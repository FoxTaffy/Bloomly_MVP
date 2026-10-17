<template>
  <div :class="['sticker-renderer flex items-center justify-center', sizeClass, props.class]">
    <!-- Lottie canvas (TGS / JSON) — shimmer fades when animation is ready -->
    <div v-if="isLottie" class="relative w-full h-full">
      <div v-if="!lottieLoaded && !loadFailed" class="absolute inset-0 sticker-shimmer pointer-events-none" />
      <span v-if="loadFailed" role="img" :aria-label="alt" class="text-white/40 text-xs">{{ alt }}</span>
      <div ref="lottieEl" class="w-full h-full" />
    </div>
    <!-- Animated / static image (WebP, GIF, PNG, etc.) -->
    <StickerImg v-else :src="src" :alt="alt" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import StickerImg from '@/components/StickerImg.vue'

// lottie-web is a CommonJS module; use dynamic import to avoid SSR issues
let lottie: any = null

const props = withDefaults(defineProps<{
  src: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  alt?: string
  autoplay?: boolean
  loop?: boolean
  class?: string
}>(), {
  size: 'md',
  alt: 'sticker',
  autoplay: true,
  loop: true,
})

// ── Detect type ────────────────────────────────────────────────────────────
const isTgs    = computed(() => /\.tgs(?:[?#]|$)/i.test(props.src))
const isJson   = computed(() => /\.json(?:[?#]|$)/i.test(props.src))
const isLottie = computed(() => isTgs.value || isJson.value)

const sizeClass = computed(() => ({
  xs: 'w-8 h-8',
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-32 h-32',
  xl: 'w-48 h-48',
}[props.size]))

// ── Lottie ─────────────────────────────────────────────────────────────────
const lottieEl    = ref<HTMLElement | null>(null)
const lottieLoaded = ref(false)
const loadFailed = ref(false)
let   anim: any   = null
let generation = 0
let activeRequest: AbortController | undefined

async function readLimited(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) throw new Error('Sticker too large')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

async function initLottie() {
  destroyAnim()
  const current = generation
  if (!lottieEl.value) return
  lottieLoaded.value = false
  loadFailed.value = false
  const controller = new AbortController()
  activeRequest = controller
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    if (!lottie) {
      const mod = await import('lottie-web/build/player/lottie_light')
      lottie = mod.default ?? mod
    }
    const response = await fetch(props.src, { signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('Sticker unavailable')
    let bytes = await readLimited(response.body, isTgs.value ? 1024 * 1024 : 8 * 1024 * 1024)
    if (isTgs.value) {
      const compressed = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
      bytes = await readLimited(compressed, 8 * 1024 * 1024)
    }
    const json = JSON.parse(new TextDecoder().decode(bytes))
    if (current !== generation || controller.signal.aborted || !lottieEl.value) return
    anim = lottie.loadAnimation({
      container: lottieEl.value,
      renderer: 'svg',
      autoplay: props.autoplay,
      loop: props.loop,
      animationData: json,
    })
    anim.addEventListener('DOMLoaded', () => { if (current === generation) lottieLoaded.value = true })
    anim.addEventListener('data_failed', () => { if (current === generation) loadFailed.value = true })
  } catch {
    if (current === generation) loadFailed.value = true
  } finally { clearTimeout(timer) }
}

function destroyAnim() {
  generation++
  activeRequest?.abort()
  if (anim) { try { anim.destroy() } catch { /* ignore */ } anim = null }
}

onMounted(() => { if (isLottie.value) initLottie() })
onBeforeUnmount(() => destroyAnim())

watch(() => props.src, () => {
  if (isLottie.value) initLottie()
  else destroyAnim()
}, { flush: 'post' })
</script>

<style scoped>
.sticker-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.10) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: sticker-shimmer-anim 1.4s ease infinite;
  transition: opacity 0.25s ease;
}

@keyframes sticker-shimmer-anim {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
