<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useCollectionTranslate } from '@/composables/useAutoTranslate'
import BIcon from './BIcon.vue'

const props = defineProps<{ postId: string }>()

const auth = useAuthStore()
const langStore = useLangStore()
const { enqueue: translateItem, getTranslation, isTranslating: isItemTranslating } = useCollectionTranslate()

// Track which items are showing translation
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
    translateItem(c.id, c.content)
    c.replies?.forEach((r: any) => translateItem(r.id, r.content))
  })
}

const comments = ref<any[]>([])
const isLoading = ref(false)
const commentText = ref('')
const replyingTo = ref<{ id: string; username: string } | null>(null)
const replyText = ref('')
const submitting = ref(false)
const expandedReplies = ref<Set<string>>(new Set())

const fetchComments = async () => {
  isLoading.value = true
  try {
    const res = await api.get(`/posts/${props.postId}/comments`)
    if (res.data.success) {
      comments.value = res.data.data.comments
      if (langStore.autoTranslateEnabled) autoEnqueueAll()
    }
  } catch {}
  isLoading.value = false
}

// Auto-translate all comments when setting is toggled on
watch(() => langStore.autoTranslateEnabled, (enabled) => {
  if (enabled) autoEnqueueAll()
})

onMounted(fetchComments)

const formatDate = (d: string) => {
  const date = new Date(d)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return `${Math.floor(diff / 86400)}д`
}

const submitComment = async () => {
  if (!commentText.value.trim() || submitting.value) return
  submitting.value = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, { content: commentText.value.trim() })
    if (res.data.success) {
      comments.value.unshift({ ...res.data.data.comment, replies: [], _count: { replies: 0 } })
      commentText.value = ''
    }
  } catch {}
  submitting.value = false
}

const submitReply = async () => {
  if (!replyText.value.trim() || !replyingTo.value || submitting.value) return
  submitting.value = true
  try {
    const res = await api.post(`/posts/${props.postId}/comments`, {
      content: replyText.value.trim(),
      parentId: replyingTo.value.id,
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

const cancelReply = () => { replyingTo.value = null; replyText.value = '' }

const toggleReplies = (commentId: string) => {
  if (expandedReplies.value.has(commentId)) expandedReplies.value.delete(commentId)
  else expandedReplies.value.add(commentId)
}

const voteComment = async (commentId: string, value: 1 | -1) => {
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
  } catch {}
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
</script>

<template>
  <div class="mt-4 space-y-3">
    <!-- Comment input -->
    <div class="flex gap-3 items-start">
      <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5" />
      <div v-else class="w-8 h-8 rounded-full border border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
      <div class="flex-1 flex gap-2">
        <input
          v-model="commentText"
          @keydown.enter.prevent="submitComment"
          :placeholder="langStore.t.writeComment"
          class="flex-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent"
        />
        <button
          @click="submitComment"
          :disabled="!commentText.trim() || submitting"
          class="px-4 py-2 bg-brand-accent text-white text-sm font-bold rounded-2xl disabled:opacity-40 flex-shrink-0">
          <BIcon v-if="submitting" name="Loader2" class="w-4 h-4 animate-spin" />
          <span v-else>{{ langStore.t.send }}</span>
        </button>
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
          <img v-if="comment.author.avatar_url"
            :src="comment.author.avatar_url"
            class="w-8 h-8 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5"
          />
          <div v-else class="w-8 h-8 rounded-full border border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs">{{ (comment.author.display_name || comment.author.username || '?')[0].toUpperCase() }}</div>
          <div class="flex-1 min-w-0">
            <div class="bg-brand-bg/50 rounded-2xl px-4 py-3 border border-brand-border/50">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="font-bold text-white text-sm">{{ comment.author.display_name || comment.author.username }}</span>
                <span class="text-white/55 text-xs">@{{ comment.author.username }}</span>
                <span class="text-white/55 text-xs ml-auto">{{ formatDate(comment.created_at) }}</span>
              </div>
              <p class="text-white/85 text-sm leading-relaxed">{{ getCommentText(comment.id, comment.content) }}</p>
            </div>
            <!-- Actions row -->
            <div class="flex items-center gap-3 mt-1.5 pl-1">
              <!-- Vote -->
              <div class="flex items-center gap-1">
                <button @click="voteComment(comment.id, 1)" class="p-1 text-white/55 hover:text-emerald-400 rounded">
                  <BIcon name="ArrowUp" class="w-3.5 h-3.5" />
                </button>
                <span class="text-xs font-bold min-w-[16px] text-center"
                  :class="comment.rating > 0 ? 'text-emerald-400' : comment.rating < 0 ? 'text-rose-400' : 'text-white/55'">
                  {{ comment.rating }}
                </span>
                <button @click="voteComment(comment.id, -1)" class="p-1 text-white/55 hover:text-rose-400 rounded">
                  <BIcon name="ArrowDown" class="w-3.5 h-3.5" />
                </button>
              </div>
              <!-- Translate comment button -->
              <button
                @click="toggleCommentTranslate(comment.id, comment.content)"
                class="text-white/40 hover:text-brand-accent text-xs flex items-center gap-0.5 transition-colors"
                :title="showTranslationFor.has(comment.id) ? langStore.t.showOriginal : langStore.t.autoTranslate">
                <span v-if="isItemTranslating(comment.id)" class="w-3 h-3 border border-brand-accent/60 border-t-transparent rounded-full animate-spin" />
                <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
              </button>
              <button @click="replyingTo = { id: comment.id, username: comment.author.username }; replyText = ''"
                class="text-white/55 hover:text-brand-accent text-xs font-semibold flex items-center gap-1">
                <BIcon name="CornerDownRight" class="w-3 h-3" />
                {{ langStore.t.reply }}
              </button>
              <button v-if="comment._count.replies > 0 || comment.replies?.length > 0"
                @click="toggleReplies(comment.id)"
                class="text-brand-accent text-xs font-semibold hover:text-brand-purple">
                {{ expandedReplies.has(comment.id) ? '▲' : '▼' }} {{ comment._count.replies || comment.replies?.length }} {{ langStore.t.replies }}
              </button>
              <button v-if="comment.author.id === auth.user?.id"
                @click="deleteComment(comment.id)"
                class="ml-auto text-white/55 hover:text-rose-400 p-1">
                <BIcon name="Trash2" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Reply input for this comment -->
            <div v-if="replyingTo?.id === comment.id" class="mt-2 flex gap-2 items-center pl-1">
              <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-7 h-7 rounded-full object-cover border border-brand-border flex-shrink-0" />
              <div v-else class="w-7 h-7 rounded-full border border-brand-border flex-shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-[10px]">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
              <input
                v-model="replyText"
                @keydown.enter.prevent="submitReply"
                :placeholder="`@${replyingTo.username}...`"
                autofocus
                class="flex-1 bg-brand-bg border border-brand-border rounded-2xl px-3 py-1.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent"
              />
              <button @click="submitReply" :disabled="!replyText.trim() || submitting"
                class="px-3 py-1.5 bg-brand-accent text-white text-xs font-bold rounded-xl disabled:opacity-40">
                {{ langStore.t.send }}
              </button>
              <button @click="cancelReply" class="p-1.5 text-white/55 hover:text-white rounded-xl hover:bg-brand-border">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- Nested replies -->
            <div v-if="expandedReplies.has(comment.id) && comment.replies?.length" class="mt-2 space-y-2 pl-4 border-l-2 border-brand-border">
              <div v-for="reply in comment.replies" :key="reply.id" class="flex gap-3">
                <img v-if="reply.author.avatar_url"
                  :src="reply.author.avatar_url"
                  class="w-7 h-7 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5"
                />
                <div v-else class="w-7 h-7 rounded-full border border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-[10px]">{{ (reply.author.display_name || reply.author.username || '?')[0].toUpperCase() }}</div>
                <div class="flex-1 min-w-0">
                  <div class="bg-brand-bg/50 rounded-2xl px-4 py-2.5 border border-brand-border/50">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-bold text-white text-xs">{{ reply.author.display_name || reply.author.username }}</span>
                      <span class="text-white/55 text-[11px] ml-auto">{{ formatDate(reply.created_at) }}</span>
                    </div>
                    <p class="text-white/85 text-sm leading-relaxed">{{ getCommentText(reply.id, reply.content) }}</p>
                  </div>
                  <div class="flex items-center gap-3 mt-1 pl-1">
                    <div class="flex items-center gap-1">
                      <button @click="voteComment(reply.id, 1)" class="p-1 text-white/55 hover:text-emerald-400 rounded">
                        <BIcon name="ArrowUp" class="w-3 h-3" />
                      </button>
                      <span class="text-xs font-bold" :class="reply.rating > 0 ? 'text-emerald-400' : reply.rating < 0 ? 'text-rose-400' : 'text-white/55'">{{ reply.rating }}</span>
                      <button @click="voteComment(reply.id, -1)" class="p-1 text-white/55 hover:text-rose-400 rounded">
                        <BIcon name="ArrowDown" class="w-3 h-3" />
                      </button>
                    </div>
                    <!-- Translate reply button -->
                    <button
                      @click="toggleCommentTranslate(reply.id, reply.content)"
                      class="text-white/40 hover:text-brand-accent text-xs flex items-center gap-0.5 transition-colors"
                      :title="showTranslationFor.has(reply.id) ? langStore.t.showOriginal : langStore.t.autoTranslate">
                      <span v-if="isItemTranslating(reply.id)" class="w-2.5 h-2.5 border border-brand-accent/60 border-t-transparent rounded-full animate-spin" />
                      <svg v-else class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>
                    </button>
                    <button v-if="reply.author.id === auth.user?.id"
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
