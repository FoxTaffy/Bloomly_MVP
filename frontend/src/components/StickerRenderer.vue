<template>
  <div :class="['sticker-renderer flex items-center justify-center', sizeClass, props.class]">
    <!-- Lottie canvas (TGS / JSON) -->
    <div v-if="isLottie" ref="lottieEl" class="w-full h-full" />
    <!-- Animated / static image (WebP, GIF, PNG, etc.) -->
    <img
      v-else
      :src="src"
      :alt="alt"
      class="w-full h-full object-contain select-none"
      loading="lazy"
      draggable="false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

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
const isTgs  = computed(() => /\.tgs$/i.test(props.src))
const isJson = computed(() => /\.json$/i.test(props.src))
const isLottie = computed(() => isTgs.value || isJson.value)

const sizeClass = computed(() => ({
  xs: 'w-8 h-8',
  sm: 'w-12 h-12',
  md: 'w-20 h-20',
  lg: 'w-32 h-32',
  xl: 'w-48 h-48',
}[props.size]))

// ── Lottie ─────────────────────────────────────────────────────────────────
const lottieEl  = ref<HTMLElement | null>(null)
let   anim: any = null

async function initLottie() {
  if (!lottieEl.value) return
  destroyAnim()

  if (!lottie) {
    const mod = await import('lottie-web')
    lottie = (mod as any).default ?? mod
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
