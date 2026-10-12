<script setup lang="ts">
// Live countdown to an auction's end. It owns its one-second timer, so the once-per-second
// tick re-renders only this component instead of the whole Dealers' Den page.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLangStore } from '@/stores/lang'

const props = defineProps<{ endsAt: string | null }>()
const langStore = useLangStore()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(timer))

const diff = computed(() => (props.endsAt ? new Date(props.endsAt).getTime() - now.value : null))
const ended = computed(() => diff.value !== null && diff.value <= 0)
// Under an hour left: the countdown turns red.
const hot = computed(() => diff.value !== null && diff.value < 3600000)

const text = computed(() => {
  if (diff.value === null) return ''
  if (diff.value <= 0) return langStore.t.dealersDenAuctionEnded
  const ms = diff.value
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (d > 0) return `${d}${langStore.t.dealersDenDayAbbr} ${h}${langStore.t.dealersDenHourAbbr}`
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
</script>

<template>
  <slot :text="text" :hot="hot" :ended="ended" />
</template>
