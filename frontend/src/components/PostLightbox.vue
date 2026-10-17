<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from './BIcon.vue'
import VerificationBadge from './VerificationBadge.vue'
import PostComments from './PostComments.vue'
import CustomPlayer from './CustomPlayer.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import { isVideoUrl } from '@/lib/mediaType'

const props = defineProps<{
  images: string[]
  originalImages?: string[]
  types?: string[]
  startIndex?: number
  postId?: string
  author?: {
    id?: string
    username: string
    display_name?: string | null
    avatar_url?: string | null
    is_verified?: boolean
    verification_type?: string | null
    deceased_at?: string | null
  } | null
  createdAt?: string | null
  content?: string | null
  /** Author id used for the "can't repaw own post" check — falls back to author.id when omitted. */
  authorId?: string | null
  rating?: number
  initialVote?: 1 | -1 | 0
  initialRepawed?: boolean
  initialFavourited?: boolean
  repawCount?: number
  commentsCount?: number
  viewsCount?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'voted', payload: { postId: string; vote: 1 | -1 | 0; rating: number }): void
  (e: 'repaw-toggled', payload: { postId: string; repawed: boolean; count: number }): void
  (e: 'favourite-changed', payload: { postId: string; favourited: boolean }): void
}>()
const router = useRouter()
const authStore = useAuthStore()

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function formatPostDate(d?: string | null): string {
  if (!d) return ''
  const date = new Date(d)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const day = `${date.getDate()} ${MONTHS_RU[date.getMonth()]}${sameYear ? '' : ' ' + date.getFullYear()}`
  return `${day} в ${hh}:${mm}`
}

function goToAuthor() {
  if (!props.author?.username) return
  emit('close')
  router.push(`/profile/${props.author.username}`)
}

const showComments = ref(!!props.postId)
const isVideo = isVideoUrl

// ── Vote / repaw / favourite (mirrors PostCard.vue) ─────────────────────────
const localRating     = ref(props.rating ?? 0)
const localVote       = ref<1 | -1 | 0>(props.initialVote ?? 0)
const localRepawed    = ref(props.initialRepawed ?? false)
const localRepaws     = ref(props.repawCount ?? 0)
const localFavourited = ref(props.initialFavourited ?? false)
const votePending  = ref(false)
const repawPending = ref(false)
const isOwnPost = computed(() => !!authStore.user?.id && authStore.user.id === (props.authorId ?? props.author?.id))

watch(() => props.rating, (v) => { if (v !== undefined) localRating.value = v })
watch(() => props.initialVote, (v) => { if (v !== undefined) localVote.value = v })
watch(() => props.initialRepawed, (v) => { if (v !== undefined) localRepawed.value = v })
watch(() => props.initialFavourited, (v) => { if (v !== undefined) localFavourited.value = v })
watch(() => props.repawCount, (v) => { if (v !== undefined) localRepaws.value = v })

async function vote(value: 1 | -1) {
  if (!props.postId || !authStore.isAuthenticated || votePending.value) return
  votePending.value = true
  const prev = localVote.value
  const prevRating = localRating.value
  const next: 1 | -1 | 0 = prev === value ? 0 : value
  localVote.value = next
  localRating.value = prevRating + (next - prev)
  try {
    const r = await api.post(`/posts/${props.postId}/vote`, { value })
    if (r.data.success) localRating.value = r.data.data.rating ?? localRating.value
    emit('voted', { postId: props.postId, vote: next, rating: localRating.value })
  } catch {
    localVote.value = prev
    localRating.value = prevRating
  } finally {
    votePending.value = false
  }
}

async function toggleRepaw() {
  if (!props.postId || !authStore.isAuthenticated || repawPending.value || isOwnPost.value) return
  repawPending.value = true
  const wasRepawed = localRepawed.value
  localRepawed.value = !wasRepawed
  localRepaws.value += wasRepawed ? -1 : 1
  try {
    const r = await api.post(`/posts/${props.postId}/repaw`, {})
    if (r.data.success) {
      localRepawed.value = r.data.data.repawed
      localRepaws.value = r.data.data.repaw_count
    } else {
      localRepawed.value = wasRepawed
      localRepaws.value += wasRepawed ? 1 : -1
    }
    emit('repaw-toggled', { postId: props.postId, repawed: localRepawed.value, count: localRepaws.value })
  } catch {
    localRepawed.value = wasRepawed
    localRepaws.value += wasRepawed ? 1 : -1
  } finally {
    repawPending.value = false
  }
}

async function toggleFavourite() {
  if (!props.postId || !authStore.isAuthenticated) return
  try {
    const r = await api.post(`/posts/${props.postId}/favourite`)
    if (r.data.success) {
      localFavourited.value = r.data.data.favourited
      emit('favourite-changed', { postId: props.postId, favourited: r.data.data.favourited })
    }
  } catch {}
}

const current = ref(props.startIndex ?? 0)
const total = computed(() => props.images.length)
const currentUrl = computed(() => props.images[current.value])
const currentOriginalUrl = computed(() => props.originalImages?.[current.value] || currentUrl.value)
const currentMsgType = computed(() => props.types?.[current.value])

const downloading = ref(false)
async function downloadOriginal() {
  const url = currentOriginalUrl.value
  downloading.value = true
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = url.split('/').pop() || 'image'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  } finally {
    downloading.value = false
  }
}

const prev = () => { current.value = (current.value - 1 + total.value) % total.value }
const next = () => { current.value = (current.value + 1) % total.value }

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
  if (e.key === 'c' && props.postId) showComments.value = !showComments.value
}

const onWheel = (e: WheelEvent) => {
  if (showComments.value) return
  e.preventDefault()
  if (e.deltaY > 0 || e.deltaX > 0) next()
  else prev()
}

// Touch: горизонтальный свайп — навигация, свайп вниз — закрытие
let touchStartX = 0
let touchStartY = 0
let multiTouch = false
const onTouchStart = (e: TouchEvent) => {
  if (e.touches.length > 1) multiTouch = true
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}
const onTouchEnd = (e: TouchEvent) => {
  // Жест с несколькими пальцами (pinch) не считаем свайпом
  if (multiTouch) { if (e.touches.length === 0) multiTouch = false; return }
  const dx = touchStartX - e.changedTouches[0].clientX
  const dy = e.changedTouches[0].clientY - touchStartY
  if (dy > 100 && dy > Math.abs(dx) * 1.5) { emit('close'); return }
  if (Math.abs(dx) > 50) dx > 0 ? next() : prev()
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[300] flex overflow-hidden" @wheel.prevent="onWheel">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/95" @click.self="emit('close')" />

      <!-- ── Media panel ─────────────────────────────────────────────── -->
      <div
        class="relative z-10 flex flex-col items-center justify-center transition-all duration-300 flex-shrink-0"
        :class="showComments ? 'w-full md:w-[60%]' : 'w-full'"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <!-- Top bar -->
        <div class="lightbox-topbar absolute top-0 left-0 right-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div v-if="total > 1" class="px-3 py-1 rounded-full bg-black/60 border border-white/10 text-white text-sm font-bold backdrop-blur-sm pointer-events-auto">
            {{ current + 1 }}&thinsp;/&thinsp;{{ total }}
          </div>
          <div v-else />
          <div class="flex items-center gap-2 pointer-events-auto">
            <!-- Toggle comments -->
            <button
              v-if="postId"
              @click="showComments = !showComments"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-sm font-semibold transition-all backdrop-blur-sm"
              :class="showComments
                ? 'bg-brand-accent/20 border-brand-accent/50 text-brand-accent'
                : 'bg-black/50 border-white/15 text-white hover:bg-black/70'"
              :title="showComments ? 'Скрыть комментарии (C)' : 'Комментарии (C)'"
            >
              <BIcon name="MessageSquare" class="w-4 h-4" />
              <BIcon
                :name="showComments ? 'ChevronRight' : 'ChevronLeft'"
                class="w-3.5 h-3.5 transition-transform"
              />
            </button>
            <!-- Download original -->
            <button
              v-if="!isVideo(currentUrl)"
              @click="downloadOriginal"
              :disabled="downloading"
              class="w-9 h-9 rounded-full bg-black/60 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors disabled:opacity-50"
              title="Скачать оригинал"
            >
              <BIcon name="Download" class="w-4.5 h-4.5" />
            </button>
            <!-- Close -->
            <button
              @click="emit('close')"
              class="w-11 h-11 rounded-full bg-black/70 border border-white/30 shadow-lg backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/85 transition-colors"
              title="Закрыть (Esc)"
              aria-label="Закрыть"
            >
              <BIcon name="X" class="w-6 h-6" />
            </button>
          </div>
        </div>

        <!-- Media -->
        <div class="lightbox-media-wrap" @click.self="emit('close')">
          <CustomPlayer
            :key="currentUrl"
            :src="currentUrl"
            :msg-type="currentMsgType"
            @click-image="() => {}"
          />
        </div>

        <!-- Prev -->
        <button
          v-if="total > 1"
          @click="prev"
          class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white border border-white/15 transition-colors"
        >
          <BIcon name="ChevronLeft" class="w-6 h-6" />
        </button>

        <!-- Next -->
        <button
          v-if="total > 1"
          @click="next"
          class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white border border-white/15 transition-colors"
        >
          <BIcon name="ChevronRight" class="w-6 h-6" />
        </button>

        <!-- Thumbs strip -->
        <div v-if="total > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
          <button
            v-for="(url, idx) in images"
            :key="idx"
            @click="current = idx"
            class="w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all"
            :class="idx === current ? 'border-brand-accent scale-105' : 'border-white/20 opacity-50 hover:opacity-80'"
          >
            <img v-if="!isVideo(url)" :src="url" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full bg-brand-bg/60 flex items-center justify-center">
              <BIcon name="Play" class="w-4 h-4 text-white" />
            </div>
          </button>
        </div>
      </div>

      <!-- ── Comments panel ──────────────────────────────────────────── -->
      <Transition name="comments-panel">
        <div
          v-if="showComments && postId"
          class="relative z-10 md:w-[40%] w-full bg-brand-card border-l border-brand-border flex flex-col overflow-hidden flex-shrink-0"
        >
          <!-- Scrollable body: post header + text, then comments -->
          <div class="flex-1 overflow-y-auto">
            <!-- Post author + date + text (VK-style) -->
            <div v-if="author" class="px-5 pt-4 pb-3 border-b border-brand-border flex-shrink-0">
              <div class="flex items-center gap-2.5 cursor-pointer" @click="goToAuthor">
                <img :src="author.avatar_url || '/default-avatar.png'" @error="onAvatarError"
                  class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-white text-sm truncate hover:text-brand-accent transition-colors">
                      {{ author.display_name || author.username }}
                    </span>
                    <span v-if="author.deceased_at" title="Светлая память">🪦</span>
                    <VerificationBadge v-if="author.is_verified" :type="author.verification_type" icon-class="w-3.5 h-3.5 flex-shrink-0" />
                  </div>
                  <span class="text-xs text-white/55">{{ formatPostDate(createdAt) }}</span>
                </div>
              </div>
              <p v-if="content" class="text-sm text-white/85 leading-relaxed mt-3 whitespace-pre-wrap break-words">{{ content }}</p>
            </div>

            <!-- Actions: vote / repaw / favourite / views (same behaviour as PostCard) -->
            <div v-if="postId" class="flex items-center justify-between px-5 py-3 border-b border-brand-border flex-shrink-0">
              <div class="flex items-center gap-2">
                <!-- Vote -->
                <div class="flex items-center h-8 gap-0.5 bg-brand-bg rounded-full px-1 border border-brand-border">
                  <button @click="vote(1)"
                    class="p-1 rounded-full transition-all duration-150"
                    :class="localVote === 1
                      ? 'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]'
                      : 'text-white/40 hover:text-emerald-400'">
                    <BIcon name="ArrowBigUp" class="w-5 h-5" :fill="localVote === 1 ? 'currentColor' : 'none'" />
                  </button>
                  <span class="font-bold text-sm min-w-[26px] text-center tabular-nums"
                    :class="localVote === 1 ? 'text-emerald-400' : localVote === -1 ? 'text-rose-400' : localRating > 0 ? 'text-emerald-300/80' : localRating < 0 ? 'text-rose-300/80' : 'text-white/60'">
                    {{ localRating }}
                  </span>
                  <button @click="vote(-1)"
                    class="p-1 rounded-full transition-all duration-150"
                    :class="localVote === -1
                      ? 'text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.7)]'
                      : 'text-white/40 hover:text-rose-400'">
                    <BIcon name="ArrowBigDown" class="w-5 h-5" :fill="localVote === -1 ? 'currentColor' : 'none'" />
                  </button>
                </div>

                <!-- Repaw -->
                <button @click="toggleRepaw"
                  :disabled="isOwnPost"
                  :title="isOwnPost ? 'Нельзя репавсить свой пост' : undefined"
                  class="flex items-center h-8 gap-1 px-2.5 rounded-full text-xs font-semibold border transition-all"
                  :class="[
                    localRepawed
                      ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                      : 'bg-brand-bg border-brand-border text-white/55 hover:text-brand-accent hover:border-brand-accent/30',
                    isOwnPost ? 'opacity-40 cursor-not-allowed' : ''
                  ]">
                  <BIcon name="Repeat2" class="w-4 h-4" />
                  <span class="text-sm">{{ localRepaws }}</span>
                </button>

                <!-- Favourite -->
                <button @click="toggleFavourite"
                  class="w-8 h-8 flex items-center justify-center rounded-full border transition-all"
                  :class="localFavourited
                    ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
                    : 'bg-brand-bg border-brand-border text-white/55 hover:text-yellow-400 hover:border-yellow-500/30'">
                  <BIcon :name="localFavourited ? 'BookmarkCheck' : 'Bookmark'" class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="viewsCount !== undefined" class="flex items-center h-8 gap-1 px-1.5 text-white/35 text-xs select-none" title="Просмотры">
                <BIcon name="Eye" class="w-3.5 h-3.5" />
                <span class="tabular-nums">{{ viewsCount }}</span>
              </div>
            </div>

            <!-- Comments header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border flex-shrink-0 bg-brand-card sticky top-0 z-10">
              <div class="flex items-center gap-2 font-bold text-white">
                <BIcon name="MessageSquare" class="w-5 h-5 text-brand-accent" />
                Комментарии
                <span v-if="commentsCount" class="text-white/40 font-semibold">{{ commentsCount }}</span>
              </div>
              <button
                @click="showComments = false"
                class="w-8 h-8 rounded-full bg-brand-bg hover:bg-brand-border flex items-center justify-center text-white/55 hover:text-white transition-colors"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <div class="px-4 pb-6">
              <PostComments :post-id="postId" />
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* Верхняя панель: отступ от выреза/чёлки (safe-area), на десктопе это 1rem / 0.75rem */
.lightbox-topbar {
  padding: calc(0.75rem + env(safe-area-inset-top)) calc(1rem + env(safe-area-inset-right)) 0.75rem calc(1rem + env(safe-area-inset-left));
}
/* Медиа-обёртка в лайтбоксе */
.lightbox-media-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 16px 72px;
  box-sizing: border-box;
  overflow: hidden;
}
/* CustomPlayer (изображение) --- вписываем по contain */
.lightbox-media-wrap :deep(> img) {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.7);
  cursor: default;
}
/* CustomPlayer (video wrapper) --- полная ширина */
.lightbox-media-wrap :deep(> div) {
  width: 100%;
  max-height: 100%;
}

.comments-panel-enter-active,
.comments-panel-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease, width 0.25s ease;
}
.comments-panel-enter-from,
.comments-panel-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.comments-panel-enter-to,
.comments-panel-leave-from {
  opacity: 1;
  transform: translateX(0);
}
</style>
