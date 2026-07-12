<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import BIcon from './BIcon.vue'

const props = defineProps<{
  show: boolean
  email: string
  reason: string
  remember: boolean
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'unfrozen'): void }>()

const auth = useAuthStore()
const step = ref<'info' | 'code'>('info')
const code = ref('')
const sending = ref(false)
const confirming = ref(false)
const localError = ref('')
const sent = ref(false)

const resendCountdown = ref(0)
let resendInterval: ReturnType<typeof setInterval> | null = null
function startResendTimer() {
  resendCountdown.value = 60
  resendInterval = setInterval(() => {
    resendCountdown.value--
    if (resendCountdown.value <= 0 && resendInterval) {
      clearInterval(resendInterval)
      resendInterval = null
    }
  }, 1000)
}

watch(() => props.show, (v) => {
  if (v) {
    step.value = 'info'
    code.value = ''
    localError.value = ''
    sent.value = false
  }
})

function onCodeInput(e: Event) {
  const target = e.target as HTMLInputElement
  code.value = target.value.replace(/\D+/g, '').slice(0, 6)
}

async function sendCode() {
  sending.value = true
  localError.value = ''
  try {
    await auth.requestUnfreeze(props.email)
    step.value = 'code'
    sent.value = true
    startResendTimer()
  } catch {
    localError.value = 'Не удалось отправить код. Попробуй ещё раз.'
  } finally {
    sending.value = false
  }
}

async function resend() {
  if (resendCountdown.value > 0) return
  try {
    await auth.requestUnfreeze(props.email)
    startResendTimer()
  } catch { /* ignore */ }
}

async function confirm() {
  if (code.value.length !== 6) return
  confirming.value = true
  localError.value = ''
  try {
    await auth.confirmUnfreeze(props.email, code.value, props.remember)
    emit('unfrozen')
  } catch (e: any) {
    localError.value = e?.response?.data?.error?.message || 'Неверный или устаревший код'
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-250 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center p-4" style="background:rgba(5,8,20,0.72);backdrop-filter:blur(6px)">
      <Transition
        appear
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 scale-95 translate-y-4"
        enter-to-class="opacity-100 scale-100 translate-y-0"
      >
        <div class="w-full max-w-[420px] rounded-[28px] overflow-hidden relative"
          style="background:rgba(12,15,32,0.92);border:1px solid rgba(56,189,248,0.25);box-shadow:0 32px 64px rgba(0,0,0,0.55),0 0 0 1px rgba(56,189,248,0.1)">

          <!-- Icy top banner -->
          <div class="relative px-8 pt-8 pb-6 text-center" style="background:linear-gradient(160deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)">
            <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center backdrop-blur-sm">
              <BIcon name="Snowflake" class="w-8 h-8 text-white" />
            </div>
            <h2 class="text-xl font-black text-white">Аккаунт заморожен</h2>
          </div>

          <div class="p-7 space-y-4">
            <p class="text-sm text-white/50 leading-relaxed">{{ reason || 'Аккаунт временно заморожен модерацией.' }}</p>

            <template v-if="step === 'info'">
              <div class="flex items-start gap-2.5 p-3.5 rounded-2xl bg-sky-500/8 border border-sky-500/20">
                <BIcon name="Mail" class="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
                <p class="text-xs text-sky-300/90 font-semibold">Чтобы разморозить аккаунт, подтверди это письмом на <span class="text-white">{{ email }}</span>.</p>
              </div>

              <p v-if="localError" class="text-xs text-rose-400 font-semibold">{{ localError }}</p>

              <button @click="sendCode" :disabled="sending"
                class="w-full py-3.5 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-50"
                style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);box-shadow:0 8px 24px rgba(14,165,233,0.35)">
                {{ sending ? 'Отправка…' : 'Отправить код на почту' }}
              </button>
            </template>

            <template v-else>
              <div class="flex items-center gap-2.5 p-3.5 rounded-2xl bg-sky-500/8 border border-sky-500/20">
                <BIcon name="ShieldCheck" class="w-4 h-4 shrink-0 text-sky-400" />
                <p class="text-xs text-sky-300/90 font-semibold">Код отправлен на <span class="text-white">{{ email }}</span></p>
              </div>

              <input
                :value="code"
                @input="onCodeInput"
                type="text"
                inputmode="numeric"
                placeholder="• • • • • •"
                maxlength="6"
                class="w-full text-center text-xl font-bold tracking-[0.5em] rounded-2xl px-4 py-3.5 outline-none text-white"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(56,189,248,0.3)"
                autocomplete="one-time-code"
              />

              <p v-if="localError" class="text-xs text-rose-400 font-semibold">{{ localError }}</p>

              <button @click="confirm" :disabled="confirming || code.length !== 6"
                class="w-full py-3.5 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-50"
                style="background:linear-gradient(135deg,#0ea5e9,#38bdf8);box-shadow:0 8px 24px rgba(14,165,233,0.35)">
                {{ confirming ? 'Проверка…' : 'Разморозить аккаунт' }}
              </button>

              <div class="flex justify-center">
                <button type="button" @click="resend" :disabled="resendCountdown > 0"
                  class="text-xs font-semibold transition-colors"
                  :class="resendCountdown > 0 ? 'text-white/20' : 'text-sky-400 hover:text-white'">
                  {{ resendCountdown > 0 ? `Отправить повторно через ${resendCountdown}с` : 'Отправить код повторно' }}
                </button>
              </div>
            </template>

            <button @click="emit('close')" class="w-full text-center text-xs text-white/25 hover:text-white/50 transition-colors pt-1">
              Закрыть
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
