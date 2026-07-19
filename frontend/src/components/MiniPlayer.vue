<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import BIcon from './BIcon.vue'

const props = defineProps<{ src: string; msgType?: string; isMine?: boolean }>()
const emit  = defineEmits(['click-image'])

const mediaEl     = ref<HTMLVideoElement | HTMLAudioElement | null>(null)
const isPlaying   = ref(false)
const isDragging  = ref(false)
const isLoading   = ref(true)
const duration    = ref(0)
const currentTime = ref(0)
const volumeLevel = ref(1)
const isMuted     = ref(false)
const volOpen     = ref(false)
const albumArt    = ref<string | null>(null)
const playbackRate = ref(1)
let   volCloseTimer: ReturnType<typeof setTimeout> | null = null

const type = computed(() => {
  if (props.msgType === 'voice') return 'voice'
  if (props.msgType === 'video') return 'video'
  if (props.msgType === 'image') return 'image'
  if (props.msgType === 'sticker') return 'sticker'
  const u = props.src.toLowerCase().split('?')[0]
  if (/\.(mp4|webm|mov|mkv|ogv)$/.test(u)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(u)) return 'audio'
  if (/\.gif$/.test(u)) return 'gif'
  return 'image'
})

// Pseudo-waveform bars for voice messages (deterministic from src hash)
const BARS = 32
const waveformBars = computed(() => {
  const seed = props.src.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: BARS }, (_, i) => {
    const v = Math.abs(Math.sin((seed + i * 3.7) * 0.47)) * 0.72 + 0.28
    return Math.max(0.18, Math.min(1, v))
  })
})
const filledBars = computed(() => {
  if (!duration.value) return 0
  return Math.round((currentTime.value / duration.value) * BARS)
})

function fmt(s: number) {
  if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
const fmtCurrent  = computed(() => fmt(currentTime.value))
const fmtDuration = computed(() => fmt(duration.value))
const progressPct = computed(() => (isFinite(duration.value) && duration.value > 0)
  ? (currentTime.value / duration.value) * 100 : 0)

function onLoadedMetadata(e: Event) {
  const d = (e.target as HTMLMediaElement).duration
  duration.value  = (isFinite(d) && d > 0) ? d : 0
  isLoading.value = false
}
function onTimeUpdate(e: Event) {
  if (isDragging.value) return
  currentTime.value = (e.target as HTMLMediaElement).currentTime || 0
}
function onPlay()    { isPlaying.value = true }
function onPause()   { isPlaying.value = false }
function onEnded()   { isPlaying.value = false; currentTime.value = 0 }
function onCanPlay() { isLoading.value = false }

function togglePlay() {
  if (!mediaEl.value) return
  if (isPlaying.value) {
    mediaEl.value.pause()
  } else {
    mediaEl.value.playbackRate = playbackRate.value
    mediaEl.value.play()
  }
}

function cycleSpeed() {
  const rates = [1, 1.5, 2]
  const idx = rates.indexOf(playbackRate.value)
  playbackRate.value = rates[(idx + 1) % rates.length]
  if (mediaEl.value) mediaEl.value.playbackRate = playbackRate.value
}

function seek(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (mediaEl.value && isFinite(v)) { mediaEl.value.currentTime = v; currentTime.value = v }
}
function seekByBar(idx: number) {
  if (!duration.value || !mediaEl.value) return
  const t = (idx / BARS) * duration.value
  mediaEl.value.currentTime = t
  currentTime.value = t
}
function setVolume(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (!mediaEl.value || !isFinite(v)) return
  mediaEl.value.volume = v
  mediaEl.value.muted  = v === 0
  volumeLevel.value    = v
  isMuted.value        = v === 0
}
function toggleMute() {
  if (!mediaEl.value) return
  isMuted.value = !isMuted.value
  mediaEl.value.muted = isMuted.value
  if (!isMuted.value && volumeLevel.value === 0) { volumeLevel.value = 0.5; mediaEl.value.volume = 0.5 }
}
function openVol()  { if (volCloseTimer) clearTimeout(volCloseTimer); volOpen.value = true }
function scheduleCloseVol() { volCloseTimer = setTimeout(() => { volOpen.value = false }, 300) }

async function extractAlbumArt(url: string): Promise<string | null> {
  try {
    const res  = await fetch(url, { headers: { Range: 'bytes=0-524288' } })
    if (!res.ok) return null
    const buf  = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null
    const tagSize = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) |
                    ((data[8] & 0x7f) << 7)  |  (data[9] & 0x7f)
    let pos = 10
    const end = Math.min(tagSize + 10, data.length)
    while (pos + 10 < end) {
      const frameId   = String.fromCharCode(data[pos], data[pos+1], data[pos+2], data[pos+3])
      const frameSize = (data[pos+4] << 24) | (data[pos+5] << 16) | (data[pos+6] << 8) | data[pos+7]
      if (frameSize <= 0 || pos + 10 + frameSize > end) break
      if (frameId === 'APIC') {
        let i = pos + 11
        let mimeEnd = i
        while (mimeEnd < end && data[mimeEnd] !== 0) mimeEnd++
        const mime = new TextDecoder().decode(data.slice(i, mimeEnd))
        let imgStart = mimeEnd + 2
        while (imgStart < end && data[imgStart] !== 0) imgStart++
        imgStart++
        const imgData = data.slice(imgStart, pos + 10 + frameSize)
        return URL.createObjectURL(new Blob([imgData], { type: mime || 'image/jpeg' }))
      }
      pos += 10 + frameSize
    }
    return null
  } catch { return null }
}

onMounted(async () => {
  if (type.value === 'audio' && /\.mp3$/i.test(props.src.split('?')[0])) {
    albumArt.value = await extractAlbumArt(props.src)
  }
})
onUnmounted(() => {
  mediaEl.value?.pause()
  if (volCloseTimer) clearTimeout(volCloseTimer)
  if (albumArt.value?.startsWith('blob:')) URL.revokeObjectURL(albumArt.value)
})
watch(() => props.src, async (newSrc) => {
  if (albumArt.value?.startsWith('blob:')) URL.revokeObjectURL(albumArt.value)
  albumArt.value = null
  isLoading.value = true
  if (type.value === 'audio' && /\.mp3$/i.test(newSrc.split('?')[0])) {
    albumArt.value = await extractAlbumArt(newSrc)
  }
})
</script>

<template>
  <!-- sticker -->
  <div v-if="type === 'sticker'" class="w-[120px] h-[120px] flex items-center justify-center text-[72px] leading-none p-2">
    {{ src }}
  </div>

  <!-- image -->
  <img v-else-if="type === 'image'"
    :src="src" class="w-[260px] h-[195px] object-cover cursor-pointer block" loading="lazy"
    @click="emit('click-image')" />

  <!-- gif -->
  <div v-else-if="type === 'gif'"
    class="relative cursor-pointer w-[260px] h-[195px]"
    @click="emit('click-image')">
    <img :src="src" class="w-full h-full object-cover block" loading="lazy" />
    <span class="absolute top-1.5 left-1.5 px-1.5 py-px rounded text-[9px] font-black tracking-widest text-white bg-black/55 uppercase">GIF</span>
  </div>

  <!-- ── Voice (Telegram-style) ──────────────────────────────────────────── -->
  <div v-else-if="type === 'voice'"
    class="flex items-center gap-3 px-3.5 py-2.5 w-[280px]">
    <audio ref="mediaEl" :src="src" preload="metadata" class="hidden"
      @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate"
      @play="onPlay" @pause="onPause" @ended="onEnded" @canplay="onCanPlay" />

    <!-- Paw play button -->
    <button @click="togglePlay"
      class="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 shadow-md"
      :class="isMine ? 'bg-white/90 hover:bg-white' : (isPlaying ? 'bg-brand-accent' : 'bg-brand-accent/80 hover:bg-brand-accent')">
      <svg v-if="!isPlaying" viewBox="0 0 15 15" fill="currentColor" class="w-4 h-4" :class="isMine ? 'text-brand-accent' : 'text-white'">
        <path d="M5 0C3.89543 0 3 0.895431 3 2V3C3 4.10457 3.89543 5 5 5C6.10457 5 7 4.10457 7 3V2C7 0.895431 6.10457 0 5 0Z"/>
        <path d="M10 0C8.89543 0 8 0.895431 8 2V3C8 4.10457 8.89543 5 10 5C11.1046 5 12 4.10457 12 3V2C12 0.895431 11.1046 0 10 0Z"/>
        <path d="M2 5C0.895431 5 0 5.89543 0 7V7.5C0 8.60457 0.895431 9.5 2 9.5C3.10457 9.5 4 8.60457 4 7.5V7C4 5.89543 3.10457 5 2 5Z"/>
        <path d="M13 5C11.8954 5 11 5.89543 11 7V7.5C11 8.60457 11.8954 9.5 13 9.5C14.1046 9.5 15 8.60457 15 7.5V7C15 5.89543 14.1046 5 13 5Z"/>
        <path d="M9.61273 7.77893C8.51793 6.44953 6.48207 6.44953 5.38727 7.77893L2.46943 11.322C1.2614 12.7889 2.30486 15 4.20516 15C4.47668 15 4.74447 14.9368 4.98732 14.8154L5.34699 14.6355C6.70234 13.9578 8.29766 13.9578 9.65301 14.6355L10.0127 14.8154C10.2555 14.9368 10.5233 15 10.7948 15C12.6951 15 13.7386 12.7889 12.5306 11.322L9.61273 7.77893Z"/>
      </svg>
      <BIcon v-else name="Pause" class="w-4 h-4" :class="isMine ? 'text-brand-accent' : 'text-white'" />
    </button>

    <!-- Waveform bars -->
    <div class="flex-1 flex flex-col gap-0.5">
      <div class="flex items-end gap-px h-7 cursor-pointer select-none"
        @click="(e) => { const bar = Math.floor(e.offsetX / e.currentTarget.clientWidth * BARS); seekByBar(bar) }">
        <div v-for="(h, i) in waveformBars" :key="i"
          class="flex-1 rounded-sm min-w-0 transition-colors"
          :style="{ height: (h * 100) + '%' }"
          :class="[
            i < filledBars
              ? (isMine ? 'bg-white' : 'bg-brand-accent')
              : (isMine ? 'bg-white/30' : 'bg-white/20'),
            isPlaying && i === filledBars ? 'animate-pulse' : ''
          ]" />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-[9px] tabular-nums" :class="isMine ? 'text-white/70' : 'text-white/55'">{{ isLoading ? '...' : (isPlaying ? fmtCurrent : fmtDuration) }}</span>
        <button @click.stop="cycleSpeed"
          class="text-[9px] transition-colors font-bold tabular-nums px-1 rounded"
          :class="isMine ? (playbackRate !== 1 ? 'text-white' : 'text-white/70 hover:text-white') : (playbackRate !== 1 ? 'text-brand-accent' : 'text-white/55 hover:text-brand-accent')">
          {{ playbackRate }}×
        </button>
      </div>
    </div>
  </div>

  <!-- ── Audio (MP3) — compact horizontal player ────────────────────────── -->
  <div v-else-if="type === 'audio'"
    class="flex items-center gap-3 px-3.5 py-3 w-[280px]">
    <audio ref="mediaEl" :src="src" preload="metadata" class="hidden"
      @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate"
      @play="onPlay" @pause="onPause" @ended="onEnded" @canplay="onCanPlay" />

    <!-- Album art + play -->
    <div class="relative flex-shrink-0 w-11 h-11">
      <div class="w-11 h-11 rounded-xl overflow-hidden border border-brand-border/60 bg-brand-bg flex items-center justify-center shadow-md">
        <img v-if="albumArt" :src="albumArt" class="w-full h-full object-cover" />
        <svg v-else viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-brand-accent/60">
          <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z"/>
        </svg>
      </div>
      <!-- Loading spinner -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
        <svg class="w-5 h-5 animate-spin text-brand-accent" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-dasharray="28 57" />
        </svg>
      </div>
    </div>

    <!-- Track info + controls -->
    <div class="flex-1 min-w-0 flex flex-col gap-1">
      <div class="flex items-center justify-between gap-2">
        <button @click="togglePlay"
          class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-95"
          :class="isMine ? 'bg-white/90 hover:bg-white' : 'bg-brand-accent/80 hover:bg-brand-accent'">
          <svg v-if="!isPlaying" viewBox="0 0 15 15" fill="currentColor" class="w-3.5 h-3.5" :class="isMine ? 'text-brand-accent' : 'text-white'">
            <path d="M5 0C3.89543 0 3 0.895431 3 2V3C3 4.10457 3.89543 5 5 5C6.10457 5 7 4.10457 7 3V2C7 0.895431 6.10457 0 5 0Z"/>
            <path d="M10 0C8.89543 0 8 0.895431 8 2V3C8 4.10457 8.89543 5 10 5C11.1046 5 12 4.10457 12 3V2C12 0.895431 11.1046 0 10 0Z"/>
            <path d="M2 5C0.895431 5 0 5.89543 0 7V7.5C0 8.60457 0.895431 9.5 2 9.5C3.10457 9.5 4 8.60457 4 7.5V7C4 5.89543 3.10457 5 2 5Z"/>
            <path d="M13 5C11.8954 5 11 5.89543 11 7V7.5C11 8.60457 11.8954 9.5 13 9.5C14.1046 9.5 15 8.60457 15 7.5V7C15 5.89543 14.1046 5 13 5Z"/>
            <path d="M9.61273 7.77893C8.51793 6.44953 6.48207 6.44953 5.38727 7.77893L2.46943 11.322C1.2614 12.7889 2.30486 15 4.20516 15C4.47668 15 4.74447 14.9368 4.98732 14.8154L5.34699 14.6355C6.70234 13.9578 8.29766 13.9578 9.65301 14.6355L10.0127 14.8154C10.2555 14.9368 10.5233 15 10.7948 15C12.6951 15 13.7386 12.7889 12.5306 11.322L9.61273 7.77893Z"/>
          </svg>
          <BIcon v-else name="Pause" class="w-3 h-3" :class="isMine ? 'text-brand-accent' : 'text-white'" />
        </button>
        <div class="flex-1 relative h-1.5 rounded-full cursor-pointer min-w-0" :class="isMine ? 'bg-white/20' : 'bg-white/10'">
          <div class="absolute inset-y-0 left-0 rounded-full transition-all" :class="isMine ? 'bg-white' : 'bg-brand-accent/80'" :style="{ width: progressPct + '%' }" />
          <input type="range" min="0" :max="duration || 100" :value="currentTime"
            @input="seek" @mousedown="isDragging = true" @mouseup="isDragging = false" class="range-overlay" />
        </div>
        <div class="relative flex-shrink-0" @mouseenter="openVol" @mouseleave="scheduleCloseVol">
          <button @click="toggleMute" class="p-0.5 text-white/55 hover:text-brand-offwhite transition-colors">
            <BIcon :name="isMuted || volumeLevel === 0 ? 'VolumeX' : 'Volume2'" class="w-3.5 h-3.5" />
          </button>
          <Transition name="vol-pop">
            <div v-if="volOpen" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-brand-card border border-brand-border rounded-xl px-2 py-2.5 shadow-xl z-30 flex flex-col items-center"
              @mouseenter="openVol" @mouseleave="scheduleCloseVol">
              <input type="range" min="0" max="1" step="0.01" :value="isMuted ? 0 : volumeLevel" @input="setVolume" class="vol-vertical" />
            </div>
          </Transition>
        </div>
      </div>
      <div class="grid grid-cols-3 items-center">
        <span class="text-[9px] text-white/55 tabular-nums text-left">{{ fmtCurrent }}</span>
        <button @click="cycleSpeed" class="text-[9px] font-bold tabular-nums px-1 py-px rounded transition-colors justify-self-center"
          :class="playbackRate !== 1 ? 'text-brand-accent' : 'text-white/55 hover:text-brand-accent'">{{ playbackRate }}×</button>
        <span class="text-[9px] text-white/55 tabular-nums text-right">{{ fmtDuration }}</span>
      </div>
    </div>
  </div>

  <!-- ── Video ─────────────────────────────────────────────────────────────── -->
  <div v-else
    class="relative overflow-hidden bg-black/80 w-[260px] cursor-pointer group"
    style="height:195px"
    @click="togglePlay">
    <video ref="mediaEl" :src="src" preload="metadata" playsinline
      class="w-full h-full object-contain block"
      @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate"
      @play="onPlay" @pause="onPause" @ended="onEnded"
      @canplay="onCanPlay" @click.prevent />
    <!-- Fullscreen expand button -->
    <button @click.stop="emit('click-image')"
      class="absolute top-1.5 right-1.5 z-20 w-6 h-6 rounded-lg bg-black/55 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80">
      <BIcon name="Maximize2" class="w-3 h-3 text-white" />
    </button>
    <!-- Circular loading -->
    <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg class="w-8 h-8 animate-spin text-white/50" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" stroke-dasharray="22 56" />
      </svg>
    </div>
    <div v-if="!isPlaying && !isLoading" class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div class="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
        <svg viewBox="0 0 15 15" fill="currentColor" class="w-5 h-5 text-white">
          <path d="M5 0C3.89543 0 3 0.895431 3 2V3C3 4.10457 3.89543 5 5 5C6.10457 5 7 4.10457 7 3V2C7 0.895431 6.10457 0 5 0Z"/>
          <path d="M10 0C8.89543 0 8 0.895431 8 2V3C8 4.10457 8.89543 5 10 5C11.1046 5 12 4.10457 12 3V2C12 0.895431 11.1046 0 10 0Z"/>
          <path d="M2 5C0.895431 5 0 5.89543 0 7V7.5C0 8.60457 0.895431 9.5 2 9.5C3.10457 9.5 4 8.60457 4 7.5V7C4 5.89543 3.10457 5 2 5Z"/>
          <path d="M13 5C11.8954 5 11 5.89543 11 7V7.5C11 8.60457 11.8954 9.5 13 9.5C14.1046 9.5 15 8.60457 15 7.5V7C15 5.89543 14.1046 5 13 5Z"/>
          <path d="M9.61273 7.77893C8.51793 6.44953 6.48207 6.44953 5.38727 7.77893L2.46943 11.322C1.2614 12.7889 2.30486 15 4.20516 15C4.47668 15 4.74447 14.9368 4.98732 14.8154L5.34699 14.6355C6.70234 13.9578 8.29766 13.9578 9.65301 14.6355L10.0127 14.8154C10.2555 14.9368 10.5233 15 10.7948 15C12.6951 15 13.7386 12.7889 12.5306 11.322L9.61273 7.77893Z"/>
        </svg>
      </div>
    </div>
    <div class="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity"
      style="background:linear-gradient(to top,rgba(0,0,0,.65),transparent)"
      @click.stop>
      <div class="relative h-1 rounded-full bg-white/20 cursor-pointer mb-2">
        <div class="absolute inset-y-0 left-0 rounded-full bg-white/70 transition-all" :style="{ width: progressPct + '%' }" />
        <input type="range" min="0" :max="duration || 100" :value="currentTime"
          @input="seek" @mousedown="isDragging = true" @mouseup="isDragging = false" class="range-overlay" />
      </div>
      <div class="flex items-center gap-1.5 text-white/80">
        <button @click="togglePlay" class="p-0.5 hover:text-white transition-colors active:scale-90">
          <BIcon :name="isPlaying ? 'Pause' : 'Play'" class="w-3.5 h-3.5" :class="{'ml-px':!isPlaying}" />
        </button>
        <div class="relative flex-shrink-0" @mouseenter="openVol" @mouseleave="scheduleCloseVol">
          <button @click.stop="toggleMute" class="p-0.5 hover:text-white transition-colors">
            <BIcon :name="isMuted || volumeLevel === 0 ? 'VolumeX' : volumeLevel < 0.5 ? 'Volume1' : 'Volume2'" class="w-3 h-3" />
          </button>
          <Transition name="vol-pop">
            <div v-if="volOpen"
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-brand-card border border-brand-border rounded-xl px-2 py-2.5 shadow-xl z-30 flex flex-col items-center"
              @mouseenter="openVol" @mouseleave="scheduleCloseVol">
              <input type="range" min="0" max="1" step="0.01" :value="isMuted ? 0 : volumeLevel"
                @input.stop="setVolume" @click.stop class="vol-vertical" />
            </div>
          </Transition>
        </div>
        <span class="text-[9px] tabular-nums ml-auto">{{ fmtCurrent }} / {{ fmtDuration }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.range-overlay {
  position: absolute; inset: -6px 0; opacity: 0; cursor: pointer; width: 100%;
  -webkit-appearance: none; appearance: none;
}
.range-overlay::-webkit-slider-thumb { width: 0; height: 0; }
.range-overlay::-moz-range-thumb     { width: 0; height: 0; border: none; }
.vol-vertical {
  width: 16px; height: 64px; cursor: pointer; accent-color: #4C67CF;
  writing-mode: vertical-lr; direction: rtl;
}
.vol-pop-enter-active, .vol-pop-leave-active { transition: opacity .15s ease, transform .15s ease; }
.vol-pop-enter-from,  .vol-pop-leave-to      { opacity: 0; transform: translateX(-50%) translateY(4px) scale(.95); }
</style>
