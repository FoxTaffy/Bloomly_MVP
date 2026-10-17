<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'

const props = defineProps<{
  show: boolean
  cooldownUntil: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const secondsLeft = ref(0)
let tickInterval: ReturnType<typeof setInterval> | null = null

function tick() {
  secondsLeft.value = Math.max(0, Math.ceil((props.cooldownUntil - Date.now()) / 1000))
  if (secondsLeft.value <= 0 && tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

watch(() => props.show, (v) => {
  if (v) {
    tick()
    tickInterval = setInterval(tick, 500)
  } else if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}, { immediate: true })

onUnmounted(() => { if (tickInterval) clearInterval(tickInterval) })
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div v-if="show" class="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-4" style="background:rgba(5,8,20,0.6);backdrop-filter:blur(4px)">
      <Transition
        appear
        enter-active-class="transition-all duration-250 ease-out"
        enter-from-class="opacity-0 scale-95 translate-y-3"
        enter-to-class="opacity-100 scale-100 translate-y-0"
      >
        <div class="w-full max-w-[380px] rounded-3xl overflow-hidden relative p-5"
          style="background:rgba(16,14,28,0.95);border:1px solid rgba(251,146,60,0.3);box-shadow:0 24px 48px rgba(0,0,0,0.5)">
          <button @click="emit('close')" class="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors">
            <BIcon name="X" class="w-4 h-4" />
          </button>

          <div class="flex items-start gap-3 pr-6">
            <div class="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <BIcon name="Zap" class="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 class="text-base font-black text-white leading-tight">Полегче с сообщениями!</h3>
              <p class="text-sm text-white/50 mt-1 leading-relaxed">Ты отправляешь их слишком быстро. Дай собеседнику дух перевести.</p>
            </div>
          </div>

          <div class="mt-4 py-3 rounded-2xl text-center font-bold text-sm"
            :class="secondsLeft > 0 ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'">
            {{ secondsLeft > 0 ? `Можно снова писать через ${secondsLeft}с` : 'Готово, можно продолжать' }}
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
