<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useCollectionTranslate } from '@/composables/useAutoTranslate'
import BIcon from './BIcon.vue'
import StickerPanel from './StickerPanel.vue'
import StickerRenderer from './StickerRenderer.vue'
import SafeMedia from './SafeMedia.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import * as fmt from '@/lib/format'

const props = defineProps<{ postId: string; commentsDisabled?: boolean }>()

const auth = useAuthStore()
const langStore = useLangStore()
const groupsStore = useGroupsStore()
const { enqueue: translateItem, getTranslation, isTranslating: isItemTranslating } = useCollectionTranslate()

// ── "Comment as" — self or a group I own/admin, mirrors the post composer's entity picker ──
type CommentEntity = { type: 'user' } | { type: 'group'; id: string; slug: string; name: string; avatar_url: string | null }
const commentAsEntity = ref<CommentEntity>({ type: 'user' })
const showEntityPicker = ref(false)
const entityBtnRef = ref<HTMLElement | null>(null)
const entityPickerPos = ref({ top: '0px', left: '0px' })
const adminGroups = computed(() =>
  groupsStore.managedGroups
)
function toggleEntityPicker() {
  if (!showEntityPicker.value && entityBtnRef.value) {
    const rect = entityBtnRef.value.getBoundingClientRect()
    entityPickerPos.value = { top: `${rect.bottom + 6}px`, left: `${rect.left}px` }
  }
  showEntityPicker.value = !showEntityPicker.value
}

// ── Display identity for a comment/reply — real user, or the group it was posted as ──
function identityAvatar(c: any): string | null {
  return c.author?.avatar_url ?? c.group?.avatar_url ?? null
}
function identityName(c: any): string {
  return c.author?.display_name || c.author?.username || c.group?.name || '?'
}
function identityHandle(c: any): string {
  return c.author ? `@${c.author.username}` : c.group ? `@${c.group.slug}` : ''
}
function identityIsGroup(c: any): boolean {
  return !!(c.group_id && c.group)
}
function identityHref(c: any): string {
  if (c.group_id && c.group) return `/groups/${c.group.slug}`
  if (c.author) return `/profile/${c.author.username}`
  return '#'
}

const showTranslationFor = ref<Set<string>>(new Set())

function toggleCommentTranslate(id: string, content: string) {
  const newSet = new Set(showTranslationFor.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
    translateItem(id, content)
  }
  showTranslationFor.value = newSet
}

function getCommentText(id: string, original: string): string {
  const translation = getTranslation(id)
  if (translation && (showTranslationFor.value.has(id) || langStore.autoTranslateEnabled)) return translation
  return original
}

function autoEnqueueAll() {
  comments.value.forEach(c => {
    if (c.type !== 'sticker') translateItem(c.id, c.content)
    c.replies?.forEach((r: any) => { if (r.type !== 'sticker') translateItem(r.id, r.content) })
  })
}

const comments       = ref<any[]>([])
const canModerate    = ref(false) // post owner / group staff / admin — may delete any comment, not just their own
const isLoading      = ref(false)
const commentText    = ref('')
const replyingTo     = ref<{ id: string; username: string } | null>(null)
const replyText      = ref('')
const submitting     = ref(false)
const expandedReplies = ref<Set<string>>(new Set())
const userVotes      = ref<Record<string, 1 | -1 | 0>>({})

// Sticker panel state
const showStickerPanel      = ref(false)
const showReplyStickerPanel = ref(false)

function closeStickerPanels() {
  showStickerPanel.value = false
  showReplyStickerPanel.value = false
}

// ── Comment media attachment (photo / video / GIF) ──────────────────────────
type CommentMediaType = 'image' | 'video' | 'gif'
function detectMediaType(file: File): CommentMediaType {
  if (file.type === 'image/gif') return 'gif'
  if (file.type.startsWith('video/')) return 'video'
  return 'image'
}

const commentFileRef      = ref<HTMLInputElement | null>(null)
const commentFilePreview  = ref('')
const commentFileType     = ref<CommentMediaType>('image')
const commentFileUrl      = ref('')
const commentFileUploading = ref(false)

async function uploadCommentFile(file: File) {
  commentFileType.value = detectMediaType(file)
  commentFilePreview.value = URL.createObjectURL(file)
  commentFileUploading.value = true
  commentFileUrl.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=comments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    commentFileUrl.value = res.data.data.url
  } catch {
    removeCommentFile()
  } finally {
    commentFileUploading.value = false
  }
}

async function onCommentFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (commentFileRef.value) commentFileRef.value.value = ''
  if (!file) return
  uploadCommentFile(file)
}

function onCommentPaste(e: ClipboardEvent) {
  const file = Array.from(e.clipboardData?.items ?? []).find(i => i.kind === 'file')?.getAsFile()
  if (file) {
    e.preventDefault()
    uploadCommentFile(file)
  }
}

function removeCommentFile() {
  if (commentFilePreview.value) URL.revokeObjectURL(commentFilePreview.value)
  commentFilePreview.value = ''
  commentFileUrl.value = ''
}

const replyFileRef      = ref<HTMLInputElement | null>(null)
const replyFilePreview  = ref('')
const replyFileType     = ref<CommentMediaType>('image')
const replyFileUrl      = ref('')
const replyFileUploading = ref(false)

async function uploadReplyFile(file: File) {
  replyFileType.value = detectMediaType(file)
  replyFilePreview.value = URL.createObjectURL(file)
  replyFileUploading.value = true
  replyFileUrl.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=comments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    replyFileUrl.value = res.data.data.url
  } catch {
    removeReplyFile()
  } finally {
    replyFileUploading.value = false
  }
}

async function onReplyFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (replyFileRef.value) replyFileRef.value.value = ''
  if (!file) return
  uploadReplyFile(file)
}

function onReplyPaste(e: ClipboardEvent) {
  const file = Array.from(e.clipboardData?.items ?? []).find(i => i.kind === 'file')?.getAsFile()
  if (file) {
    e.preventDefault()
    uploadReplyFile(file)
  }
}

function removeReplyFile() {
  if (replyFilePreview.value) URL.revokeObjectURL(replyFilePreview.value)
  replyFilePreview.value = ''
  replyFileUrl.value = ''
}

const fetchComments = async () => {
  isLoading.value = true
  try {
    const res = await api.get(`/posts/${props.postId}/comments`)
    if (res.data.success) {
      comments.value = res.data.data.comments
      canModerate.value = !!res.data.data.canModerate
      if (langStore.autoTranslateEnabled) autoEnqueueAll()
    }
  } catch {}
  isLoading.value = false
}

watch(() => langStore.autoTranslateEnabled, (enabled) => {
  if (enabled) autoEnqueueAll()
})

onMounted(() => {
  fetchComments()
  if (auth.user && !groupsStore.myGroups.length) groupsStore.loadMyGroups().catch(() => {})
})

const formatDate = (d: string) => fmt.formatRelativeShort(d)

/** groupId to attach when posting "as" a group — undefined when posting as yourself. */
function entityGroupId(): string | undefined {
  return commentAsEntity.value.type === 'group' ? commentAsEntity.value.id : undefined
}

const submitComment = async () => {
  const hasText = !!commentText.value.trim()
  const hasFile = !!commentFileUrl.value
  if ((!hasText && !hasFile) || submitting.value || commentFileUploading.value) return
  submitting.value = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: commentText.value.trim(),
      groupId: entityGroupId(),
      ...(hasFile ? { type: commentFileType.value, file_url: commentFileUrl.value } : {}),
    })
    if (res.data.success) {
      comments.value.unshift({ ...res.data.data.comment, replies: [], _count: { replies: 0 } })
      commentText.value = ''
      removeCommentFile()
    }
  } catch {}
  submitting.value = false
}

const submitCommentSticker = async (url: string) => {
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: '',
      type: 'sticker',
      file_url: url,
      groupId: entityGroupId(),
    })
    if (res.data.success) {
      comments.value.unshift({ ...res.data.data.comment, replies: [], _count: { replies: 0 } })
    }
  } catch {}
  submitting.value = false
}

function pickCommentSticker(url: string) {
  closeStickerPanels()
  submitCommentSticker(url)
}

const submitReply = async () => {
  const hasText = !!replyText.value.trim()
  const hasFile = !!replyFileUrl.value
  if ((!hasText && !hasFile) || !replyingTo.value || submitting.value || replyFileUploading.value) return
  submitting.value = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: replyText.value.trim(),
      parentId: replyingTo.value.id,
      groupId: entityGroupId(),
      ...(hasFile ? { type: replyFileType.value, file_url: replyFileUrl.value } : {}),
    })
    if (res.data.success) {
      const parent = comments.value.find(c => c.id === replyingTo.value!.id)
      if (parent) {
        if (!parent.replies) parent.replies = []
        parent.replies.push(res.data.data.comment)
        parent._count.replies++
        expandedReplies.value.add(parent.id)
      }
      replyText.value = ''
      replyingTo.value = null
      removeReplyFile()
    }
  } catch {}
  submitting.value = false
}

const submitReplySticker = async (url: string) => {
  if (!replyingTo.value || submitting.value) return
  submitting.value = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: '',
      type: 'sticker',
      file_url: url,
      parentId: replyingTo.value.id,
      groupId: entityGroupId(),
    })
    if (res.data.success) {
      const parent = comments.value.find(c => c.id === replyingTo.value!.id)
      if (parent) {
        if (!parent.replies) parent.replies = []
        parent.replies.push(res.data.data.comment)
        parent._count.replies++
        expandedReplies.value.add(parent.id)
      }
      replyText.value = ''
      replyingTo.value = null
    }
  } catch {}
  submitting.value = false
}

function pickReplySticker(url: string) {
  closeStickerPanels()
  submitReplySticker(url)
}

const cancelReply = () => { replyingTo.value = null; replyText.value = ''; closeStickerPanels(); removeReplyFile() }

const toggleReplies = (commentId: string) => {
  if (expandedReplies.value.has(commentId)) expandedReplies.value.delete(commentId)
  else expandedReplies.value.add(commentId)
}

const voteComment = async (commentId: string, value: 1 | -1) => {
  const prev = userVotes.value[commentId] ?? 0
  const next: 1 | -1 | 0 = prev === value ? 0 : value
  userVotes.value = { ...userVotes.value, [commentId]: next }
  try {
    const res = await api.post(`/posts/comments/${commentId}/vote`, { value })
    if (res.data.success) {
      const updateRating = (list: any[]) => {
        for (const c of list) {
          if (c.id === commentId) { c.rating = res.data.data.rating; return true }
          if (c.replies && updateRating(c.replies)) return true
        }
        return false
      }
      updateRating(comments.value)
    }
  } catch {
    userVotes.value = { ...userVotes.value, [commentId]: prev as 1 | -1 | 0 }
  }
}

const deleteComment = async (commentId: string) => {
  try {
    await api.delete(`/posts/comments/${commentId}`)
    const removeComment = (list: any[]) => {
      const idx = list.findIndex(c => c.id === commentId)
      if (idx !== -1) { list.splice(idx, 1); return true }
      for (const c of list) {
        if (c.replies && removeComment(c.replies)) return true
      }
      return false
    }
    removeComment(comments.value)
  } catch {}
}

const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    ;(el as any)._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', (el as any)._clickOutside)
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any)._clickOutside)
  },
}
</script>

<template>
  <div class="mt-4 space-y-3">
    <!-- Comments disabled by author -->
    <div v-if="commentsDisabled" class="flex items-center gap-2 text-sm text-white/40 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
      <BIcon name="MessageSquareOff" class="w-4 h-4" /> Комментарии отключены автором
    </div>

    <!-- Comment input -->
    <div v-else-if="auth.user" class="flex gap-3 items-start">
      <div class="relative flex-shrink-0 mt-0.5">
        <!-- Clickable avatar — opens "comment as" picker if I manage any groups -->
        <button v-if="adminGroups.length" ref="entityBtnRef" @click.stop="toggleEntityPicker"
          class="flex items-center gap-0.5 focus:outline-none group/av">
          <template v-if="commentAsEntity.type === 'group'">
            <img v-if="commentAsEntity.avatar_url" :src="commentAsEntity.avatar_url"
              class="w-8 h-8 rounded-xl border-2 object-cover transition-colors"
              :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'"
              @error="onAvatarError" />
            <div v-else class="w-8 h-8 rounded-xl border-2 flex items-center justify-center text-brand-accent font-bold bg-brand-accent/20 text-xs transition-colors"
              :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'">
              {{ (commentAsEntity.name || '?')[0].toUpperCase() }}
            </div>
          </template>
          <template v-else>
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl"
              class="w-8 h-8 rounded-full border-2 object-cover transition-colors"
              :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'"
              @error="onAvatarError" />
            <div v-else class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-brand-accent font-bold bg-brand-accent/20 text-xs transition-colors"
              :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'">
              {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
            </div>
          </template>
          <BIcon name="ChevronDown" class="w-3 h-3 text-white/50 group-hover/av:text-white/80 transition-all flex-shrink-0"
            :class="showEntityPicker ? 'rotate-180 text-brand-accent' : ''" />
        </button>

        <!-- Non-clickable avatar (no groups to comment as) -->
        <template v-else>
          <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-brand-border" />
          <div v-else class="w-8 h-8 rounded-full border border-brand-border flex items-center justify-center text-brand-accent font-bold text-xs bg-brand-accent/20">
            {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
          </div>
        </template>

        <!-- "Comment as" dropdown — teleported to escape the post card's overflow-hidden clipping -->
        <Teleport to="body">
        <Transition name="popover-up">
          <div v-if="showEntityPicker" v-click-outside="() => showEntityPicker = false"
            class="fixed z-[9998] min-w-[220px] bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1.5"
            :style="{ top: entityPickerPos.top, left: entityPickerPos.left }">
            <button class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg/60 transition-colors text-sm"
              :class="commentAsEntity.type === 'user' ? 'text-brand-accent' : 'text-white'"
              @click="commentAsEntity = { type: 'user' }; showEntityPicker = false">
              <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-7 h-7 rounded-full object-cover flex-shrink-0" @error="onAvatarError" />
              <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold flex-shrink-0">
                {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
              </div>
              <span class="font-semibold truncate flex-1 text-left">{{ auth.user?.display_name || auth.user?.username }}</span>
              <BIcon v-if="commentAsEntity.type === 'user'" name="Check" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
            </button>
            <div class="h-px bg-brand-border mx-3 my-1" />
            <button v-for="grp in adminGroups" :key="grp.id"
              class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg/60 transition-colors text-sm"
              :class="commentAsEntity.type === 'group' && commentAsEntity.id === grp.id ? 'text-brand-accent' : 'text-white'"
              @click="commentAsEntity = { type: 'group', id: grp.id, slug: grp.slug, name: grp.name, avatar_url: grp.avatar_url }; showEntityPicker = false">
              <img v-if="grp.avatar_url" :src="grp.avatar_url" class="w-7 h-7 rounded-xl object-cover flex-shrink-0" @error="onAvatarError" />
              <div v-else class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold flex-shrink-0">
                {{ (grp.name || '?')[0].toUpperCase() }}
              </div>
              <span class="font-semibold truncate flex-1 text-left">{{ grp.name }}</span>
              <BIcon v-if="commentAsEntity.type === 'group' && commentAsEntity.id === grp.id" name="Check" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
            </button>
          </div>
        </Transition>
        </Teleport>
      </div>

      <div class="flex-1 relative">
        <!-- Sticker panel popover -->
        <Transition name="popover-up">
          <div v-if="showStickerPanel" class="absolute bottom-full mb-2 left-0 z-50">
            <StickerPanel @pick="pickCommentSticker" />
          </div>
        </Transition>

        <!-- Attached media preview -->
        <div v-if="commentFilePreview" class="relative inline-block mb-2">
          <video v-if="commentFileType === 'video'" :src="commentFilePreview" muted playsinline class="h-20 rounded-xl object-cover border border-brand-border" />
          <img v-else :src="commentFilePreview" class="h-20 rounded-xl object-cover border border-brand-border" />
          <div v-if="commentFileUploading" class="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
            <BIcon name="Loader2" class="w-4 h-4 animate-spin text-white" />
          </div>
          <button type="button" @click="removeCommentFile"
            class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 hover:bg-rose-500 rounded-full flex items-center justify-center text-white">
            <BIcon name="X" class="w-3 h-3" />
          </button>
        </div>

        <input ref="commentFileRef" type="file" accept="image/*,video/*" class="hidden" @change="onCommentFilePicked" />
        <input ref="replyFileRef" type="file" accept="image/*,video/*" class="hidden" @change="onReplyFilePicked" />

        <div class="flex gap-2">
          <input
            v-model="commentText"
            @keydown.enter.prevent="submitComment"
            @focus="showReplyStickerPanel = false"
            @paste="onCommentPaste"
            :placeholder="langStore.t.writeComment"
            class="flex-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent"
          />
          <!-- Media attach button -->
          <button
            type="button"
            @click="commentFileRef?.click()"
            :class="['flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all',
              commentFilePreview ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
            title="Фото / видео / GIF">
            <BIcon name="Image" class="w-4 h-4" />
          </button>
          <!-- Sticker button -->
          <button
            type="button"
            @click="showStickerPanel = !showStickerPanel; showReplyStickerPanel = false"
            :class="['flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all',
              showStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
            title="Стикеры">
            <BIcon name="Sticker" class="w-4 h-4" />
          </button>
          <!-- Send button -->
          <button
            @click="submitComment"
            :disabled="(!commentText.trim() && !commentFileUrl) || submitting || commentFileUploading"
            class="px-4 py-2 bg-brand-accent text-white text-sm font-bold rounded-2xl disabled:opacity-40 flex-shrink-0">
            <BIcon v-if="submitting" name="Loader2" class="w-4 h-4 animate-spin" />
            <span v-else>{{ langStore.t.send }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="text-center py-3 text-white/55 text-sm">
      <BIcon name="Loader2" class="w-5 h-5 animate-spin inline-block" />
    </div>

    <!-- No comments -->
    <div v-else-if="comments.length === 0" class="text-center py-4 text-white/55 text-sm">
      {{ langStore.t.noComments }}
    </div>

    <!-- Comment list -->
    <div v-else class="space-y-3">
      <div v-for="comment in comments" :key="comment.id" class="space-y-2">
        <!-- Top-level comment -->
        <div class="flex gap-3">
          <router-link :to="identityHref(comment)" class="flex-shrink-0 mt-0.5">
            <img v-if="identityAvatar(comment)"
              :src="identityAvatar(comment)!"
              class="w-8 h-8 object-cover border border-brand-border cursor-pointer"
              :class="identityIsGroup(comment) ? 'rounded-xl' : 'rounded-full'"
              @error="onAvatarError"
            />
            <div v-else class="w-8 h-8 border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs cursor-pointer"
              :class="identityIsGroup(comment) ? 'rounded-xl' : 'rounded-full'">{{ identityName(comment)[0].toUpperCase() }}</div>
          </router-link>

          <div class="flex-1 min-w-0">
            <!-- Sticker comment — no bubble -->
            <template v-if="comment.type === 'sticker' && comment.file_url">
              <div class="flex items-center gap-2 mb-1 px-1">
                <router-link :to="identityHref(comment)" class="font-bold text-white text-sm cursor-pointer hover:underline">{{ identityName(comment) }}</router-link>
                <span class="text-white/55 text-xs">{{ identityHandle(comment) }}</span>
                <span class="text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <div class="cursor-pointer hover:scale-105 transition-transform active:scale-95 inline-block">
                <StickerRenderer :src="comment.file_url" size="lg" :loop="true" :autoplay="true" />
              </div>
            </template>

            <!-- Media comment (photo / video / GIF) — media + optional caption -->
            <template v-else-if="['image', 'video', 'gif'].includes(comment.type) && comment.file_url">
              <div class="flex items-center gap-2 mb-1 px-1">
                <router-link :to="identityHref(comment)" class="font-bold text-white text-sm cursor-pointer hover:underline">{{ identityName(comment) }}</router-link>
                <span class="text-white/55 text-xs">{{ identityHandle(comment) }}</span>
                <span class="text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <div class="rounded-2xl overflow-hidden border border-brand-border/50 max-w-[280px] bg-black/20">
                <SafeMedia :src="comment.file_url" :kind="comment.type === 'video' ? 'video' : 'image'" class="w-full h-auto max-h-72 object-contain" />
              </div>
              <p v-if="comment.content" class="text-white/85 text-sm leading-relaxed mt-1.5 px-1">{{ getCommentText(comment.id, comment.content) }}</p>
            </template>

            <!-- Text comment — with bubble -->
            <div v-else class="bg-brand-bg/50 rounded-2xl px-4 py-3 border border-brand-border/50">
              <div class="flex items-center gap-2 mb-1.5">
                <router-link :to="identityHref(comment)" class="font-bold text-white text-sm cursor-pointer hover:underline">{{ identityName(comment) }}</router-link>
                <span class="text-white/55 text-xs">{{ identityHandle(comment) }}</span>
                <span class="text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <p class="text-white/85 text-sm leading-relaxed">{{ getCommentText(comment.id, comment.content) }}</p>
            </div>

            <!-- Actions row -->
            <div class="flex items-center gap-3 mt-1.5 pl-1">
              <!-- Vote -->
              <div class="flex items-center gap-0.5 bg-brand-bg rounded-full border border-brand-border/60 px-0.5">
                <button @click="voteComment(comment.id, 1)"
                  class="p-0.5 rounded-full transition-all duration-150"
                  :class="(userVotes[comment.id] ?? 0) === 1 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)]' : 'text-white/35 hover:text-emerald-400'">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" :fill-opacity="(userVotes[comment.id] ?? 0) === 1 ? 1 : 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19V13H5l7-9 7 9h-4v6H9z"/></svg>
                </button>
                <span class="text-xs font-bold min-w-[16px] text-center tabular-nums"
                  :class="(userVotes[comment.id] ?? 0) === 1 ? 'text-emerald-400' : (userVotes[comment.id] ?? 0) === -1 ? 'text-rose-400' : comment.rating > 0 ? 'text-emerald-300/80' : comment.rating < 0 ? 'text-rose-300/80' : 'text-white/50'">
                  {{ comment.rating }}
                </span>
                <button @click="voteComment(comment.id, -1)"
                  class="p-0.5 rounded-full transition-all duration-150"
                  :class="(userVotes[comment.id] ?? 0) === -1 ? 'text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.6)]' : 'text-white/35 hover:text-rose-400'">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" :fill-opacity="(userVotes[comment.id] ?? 0) === -1 ? 1 : 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5v6h4l-7 9-7-9h4V5h6z"/></svg>
                </button>
              </div>
              <!-- Translate (only for text) -->
              <button v-if="comment.type !== 'sticker'"
                @click="toggleCommentTranslate(comment.id, comment.content)"
                class="text-white/40 hover:text-brand-accent text-xs flex items-center gap-0.5 transition-colors"
                :title="showTranslationFor.has(comment.id) ? langStore.t.showOriginal : langStore.t.autoTranslate">
                <span v-if="isItemTranslating(comment.id)" class="w-3 h-3 border border-brand-accent/60 border-t-transparent rounded-full animate-spin" />
                <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
              </button>
              <button v-if="auth.user"
                @click="replyingTo = { id: comment.id, username: comment.author?.username ?? comment.group?.slug ?? '' }; replyText = ''; closeStickerPanels()"
                class="text-white/55 hover:text-brand-accent text-xs font-semibold flex items-center gap-1">
                <BIcon name="CornerDownRight" class="w-3 h-3" />
                {{ langStore.t.reply }}
              </button>
              <button v-if="comment._count.replies > 0 || comment.replies?.length > 0"
                @click="toggleReplies(comment.id)"
                class="text-brand-accent text-xs font-semibold hover:text-brand-purple">
                {{ expandedReplies.has(comment.id) ? '▲' : '▼' }} {{ comment._count.replies || comment.replies?.length }} {{ langStore.t.replies }}
              </button>
              <button v-if="comment.author_id === auth.user?.id || canModerate"
                @click="deleteComment(comment.id)"
                class="ml-auto text-white/55 hover:text-rose-400 p-1">
                <BIcon name="Trash2" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Reply input for this comment -->
            <div v-if="replyingTo?.id === comment.id" class="mt-2 pl-1 relative">
              <!-- Reply sticker panel -->
              <Transition name="popover-up">
                <div v-if="showReplyStickerPanel" class="absolute bottom-full mb-2 left-0 z-50">
                  <StickerPanel @pick="pickReplySticker" />
                </div>
              </Transition>

              <!-- Attached media preview -->
              <div v-if="replyFilePreview" class="relative inline-block mb-2 ml-9">
                <video v-if="replyFileType === 'video'" :src="replyFilePreview" muted playsinline class="h-16 rounded-xl object-cover border border-brand-border" />
                <img v-else :src="replyFilePreview" class="h-16 rounded-xl object-cover border border-brand-border" />
                <div v-if="replyFileUploading" class="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                  <BIcon name="Loader2" class="w-4 h-4 animate-spin text-white" />
                </div>
                <button type="button" @click="removeReplyFile"
                  class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 hover:bg-rose-500 rounded-full flex items-center justify-center text-white">
                  <BIcon name="X" class="w-3 h-3" />
                </button>
              </div>

              <div class="flex gap-2 items-center">
                <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-7 h-7 rounded-full object-cover border border-brand-border flex-shrink-0" />
                <div v-else class="w-7 h-7 rounded-full border border-brand-border flex-shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-[10px]">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
                <input
                  v-model="replyText"
                  @keydown.enter.prevent="submitReply"
                  @paste="onReplyPaste"
                  :placeholder="`@${replyingTo?.username}...`"
                  autofocus
                  class="flex-1 bg-brand-bg border border-brand-border rounded-2xl px-3 py-1.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent"
                />
                <!-- Reply media attach button -->
                <button
                  type="button"
                  @click="replyFileRef?.click()"
                  :class="['flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all',
                    replyFilePreview ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
                  title="Фото / видео / GIF">
                  <BIcon name="Image" class="w-3.5 h-3.5" />
                </button>
                <!-- Reply sticker button -->
                <button
                  type="button"
                  @click="showReplyStickerPanel = !showReplyStickerPanel; showStickerPanel = false"
                  :class="['flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all',
                    showReplyStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
                  title="Стикеры">
                  <BIcon name="Sticker" class="w-3.5 h-3.5" />
                </button>
                <button @click="submitReply" :disabled="(!replyText.trim() && !replyFileUrl) || submitting || replyFileUploading"
                  class="px-3 py-1.5 bg-brand-accent text-white text-xs font-bold rounded-xl disabled:opacity-40">
                  {{ langStore.t.send }}
                </button>
                <button @click="cancelReply" class="p-1.5 text-white/55 hover:text-white rounded-xl hover:bg-brand-border">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Nested replies -->
            <div v-if="expandedReplies.has(comment.id) && comment.replies?.length" class="mt-2 space-y-2 pl-4 border-l-2 border-brand-border">
              <div v-for="reply in comment.replies" :key="reply.id" class="flex gap-3">
                <router-link :to="identityHref(reply)" class="flex-shrink-0 mt-0.5">
                  <img v-if="identityAvatar(reply)"
                    :src="identityAvatar(reply)!"
                    class="w-7 h-7 object-cover border border-brand-border cursor-pointer"
                    :class="identityIsGroup(reply) ? 'rounded-xl' : 'rounded-full'"
                    @error="onAvatarError"
                  />
                  <div v-else class="w-7 h-7 border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-[10px] cursor-pointer"
                    :class="identityIsGroup(reply) ? 'rounded-xl' : 'rounded-full'">{{ identityName(reply)[0].toUpperCase() }}</div>
                </router-link>
                <div class="flex-1 min-w-0">
                  <!-- Sticker reply -->
                  <template v-if="reply.type === 'sticker' && reply.file_url">
                    <div class="flex items-center gap-2 mb-1 px-1">
                      <router-link :to="identityHref(reply)" class="font-bold text-white text-xs cursor-pointer hover:underline">{{ identityName(reply) }}</router-link>
                      <span class="text-white/55 text-[11px] ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <div class="cursor-pointer hover:scale-105 transition-transform active:scale-95 inline-block">
                      <StickerRenderer :src="reply.file_url" size="md" :loop="true" :autoplay="true" />
                    </div>
                  </template>

                  <!-- Media reply (photo / video / GIF) -->
                  <template v-else-if="['image', 'video', 'gif'].includes(reply.type) && reply.file_url">
                    <div class="flex items-center gap-2 mb-1 px-1">
                      <router-link :to="identityHref(reply)" class="font-bold text-white text-xs cursor-pointer hover:underline">{{ identityName(reply) }}</router-link>
                      <span class="text-white/55 text-[11px] ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <div class="rounded-2xl overflow-hidden border border-brand-border/50 max-w-[240px] bg-black/20">
                      <SafeMedia :src="reply.file_url" :kind="reply.type === 'video' ? 'video' : 'image'" class="w-full h-auto max-h-64 object-contain" />
                    </div>
                    <p v-if="reply.content" class="text-white/85 text-sm leading-relaxed mt-1 px-1">{{ getCommentText(reply.id, reply.content) }}</p>
                  </template>

                  <!-- Text reply -->
                  <div v-else class="bg-brand-bg/50 rounded-2xl px-4 py-2.5 border border-brand-border/50">
                    <div class="flex items-center gap-2 mb-1">
                      <router-link :to="identityHref(reply)" class="font-bold text-white text-xs cursor-pointer hover:underline">{{ identityName(reply) }}</router-link>
                      <span class="text-white/55 text-[11px] ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <p class="text-white/85 text-sm leading-relaxed">{{ getCommentText(reply.id, reply.content) }}</p>
                  </div>

                  <div class="flex items-center gap-3 mt-1 pl-1">
                    <div class="flex items-center gap-0.5 bg-brand-bg rounded-full border border-brand-border/60 px-0.5">
                      <button @click="voteComment(reply.id, 1)"
                        class="p-0.5 rounded-full transition-all duration-150"
                        :class="(userVotes[reply.id] ?? 0) === 1 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)]' : 'text-white/35 hover:text-emerald-400'">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" :fill-opacity="(userVotes[reply.id] ?? 0) === 1 ? 1 : 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19V13H5l7-9 7 9h-4v6H9z"/></svg>
                      </button>
                      <span class="text-xs font-bold min-w-[14px] text-center tabular-nums"
                        :class="(userVotes[reply.id] ?? 0) === 1 ? 'text-emerald-400' : (userVotes[reply.id] ?? 0) === -1 ? 'text-rose-400' : reply.rating > 0 ? 'text-emerald-300/80' : reply.rating < 0 ? 'text-rose-300/80' : 'text-white/50'">{{ reply.rating }}</span>
                      <button @click="voteComment(reply.id, -1)"
                        class="p-0.5 rounded-full transition-all duration-150"
                        :class="(userVotes[reply.id] ?? 0) === -1 ? 'text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.6)]' : 'text-white/35 hover:text-rose-400'">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" :fill-opacity="(userVotes[reply.id] ?? 0) === -1 ? 1 : 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5v6h4l-7 9-7-9h4V5h6z"/></svg>
                      </button>
                    </div>
                    <!-- Translate reply (only for text) -->
                    <button v-if="reply.type !== 'sticker'"
                      @click="toggleCommentTranslate(reply.id, reply.content)"
                      class="text-white/40 hover:text-brand-accent text-xs flex items-center gap-0.5 transition-colors"
                      :title="showTranslationFor.has(reply.id) ? langStore.t.showOriginal : langStore.t.autoTranslate">
                      <span v-if="isItemTranslating(reply.id)" class="w-2.5 h-2.5 border border-brand-accent/60 border-t-transparent rounded-full animate-spin" />
                      <svg v-else class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
                    </button>
                    <!-- Reply to a reply: attaches to the same top-level comment (backend only nests one level deep), tagging the reply's author -->
                    <button v-if="auth.user"
                      @click="replyingTo = { id: comment.id, username: identityHandle(reply).slice(1) }; replyText = `${identityHandle(reply)} `; closeStickerPanels()"
                      class="text-white/55 hover:text-brand-accent text-xs font-semibold flex items-center gap-1">
                      <BIcon name="CornerDownRight" class="w-3 h-3" />
                      {{ langStore.t.reply }}
                    </button>
                    <button v-if="reply.author_id === auth.user?.id || canModerate"
                      @click="deleteComment(reply.id)"
                      class="ml-auto text-white/55 hover:text-rose-400 p-1">
                      <BIcon name="Trash2" class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popover-up-enter-active,
.popover-up-leave-active { transition: all 0.15s ease; }
.popover-up-enter-from,
.popover-up-leave-to    { opacity: 0; transform: translateY(6px) scale(0.97); }
.popover-up-enter-to,
.popover-up-leave-from  { opacity: 1; transform: translateY(0) scale(1); }
</style>
