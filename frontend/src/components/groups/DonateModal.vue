<script setup lang="ts">
import { ref, computed } from 'vue'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{
  group: {
    id: string
    name: string
    avatar_url?: string | null
    accent_color?: string | null
    bank_card_masked?: string | null
  }
}>()

const emit = defineEmits<{ close: [] }>()

const PRESETS = [100, 200, 500, 1000]
const selectedAmount = ref<number | null>(200)
const customAmount = ref('')
const step = ref<'pick' | 'card' | 'success'>('pick')
const sending = ref(false)

const cardNum = ref('')
const cardExp = ref('')
const cardCvv = ref('')

const accent = computed(() => props.group.accent_color || '#4C67CF')

const finalAmount = computed(() => {
  if (customAmount.value && !isNaN(Number(customAmount.value))) return Number(customAmount.value)
  return selectedAmount.value ?? 0
})

function pickPreset(v: number) {
  selectedAmount.value = v
  customAmount.value = ''
}

function onCustomInput(e: Event) {
  const val = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  customAmount.value = val
  selectedAmount.value = null
}

function formatCardNum(e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.replace(/\D/g, '').slice(0, 16)
  cardNum.value = raw.replace(/(.{4})/g, '$1 ').trim()
}

function formatExp(e: Event) {
  const input = e.target as HTMLInputElement
  const raw = input.value.replace(/\D/g, '').slice(0, 4)
  cardExp.value = raw.length > 2 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw
}

const cardValid = computed(() =>
  cardNum.value.replace(/\s/g, '').length === 16 &&
  cardExp.value.length === 5 &&
  cardCvv.value.length >= 3
)

async function sendDonate() {
  if (step.value === 'pick') {
    if (finalAmount.value < 10) return
    step.value = 'card'
    return
  }
  if (!cardValid.value || sending.value) return
  sending.value = true
  await new Promise(r => setTimeout(r, 1400))
  step.value = 'success'
  sending.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="donate-fade">
      <div class="fixed inset-0 z-[700] flex items-end sm:items-center justify-center"
        @click.self="emit('close')">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

        <!-- Sheet -->
        <div class="relative w-full sm:max-w-sm bg-[#13131f] border border-white/8 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10"
          :style="`box-shadow: 0 -8px 60px ${accent}18, 0 0 0 1px ${accent}10`">

          <!-- Accent top bar -->
          <div class="h-1 w-full" :style="`background: linear-gradient(90deg, ${accent}80, ${accent})`" />

          <!-- Drag handle (mobile) -->
          <div class="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

          <!-- STEP: Pick amount -->
          <template v-if="step === 'pick'">
            <!-- Group header -->
            <div class="px-6 pt-5 pb-4 flex items-center gap-4">
              <div class="w-14 h-14 rounded-2xl overflow-hidden border-2 flex-shrink-0"
                :style="`border-color: ${accent}40`">
                <img v-if="group.avatar_url" :src="group.avatar_url" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-xl font-bold"
                  :style="`background: ${accent}20; color: ${accent}`">
                  {{ group.name[0] }}
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] text-white/35 uppercase tracking-widest font-bold mb-0.5">Пожертвование</p>
                <p class="text-base font-extrabold text-white leading-tight truncate">{{ group.name }}</p>
              </div>
              <button @click="emit('close')"
                class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all flex-shrink-0">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <div class="px-6 pb-6 space-y-5">
              <!-- Amount display -->
              <div class="text-center py-3">
                <p class="text-5xl font-black tabular-nums"
                  :style="finalAmount ? `color: ${accent}` : 'color: rgba(255,255,255,0.15)'">
                  {{ finalAmount ? finalAmount.toLocaleString('ru') : '0' }}
                  <span class="text-2xl font-bold">₽</span>
                </p>
              </div>

              <!-- Preset buttons -->
              <div class="grid grid-cols-4 gap-2">
                <button v-for="preset in PRESETS" :key="preset"
                  @click="pickPreset(preset)"
                  class="py-3 rounded-2xl text-sm font-bold transition-all"
                  :style="selectedAmount === preset
                    ? `background: ${accent}; color: white; box-shadow: 0 4px 14px ${accent}40`
                    : 'background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5)'">
                  {{ preset.toLocaleString('ru') }}₽
                </button>
              </div>

              <!-- Custom amount input -->
              <div class="relative">
                <input
                  type="text"
                  inputmode="numeric"
                  placeholder="Другая сумма"
                  :value="customAmount"
                  @input="onCustomInput"
                  class="w-full bg-white/5 border rounded-2xl px-4 py-3.5 text-center text-white text-base font-bold placeholder-white/20 outline-none transition-all"
                  :style="customAmount
                    ? `border-color: ${accent}50; box-shadow: 0 0 0 3px ${accent}12`
                    : 'border-color: rgba(255,255,255,0.08)'" />
                <span v-if="customAmount" class="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">₽</span>
              </div>

              <!-- Min amount hint -->
              <p class="text-[11px] text-white/25 text-center">Минимальная сумма — 10 ₽</p>

              <!-- Donate button -->
              <button
                @click="sendDonate"
                :disabled="finalAmount < 10"
                class="w-full py-4 rounded-2xl text-base font-extrabold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                :style="`background: ${accent}; color: white; box-shadow: 0 6px 20px ${accent}35`">
                Поддержать · {{ finalAmount ? finalAmount.toLocaleString('ru') + ' ₽' : '—' }}
              </button>

              <p class="text-[10px] text-white/20 text-center">
                Нажимая кнопку, вы соглашаетесь с условиями Bloomly Pay
              </p>
            </div>
          </template>

          <!-- STEP: Card details -->
          <template v-else-if="step === 'card'">
            <div class="px-6 pt-5 pb-6 space-y-5">
              <div class="flex items-center gap-3">
                <button @click="step = 'pick'"
                  class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all flex-shrink-0">
                  <BIcon name="ChevronLeft" class="w-4 h-4" />
                </button>
                <div>
                  <p class="text-base font-extrabold text-white">Данные карты</p>
                  <p class="text-xs text-white/35">Перевод {{ finalAmount.toLocaleString('ru') }} ₽ → {{ group.name }}</p>
                </div>
                <button @click="emit('close')"
                  class="ml-auto w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all flex-shrink-0">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
              </div>

              <!-- Virtual card preview -->
              <div class="relative rounded-2xl overflow-hidden p-5 h-44"
                :style="`background: linear-gradient(135deg, ${accent}30 0%, ${accent}08 100%); border: 1px solid ${accent}20`">
                <div class="absolute inset-0 opacity-5" style="background: radial-gradient(circle at 80% 20%, white 0%, transparent 60%)" />
                <div class="flex items-start justify-between">
                  <BIcon name="CreditCard" class="w-6 h-6" :style="`color: ${accent}`" />
                  <div class="flex gap-1">
                    <div v-for="i in 4" :key="i" class="w-2 h-2 rounded-full bg-white/20" />
                  </div>
                </div>
                <p class="text-white/20 text-lg font-mono tracking-widest mt-6">
                  {{ cardNum || '**** **** **** ****' }}
                </p>
                <div class="flex items-end justify-between mt-auto pt-4">
                  <div>
                    <p class="text-[10px] text-white/30 uppercase tracking-wide">Действует до</p>
                    <p class="text-sm font-mono text-white/60">{{ cardExp || 'MM/YY' }}</p>
                  </div>
                  <p class="text-sm font-mono text-white/30">{{ cardCvv ? '***' : 'CVV' }}</p>
                </div>
              </div>

              <!-- Inputs -->
              <div class="space-y-3">
                <input
                  type="text"
                  inputmode="numeric"
                  placeholder="Номер карты"
                  :value="cardNum"
                  @input="formatCardNum"
                  maxlength="19"
                  class="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-3.5 text-white text-sm font-mono placeholder-white/20 outline-none focus:border-white/20 transition-all" />
                <div class="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    inputmode="numeric"
                    placeholder="ММ/ГГ"
                    :value="cardExp"
                    @input="formatExp"
                    maxlength="5"
                    class="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-3.5 text-white text-sm font-mono placeholder-white/20 outline-none focus:border-white/20 transition-all" />
                  <input
                    type="password"
                    inputmode="numeric"
                    placeholder="CVV"
                    v-model="cardCvv"
                    maxlength="4"
                    class="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-3.5 text-white text-sm font-mono placeholder-white/20 outline-none focus:border-white/20 transition-all" />
                </div>
              </div>

              <button
                @click="sendDonate"
                :disabled="!cardValid || sending"
                class="w-full py-4 rounded-2xl text-base font-extrabold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                :style="`background: ${accent}; color: white; box-shadow: 0 6px 20px ${accent}35`">
                <BIcon v-if="sending" name="Loader2" class="w-5 h-5 animate-spin" />
                <BIcon v-else name="Lock" class="w-4 h-4" />
                {{ sending ? 'Обрабатываем…' : `Оплатить ${finalAmount.toLocaleString('ru')} ₽` }}
              </button>

              <div class="flex items-center justify-center gap-2 text-[11px] text-white/20">
                <BIcon name="Shield" class="w-3.5 h-3.5" />
                Защищено Bloomly Pay · SSL 256-bit
              </div>
            </div>
          </template>

          <!-- STEP: Success -->
          <template v-else-if="step === 'success'">
            <div class="px-6 py-10 text-center space-y-5">
              <!-- Animated checkmark -->
              <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                :style="`background: ${accent}20; border: 2px solid ${accent}40`">
                <BIcon name="Heart" class="w-9 h-9" :style="`color: ${accent}`" />
              </div>
              <div>
                <p class="text-2xl font-extrabold text-white">Спасибо!</p>
                <p class="text-white/50 text-sm mt-1.5">
                  Ваш донат <span class="font-bold" :style="`color: ${accent}`">{{ finalAmount.toLocaleString('ru') }} ₽</span> успешно отправлен
                </p>
                <p class="text-white/30 text-xs mt-1">для {{ group.name }}</p>
              </div>
              <div class="bg-white/5 rounded-2xl px-4 py-3 border border-white/8">
                <p class="text-[11px] text-white/30">Ваша поддержка помогает создавать контент для всего фандома</p>
              </div>
              <button @click="emit('close')"
                class="w-full py-3.5 rounded-2xl text-sm font-bold text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-all">
                Закрыть
              </button>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.donate-fade-enter-active { transition: opacity 0.2s ease; }
.donate-fade-leave-active { transition: opacity 0.15s ease; }
.donate-fade-enter-from, .donate-fade-leave-to { opacity: 0; }
.donate-fade-enter-active > div:last-child { transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.donate-fade-enter-from > div:last-child { transform: translateY(30px) scale(0.96); }
</style>
