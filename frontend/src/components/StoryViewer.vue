<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from './BIcon.vue'
import api from '@/api'
import { useMessagesStore } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'

// ── Types ────────────────────────────────────────────────────────────────────
interface Story {
  id: string
  image_url: string | null
  created_at: string
  expires_at: string
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

// ── Vote (thumbs up / down — like PostCard, stored in localStorage) ──────────
const VOTE_KEY   = 'bloomly_story_votes'
const storyVote  = ref<1 | -1 | 0>(0)   // current user vote
const storyScore = ref(0)               // aggregate score (optimistic)

function loadVote(storyId: string) {
  try {
    const map = JSON.parse(localStorage.getItem(VOTE_KEY) ?? '{}')
    const entry = map[storyId] as { vote: 1 | -1 | 0; score: number } | undefined
    storyVote.value  = entry?.vote  ?? 0
    storyScore.value = entry?.score ?? 0
  } catch { storyVote.value = 0; storyScore.value = 0 }
}

function castVote(value: 1 | -1) {
  if (!currentStory.value) return
  const prev = storyVote.value
  const prevScore = storyScore.value
  // Toggle off if same button clicked
  storyVote.value  = prev === value ? 0 : value
  storyScore.value = prevScore - prev + storyVote.value
  try {
    const map = JSON.parse(localStorage.getItem(VOTE_KEY) ?? '{}')
    map[currentStory.value.id] = { vote: storyVote.value, score: storyScore.value }
    localStorage.setItem(VOTE_KEY, JSON.stringify(map))
  } catch {}
}

// ── Computed ─────────────────────────────────────────────────────────────────
const currentGroup  = computed(() => props.groups[curGroupIdx.value] ?? [])
const currentStory  = computed(() => currentGroup.value[curStoryIdx.value] ?? null)
const hasPrevGroup  = computed(() => curGroupIdx.value > 0)
const hasNextGroup  = computed(() => curGroupIdx.value < props.groups.length - 1)
const hasPrevStory  = computed(() => curStoryIdx.value > 0 || hasPrevGroup.value)
const hasNextStory  = computed(() => curStoryIdx.value < currentGroup.value.length - 1 || hasNextGroup.value)

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

// Watch story change → reset + load vote
watch([curGroupIdx, curStoryIdx], () => {
  resetTimer()
  if (currentStory.value) loadVote(currentStory.value.id)
})

// Watch loaded state → start timer when image loaded
watch(loaded, (v) => { if (v) startTimer() })

// ── Image load handler ───────────────────────────────────────────────────────
function onImageLoad() {
  loaded.value = true
}

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
}
function resumeStory() {
  if (!paused.value) return
  paused.value = false
  // Shift timerStart so elapsed is preserved
  timerStart += performance.now() - pausedAt
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
  if (currentStory.value) loadVote(currentStory.value.id)
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
            <!-- Avatar -->
            <button
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
              <p
                class="text-sm font-bold text-white leading-tight cursor-pointer hover:underline truncate"
                @click.stop="emit('close'); router.push('/profile/' + currentStory.user.username)"
              >
                {{ currentStory.user.display_name || currentStory.user.username }}
              </p>
              <div class="flex items-center gap-1.5 text-[11px] text-white/55">
                <span>{{ formatAgo(currentStory.created_at) }}</span>
                <span v-if="timeLeft" class="flex items-center gap-0.5">
                  <BIcon name="Clock" class="w-3 h-3" />{{ timeLeft }}
                </span>
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
                <!-- Image -->
                <img
                  v-if="currentStory.image_url"
                  :src="currentStory.image_url"
                  class="w-full h-full object-cover"
                  @load="onImageLoad"
                  draggable="false"
                />
                <!-- No image placeholder -->
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
                    v-if="!loaded && currentStory.image_url"
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
              <!-- Reply input — hidden when viewing own story -->
              <div
                v-if="currentStory && currentStory.user.id !== (authStore.user as any)?.id"
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
              <!-- Own story: label instead of reply input -->
              <div
                v-else-if="currentStory"
                class="flex-1 flex items-center justify-center gap-2 bg-white/6 border border-white/10 rounded-full px-4 py-2.5 text-xs text-white/40"
              >
                <BIcon name="Eye" class="w-3.5 h-3.5" />
                Ваша история
              </div>

            <!-- Vote pill — same style as PostCard.vue -->
            <div class="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 flex-shrink-0">
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
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* safe area for iPhone notch */
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 1.25rem); }
</style>
