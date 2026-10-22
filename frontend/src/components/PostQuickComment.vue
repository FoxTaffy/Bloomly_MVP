<script setup lang="ts">
// Быстрый комментарий прямо в карточке ленты — без открытия полноэкранного обсуждения.
// Черновик хранится под тем же ключом sessionStorage, что и в PostComments, поэтому
// начатый здесь текст подхватывается окном обсуждения и наоборот.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
import BIcon from './BIcon.vue'

const props = defineProps<{ postId: string }>()
const emit = defineEmits<{
  (e: 'sent', comment: any): void
  (e: 'open'): void
}>()

const auth = useAuthStore()
const langStore = useLangStore()

const draftKey = () => `bloomly-comment-draft:${auth.user?.id ?? 'guest'}:${props.postId}`
function readDraft() { try { return sessionStorage.getItem(draftKey()) ?? '' } catch { return '' } }

const text = ref(readDraft())
const submitting = ref(false)
const error = ref('')
const sentNotice = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)
let disposed = false
let noticeTimer: ReturnType<typeof setTimeout> | null = null

watch(text, value => {
  try { if (value) sessionStorage.setItem(draftKey(), value); else sessionStorage.removeItem(draftKey()) } catch { /* storage may be unavailable */ }
  if (value) error.value = ''
  autoSize()
})
// Примитивный ключ: смена объекта auth.user с тем же id ничего не сбрасывает.
watch(() => `${props.postId}:${auth.user?.id ?? ''}`, () => { text.value = readDraft(); error.value = '' })

const canSend = computed(() => !!text.value.trim() && !submitting.value)

function autoSize() {
  const el = inputRef.value
  if (!el) return
  requestAnimationFrame(() => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
}

async function send() {
  const content = text.value.trim()
  if (!content || submitting.value || !auth.user) return
  const requestPostId = props.postId
  const requestUserId = auth.user.id
  submitting.value = true
  error.value = ''
  try {
    const res = await api.post(`/posts/${requestPostId}/comments`, { content })
    if (!res.data?.success) throw new Error('Comment rejected')
    if (disposed || requestPostId !== props.postId || requestUserId !== auth.user?.id) return
    text.value = ''
    sentNotice.value = true
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { sentNotice.value = false }, 6000)
    emit('sent', res.data.data?.comment)
  } catch (e: any) {
    if (!disposed) error.value = e?.response?.data?.error?.message || 'Не удалось отправить комментарий. Текст сохранён — попробуйте ещё раз.'
  } finally {
    if (!disposed) submitting.value = false
  }
}

onBeforeUnmount(() => { disposed = true; if (noticeTimer) clearTimeout(noticeTimer) })
</script>

<template>
  <div class="mt-3" @click.stop>
    <div class="flex items-end gap-2">
      <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" class="w-8 h-8 rounded-full object-cover border border-brand-border shrink-0 mb-0.5" @error="onAvatarError" />
      <div v-else class="w-8 h-8 rounded-full border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs shrink-0 mb-0.5">
        {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
      </div>
      <div class="quick-comment-field flex-1 min-w-0 flex items-end gap-1 bg-brand-bg border border-brand-border rounded-2xl pl-3.5 pr-1 py-1 transition-colors focus-within:border-brand-accent">
        <textarea ref="inputRef" v-model="text" rows="1" maxlength="5000"
          :disabled="submitting"
          :placeholder="langStore.t.writeComment || 'Написать комментарий…'"
          aria-label="Быстрый комментарий к публикации"
          @keydown="onKey"
          class="flex-1 min-w-0 resize-none bg-transparent outline-hidden text-sm max-md:text-base text-white placeholder-brand-muted py-1.5 leading-5 max-h-[132px]"></textarea>
        <button type="button" @click="emit('open')"
          class="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white/45 hover:text-brand-accent hover:bg-brand-border/60 transition-colors"
          aria-label="Открыть обсуждение: фото, стикеры, ответы" title="Открыть обсуждение">
          <BIcon name="Maximize2" class="w-4 h-4" aria-hidden="true" />
        </button>
        <button type="button" @click="send" :disabled="!canSend"
          class="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-brand-accent text-white transition-opacity disabled:opacity-35 disabled:cursor-default"
          :aria-label="langStore.t.send || 'Отправить'" :title="langStore.t.send || 'Отправить'">
          <BIcon :name="submitting ? 'Loader2' : 'SendHorizontal'" :class="['w-4 h-4', { 'animate-spin': submitting }]" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-if="error" class="mt-1.5 pl-10 text-xs text-rose-400" role="alert">{{ error }}</p>
    <p v-else-if="sentNotice" class="mt-1.5 pl-10 text-xs text-white/55" role="status">
      Комментарий опубликован ·
      <button type="button" class="text-brand-accent font-semibold hover:underline" @click="emit('open')">открыть обсуждение</button>
    </p>
  </div>
</template>
