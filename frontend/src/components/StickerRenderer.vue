<template>
  <div :class="['sticker-renderer flex items-center justify-center', sizeClass, props.class]">
    <!-- Lottie canvas (TGS / JSON) — shimmer fades when animation is ready -->
    <div v-if="isLottie" class="relative w-full h-full">
      <div v-if="!lottieLoaded" class="absolute inset-0 sticker-shimmer pointer-events-none" />
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
const isTgs    = computed(() => /\.tgs$/i.test(props.src))
const isJson   = computed(() => /\.json$/i.test(props.src))
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
let   anim: any   = null

async function initLottie() {
  if (!lottieEl.value) return
  destroyAnim()
  lottieLoaded.value = false

  if (!lottie) {
    const mod = await import('lottie-web')
    lottie = mod.default ?? mod
  }

  if (isTgs.value) {
    // TGS = gzip-compressed Lottie JSON
    const { gunzipSync } = await import('fflate')
    const resp = await fetch(props.src)
    const buf  = await resp.arrayBuffer()
    const json = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(buf))))
    anim = lottie.loadAnimation({
      container: lottieEl.value,
      renderer: 'svg',
      autoplay: props.autoplay,
      loop: props.loop,
      animationData: json,
    })
  } else {
    // Regular Lottie JSON
    anim = lottie.loadAnimation({
      container: lottieEl.value,
      renderer: 'svg',
      autoplay: props.autoplay,
      loop: props.loop,
      path: props.src,
    })
  }

  anim.addEventListener('data_ready', () => { lottieLoaded.value = true })
}

function destroyAnim() {
  if (anim) { try { anim.destroy() } catch { /* ignore */ } anim = null }
}

onMounted(() => { if (isLottie.value) initLottie() })
onBeforeUnmount(() => destroyAnim())

watch(() => props.src, () => {
  if (isLottie.value) initLottie()
  else destroyAnim()
})
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
