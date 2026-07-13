<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from './BIcon.vue'
import api from '@/api'
import { useMessagesStore } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import { sanitizeHtml } from '@/utils/sanitizeHtml'

// ── Types ────────────────────────────────────────────────────────────────────
interface Story {
  id: string
  image_url: string | null
  video_url?: string | null
  created_at: string
  expires_at: string
  isBloomly?: boolean
  title?: string
  body?: string
  score?: number
  my_vote?: 1 | -1 | 0
  view_count?: number
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

interface Viewer {
  id: string
  created_at: string
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

// ── Props / Emits ────────────────────────────────────────────────────────────
interface Props {
  /** All user-groups: [[userA stories], [userB stories], …] */
  groups: Story[][]
  /** Which group index to start at */
  groupIndex?: number
  /** Which story index within the group to start at */
  storyIndex?: number
}
const props = withDefaults(defineProps<Props>(), {
  groupIndex: 0,
  storyIndex: 0,
})
const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()
const messagesStore = useMessagesStore()
const authStore     = useAuthStore()

// ── State ────────────────────────────────────────────────────────────────────
const curGroupIdx = ref(props.groupIndex)
const curStoryIdx = ref(props.storyIndex)
const progress = ref(0)          // 0-100
const paused   = ref(false)
const loaded   = ref(false)      // image loaded flag
const replyText    = ref('')
const replySending = ref(false)
const replyStatus  = ref<'idle' | 'sent' | 'error'>('idle')
let replyStatusTimer = 0
const inputFocused = ref(false)  // true while reply input is focused → guard resumeStory
const showHeart = ref(false)     // double-tap heart burst
const heartX = ref(0)
const heartY = ref(0)

// ── Vote (thumbs up / down — persisted server-side) ──────────────────────────
const storyVote  = ref<1 | -1 | 0>(0)   // current user vote
const storyScore = ref(0)               // aggregate score

function loadVote(story: Story) {
  storyVote.value  = story.my_vote ?? 0
  storyScore.value = story.score ?? 0
}

async function castVote(value: 1 | -1) {
  const story = currentStory.value
  if (!story || story.isBloomly) return
  if (!authStore.isAuthenticated) { router.push('/login'); return }
  const prev = storyVote.value
  const prevScore = storyScore.value
  // Optimistic update; toggle off if same button clicked
  storyVote.value  = prev === value ? 0 : value
  storyScore.value = prevScore - prev + storyVote.value
  try {
    const res = await api.post(`/stories/${story.id}/vote`, { value })
    if (res.data.success) {
      storyVote.value  = res.data.data.my_vote
      storyScore.value = res.data.data.score
    }
  } catch (err) {
    console.error('Failed to vote on story', err)
    storyVote.value  = prev
    storyScore.value = prevScore
  }
}

// ── View tracking ─────────────────────────────────────────────────────────────
const trackedViews = new Set<string>()
async function trackView(story: Story) {
  if (story.isBloomly) return
  if (!authStore.isAuthenticated) return
  if (story.user.id === (authStore.user as any)?.id) return
  if (trackedViews.has(story.id)) return
  trackedViews.add(story.id)
  try { await api.post(`/stories/${story.id}/view`) } catch {}
}

// ── Viewers sheet (own story only) ────────────────────────────────────────────
const showViewers    = ref(false)
const viewers        = ref<Viewer[]>([])
const loadingViewers  = ref(false)

function pluralizeViews(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return 'просмотров'
  if (mod10 === 1) return 'просмотр'
  if (mod10 >= 2 && mod10 <= 4) return 'просмотра'
  return 'просмотров'
}

async function openViewers() {
  if (!currentStory.value) return
  showViewers.value = true
  pauseStory()
  loadingViewers.value = true
  try {
    const res = await api.get(`/stories/${currentStory.value.id}/viewers`)
    viewers.value = res.data.success ? res.data.data.viewers : []
  } catch (err) {
    console.error('Failed to load story viewers', err)
    viewers.value = []
  }
  loadingViewers.value = false
}

function closeViewers() {
  showViewers.value = false
  if (!inputFocused.value) resumeStory()
}

// ── Computed ─────────────────────────────────────────────────────────────────
const currentGroup  = computed(() => props.groups[curGroupIdx.value] ?? [])
const currentStory  = computed(() => currentGroup.value[curStoryIdx.value] ?? null)
const hasPrevGroup  = computed(() => curGroupIdx.value > 0)
const hasNextGroup  = computed(() => curGroupIdx.value < props.groups.length - 1)
const hasPrevStory  = computed(() => curStoryIdx.value > 0 || hasPrevGroup.value)
const hasNextStory  = computed(() => curStoryIdx.value < currentGroup.value.length - 1 || hasNextGroup.value)
const isBloomlyGroup = computed(() => currentGroup.value[0]?.isBloomly === true)

const timeLeft = computed(() => {
  if (!currentStory.value) return ''
  const diff = Math.max(0, new Date(currentStory.value.expires_at).getTime() - Date.now())
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
})

// ── Timer ────────────────────────────────────────────────────────────────────
const STORY_DURATION = 7000   // ms
let timerStart = 0
let animFrame  = 0

function startTimer() {
  cancelAnimationFrame(animFrame)
  timerStart = performance.now() - (progress.value / 100) * STORY_DURATION
  tick()
}

function tick() {
  if (!paused.value && loaded.value) {
    const elapsed = performance.now() - timerStart
    progress.value = Math.min(100, (elapsed / STORY_DURATION) * 100)
    if (progress.value >= 100) { goNext(); return }
  }
  animFrame = requestAnimationFrame(tick)
}

function resetTimer() {
  cancelAnimationFrame(animFrame)
  progress.value = 0
  loaded.value = false
  paused.value = false
}

// ── Navigation ───────────────────────────────────────────────────────────────
function goNext() {
  if (curStoryIdx.value < currentGroup.value.length - 1) {
    curStoryIdx.value++
  } else if (hasNextGroup.value) {
    curGroupIdx.value++
    curStoryIdx.value = 0
  } else {
    emit('close')
  }
}

function goPrev() {
  if (curStoryIdx.value > 0) {
    curStoryIdx.value--
  } else if (hasPrevGroup.value) {
    curGroupIdx.value--
    curStoryIdx.value = currentGroup.value.length - 1
    // After set, needs recalc via watcher
  } else {
    progress.value = 0
    resetTimer()
    startTimer()
  }
}

// Watch story change → reset + load vote + track view
watch([curGroupIdx, curStoryIdx], () => {
  resetTimer()
  showViewers.value = false
  if (currentStory.value) {
    loadVote(currentStory.value)
    trackView(currentStory.value)
  }
})

// Watch loaded state → start timer when media loaded (video drives its own progress)
watch(loaded, (v) => { if (v && !isVideoStory.value) startTimer() })

// ── Image load handler ───────────────────────────────────────────────────────
function onImageLoad() {
  loaded.value = true
}

// ── Video state ────────────────────────────────────────────────────────────────
const videoEl    = ref<HTMLVideoElement | null>(null)
const videoMuted = ref(true)
const isVideoStory = computed(() => !!currentStory.value?.video_url)

function onVideoLoaded() {
  loaded.value = true
}
function onVideoTimeUpdate() {
  const v = videoEl.value
  if (!v || !v.duration) return
  progress.value = Math.min(100, (v.currentTime / v.duration) * 100)
}
function onVideoEnded() {
  goNext()
}
function toggleVideoMute() {
  videoMuted.value = !videoMuted.value
}

// For text-only Bloomly updates (no image), auto-start the timer
watch(currentStory, (s) => {
  if (s?.isBloomly && !s.image_url) {
    loaded.value = true
  }
}, { immediate: true })

// Preload next image
function preloadNext() {
  const nextStory = currentGroup.value[curStoryIdx.value + 1]
    ?? props.groups[curGroupIdx.value + 1]?.[0]
  if (nextStory?.image_url) {
    const img = new Image()
    img.src = nextStory.image_url
  }
}

watch(loaded, () => { if (loaded.value) preloadNext() })

// ── Pause / Resume ────────────────────────────────────────────────────────────
let pausedAt = 0
function pauseStory() {
  if (paused.value) return
  paused.value = true
  pausedAt = performance.now()
  if (isVideoStory.value) videoEl.value?.pause()
}
function resumeStory() {
  if (!paused.value) return
  paused.value = false
  // Shift timerStart so elapsed is preserved
  timerStart += performance.now() - pausedAt
  if (isVideoStory.value) videoEl.value?.play().catch(() => {})
}

// ── Tap zones ────────────────────────────────────────────────────────────────
let tapStartX = 0
let tapStartTime = 0
let lastTap = 0

function onTapStart(e: MouseEvent | TouchEvent) {
  tapStartX = 'touches' in e ? e.touches[0].clientX : e.clientX
  tapStartTime = Date.now()
  pauseStory()
}

function onTapEnd(e: MouseEvent | TouchEvent) {
  const dur = Date.now() - tapStartTime
  // Don't resume auto-play when the reply input has focus
  if (!inputFocused.value) resumeStory()
  if (dur > 350) return  // was a hold — don't navigate

  const endX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX
  const dx   = endX - tapStartX
  const w    = window.innerWidth

  // Swipe
  if (Math.abs(dx) > 50) {
    if (dx < 0) goNext()
    else goPrev()
    return
  }

  // Tap zone: left 35% → prev, right 35% → next
  const tapX = endX
  if (tapX < w * 0.35) goPrev()
  else if (tapX > w * 0.65) goNext()

  // Double-tap heart
  const now = Date.now()
  if (now - lastTap < 300) {
    triggerHeart(endX, 'clientY' in e ? e.clientY : (e as TouchEvent).changedTouches[0].clientY)
  }
  lastTap = now
}

// ── Double-tap heart ─────────────────────────────────────────────────────────
function triggerHeart(x: number, y: number) {
  heartX.value = x
  heartY.value = y
  showHeart.value = true
  setTimeout(() => { showHeart.value = false }, 900)
}

// ── Keyboard ─────────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  // Don't intercept keys while typing in the reply input
  if (inputFocused.value) return
  if (e.key === 'Escape')          { emit('close') }
  else if (e.key === 'ArrowRight') goNext()
  else if (e.key === 'ArrowLeft')  goPrev()
}

function heartCenter() {
  triggerHeart(window.innerWidth / 2, window.innerHeight / 2)
}

// ── Reply ─────────────────────────────────────────────────────────────────────
function showReplyFeedback(status: 'sent' | 'error') {
  replyStatus.value = status
  clearTimeout(replyStatusTimer)
  replyStatusTimer = window.setTimeout(() => { replyStatus.value = 'idle' }, 2500)
}

async function sendReply() {
  const text = replyText.value.trim()
  if (!text || replySending.value) return
  if (!authStore.isAuthenticated) { router.push('/login'); return }
  const story = currentStory.value
  if (!story) return
  // Can't reply to yourself
  if (story.user.id === (authStore.user as any)?.id) return

  replySending.value = true
  replyText.value = ''
  try {
    const convId = await messagesStore.openConversation(story.user.id)
    // Encode story metadata as JSON for safe parsing in ChatWindow
    const meta = JSON.stringify({
      img: story.image_url ?? '',
      exp: story.expires_at,
      name: story.user.display_name || story.user.username || '',
      ava: story.user.avatar_url ?? '',
    })
    const msgText = `[story_reply:${meta}]\n${text}`
    await api.post(`/messages/conversations/${convId}/messages`, { content: msgText })
    showReplyFeedback('sent')
  } catch (err) {
    console.error('Failed to send story reply', err)
    replyText.value = text
    showReplyFeedback('error')
  } finally {
    replySending.value = false
  }
}

// ── Date format ───────────────────────────────────────────────────────────────
function formatAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 60)   return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  return `${Math.floor(diff / 3600)}ч`
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
  if (currentStory.value) {
    loadVote(currentStory.value)
    trackView(currentStory.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  cancelAnimationFrame(animFrame)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="currentStory"
        class="fixed inset-0 z-[700] flex items-center justify-center bg-black select-none"
        @mousedown="onTapStart"
        @mouseup="onTapEnd"
        @touchstart.passive="onTapStart"
        @touchend.passive="onTapEnd"
      >
        <!-- ── Background blur / gradient ───────────────────────────────── -->
        <div class="absolute inset-0 overflow-hidden">
          <img
            v-if="currentStory.image_url"
            :src="currentStory.image_url"
            class="w-full h-full object-cover scale-110 blur-2xl opacity-30 pointer-events-none"
            aria-hidden="true"
          />
          <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70"></div>
        </div>

        <!-- ── Story card ────────────────────────────────────────────────── -->
        <div class="relative w-full h-full max-w-[430px] mx-auto flex flex-col md:h-auto md:aspect-[9/16] md:max-h-[95vh] md:rounded-3xl md:overflow-hidden md:my-auto">

          <!-- Progress bars row -->
          <div class="relative z-10 flex gap-1 px-3 pt-3">
            <div
              v-for="(s, si) in currentGroup"
              :key="s.id"
              class="flex-1 h-[3px] rounded-full overflow-hidden bg-white/25"
            >
              <div
                class="h-full rounded-full bg-white transition-none"
                :style="{
                  width: si < curStoryIdx
                    ? '100%'
                    : si === curStoryIdx
                      ? progress + '%'
                      : '0%',
                  transition: (si === curStoryIdx && !paused) ? 'none' : undefined
                }"
              ></div>
            </div>
          </div>

          <!-- Top bar: user info + actions -->
          <div class="relative z-10 flex items-center gap-3 px-3 pt-2 pb-1">
            <!-- Bloomly avatar / regular avatar -->
            <div v-if="isBloomlyGroup" class="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center ring-2 ring-brand-accent/60">
              <span class="text-white font-black text-base select-none" style="letter-spacing:-1px">B</span>
            </div>
            <button
              v-else
              class="flex-shrink-0 ring-2 ring-white/30 hover:ring-white/60 rounded-full transition-all"
              @click.stop="emit('close'); router.push('/profile/' + currentStory.user.username)"
            >
              <img
                v-if="currentStory.user.avatar_url"
                :src="currentStory.user.avatar_url"
                class="w-9 h-9 rounded-full object-cover"
              />
              <div
                v-else
                class="w-9 h-9 rounded-full bg-brand-accent/30 flex items-center justify-center text-brand-accent font-bold text-sm"
              >
                {{ (currentStory.user.username ?? '?')[0].toUpperCase() }}
              </div>
            </button>
            <!-- Name -->
            <div class="flex-1 min-w-0">
              <div v-if="isBloomlyGroup" class="flex items-center gap-1.5">
                <p class="text-sm font-bold text-white leading-tight truncate">Bloomly</p>
                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-accent/25 text-brand-accent border border-brand-accent/30">Официально</span>
              </div>
              <p
                v-else
                class="text-sm font-bold text-white leading-tight cursor-pointer hover:underline truncate"
                @click.stop="emit('close'); router.push('/profile/' + currentStory.user.username)"
              >
                {{ currentStory.user.display_name || currentStory.user.username }}
              </p>
              <div class="flex items-center gap-1.5 text-[11px] text-white/55">
                <span>{{ formatAgo(currentStory.created_at) }}</span>
                <span v-if="timeLeft && !isBloomlyGroup" class="flex items-center gap-0.5">
                  <BIcon name="Clock" class="w-3 h-3" />{{ timeLeft }}
                </span>
                <span v-if="isBloomlyGroup && currentStory.title" class="font-semibold text-white/80 truncate max-w-[160px]">{{ currentStory.title }}</span>
              </div>
            </div>
            <!-- Pause indicator -->
            <Transition name="fade">
              <div
                v-if="paused"
                class="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold text-white flex items-center gap-1"
              >
                <BIcon name="Pause" class="w-3 h-3" />Пауза
              </div>
            </Transition>
            <!-- Video mute toggle -->
            <button
              v-if="isVideoStory"
              @click.stop="toggleVideoMute"
              class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors flex-shrink-0"
              :aria-label="videoMuted ? 'Включить звук' : 'Выключить звук'"
            >
              <BIcon :name="videoMuted ? 'VolumeX' : 'Volume2'" class="w-4 h-4" />
            </button>
            <!-- Close -->
            <button
              @click.stop="emit('close')"
              class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors flex-shrink-0"
              aria-label="Закрыть"
            >
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>

          <!-- Story image / content (fills flex-1) -->
          <div class="relative flex-1 flex items-center justify-center overflow-hidden">
            <Transition
              mode="out-in"
              enter-active-class="transition duration-200 ease-out"
              enter-from-class="opacity-0 translate-x-4"
              enter-to-class="opacity-100 translate-x-0"
              leave-active-class="transition duration-150 ease-in"
              leave-from-class="opacity-100 translate-x-0"
              leave-to-class="opacity-0 -translate-x-4"
            >
              <div
                :key="currentStory.id"
                class="relative w-full h-full flex items-center justify-center"
              >
                <!-- Video -->
                <video
                  v-if="currentStory.video_url"
                  ref="videoEl"
                  :src="currentStory.video_url"
                  :muted="videoMuted"
                  class="w-full h-full object-cover"
                  autoplay
                  playsinline
                  draggable="false"
                  @loadedmetadata="onVideoLoaded"
                  @timeupdate="onVideoTimeUpdate"
                  @ended="onVideoEnded"
                />
                <!-- Image -->
                <img
                  v-else-if="currentStory.image_url"
                  :src="currentStory.image_url"
                  class="w-full h-full object-cover"
                  @load="onImageLoad"
                  draggable="false"
                />
                <!-- No image: Bloomly text card or generic placeholder.
                     Outer div is the ONLY scroll container (no centering on it, so long
                     content never gets clipped); inner div uses min-h-full so short
                     content still centers vertically like before. -->
                <div
                  v-else-if="currentStory.isBloomly"
                  class="w-full h-full overflow-y-auto bg-gradient-to-br from-[#1a1f4e] via-[#0f172a] to-[#1e1b4b]"
                >
                  <div class="min-h-full flex flex-col items-center justify-center gap-6 px-8 py-12">
                    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center shadow-2xl shadow-brand-accent/30 flex-shrink-0">
                      <span class="text-white font-black text-3xl select-none" style="letter-spacing:-2px">B</span>
                    </div>
                    <div class="w-full text-center space-y-3">
                      <h2 class="text-xl font-extrabold text-white leading-tight">{{ currentStory.title }}</h2>
                      <p v-if="currentStory.body" class="text-sm text-white/70 leading-relaxed update-body text-left" v-html="sanitizeHtml(currentStory.body)" />
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="flex flex-col items-center gap-3 text-white/30"
                >
                  <BIcon name="ImageOff" class="w-16 h-16" />
                  <span class="text-sm">Изображение недоступно</span>
                </div>
                <!-- Loading spinner -->
                <Transition name="fade">
                  <div
                    v-if="!loaded && (currentStory.image_url || currentStory.video_url)"
                    class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                  >
                    <BIcon name="Loader2" class="w-10 h-10 text-white animate-spin" />
                  </div>
                </Transition>
              </div>
            </Transition>

            <!-- Left tap zone overlay (visual hint on hover) -->
            <div
              class="absolute left-0 top-0 bottom-0 w-1/3 flex items-center justify-start pl-3 opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
            >
              <div class="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <BIcon name="ChevronLeft" class="w-5 h-5 text-white" />
              </div>
            </div>
            <!-- Right tap zone overlay -->
            <div
              class="absolute right-0 top-0 bottom-0 w-1/3 flex items-center justify-end pr-3 opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
            >
              <div class="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <BIcon name="ChevronRight" class="w-5 h-5 text-white" />
              </div>
            </div>

            <!-- Double-tap heart burst -->
            <Transition
              enter-active-class="transition duration-100"
              enter-from-class="opacity-0 scale-50"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition duration-700"
              leave-from-class="opacity-100 scale-100 translate-y-0"
              leave-to-class="opacity-0 scale-150 -translate-y-12"
            >
              <div
                v-if="showHeart"
                class="fixed pointer-events-none z-[800] text-5xl"
                :style="{ left: heartX + 'px', top: heartY + 'px', transform: 'translate(-50%, -50%)' }"
              >
                ❤️
              </div>
            </Transition>
          </div>

          <!-- Prev / Next user group arrows (desktop) -->
          <button
            v-if="hasPrevGroup"
            @click.stop="curGroupIdx--; curStoryIdx = 0"
            class="hidden md:flex absolute left-[-60px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm"
            aria-label="Предыдущий пользователь"
          >
            <BIcon name="ChevronLeft" class="w-6 h-6" />
          </button>
          <button
            v-if="hasNextGroup"
            @click.stop="curGroupIdx++; curStoryIdx = 0"
            class="hidden md:flex absolute right-[-60px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm"
            aria-label="Следующий пользователь"
          >
            <BIcon name="ChevronRight" class="w-6 h-6" />
          </button>

          <!-- Bottom: reply + reactions -->
          <div
            class="relative z-10 px-4 pb-safe pb-5 pt-3 flex flex-col gap-2"
            @mousedown.stop
            @touchstart.stop
          >
            <!-- Send status toast -->
            <Transition
              enter-active-class="transition duration-200 ease-out"
              enter-from-class="opacity-0 translate-y-2"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-200 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 translate-y-2"
            >
              <div
                v-if="replyStatus !== 'idle'"
                class="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold self-center"
                :class="replyStatus === 'sent'
                  ? 'bg-green-500/20 border border-green-500/30 text-green-300'
                  : 'bg-rose-500/20 border border-rose-500/30 text-rose-300'"
              >
                <BIcon :name="replyStatus === 'sent' ? 'CheckCheck' : 'AlertCircle'" class="w-3.5 h-3.5" />
                {{ replyStatus === 'sent' ? 'Сообщение отправлено' : 'Не удалось отправить' }}
              </div>
            </Transition>

            <!-- Reply row -->
            <div class="flex items-center gap-3">
              <!-- Bloomly update: show branded label + body if has image -->
              <div
                v-if="isBloomlyGroup"
                class="flex-1 flex flex-col gap-1 bg-white/6 border border-brand-accent/20 rounded-2xl px-4 py-2.5"
              >
                <div class="flex items-center gap-1.5">
                  <div class="w-4 h-4 rounded-md bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center flex-shrink-0">
                    <span class="text-white font-black text-[8px]">B</span>
                  </div>
                  <span class="text-xs font-bold text-brand-accent">Обновление Bloomly</span>
                </div>
                <p v-if="currentStory.body && currentStory.image_url" class="text-[11px] text-white/60 leading-snug line-clamp-2 update-body" v-html="sanitizeHtml(currentStory.body)" />
              </div>
              <!-- Reply input — hidden when viewing own story -->
              <div
                v-else-if="currentStory && currentStory.user.id !== (authStore.user as any)?.id"
                class="flex-1 flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-2.5"
                :class="replyStatus === 'sent' ? 'border-green-500/30' : replyStatus === 'error' ? 'border-rose-500/30' : ''"
              >
                <input
                  v-model="replyText"
                  type="text"
                  placeholder="Ответить в личку…"
                  :disabled="replySending"
                  class="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none disabled:opacity-50"
                  @keydown.enter.stop="sendReply"
                  @focus="inputFocused = true; pauseStory()"
                  @blur="inputFocused = false; resumeStory()"
                />
                <button
                  v-if="replyText.trim() || replySending"
                  @click.stop="sendReply"
                  :disabled="replySending"
                  class="w-7 h-7 rounded-full bg-brand-accent flex items-center justify-center flex-shrink-0 hover:bg-brand-accent-plus disabled:opacity-60 transition-all active:scale-90"
                >
                  <BIcon v-if="replySending" name="Loader2" class="w-3.5 h-3.5 text-white animate-spin" />
                  <BIcon v-else name="SendHorizontal" class="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <!-- Own story: viewers button instead of reply input -->
              <button
                v-else-if="currentStory"
                @click.stop="openViewers"
                class="flex-1 flex items-center justify-center gap-2 bg-white/6 border border-white/10 rounded-full px-4 py-2.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
              >
                <BIcon name="Eye" class="w-3.5 h-3.5" />
                {{ currentStory.view_count ?? 0 }} {{ pluralizeViews(currentStory.view_count ?? 0) }}
              </button>

            <!-- Vote pill — hidden for Bloomly stories -->
            <div v-if="!isBloomlyGroup" class="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 flex-shrink-0">
              <button
                @click.stop="castVote(1)"
                class="p-1.5 rounded-full transition-all duration-150"
                :class="storyVote === 1
                  ? 'bg-green-500/25 text-green-400 shadow-[0_0_8px_0px] shadow-green-500/40'
                  : 'text-white/55 hover:bg-green-500/20 hover:text-green-400'"
                aria-label="Нравится"
              >
                <BIcon name="ThumbsUp" class="w-4 h-4" />
              </button>
              <span
                class="font-bold text-sm min-w-[24px] text-center"
                :class="storyVote === 1 ? 'text-green-400' : storyVote === -1 ? 'text-rose-400' : storyScore > 0 ? 'text-green-400' : storyScore < 0 ? 'text-rose-400' : 'text-white'"
              >{{ storyScore }}</span>
              <button
                @click.stop="castVote(-1)"
                class="p-1.5 rounded-full transition-all duration-150"
                :class="storyVote === -1
                  ? 'bg-rose-500/25 text-rose-400 shadow-[0_0_8px_0px] shadow-rose-500/40'
                  : 'text-white/55 hover:bg-rose-500/20 hover:text-rose-400'"
                aria-label="Не нравится"
              >
                <BIcon name="ThumbsDown" class="w-4 h-4" />
              </button>
            </div>
            <button
              v-if="!isBloomlyGroup"
              @click.stop
              class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition-all hover:scale-110 backdrop-blur-sm flex-shrink-0"
              aria-label="Поделиться"
            >
              <BIcon name="Share2" class="w-4.5 h-4.5 text-white" />
            </button>
            </div><!-- end reply row -->
          </div>
        </div>

        <!-- Thumbnail strip (user groups preview at bottom on desktop) -->
        <div class="hidden xl:flex absolute bottom-6 left-1/2 -translate-x-1/2 gap-2 z-10">
          <button
            v-for="(g, gi) in groups"
            :key="g[0].user.id"
            @click.stop="curGroupIdx = gi; curStoryIdx = 0"
            class="flex-shrink-0 transition-all duration-200"
            :class="gi === curGroupIdx ? 'scale-110' : 'opacity-50 hover:opacity-80'"
            :aria-label="'Истории пользователя ' + g[0].user.username"
          >
            <div
              class="w-9 h-9 rounded-xl p-[2px]"
              :class="gi === curGroupIdx
                ? 'bg-gradient-to-tr from-brand-accent to-brand-purple'
                : 'bg-white/20'"
            >
              <div class="w-full h-full rounded-[9px] overflow-hidden">
                <img
                  v-if="g[0].user.avatar_url"
                  :src="g[0].user.avatar_url"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs"
                >
                  {{ (g[0].user.username ?? '?')[0].toUpperCase() }}
                </div>
              </div>
            </div>
          </button>
        </div>

        <!-- Viewers bottom sheet (own story only) -->
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-4"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-4"
        >
          <div
            v-if="showViewers"
            class="absolute inset-x-0 bottom-0 z-20 max-h-[60%] flex flex-col bg-[#111318]/95 backdrop-blur-md rounded-t-3xl border-t border-white/10"
            @click.stop
            @mousedown.stop
            @touchstart.stop
          >
            <div class="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
              <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                <BIcon name="Eye" class="w-4 h-4" />
                Просмотры
              </h3>
              <button
                @click="closeViewers"
                class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                aria-label="Закрыть"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-5 pb-5 space-y-1">
              <div v-if="loadingViewers" class="flex items-center justify-center py-8">
                <BIcon name="Loader2" class="w-6 h-6 text-white/40 animate-spin" />
              </div>
              <div v-else-if="viewers.length === 0" class="flex flex-col items-center gap-2 py-8 text-white/30">
                <BIcon name="EyeOff" class="w-8 h-8" />
                <span class="text-xs">Пока никто не смотрел</span>
              </div>
              <button
                v-for="v in viewers"
                :key="v.id"
                class="w-full flex items-center gap-3 py-2 px-1 rounded-xl hover:bg-white/5 transition-colors text-left"
                @click.stop="emit('close'); router.push('/profile/' + v.user.username)"
              >
                <img
                  v-if="v.user.avatar_url"
                  :src="v.user.avatar_url"
                  class="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
                <div v-else class="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm flex-shrink-0">
                  {{ (v.user.username ?? '?')[0].toUpperCase() }}
                </div>
                <span class="flex-1 min-w-0 text-sm font-semibold text-white truncate">{{ v.user.display_name || v.user.username }}</span>
                <span class="text-[11px] text-white/40 flex-shrink-0">{{ formatAgo(v.created_at) }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* safe area for iPhone notch */
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 1.25rem); }

.update-body :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.4rem 0; }
.update-body :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.4rem 0; }
.update-body :deep(div),
.update-body :deep(p) { margin: 0.5rem 0; }
.update-body :deep(div:first-child),
.update-body :deep(p:first-child) { margin-top: 0; }
.update-body :deep(b),
.update-body :deep(strong) { font-weight: 800; color: white; }
</style>
