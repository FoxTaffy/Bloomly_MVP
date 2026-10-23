<script setup lang="ts">
import LinkifiedText from '@/components/LinkifiedText.vue'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useCollectionTranslate } from '@/composables/useAutoTranslate'
import BIcon from './BIcon.vue'
import VerificationBadge from './VerificationBadge.vue'
import StickerPanel from './StickerPanel.vue'
import StickerRenderer from './StickerRenderer.vue'
import SafeMedia from './SafeMedia.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { usePostDiscussion } from '@/composables/usePostDiscussion'
import * as fmt from '@/lib/format'
import { useUploadPrecheck } from '@/composables/useUploadPrecheck'
import { uploadMedia } from '@/lib/uploadMedia'

const { precheck: precheckUpload, fromServerError: uploadLimitMessage } = useUploadPrecheck()

const props = defineProps<{ postId: string; commentsDisabled?: boolean; fullscreen?: boolean; overlayTarget?: HTMLElement | null; previewLimit?: number }>()

const emit = defineEmits<{ (e: 'count-change', delta: number): void }>()
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
    const height = Math.min(280, (adminGroups.value.length + 1) * 52 + 16, window.innerHeight * .5)
    entityPickerPos.value = { top: `${Math.max(8, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 8 : rect.bottom + 6)}px`, left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 248))}px` }
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

const discussion = usePostDiscussion(() => props.postId, () => auth.user?.id)
const comments = discussion.comments
const canModerate = discussion.canModerate
const isLoading = discussion.loading
const commentText = discussion.draft
const loadError = discussion.error
const root = ref<HTMLElement | null>(null)
const visibleLimit = ref(props.previewLimit ?? Number.POSITIVE_INFINITY)
let observer: IntersectionObserver | null = null
let activated = false
const actionError = ref('')
const sortOrder = ref('newest')
const sortedComments = computed(() => [...comments.value].sort((a, b) => sortOrder.value === 'popular'
  ? b.rating - a.rating || Date.parse(b.created_at) - Date.parse(a.created_at)
  : (Date.parse(a.created_at) - Date.parse(b.created_at)) * (sortOrder.value === 'oldest' ? 1 : -1)))
const visibleComments = computed(() => sortedComments.value.slice(0, visibleLimit.value))
function replyItems(comment: any) { return expandedReplies.value.has(comment.id) ? comment.replies ?? [] : (comment.replies ?? []).slice(0, 2) }
function replyMoreLabel(comment: any) {
  return expandedReplies.value.has(comment.id) ? 'Свернуть ответы' : `Показать ещё ${Math.max(0, (comment.replies?.length ?? 0) - 2)} ответов`
}
const pendingVotes = ref(new Set<string>())
const deleting = ref(false)
const pendingDelete = ref<string | null>(null)
let disposed = false
let loadGeneration = 0
function onCommentKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitComment() }
}
function onReplyKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitReply() }
}
const replyingTo     = ref<{ id: string; username: string } | null>(null)
const replyText      = ref('')
const submitting = discussion.submitting
const expandedReplies = ref<Set<string>>(new Set())
const userVotes = discussion.votes

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

let commentUploadGeneration = 0
let commentUploadController: AbortController | null = null
async function uploadCommentFile(file: File) {
  if (!auth.user || props.commentsDisabled || submitting.value) return
  removeCommentFile()
  const tooBig = precheckUpload(file) // лимит тарифа — до отправки, с подсказкой тарифа
  if (tooBig) { actionError.value = tooBig; return }
  const generation = commentUploadGeneration
  commentUploadController = new AbortController()
  commentFileType.value = detectMediaType(file)
  commentFilePreview.value = URL.createObjectURL(file)
  commentFileUploading.value = true
  actionError.value = ''
  try {
    const res = await uploadMedia(file, { folder: 'comments', signal: commentUploadController.signal })
    if (disposed || generation !== commentUploadGeneration) return
    if (!res.url) throw new Error('Upload failed')
    commentFileUrl.value = res.url
  } catch (err) {
    if (!disposed && generation === commentUploadGeneration) {
      removeCommentFile()
      actionError.value = uploadLimitMessage(err) ?? 'Не удалось загрузить вложение. Выберите файл ещё раз.'
    }
  } finally {
    if (generation === commentUploadGeneration) commentFileUploading.value = false
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
  commentUploadGeneration++
  commentUploadController?.abort()
  commentUploadController = null
  commentFileUploading.value = false
  if (commentFilePreview.value) URL.revokeObjectURL(commentFilePreview.value)
  commentFilePreview.value = ''
  commentFileUrl.value = ''
}

const replyFileRef      = ref<HTMLInputElement | null>(null)
const replyFilePreview  = ref('')
const replyFileType     = ref<CommentMediaType>('image')
const replyFileUrl      = ref('')
const replyFileUploading = ref(false)

let replyUploadGeneration = 0
let replyUploadController: AbortController | null = null
async function uploadReplyFile(file: File) {
  if (!auth.user || props.commentsDisabled || submitting.value) return
  removeReplyFile()
  const tooBig = precheckUpload(file)
  if (tooBig) { actionError.value = tooBig; return }
  const generation = replyUploadGeneration
  replyUploadController = new AbortController()
  replyFileType.value = detectMediaType(file)
  replyFilePreview.value = URL.createObjectURL(file)
  replyFileUploading.value = true
  actionError.value = ''
  try {
    const res = await uploadMedia(file, { folder: 'comments', signal: replyUploadController.signal })
    if (disposed || generation !== replyUploadGeneration) return
    if (!res.url) throw new Error('Upload failed')
    replyFileUrl.value = res.url
  } catch (err) {
    if (!disposed && generation === replyUploadGeneration) {
      removeReplyFile()
      actionError.value = uploadLimitMessage(err) ?? 'Не удалось загрузить вложение. Выберите файл ещё раз.'
    }
  } finally {
    if (generation === replyUploadGeneration) replyFileUploading.value = false
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
  replyUploadGeneration++
  replyUploadController?.abort()
  replyUploadController = null
  replyFileUploading.value = false
  if (replyFilePreview.value) URL.revokeObjectURL(replyFilePreview.value)
  replyFilePreview.value = ''
  replyFileUrl.value = ''
}

async function fetchComments(force = true) {
  await discussion.load(force)
  if (langStore.autoTranslateEnabled) autoEnqueueAll()
}
function activate() {
  if (activated) return
  activated = true
  fetchComments(false)
}
onMounted(() => {
  if (!props.previewLimit || !('IntersectionObserver' in window)) activate()
  else {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { activate(); observer?.disconnect() }
    }, { rootMargin: '200px' })
    if (root.value) observer.observe(root.value)
  }
  if (auth.user && !groupsStore.myGroups.length) groupsStore.loadMyGroups().catch(() => {})
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  removeCommentFile()
  removeReplyFile()
})
watch(() => `${props.postId}:${auth.user?.id ?? ''}`, () => {
  replyingTo.value = null
  replyText.value = ''
  commentAsEntity.value = { type: 'user' }
  removeCommentFile()
  removeReplyFile()
  actionError.value = ''
  visibleLimit.value = props.previewLimit ?? Number.POSITIVE_INFINITY
  if (activated) fetchComments(false)
})
watch(() => langStore.autoTranslateEnabled, enabled => { if (enabled) autoEnqueueAll() })

const formatDate = (d: string) => fmt.formatRelativeShort(d)

/** groupId to attach when posting "as" a group — undefined when posting as yourself. */
function entityGroupId(): string | undefined {
  return commentAsEntity.value.type === 'group' ? commentAsEntity.value.id : undefined
}

const submitComment = async () => {
  const hasText = !!commentText.value.trim()
  const hasFile = !!commentFileUrl.value
  if ((!hasText && !hasFile) || submitting.value || commentFileUploading.value) return
  if (!auth.user || props.commentsDisabled) return
  actionError.value = ''
  const requestPostId = props.postId
  const requestUserId = auth.user.id
  const requestState = discussion.state.value
  requestState.submitting = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: commentText.value.trim(),
      groupId: entityGroupId(),
      ...(hasFile ? { type: commentFileType.value, file_url: commentFileUrl.value } : {}),
    })
    if (!res.data.success) throw new Error('Comment rejected')
    if (requestPostId === props.postId && requestUserId === auth.user?.id && res.data.success) {
      discussion.adjustCount(1)
      emit('count-change', 1)
      comments.value.unshift({ ...res.data.data.comment, __local: true, replies: [], _count: { replies: 0 } })
      commentText.value = ''
      removeCommentFile()
    }
  } catch { actionError.value = 'Не удалось отправить сообщение. Текст сохранён — попробуйте ещё раз.' }
  requestState.submitting = false
}

const submitCommentSticker = async (url: string) => {
  if (submitting.value) return
  if (!auth.user || props.commentsDisabled) return
  actionError.value = ''
  const requestPostId = props.postId
  const requestUserId = auth.user.id
  const requestState = discussion.state.value
  requestState.submitting = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: '',
      type: 'sticker',
      file_url: url,
      groupId: entityGroupId(),
    })
    if (!res.data.success) throw new Error('Comment rejected')
    if (requestPostId === props.postId && requestUserId === auth.user?.id && res.data.success) {
      discussion.adjustCount(1)
      emit('count-change', 1)
      comments.value.unshift({ ...res.data.data.comment, __local: true, replies: [], _count: { replies: 0 } })
    }
  } catch { actionError.value = 'Не удалось отправить сообщение. Текст сохранён — попробуйте ещё раз.' }
  requestState.submitting = false
}

function pickCommentSticker(url: string) {
  closeStickerPanels()
  submitCommentSticker(url)
}

const submitReply = async () => {
  const hasText = !!replyText.value.trim()
  const hasFile = !!replyFileUrl.value
  if ((!hasText && !hasFile) || !replyingTo.value || submitting.value || replyFileUploading.value) return
  if (!auth.user || props.commentsDisabled) return
  const replyTarget = { ...replyingTo.value! }
  actionError.value = ''
  const requestPostId = props.postId
  const requestUserId = auth.user.id
  const requestState = discussion.state.value
  requestState.submitting = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: replyText.value.trim(),
      parentId: replyTarget.id,
      groupId: entityGroupId(),
      ...(hasFile ? { type: replyFileType.value, file_url: replyFileUrl.value } : {}),
    })
    if (!res.data.success) throw new Error('Reply rejected')
    if (requestPostId === props.postId && requestUserId === auth.user?.id && res.data.success) {
      discussion.adjustCount(1)
      emit('count-change', 1)
      const parent = comments.value.find(c => c.id === replyTarget.id)
      if (parent) {
        if (!parent.replies) parent.replies = []
        parent.replies.push(res.data.data.comment)
        parent._count = { ...parent._count, replies: (parent._count?.replies ?? 0) + 1 }
        expandedReplies.value.add(parent.id)
      }
      replyText.value = ''
      replyingTo.value = null
      removeReplyFile()
    }
  } catch { actionError.value = 'Не удалось отправить сообщение. Текст сохранён — попробуйте ещё раз.' }
  requestState.submitting = false
}

const submitReplySticker = async (url: string) => {
  if (!replyingTo.value || submitting.value) return
  if (!auth.user || props.commentsDisabled) return
  const replyTarget = { ...replyingTo.value! }
  actionError.value = ''
  const requestPostId = props.postId
  const requestUserId = auth.user.id
  const requestState = discussion.state.value
  requestState.submitting = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: '',
      type: 'sticker',
      file_url: url,
      parentId: replyTarget.id,
      groupId: entityGroupId(),
    })
    if (!res.data.success) throw new Error('Reply rejected')
    if (requestPostId === props.postId && requestUserId === auth.user?.id && res.data.success) {
      discussion.adjustCount(1)
      emit('count-change', 1)
      const parent = comments.value.find(c => c.id === replyTarget.id)
      if (parent) {
        if (!parent.replies) parent.replies = []
        parent.replies.push(res.data.data.comment)
        parent._count = { ...parent._count, replies: (parent._count?.replies ?? 0) + 1 }
        expandedReplies.value.add(parent.id)
      }
      replyText.value = ''
      replyingTo.value = null
    }
  } catch { actionError.value = 'Не удалось отправить сообщение. Текст сохранён — попробуйте ещё раз.' }
  requestState.submitting = false
}

function pickReplySticker(url: string) {
  closeStickerPanels()
  submitReplySticker(url)
}

const cancelReply = () => { if (submitting.value) return; replyingTo.value = null; replyText.value = ''; closeStickerPanels(); removeReplyFile() }

const toggleReplies = (commentId: string) => {
  if (expandedReplies.value.has(commentId)) expandedReplies.value.delete(commentId)
  else expandedReplies.value.add(commentId)
}

const voteComment = async (commentId: string, value: 1 | -1) => {
  if (!auth.user || pendingVotes.value.has(commentId)) return
  pendingVotes.value.add(commentId)
  actionError.value = ''
  const prev = userVotes.value[commentId] ?? 0
  const next: 1 | -1 | 0 = prev === value ? 0 : value
  userVotes.value = { ...userVotes.value, [commentId]: next }
  try {
    const res = await api.post(`/posts/comments/${commentId}/vote`, { value })
    if (!res.data.success) throw new Error('Vote rejected')
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
    actionError.value = 'Не удалось сохранить оценку. Попробуйте ещё раз.'
    userVotes.value = { ...userVotes.value, [commentId]: prev as 1 | -1 | 0 }
  } finally { pendingVotes.value.delete(commentId) }
}

const deleteComment = async (commentId: string) => {
  if (deleting.value) return
  deleting.value = true
  actionError.value = ''
  try {
    const res = await api.delete(`/posts/comments/${commentId}`)
    if (!res.data.success) throw new Error('Delete rejected')
    const removeComment = (list: any[]) => {
      const idx = list.findIndex(c => c.id === commentId)
      if (idx !== -1) { list.splice(idx, 1); discussion.adjustCount(-1); emit('count-change', -1); return true }
      for (const c of list) {
        if (c.replies && removeComment(c.replies)) { c._count.replies = Math.max(0, c._count.replies - 1); return true }
      }
      return false
    }
    removeComment(comments.value)
    pendingDelete.value = null
  } catch { actionError.value = 'Не удалось удалить комментарий. Попробуйте ещё раз.' }
  finally { deleting.value = false }
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
  <div ref="root" class="comments-root" :class="{ 'comments-fullscreen': fullscreen, 'comments-preview': !!previewLimit }">
    <!-- Comments disabled by author -->
    <div v-if="commentsDisabled" class="comment-access-message flex items-center gap-2 text-sm text-white/40 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
      <BIcon name="MessageSquareOff" class="w-4 h-4" /> Комментарии отключены автором
    </div>

    <!-- Comment input -->
    <div v-else-if="auth.user" class="comment-composer flex gap-3 max-md:gap-2 items-start">
      <div class="relative shrink-0 mt-0.5">
        <!-- Clickable avatar — opens "comment as" picker if I manage any groups -->
        <button v-if="adminGroups.length" ref="entityBtnRef" @click.stop="toggleEntityPicker"
          aria-label="Комментировать от имени" :aria-expanded="showEntityPicker" :disabled="submitting"
          class="flex items-center gap-0.5 group/av">
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
          <BIcon name="ChevronDown" class="w-3 h-3 text-white/50 group-hover/av:text-white/80 transition-all shrink-0"
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
        <Teleport :to="overlayTarget || 'body'">
        <Transition name="popover-up">
          <div v-if="showEntityPicker" v-click-outside="() => showEntityPicker = false"
            class="fixed z-9998 min-w-[220px] bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1.5"
            :style="{ top: entityPickerPos.top, left: entityPickerPos.left, maxHeight: 'min(280px, 50dvh)', overflowY: 'auto', maxWidth: 'calc(100vw - 16px)' }">
            <button class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg/60 transition-colors text-sm"
              :class="commentAsEntity.type === 'user' ? 'text-brand-accent' : 'text-white'"
              @click="commentAsEntity = { type: 'user' }; showEntityPicker = false">
              <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-7 h-7 rounded-full object-cover shrink-0" @error="onAvatarError" />
              <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold shrink-0">
                {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
              </div>
              <span class="font-semibold truncate flex-1 text-left">{{ auth.user?.display_name || auth.user?.username }}</span>
              <BIcon v-if="commentAsEntity.type === 'user'" name="Check" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
            </button>
            <div class="h-px bg-brand-border mx-3 my-1" />
            <button v-for="grp in adminGroups" :key="grp.id" :aria-label="grp.name"
              class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg/60 transition-colors text-sm"
              :class="commentAsEntity.type === 'group' && commentAsEntity.id === grp.id ? 'text-brand-accent' : 'text-white'"
              @click="commentAsEntity = { type: 'group', id: grp.id, slug: grp.slug, name: grp.name, avatar_url: grp.avatar_url }; showEntityPicker = false">
              <img v-if="grp.avatar_url" :src="grp.avatar_url" class="w-7 h-7 rounded-xl object-cover shrink-0" @error="onAvatarError" />
              <div v-else class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold shrink-0">
                {{ (grp.name || '?')[0].toUpperCase() }}
              </div>
              <span class="font-semibold truncate flex-1 text-left">{{ grp.name }}</span>
              <BIcon v-if="commentAsEntity.type === 'group' && commentAsEntity.id === grp.id" name="Check" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
            </button>
          </div>
        </Transition>
        </Teleport>
      </div>

      <div class="comment-editor flex-1 min-w-0 relative">
        <!-- Sticker panel popover -->
        <Transition name="popover-up">
          <div v-if="showStickerPanel" class="comment-sticker-popover absolute bottom-full mb-2 left-0 z-50">
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
          <button type="button" @click="removeCommentFile" aria-label="Убрать вложение"
            class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 hover:bg-rose-500 rounded-full flex items-center justify-center text-white">
            <BIcon name="X" class="w-3 h-3" />
          </button>
        </div>

        <input ref="commentFileRef" type="file" accept="image/*,video/*" class="hidden" @change="onCommentFilePicked" />
        <input ref="replyFileRef" type="file" accept="image/*,video/*" class="hidden" @change="onReplyFilePicked" />

        <div class="comment-input-label" aria-hidden="true">Ваш комментарий</div>
        <div class="comment-compose-controls">
          <textarea rows="2" aria-label="Ваш комментарий" maxlength="5000" :disabled="submitting"
            v-model="commentText"
            @keydown="onCommentKey"
            @focus="showReplyStickerPanel = false"
            @paste="onCommentPaste"
            :placeholder="langStore.t.writeComment"
            class="flex-1 max-md:min-w-0 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2 max-md:px-3 text-sm text-white placeholder-brand-muted outline-hidden focus:border-brand-accent"
          ></textarea>
          <!-- Media attach button -->
          <button
            type="button"
            @click="commentFileRef?.click()"
            :class="['shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all',
              commentFilePreview ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
            title="Фото / видео / GIF" aria-label="Прикрепить фото, видео или GIF">
            <BIcon name="Image" class="w-4 h-4" />
          </button>
          <!-- Sticker button -->
          <button
            type="button"
            @click="showStickerPanel = !showStickerPanel; showReplyStickerPanel = false"
            :class="['shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center transition-all',
              showStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
            title="Стикеры" aria-label="Стикеры">
            <BIcon name="Sticker" class="w-4 h-4" />
          </button>
          <!-- Send button -->
          <button
            @click="submitComment"
            :disabled="(!commentText.trim() && !commentFileUrl) || submitting || commentFileUploading"
            :aria-label="langStore.t.send"
            class="comment-send px-4 py-2 bg-brand-accent text-white text-sm font-bold rounded-2xl disabled:opacity-40 shrink-0 max-md:w-9 max-md:h-9 max-md:p-0 max-md:flex max-md:items-center max-md:justify-center">
            <BIcon v-if="submitting" name="Loader2" class="w-4 h-4 animate-spin" />
            <template v-else>
              <span class="max-md:hidden">{{ langStore.t.send }}</span>
              <BIcon name="SendHorizontal" class="w-4 h-4 md:hidden" />
            </template>
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="!commentsDisabled" class="comment-access-message comment-guest">
      <BIcon name="MessageSquare" class="w-5 h-5" aria-hidden="true" />
      <p>Войдите, чтобы присоединиться к обсуждению.</p><router-link to="/login">Войти</router-link>
    </div>
    <div class="comments-scroll">
      <slot name="post" />
      <div v-if="fullscreen || (previewLimit && comments.length)" class="comments-list-heading"><span v-if="previewLimit">Комментарии</span><div class="flex items-center gap-2 ml-auto"><button class="comments-refresh" type="button" aria-label="Обновить комментарии" title="Обновить комментарии" @click="fetchComments(true)" :disabled="isLoading"><BIcon name="RefreshCw" :class="['w-4 h-4', { 'animate-spin': isLoading }]" aria-hidden="true" /></button><select v-model="sortOrder" aria-label="Порядок комментариев"><option value="newest">Сначала новые</option><option value="popular">Популярные</option><option value="oldest">Сначала старые</option></select></div></div>
    <!-- Loading -->
    <div v-if="isLoading && !comments.length" role="status" aria-label="Загрузка комментариев" class="text-center py-3 text-white/55 text-sm">
      <BIcon name="Loader2" class="w-5 h-5 animate-spin inline-block" />
    </div>

    <div v-else-if="loadError && !comments.length" class="comments-empty" role="alert"><BIcon name="WifiOff" class="w-7 h-7" aria-hidden="true" /><p>{{ loadError }}</p><button @click="fetchComments(true)" class="comments-retry">Попробовать ещё раз</button></div>
    <!-- No comments -->
    <div v-else-if="comments.length === 0" class="comments-empty comments-empty-state" role="status">
      <BIcon name="MessageSquare" class="w-4 h-4 shrink-0" aria-hidden="true" />
      <p class="comments-empty-title">{{ langStore.t.noComments }}</p>
    </div>

    <!-- Comment list -->
    <div v-else class="comments-list stack-y-5" data-testid="discussion-list">
      <div v-for="comment in visibleComments" :key="comment.id" class="stack-y-2">
        <!-- Top-level comment -->
        <div class="flex gap-3">
          <router-link :to="identityHref(comment)" class="shrink-0 mt-0.5">
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
                <router-link :to="identityHref(comment)" class="comment-author text-white text-sm cursor-pointer hover:underline">{{ identityName(comment) }}</router-link><VerificationBadge v-if="comment.author?.is_verified" :type="comment.author.verification_type" icon-class="w-3.5 h-3.5 shrink-0" />
                <span class="comment-meta text-white/55 text-xs">{{ identityHandle(comment) }}</span>
                <span class="comment-meta text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <div class="cursor-pointer hover:scale-105 transition-transform active:scale-95 inline-block">
                <StickerRenderer :src="comment.file_url" size="lg" :loop="true" :autoplay="true" />
              </div>
            </template>

            <!-- Media comment (photo / video / GIF) — media + optional caption -->
            <template v-else-if="['image', 'video', 'gif'].includes(comment.type) && comment.file_url">
              <div class="flex items-center gap-2 mb-1 px-1">
                <router-link :to="identityHref(comment)" class="comment-author text-white text-sm cursor-pointer hover:underline">{{ identityName(comment) }}</router-link><VerificationBadge v-if="comment.author?.is_verified" :type="comment.author.verification_type" icon-class="w-3.5 h-3.5 shrink-0" />
                <span class="comment-meta text-white/55 text-xs">{{ identityHandle(comment) }}</span>
                <span class="comment-meta text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <div class="rounded-2xl overflow-hidden border border-brand-border/50 max-w-[280px] bg-black/20">
                <SafeMedia :src="comment.file_url" :kind="comment.type === 'video' ? 'video' : 'image'" class="w-full h-auto max-h-72 object-contain" />
              </div>
              <p v-if="comment.content" class="comment-content text-white/85 text-sm leading-relaxed mt-1.5 px-1"><LinkifiedText :text="getCommentText(comment.id, comment.content)" /></p>
            </template>

            <!-- Text comment — with bubble -->
            <div v-else class="bg-brand-bg/50 rounded-2xl px-4 py-3 border border-brand-border/50">
              <div class="flex items-center gap-2 mb-1.5">
                <router-link :to="identityHref(comment)" class="comment-author text-white text-sm cursor-pointer hover:underline">{{ identityName(comment) }}</router-link><VerificationBadge v-if="comment.author?.is_verified" :type="comment.author.verification_type" icon-class="w-3.5 h-3.5 shrink-0" />
                <span class="comment-meta text-white/55 text-xs">{{ identityHandle(comment) }}</span>
                <span class="comment-meta text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <p class="comment-content text-white/85 text-sm leading-relaxed"><LinkifiedText :text="getCommentText(comment.id, comment.content)" /></p>
            </div>

            <!-- Actions row -->
            <div class="comment-actions flex items-center gap-3 mt-1.5 pl-1">
              <!-- Vote -->
              <div class="flex items-center gap-0.5 bg-brand-bg rounded-full border border-brand-border/60 px-0.5">
                <button @click="voteComment(comment.id, 1)" aria-label="Нравится комментарий" :disabled="!auth.user || pendingVotes.has(comment.id)" :aria-pressed="userVotes[comment.id] === 1"
                  class="p-0.5 rounded-full transition-all duration-150"
                  :class="(userVotes[comment.id] ?? 0) === 1 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)]' : 'text-white/35 hover:text-emerald-400'">
                  <BIcon name="ArrowBigUp" class="w-4.5 h-4.5" :fill="userVotes[comment.id] === 1 ? 'currentColor' : 'none'" aria-hidden="true" />
                </button>
                <span class="comment-vote-count text-xs font-semibold min-w-[16px] text-center tabular-nums"
                  :class="(userVotes[comment.id] ?? 0) === 1 ? 'text-emerald-400' : (userVotes[comment.id] ?? 0) === -1 ? 'text-rose-400' : comment.rating > 0 ? 'text-emerald-300/80' : comment.rating < 0 ? 'text-rose-300/80' : 'text-white/50'">
                  {{ comment.rating }}
                </span>
                <button @click="voteComment(comment.id, -1)" aria-label="Не нравится комментарий" :disabled="!auth.user || pendingVotes.has(comment.id)" :aria-pressed="userVotes[comment.id] === -1"
                  class="p-0.5 rounded-full transition-all duration-150"
                  :class="(userVotes[comment.id] ?? 0) === -1 ? 'text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.6)]' : 'text-white/35 hover:text-rose-400'">
                  <BIcon name="ArrowBigDown" class="w-4.5 h-4.5" :fill="userVotes[comment.id] === -1 ? 'currentColor' : 'none'" aria-hidden="true" />
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
              <button v-if="auth.user && !commentsDisabled" :disabled="submitting"
                @click="replyingTo = { id: comment.id, username: comment.author?.username ?? comment.group?.slug ?? '' }; replyText = ''; closeStickerPanels()"
                class="text-white/55 hover:text-brand-accent text-xs font-semibold flex items-center gap-1">
                <BIcon name="CornerDownRight" class="w-3 h-3" />
                {{ langStore.t.reply }}
              </button>
              <button v-if="comment.replies?.length > 2"
                @click="toggleReplies(comment.id)" :aria-expanded="expandedReplies.has(comment.id)"
                class="text-brand-accent text-xs font-semibold hover:text-brand-purple">
                <BIcon :name="expandedReplies.has(comment.id) ? 'ChevronUp' : 'ChevronDown'" class="w-4 h-4" aria-hidden="true" />{{ replyMoreLabel(comment) }}
              </button>
              <button v-if="auth.user && (comment.author_id === auth.user.id || canModerate)"
                @click="pendingDelete = comment.id" aria-label="Удалить комментарий"
                :title="comment.author_id === auth.user?.id ? 'Удалить свой комментарий' : 'Удалить комментарий (модерация)'"
                class="ml-auto text-white/55 hover:text-rose-400 p-1">
                <BIcon name="Trash2" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Reply input for this comment -->
            <div v-if="replyingTo?.id === comment.id && !commentsDisabled" class="mt-2 pl-1 relative">
              <!-- Reply sticker panel -->
              <Transition name="popover-up">
                <div v-if="showReplyStickerPanel" class="comment-sticker-popover absolute bottom-full mb-2 left-0 z-50">
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
                <button type="button" @click="removeReplyFile" aria-label="Убрать вложение ответа"
                  class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/70 hover:bg-rose-500 rounded-full flex items-center justify-center text-white">
                  <BIcon name="X" class="w-3 h-3" />
                </button>
              </div>

              <div class="comment-reply-controls flex gap-2 max-md:gap-1.5 items-center">
                <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-7 h-7 rounded-full object-cover border border-brand-border shrink-0 max-md:hidden" />
                <div v-else class="w-7 h-7 rounded-full border border-brand-border shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-[10px] max-md:hidden">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
                <input
                  v-model="replyText" aria-label="Ваш ответ" :disabled="submitting" maxlength="5000"
                  @keydown="onReplyKey"
                  @paste="onReplyPaste"
                  :placeholder="`@${replyingTo?.username}...`"
                  autofocus
                  class="flex-1 max-md:min-w-0 bg-brand-bg border border-brand-border rounded-2xl px-3 py-1.5 text-sm text-white placeholder-brand-muted outline-hidden focus:border-brand-accent"
                />
                <!-- Reply media attach button -->
                <button
                  type="button"
                  @click="replyFileRef?.click()"
                  :class="['shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all',
                    replyFilePreview ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
                  title="Фото / видео / GIF" aria-label="Прикрепить фото, видео или GIF">
                  <BIcon name="Image" class="w-3.5 h-3.5" />
                </button>
                <!-- Reply sticker button -->
                <button
                  type="button"
                  @click="showReplyStickerPanel = !showReplyStickerPanel; showStickerPanel = false"
                  :class="['shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all',
                    showReplyStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-brand-bg border border-brand-border']"
                  title="Стикеры" aria-label="Стикеры">
                  <BIcon name="Sticker" class="w-3.5 h-3.5" />
                </button>
                <button @click="submitReply" :disabled="(!replyText.trim() && !replyFileUrl) || submitting || replyFileUploading"
                  :aria-label="langStore.t.send"
                  class="px-3 py-1.5 bg-brand-accent text-white text-xs font-bold rounded-xl disabled:opacity-40 max-md:shrink-0 max-md:w-7 max-md:h-7 max-md:p-0 max-md:flex max-md:items-center max-md:justify-center">
                  <span class="max-md:hidden">{{ langStore.t.send }}</span>
                  <BIcon name="SendHorizontal" class="w-3.5 h-3.5 md:hidden" />
                </button>
                <button @click="cancelReply" :disabled="submitting" aria-label="Отменить ответ" class="max-md:shrink-0 p-1.5 text-white/55 hover:text-white rounded-xl hover:bg-brand-border">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Nested replies -->
            <div v-if="comment.replies?.length" class="mt-2 stack-y-2 pl-4 border-l-2 border-brand-border">
              <div v-for="reply in replyItems(comment)" :key="reply.id" class="flex gap-3">
                <router-link :to="identityHref(reply)" class="shrink-0 mt-0.5">
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
                      <router-link :to="identityHref(reply)" class="comment-author text-white text-xs cursor-pointer hover:underline">{{ identityName(reply) }}</router-link><VerificationBadge v-if="reply.author?.is_verified" :type="reply.author.verification_type" icon-class="w-3.5 h-3.5 shrink-0" />
                      <span class="comment-meta text-white/55 text-xs ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <div class="cursor-pointer hover:scale-105 transition-transform active:scale-95 inline-block">
                      <StickerRenderer :src="reply.file_url" size="md" :loop="true" :autoplay="true" />
                    </div>
                  </template>

                  <!-- Media reply (photo / video / GIF) -->
                  <template v-else-if="['image', 'video', 'gif'].includes(reply.type) && reply.file_url">
                    <div class="flex items-center gap-2 mb-1 px-1">
                      <router-link :to="identityHref(reply)" class="comment-author text-white text-xs cursor-pointer hover:underline">{{ identityName(reply) }}</router-link><VerificationBadge v-if="reply.author?.is_verified" :type="reply.author.verification_type" icon-class="w-3.5 h-3.5 shrink-0" />
                      <span class="comment-meta text-white/55 text-xs ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <div class="rounded-2xl overflow-hidden border border-brand-border/50 max-w-[240px] bg-black/20">
                      <SafeMedia :src="reply.file_url" :kind="reply.type === 'video' ? 'video' : 'image'" class="w-full h-auto max-h-64 object-contain" />
                    </div>
                    <p v-if="reply.content" class="comment-content text-white/85 text-sm leading-relaxed mt-1 px-1"><LinkifiedText :text="getCommentText(reply.id, reply.content)" /></p>
                  </template>

                  <!-- Text reply -->
                  <div v-else class="bg-brand-bg/50 rounded-2xl px-4 py-2.5 border border-brand-border/50">
                    <div class="flex items-center gap-2 mb-1">
                      <router-link :to="identityHref(reply)" class="comment-author text-white text-xs cursor-pointer hover:underline">{{ identityName(reply) }}</router-link><VerificationBadge v-if="reply.author?.is_verified" :type="reply.author.verification_type" icon-class="w-3.5 h-3.5 shrink-0" />
                      <span class="comment-meta text-white/55 text-xs ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <p class="comment-content text-white/85 text-sm leading-relaxed"><LinkifiedText :text="getCommentText(reply.id, reply.content)" /></p>
                  </div>

                  <div class="comment-actions flex items-center gap-3 mt-1 pl-1">
                    <div class="flex items-center gap-0.5 bg-brand-bg rounded-full border border-brand-border/60 px-0.5">
                      <button @click="voteComment(reply.id, 1)" aria-label="Нравится ответ" :disabled="!auth.user || pendingVotes.has(reply.id)" :aria-pressed="userVotes[reply.id] === 1"
                        class="p-0.5 rounded-full transition-all duration-150"
                        :class="(userVotes[reply.id] ?? 0) === 1 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)]' : 'text-white/35 hover:text-emerald-400'">
                        <BIcon name="ArrowBigUp" class="w-4.5 h-4.5" :fill="userVotes[reply.id] === 1 ? 'currentColor' : 'none'" aria-hidden="true" />
                      </button>
                      <span class="comment-vote-count text-xs font-semibold min-w-[14px] text-center tabular-nums"
                        :class="(userVotes[reply.id] ?? 0) === 1 ? 'text-emerald-400' : (userVotes[reply.id] ?? 0) === -1 ? 'text-rose-400' : reply.rating > 0 ? 'text-emerald-300/80' : reply.rating < 0 ? 'text-rose-300/80' : 'text-white/50'">{{ reply.rating }}</span>
                      <button @click="voteComment(reply.id, -1)" aria-label="Не нравится ответ" :disabled="!auth.user || pendingVotes.has(reply.id)" :aria-pressed="userVotes[reply.id] === -1"
                        class="p-0.5 rounded-full transition-all duration-150"
                        :class="(userVotes[reply.id] ?? 0) === -1 ? 'text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.6)]' : 'text-white/35 hover:text-rose-400'">
                        <BIcon name="ArrowBigDown" class="w-4.5 h-4.5" :fill="userVotes[reply.id] === -1 ? 'currentColor' : 'none'" aria-hidden="true" />
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
                    <button v-if="auth.user && !commentsDisabled" :disabled="submitting"
                      @click="replyingTo = { id: comment.id, username: identityHandle(reply).slice(1) }; replyText = `${identityHandle(reply)} `; closeStickerPanels()"
                      class="text-white/55 hover:text-brand-accent text-xs font-semibold flex items-center gap-1">
                      <BIcon name="CornerDownRight" class="w-3 h-3" />
                      {{ langStore.t.reply }}
                    </button>
                    <button v-if="auth.user && (reply.author_id === auth.user.id || canModerate)"
                      @click="pendingDelete = reply.id" aria-label="Удалить ответ"
                      :title="reply.author_id === auth.user?.id ? 'Удалить свой ответ' : 'Удалить ответ (модерация)'"
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
      <button v-if="visibleLimit < sortedComments.length" type="button" class="comments-load-more" @click="visibleLimit += previewLimit || 3">
        <BIcon name="MessagesSquare" class="w-4 h-4" aria-hidden="true" /> Показать ещё {{ Math.min(previewLimit || 3, sortedComments.length - visibleLimit) }}
      </button>
    </div>
    <div v-if="loadError && comments.length" class="comment-action-error" role="alert">{{ loadError }} <button type="button" @click="fetchComments(true)">Попробовать ещё раз</button></div>
    <div v-if="actionError" class="comment-action-error" role="alert">{{ actionError }}</div>
    <div v-if="pendingDelete" class="comment-delete-confirm" role="alert">
      <p>Удалить этот комментарий?</p><div><button @click="pendingDelete = null" :disabled="deleting">Отмена</button><button @click="deleteComment(pendingDelete!)" :disabled="deleting">{{ deleting ? 'Удаление…' : 'Удалить' }}</button></div>
    </div>
  </div>
</template>

<style scoped>
.comment-actions { flex-wrap:wrap; row-gap:6px; }
.comment-actions > button { flex-shrink:0; width:auto; }
.comment-compose-controls .comment-send { height:auto; min-height:44px; padding-block:10px; max-width:100%; line-height:1.3; }
.comments-refresh { display:grid; place-items:center; min-width:36px; min-height:36px; border-radius:10px; border:1px solid var(--color-brand-border); color:var(--color-brand-accent-minus); }
.comments-preview { display:flex; flex-direction:column; margin:0; padding:0; }
.comments-preview .comments-scroll { order:1; padding-top:4px; }
.comments-preview > .comment-composer,.comments-preview > .comment-access-message { order:3; }
.comments-preview .comments-empty { padding:16px 8px; }
.comments-preview .comment-compose-controls textarea { min-height:48px; height:48px; }
.comments-load-more { width:100%; margin-top:16px; min-height:44px; display:flex; gap:8px; align-items:center; justify-content:center; border:1px solid var(--color-brand-border); border-radius:14px; color:var(--color-brand-accent-minus); font-size:var(--comment-label-size); font-weight:600; }
.comments-list :is(.text-white\/35,.text-white\/40,.text-white\/50,.text-white\/55) { color:var(--color-brand-accent-minus-minus); }
.comments-list :is(.text-brand-accent,.text-brand-purple) { color:var(--color-brand-accent-minus); }
.comments-list button[aria-label*="Нравится"],.comments-list button[aria-label*="нравится"] { min-width:36px; min-height:36px; display:grid; place-items:center; }
.comments-list button[aria-label*="Нравится"] + span { font-size:14px; min-width:24px; }
.comments-list :is(.text-emerald-400,.text-emerald-300\/80) { color:var(--color-brand-success); }
.comments-list :is(.text-rose-400,.text-rose-300\/80) { color:var(--color-brand-pink); }
.comments-list .border-l-2 { border-color:var(--color-brand-accent-plus); margin-top:12px; padding-left:12px; }
.comments-list button[aria-expanded] { display:inline-flex; align-items:center; gap:6px; font-size:13px; }
.comments-list .flex.items-center.gap-0\.5 { border-radius:12px; }

.comments-root {
  --comment-text-size:.875rem;
  --comment-label-size:.8125rem;
  --comment-meta-size:.75rem;
  margin-top:16px;
  font-family:var(--font-nunito);
  font-size:var(--comment-text-size);
  line-height:1.5;
}
.comment-author { font-size:var(--comment-text-size); font-weight:700; line-height:1.5; }
.comment-meta { font-size:var(--comment-meta-size); line-height:1.5; }
.comment-content { font-size:var(--comment-text-size); line-height:1.5; }
.comment-actions { column-gap:10px; }
.comment-actions > button { font-size:var(--comment-meta-size); font-weight:600; line-height:1.5; }
.comment-actions > button svg { width:14px; height:14px; }
.comment-vote-count { font-size:var(--comment-text-size); font-weight:600; min-width:24px; }
.comments-root :is(p,strong,a,span) { overflow-wrap:anywhere; }
.comments-root :is(button,a,textarea,select):focus-visible { outline:2px solid var(--color-brand-accent-minus); outline-offset:2px; }
.comments-root button { cursor:pointer; }
.comments-root button:disabled { opacity:.45; cursor:default; }
.comment-composer { padding:16px 0; }
.comment-input-label { display:block; margin-bottom:8px; font-size:var(--comment-label-size); font-weight:600; color:var(--color-brand-accent-minus-minus); }
.comment-compose-controls { display:grid; grid-template-columns:44px 44px minmax(0,1fr); gap:8px; align-items:center; }
.comment-compose-controls textarea { grid-column:1 / -1; width:100%; min-width:0; max-height:160px; resize:vertical; font-family:inherit; font-size:var(--comment-text-size); line-height:1.5; min-height:80px; padding:12px 14px; color:var(--color-brand-offwhite); }
.comment-compose-controls textarea::placeholder { color:var(--color-brand-accent-minus-minus); opacity:.6; }
.comment-compose-controls > button { min-height:44px; min-width:44px; width:auto; height:44px; }
.comment-compose-controls .comment-send { font-size:var(--comment-label-size); font-weight:600; justify-self:end; display:flex; align-items:center; justify-content:center; padding:0 16px; }
.comment-send :deep(.max-md\:hidden) { display:inline; }
.comment-send :deep(svg.md\:hidden) { display:none; }
.comment-editor { min-width:0; }
.comments-fullscreen { flex:1; min-height:0; display:flex; flex-direction:column; margin:0; overflow:hidden; }
.comments-fullscreen > .comment-composer { order:3; flex-shrink:0; padding:16px 24px max(16px,env(safe-area-inset-bottom)); border-top:1px solid var(--color-brand-border); background:var(--color-brand-card); }
.comments-fullscreen > .comment-access-message { order:3; border-radius:0; padding:20px 24px max(20px,env(safe-area-inset-bottom)); flex-shrink:0; margin:0; color:var(--color-brand-accent-minus-minus); }
.comments-scroll { padding-top:12px; }
.comments-fullscreen .comments-scroll { order:1; flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; padding:24px; scroll-padding-block:16px; }

.comments-list-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:16px; font-weight:600; font-size:var(--comment-label-size); }
.comments-list-heading select { min-height:36px; max-width:100%; padding:6px 10px; border:1px solid var(--color-brand-border); border-radius:10px; font-weight:500; font-size:var(--comment-meta-size); color:var(--color-brand-accent-minus-minus); background:var(--color-brand-bg); }
.comments-list :deep(p) { white-space:pre-wrap; overflow-wrap:anywhere; }
.comments-list :deep(button) { min-height:32px; min-width:28px; }
.comments-list :deep(.flex.items-center.gap-2.mb-1\.5),.comments-list :deep(.flex.items-center.gap-2.mb-1) { flex-wrap:wrap; gap:4px 8px; }
.comments-list :deep(.flex.items-center.gap-3.mt-1\.5) { flex-wrap:wrap; gap:4px 10px; }
.comment-reply-controls { flex-wrap:wrap; }
.comment-reply-controls input { flex-basis:100%; }
.comment-reply-controls button { min-width:40px; min-height:40px; }
.comments-list :deep(input) { min-width:0; min-height:44px; font-size:16px; }
.comments-list :deep(.bg-brand-bg\/50) { background:color-mix(in srgb,var(--color-brand-bg) 65%,transparent); }
.comments-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:20px 12px; text-align:center; color:var(--color-brand-accent-minus-minus); font-size:var(--comment-label-size); line-height:1.5; }
.comments-empty p { max-width:40ch; }
.comments-empty-state { flex-direction:row; justify-content:center; padding:14px 8px; gap:8px; color:color-mix(in srgb,var(--color-brand-accent-minus-minus) 70%,var(--color-brand-card)); }
.comments-empty-title { font-size:var(--comment-label-size); font-weight:500; line-height:1.5; }
.comments-retry { min-height:44px; margin-top:4px; padding:8px 16px; border-radius:12px; border:1px solid var(--color-brand-accent); color:var(--color-brand-accent-minus-minus); }
.comment-action-error { order:2; padding:12px 24px; color:var(--color-brand-pink); font-size:13px; background:var(--color-brand-bg); }
.comment-delete-confirm { order:2; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 24px; background:var(--color-brand-bg); font-size:14px; }
.comment-delete-confirm > div { display:flex; gap:8px; }
.comment-delete-confirm button { min-height:44px; padding:8px 12px; border:1px solid var(--color-brand-border); border-radius:12px; }
.comment-delete-confirm button:last-child { color:var(--color-brand-pink); }
.comment-guest { display:flex; align-items:center; gap:12px; font-size:13px; line-height:1.5; background:var(--color-brand-bg); }
.comment-guest p { flex:1; }
.comment-guest a { color:var(--color-brand-accent-minus); font-weight:800; padding:12px; }
.comment-sticker-popover { width:340px; max-width:100%; }
.comment-sticker-popover :deep(.sticker-panel) { width:100% !important; max-height:min(440px,50dvh) !important; }
@media(min-width:1200px) { .post-dialog--text .comments-scroll { padding:28px 32px; } }
@media(max-width:767px) { .comment-compose-controls textarea { font-size:16px; } }
@media(max-width:900px) {
  .comments-fullscreen .comments-scroll { padding:20px; }
  .comments-fullscreen > .comment-composer { padding:12px 16px max(12px,env(safe-area-inset-bottom)); }
  .comments-fullscreen .comment-input-label { margin-bottom:6px; }
  .comment-compose-controls textarea { min-height:64px; }
  .comment-delete-confirm { flex-wrap:wrap; }
}
@media(max-height:500px) { .comments-fullscreen .comment-input-label { display:none; } .comment-compose-controls textarea { min-height:44px; height:44px; padding-block:8px; } .comments-fullscreen > .comment-composer { padding-block:8px; } }
@media(prefers-reduced-motion:reduce) { .comments-root * { transition:none !important; animation:none !important; } }

.popover-up-enter-active,
.popover-up-leave-active { transition: all 0.15s ease; }
.popover-up-enter-from,
.popover-up-leave-to    { opacity: 0; transform: translateY(6px) scale(0.97); }
.popover-up-enter-to,
.popover-up-leave-from  { opacity: 1; transform: translateY(0) scale(1); }
</style>
