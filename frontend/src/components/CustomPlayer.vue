<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'
import { isVideoUrl } from '@/lib/mediaType'

const props = defineProps<{ src: string; disableAutoplay?: boolean; msgType?: string }>()
const emit = defineEmits(['click-image'])

// ── Volume persistence (shared across every player on the site) ────────────
const VOLUME_KEY = 'bloomly_player_volume'
const DEFAULT_VOLUME = 0.5 // half of the old 100% default
function getStoredVolume(): number {
  const raw = localStorage.getItem(VOLUME_KEY)
  if (raw === null) return DEFAULT_VOLUME
  const v = parseFloat(raw)
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME
}
function storeVolume(v: number) {
  try { localStorage.setItem(VOLUME_KEY, String(v)) } catch {}
}

// ── Refs ───────────────────────────────────────────────────────────────────
const container   = ref<HTMLElement | null>(null)
const mediaEl     = ref<HTMLVideoElement | HTMLAudioElement | null>(null)
const gifImg      = ref<HTMLImageElement | null>(null)
const gifCanvas   = ref<HTMLCanvasElement | null>(null)

// ── State ─────────────────────────────────────────────────────────────────
const isPlaying      = ref(false)
const isMuted        = ref(false)
const isFullscreen   = ref(false)
const isPip          = ref(false)
const isLoading      = ref(true)
const showControls   = ref(true)
const showVolSlider  = ref(false)
const isDragging     = ref(false)
const volumeLevel    = ref(getStoredVolume())
const duration       = ref(0)
const currentTime    = ref(0)
const buffered       = ref(0)
const gifPlaying     = ref(false)
const playbackRate   = ref(1)
const showSpeedMenu  = ref(false)
const hoverTime      = ref(0)
const hoverX         = ref(0)
const showHoverTime  = ref(false)

let hideTimer: ReturnType<typeof setTimeout> | null = null

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

// ── Media type ────────────────────────────────────────────────────────────
const type = computed(() => {
  // Silent videos (no audio track) arrive tagged msgType 'gif' from the backend —
  // render with the lightweight autoplay/pause gif UI, not the full video player.
  if (props.msgType === 'gif') return 'gif'
  if (props.msgType === 'video' || props.msgType === 'audio') return props.msgType
  const u = props.src.toLowerCase().split(/[?#]/)[0]
  if (isVideoUrl(props.src)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(u)) return 'audio'
  if (/\.gif$/.test(u)) return 'gif'
  return 'image'
})
const isGifVideo = computed(() => isVideoUrl(props.src))

// ── Formatters ────────────────────────────────────────────────────────────
function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`
  return `${m}:${sec.toString().padStart(2,'0')}`
}

const formattedCurrent  = computed(() => fmt(currentTime.value))
const formattedDuration = computed(() => fmt(duration.value))
const formattedHover    = computed(() => fmt(hoverTime.value))
const shouldLoop = computed(() => duration.value > 0 && duration.value < 5)
const progressPct       = computed(() =>
  duration.value ? (currentTime.value / duration.value) * 100 : 0
)
const bufferedPct = computed(() =>
  duration.value ? (buffered.value / duration.value) * 100 : 0
)
const volIcon = computed(() => {
  if (isMuted.value || volumeLevel.value === 0) return 'VolumeX'
  if (volumeLevel.value < 0.5) return 'Volume1'
  return 'Volume2'
})

// ── Media events ──────────────────────────────────────────────────────────
function onCanPlay()   { isLoading.value = false }
function onWaiting()   { isLoading.value = true  }
function onPlay()      { isPlaying.value = true; isLoading.value = false; scheduleHide() }
function onPause()     { isPlaying.value = false; showControls.value = true; clearHide() }
function onEnded()     { isPlaying.value = false; showControls.value = true; clearHide() }
function onLoadedMetadata(e: Event) {
  const t = e.target as HTMLMediaElement
  duration.value = t.duration || 0
  isLoading.value = false
}
function onTimeUpdate(e: Event) {
  if (isDragging.value) return
  const t = e.target as HTMLMediaElement
  currentTime.value = t.currentTime || 0
  if (t.buffered.length) buffered.value = t.buffered.end(t.buffered.length - 1)
}
function onVolumeChange(e: Event) {
  const t = e.target as HTMLMediaElement
  volumeLevel.value = t.volume
  isMuted.value = t.muted
}

// ── Controls ──────────────────────────────────────────────────────────────
function togglePlay() {
  if (!mediaEl.value) return
  isPlaying.value ? mediaEl.value.pause() : mediaEl.value.play()
}
function toggleMute() {
  if (!mediaEl.value) return
  mediaEl.value.muted = !mediaEl.value.muted
  isMuted.value = mediaEl.value.muted
}
function setVolume(e: Event) {
  if (!mediaEl.value) return
  const v = parseFloat((e.target as HTMLInputElement).value)
  mediaEl.value.volume = v
  mediaEl.value.muted = v === 0
  volumeLevel.value = v
  isMuted.value = v === 0
  storeVolume(v)
}
function seekStart() { isDragging.value = true }
function seekEnd()   { isDragging.value = false }
function seek(e: Event) {
  const t = e.target as HTMLInputElement
  const time = parseFloat(t.value)
  if (mediaEl.value) { mediaEl.value.currentTime = time; currentTime.value = time }
}
function seekClick(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const time = pct * duration.value
  if (mediaEl.value) { mediaEl.value.currentTime = time; currentTime.value = time }
}
function onProgressHover(e: MouseEvent) {
  const rect  = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const pct   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  hoverTime.value = pct * duration.value
  hoverX.value    = pct * 100
  showHoverTime.value = true
}
function onProgressLeave() { showHoverTime.value = false }
function skipSeconds(s: number) {
  if (!mediaEl.value) return
  mediaEl.value.currentTime = Math.max(0, Math.min(duration.value, mediaEl.value.currentTime + s))
}
function setSpeed(s: number) {
  playbackRate.value = s
  if (mediaEl.value) mediaEl.value.playbackRate = s
  showSpeedMenu.value = false
}
async function toggleFullscreen() {
  if (!container.value) return
  if (!document.fullscreenElement) {
    await container.value.requestFullscreen()
    isFullscreen.value = true
  } else {
    await document.exitFullscreen()
    isFullscreen.value = false
  }
}
async function togglePip() {
  const video = mediaEl.value as HTMLVideoElement | null
  if (!video || !document.pictureInPictureEnabled) return
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
    } else {
      await video.requestPictureInPicture()
    }
  } catch { /* user gesture / codec restrictions — silently ignore */ }
}

// ── Controls visibility ───────────────────────────────────────────────────
function bumpControls() {
  showControls.value = true
  if (isPlaying.value) scheduleHide()
}
function scheduleHide() {
  clearHide()
  hideTimer = setTimeout(() => { showControls.value = false }, 3000)
}
function clearHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
function onKey(e: KeyboardEvent) {
  if (!container.value?.contains(e.target as Node) && document.activeElement !== container.value) return
  switch (e.code) {
    case 'Space': case 'KeyK': e.preventDefault(); togglePlay(); break
    case 'KeyF':  e.preventDefault(); toggleFullscreen(); break
    case 'KeyM':  e.preventDefault(); toggleMute(); break
    case 'ArrowRight': e.preventDefault(); skipSeconds(5); break
    case 'ArrowLeft':  e.preventDefault(); skipSeconds(-5); break
    case 'ArrowUp':    e.preventDefault(); if (mediaEl.value) { mediaEl.value.volume = Math.min(1, mediaEl.value.volume + 0.1); volumeLevel.value = mediaEl.value.volume } break
    case 'ArrowDown':  e.preventDefault(); if (mediaEl.value) { mediaEl.value.volume = Math.max(0, mediaEl.value.volume - 0.1); volumeLevel.value = mediaEl.value.volume } break
  }
}

// ── GIF ───────────────────────────────────────────────────────────────────
function toggleGif() {
  if (isGifVideo.value) {
    const v = mediaEl.value as HTMLVideoElement | null
    if (!v) return
    if (v.paused) v.play(); else v.pause()
    return
  }
  gifPlaying.value = !gifPlaying.value
}
function captureGifFrame() {
  if (!gifCanvas.value || !gifImg.value) return
  const ctx = gifCanvas.value.getContext('2d')
  if (!ctx) return
  gifCanvas.value.width  = gifImg.value.naturalWidth
  gifCanvas.value.height = gifImg.value.naturalHeight
  ctx.drawImage(gifImg.value, 0, 0)
}

function onEnterPip()  { isPip.value = true }
function onLeavePip()  { isPip.value = false }

// ── Autoplay-in-view (muted, like the feed on every other social app) ───────
// Browsers only allow unattended autoplay when the clip starts muted, so sound
// is always opt-in via the mute button once a video is actually playing.
let scrollObserver: IntersectionObserver | null = null
function setupAutoplayObserver() {
  if (type.value !== 'video' || !container.value || props.disableAutoplay) return
  scrollObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) mediaEl.value?.play().catch(() => {})
        else mediaEl.value?.pause()
      }
    },
    { threshold: 0.6 },
  )
  scrollObserver.observe(container.value)
}

// Scoped to this instance's own container — a naive `!!document.fullscreenElement`
// check would flip every OTHER player on the page into "fullscreen" styling too
// the moment any single one of them actually goes fullscreen.
function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === container.value
}

// ── Lifecycle ────────────────────────────────────────────────────────────
onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  if (type.value === 'audio') isLoading.value = false
  if (mediaEl.value) {
    mediaEl.value.volume = volumeLevel.value
    if (type.value === 'video') {
      mediaEl.value.muted = true
      isMuted.value = true
      mediaEl.value.addEventListener('enterpictureinpicture', onEnterPip)
      mediaEl.value.addEventListener('leavepictureinpicture', onLeavePip)
      setupAutoplayObserver()
    }
  }
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  mediaEl.value?.removeEventListener('enterpictureinpicture', onEnterPip)
  mediaEl.value?.removeEventListener('leavepictureinpicture', onLeavePip)
  scrollObserver?.disconnect()
  clearHide()
})

// Let the parent (e.g. the feed card behind an opened lightbox) stop this
// instance so it doesn't keep playing — with audio — out of view.
defineExpose({
  pause: () => mediaEl.value?.pause(),
})
</script>

<template>
  <!-- ══════════════════ IMAGE ══ -->
  <img
    v-if="type === 'image'"
    :src="src"
    class="w-full rounded-2xl object-cover max-h-[520px] border border-brand-border cursor-pointer hover:brightness-95 transition duration-200"
    loading="lazy"
    @click="$emit('click-image')"
  />

  <!-- ══════════════════ GIF ══ -->
  <div
    v-else-if="type === 'gif'"
    class="relative w-full rounded-2xl overflow-hidden bg-black cursor-pointer select-none group"
    @click="toggleGif"
  >
    <video v-if="isGifVideo" ref="mediaEl" :src="src" autoplay loop muted playsinline
           class="w-full max-h-[520px] object-contain"
           @play="gifPlaying = true" @pause="gifPlaying = false" />
    <template v-else>
      <img v-show="gifPlaying" ref="gifImg" :src="src"
           class="w-full max-h-[520px] object-contain" @load="captureGifFrame" />
      <canvas v-show="!gifPlaying" ref="gifCanvas"
              class="w-full max-h-[520px] object-contain" />
    </template>

    <Transition name="bfade">
      <div v-if="!gifPlaying"
           class="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
        <div class="w-16 h-16 rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-md flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-200">
          <BIcon name="Play" class="w-8 h-8 text-white ml-1 drop-shadow-lg" />
        </div>
      </div>
    </Transition>
    <div class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-xs border border-white/10 text-white text-[11px] font-black tracking-widest uppercase pointer-events-none shadow-lg">
      GIF
    </div>
  </div>

  <!-- ══════════════════ AUDIO ══ -->
  <div
    v-else-if="type === 'audio'"
    class="w-full rounded-2xl overflow-hidden border border-brand-border"
    style="background:linear-gradient(135deg,#191c35 0%,#1f2348 60%,#191c35 100%)"
  >
    <audio ref="mediaEl" :src="src" preload="metadata" class="hidden"
           @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate"
           @play="onPlay" @pause="onPause" @ended="onEnded" @volumechange="onVolumeChange" />

    <div class="p-5 flex flex-col gap-4">
      <!-- Top row -->
      <div class="flex items-center gap-4">
        <!-- Cover icon -->
        <div class="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center relative shadow-xl overflow-hidden"
             style="background:linear-gradient(135deg,#4C67CF,#9055FF)">
          <BIcon name="Music" class="w-7 h-7 text-white drop-shadow-md" />
          <div v-if="isPlaying" class="absolute inset-0 rounded-xl animate-ping opacity-20"
               style="background:linear-gradient(135deg,#4C67CF,#9055FF)" />
        </div>

        <!-- Waveform -->
        <div class="flex-1 flex flex-col gap-2">
          <div class="flex items-end gap-[3px] h-10 overflow-hidden">
            <div v-for="i in 36" :key="i"
                 class="rounded-full shrink-0"
                 style="width:3px; background:linear-gradient(to top,#4C67CF,#A1B4FF)"
                 :style="{
                   height: isPlaying ? `${20 + Math.abs(Math.sin(i * 0.7)) * 70}%` : `${8 + (i % 6) * 4}%`,
                   opacity: isPlaying ? (0.45 + (i % 4) * 0.14) : 0.3,
                   transition: `height ${0.08 + (i % 5) * 0.04}s ease`
                 }" />
          </div>
          <div class="flex justify-between">
            <span class="text-xs font-mono text-brand-accent-minus tabular-nums">{{ formattedCurrent }}</span>
            <span class="text-xs font-mono text-white/55 tabular-nums">{{ formattedDuration }}</span>
          </div>
        </div>
      </div>

      <!-- Progress -->
      <div class="relative h-8 flex items-center cursor-pointer group/bar"
           @click="seekClick" @mousemove="onProgressHover" @mouseleave="onProgressLeave">
        <div class="absolute w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div class="absolute inset-y-0 left-0 bg-white/20" :style="{ width: bufferedPct + '%' }" />
          <div class="absolute inset-y-0 left-0 rounded-full transition-all"
               style="background:linear-gradient(90deg,#4C67CF,#9055FF)" :style="{ width: progressPct + '%' }" />
        </div>
        <div class="absolute w-3.5 h-3.5 rounded-full bg-white shadow-lg ring-2 ring-brand-accent scale-0 group-hover/bar:scale-100 transition-transform pointer-events-none"
             :style="{ left: `calc(${progressPct}% - 7px)` }" />
        <Transition name="bfade">
          <div v-if="showHoverTime"
               class="absolute -top-8 px-2 py-1 rounded-lg bg-black/85 text-white text-xs font-mono whitespace-nowrap pointer-events-none shadow-xl -translate-x-1/2"
               :style="{ left: hoverX + '%' }">{{ formattedHover }}</div>
        </Transition>
        <input type="range" min="0" :max="duration || 100" :value="currentTime"
               @input="seek" @mousedown="seekStart" @mouseup="seekEnd"
               class="absolute inset-0 opacity-0 cursor-pointer w-full" />
      </div>

      <!-- Controls -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button @click="togglePlay"
                  class="w-12 h-12 flex items-center justify-center rounded-full text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
                  style="background:linear-gradient(135deg,#4C67CF,#9055FF)">
            <BIcon :name="isPlaying ? 'Pause' : 'Play'" class="w-6 h-6" :class="{'ml-0.5':!isPlaying}" />
          </button>
        </div>

        <!-- Volume audio -->
        <div class="flex items-center gap-2"
             @mouseenter="showVolSlider = true" @mouseleave="showVolSlider = false">
          <button @click="toggleMute" class="text-white/55 hover:text-white transition-colors">
            <BIcon :name="volIcon" class="w-4 h-4" />
          </button>
          <Transition name="slide-width">
            <div v-show="showVolSlider" class="w-24">
              <div class="relative h-4 flex items-center cursor-pointer group/vol">
                <div class="absolute w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div class="absolute inset-y-0 left-0 rounded-full"
                       style="background:linear-gradient(90deg,#4C67CF,#9055FF)"
                       :style="{ width: volumeLevel * 100 + '%' }" />
                </div>
                <div class="absolute w-3 h-3 rounded-full bg-white shadow-md pointer-events-none"
                     :style="{ left: `calc(${volumeLevel * 100}% - 6px)` }" />
                <input type="range" min="0" max="1" step="0.01" :value="volumeLevel"
                       @input="setVolume" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>

  <!-- ══════════════════ VIDEO ══ -->
  <div
    v-else-if="type === 'video'"
    ref="container"
    tabindex="0"
    class="relative w-full overflow-hidden bg-black select-none outline-hidden"
    :class="[
      isPlaying && !showControls ? 'cursor-none' : '',
      isFullscreen ? 'h-full rounded-none' : 'rounded-2xl',
    ]"
    @mousemove="bumpControls"
    @mouseleave="isPlaying && (showControls = false)"
    @dblclick="toggleFullscreen"
  >
    <!-- Capped height inline, but fills the screen once actually fullscreen —
         without this it stayed pinned to its inline size inside the fullscreen frame. -->
    <video ref="mediaEl" :src="src" class="w-full object-contain block"
           :class="isFullscreen ? 'h-full' : 'max-h-[560px]'"
           playsinline preload="metadata" :loop="shouldLoop"
           @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate"
           @play="onPlay" @pause="onPause" @ended="onEnded"
           @waiting="onWaiting" @canplay="onCanPlay" @volumechange="onVolumeChange"
           @click.stop.prevent="togglePlay" />

    <!-- Spinner -->
    <Transition name="bfade">
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
        <svg class="animate-spin w-11 h-11" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,.15)" stroke-width="4"/>
          <path d="M22 4a18 18 0 0 1 18 18" stroke="#4C67CF" stroke-width="4" stroke-linecap="round"/>
        </svg>
      </div>
    </Transition>

    <!-- Big centre play -->
    <Transition name="pop">
      <div v-if="!isPlaying && !isLoading"
           class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-20 h-20 rounded-full bg-black/45 backdrop-blur-xs ring-1 ring-white/20 flex items-center justify-center shadow-2xl">
          <BIcon name="Play" class="w-10 h-10 text-white ml-1" />
        </div>
      </div>
    </Transition>

    <!-- Persistent mute button — the only thing visible while a muted autoplay
         clip is quietly playing with the full control bar tucked away. -->
    <Transition name="bfade">
      <button
        v-show="!showControls && isPlaying"
        @click.stop="toggleMute"
        :title="isMuted ? 'Включить звук' : 'Выключить звук'"
        class="absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur-xs border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors shadow-lg"
      >
        <BIcon :name="volIcon" class="w-4 h-4" />
      </button>
    </Transition>

    <!-- Controls overlay -->
    <Transition name="controls-fade">
      <div v-show="showControls || !isPlaying"
           class="absolute inset-x-0 bottom-0 pt-14 pb-2 px-3"
           style="background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.45) 50%,transparent 100%)">

        <!-- Seek bar -->
        <div class="relative h-5 flex items-center mb-2 cursor-pointer group/prog"
             @click="seekClick" @mousemove="onProgressHover" @mouseleave="onProgressLeave">
          <!-- Tracks -->
          <div class="absolute w-full rounded-full overflow-hidden transition-all duration-150 group-hover/prog:h-1.5"
               style="height:3px">
            <div class="absolute inset-y-0 left-0 bg-white/25" :style="{ width: bufferedPct + '%' }" />
            <div class="absolute inset-y-0 left-0 bg-brand-accent" :style="{ width: progressPct + '%' }" />
          </div>
          <!-- Knob -->
          <div class="absolute w-4 h-4 rounded-full bg-white shadow-xl ring-2 ring-brand-accent/50 pointer-events-none scale-0 group-hover/prog:scale-100 transition-transform"
               :style="{ left: `calc(${progressPct}% - 8px)` }" />
          <!-- Hover time -->
          <Transition name="bfade">
            <div v-if="showHoverTime"
                 class="absolute -top-8 px-2 py-1 rounded-sm bg-black/90 text-white text-[11px] font-mono whitespace-nowrap pointer-events-none shadow-xl -translate-x-1/2"
                 :style="{ left: hoverX + '%' }">{{ formattedHover }}</div>
          </Transition>
          <input type="range" min="0" :max="duration || 100" :value="currentTime"
                 @input="seek" @mousedown="seekStart" @mouseup="seekEnd"
                 class="absolute inset-0 opacity-0 cursor-pointer w-full" />
        </div>

        <!-- Bottom row -->
        <div class="flex items-center justify-between gap-2">
          <!-- Left -->
          <div class="flex items-center gap-1 text-white">
            <!-- Skip back 10s -->
            <button @click="skipSeconds(-10)" title="-10 сек"
                    class="w-8 h-8 hidden sm:flex items-center justify-center rounded-xl hover:bg-white/15 active:scale-90 transition-all">
              <BIcon name="RotateCcw" class="w-4 h-4" />
            </button>

            <button @click="togglePlay"
                    class="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/15 active:scale-90 transition-all">
              <BIcon :name="isPlaying ? 'Pause' : 'Play'" class="w-5 h-5" :class="{'ml-0.5':!isPlaying}" />
            </button>

            <!-- Skip forward 10s -->
            <button @click="skipSeconds(10)" title="+10 сек"
                    class="w-8 h-8 hidden sm:flex items-center justify-center rounded-xl hover:bg-white/15 active:scale-90 transition-all">
              <BIcon name="RotateCw" class="w-4 h-4" />
            </button>

            <!-- Volume -->
            <div class="flex items-center gap-1"
                 @mouseenter="showVolSlider = true" @mouseleave="showVolSlider = false">
              <button @click="toggleMute"
                      class="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/15 transition-all">
                <BIcon :name="volIcon" class="w-4 h-4" />
              </button>
              <Transition name="slide-width">
                <div v-show="showVolSlider" class="w-24">
                  <div class="relative h-4 flex items-center cursor-pointer group/vol">
                    <div class="absolute w-full h-1.5 rounded-full bg-white/25 overflow-hidden">
                      <div class="absolute inset-y-0 left-0 rounded-full bg-white"
                           :style="{ width: volumeLevel * 100 + '%' }" />
                    </div>
                    <div class="absolute w-3 h-3 rounded-full bg-white shadow-md ring-2 ring-brand-accent/50 pointer-events-none"
                         :style="{ left: `calc(${volumeLevel * 100}% - 6px)` }" />
                    <input type="range" min="0" max="1" step="0.01" :value="volumeLevel"
                           @input="setVolume" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Time -->
            <span class="text-xs font-mono text-white/90 ml-1 tabular-nums whitespace-nowrap">
              {{ formattedCurrent }} <span class="text-white/35">/</span> {{ formattedDuration }}
            </span>
          </div>

          <!-- Right -->
          <div class="flex items-center gap-1 text-white">
            <!-- Speed -->
            <div class="relative">
              <button @click="showSpeedMenu = !showSpeedMenu"
                      class="px-2 h-8 text-xs font-bold rounded-xl hover:bg-white/15 transition-all tabular-nums">
                {{ playbackRate === 1 ? '1×' : playbackRate + '×' }}
              </button>
              <Transition name="pop-up">
                <div v-if="showSpeedMenu"
                     class="absolute bottom-full right-0 mb-2 py-1.5 rounded-xl border border-brand-border shadow-2xl w-28 z-20 overflow-hidden"
                     style="background:rgba(14,16,38,0.97);backdrop-filter:blur(20px)">
                  <button v-for="s in SPEEDS" :key="s" @click="setSpeed(s)"
                          class="w-full px-3 py-1.5 text-sm text-left transition-colors hover:bg-brand-accent/20"
                          :class="playbackRate === s ? 'text-brand-accent-minus font-bold' : 'text-white/80'">
                    {{ s === 1 ? '1×  Норма' : s + '×' }}
                  </button>
                </div>
              </Transition>
            </div>
            <!-- Picture-in-picture -->
            <button v-if="!isFullscreen" @click="togglePip" title="Картинка в картинке"
                    class="w-9 h-9 hidden sm:flex items-center justify-center rounded-xl hover:bg-white/15 active:scale-90 transition-all"
                    :class="isPip ? 'text-brand-accent-minus' : ''">
              <BIcon name="PictureInPicture2" class="w-4 h-4" />
            </button>
            <!-- Fullscreen -->
            <button @click="toggleFullscreen"
                    class="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/15 active:scale-90 transition-all">
              <BIcon :name="isFullscreen ? 'Minimize' : 'Maximize'" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bfade-enter-active,.bfade-leave-active{transition:opacity .2s ease}
.bfade-enter-from,.bfade-leave-to{opacity:0}

.pop-enter-active{transition:opacity .2s ease,transform .2s cubic-bezier(.34,1.56,.64,1)}
.pop-leave-active{transition:opacity .15s ease,transform .15s ease}
.pop-enter-from,.pop-leave-to{opacity:0;transform:scale(.8)}

.pop-up-enter-active{transition:opacity .18s,transform .18s cubic-bezier(.34,1.56,.64,1)}
.pop-up-leave-active{transition:opacity .15s,transform .15s ease}
.pop-up-enter-from,.pop-up-leave-to{opacity:0;transform:translateY(8px) scale(.95)}

.controls-fade-enter-active{transition:opacity .25s ease}
.controls-fade-leave-active{transition:opacity .5s ease}
.controls-fade-enter-from,.controls-fade-leave-to{opacity:0}

.slide-width-enter-active{transition:width .22s ease,opacity .18s}
.slide-width-leave-active{transition:width .18s ease,opacity .14s}
.slide-width-enter-from,.slide-width-leave-to{width:0!important;opacity:0}

input[type=range]{-webkit-appearance:none;appearance:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:1px;height:1px;opacity:0}
input[type=range]::-moz-range-thumb{width:1px;height:1px;opacity:0;border:none;background:transparent}
</style>

