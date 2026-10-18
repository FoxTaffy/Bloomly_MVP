<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useWalletStore } from '@/stores/wallet'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { contrastText } from '@/utils/contrastText'

const props = defineProps<{
  group: {
    id: string
    name: string
    avatar_url?: string | null
    accent_color?: string | null
  }
}>()

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const walletStore = useWalletStore()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()

const PRESETS = [50, 100, 250, 500]
const selectedAmount = ref<number | null>(100)
const customAmount = ref('')
const donateMessage = ref('')
const step = ref<'pick' | 'insufficient' | 'success'>('pick')
const sending = ref(false)
const donateError = ref('')

const accent = computed(() => props.group.accent_color || '#4C67CF')
const onAccent = computed(() => contrastText(accent.value))

const finalAmount = computed(() => {
  if (customAmount.value && !isNaN(Number(customAmount.value))) return Number(customAmount.value)
  return selectedAmount.value ?? 0
})

const insufficientBy = computed(() => Math.max(0, finalAmount.value - walletStore.balance))

function pickPreset(v: number) {
  selectedAmount.value = v
  customAmount.value = ''
}

function onCustomInput(e: Event) {
  const val = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  customAmount.value = val
  selectedAmount.value = null
}

async function sendDonate() {
  if (finalAmount.value < 10 || sending.value) return
  if (finalAmount.value > walletStore.balance) {
    step.value = 'insufficient'
    return
  }
  sending.value = true
  donateError.value = ''
  try {
    await groupsStore.donateToGroup(props.group.id, finalAmount.value, donateMessage.value.trim() || undefined)
    await walletStore.fetchBalance()
    step.value = 'success'
  } catch (e) {
    donateError.value = apiErrorMessage(e) || 'Не удалось отправить донат'
  } finally {
    sending.value = false
  }
}

function goToWallet() {
  emit('close')
  if (authStore.user?.username) router.push(`/profile/${authStore.user.username}`)
}

onMounted(() => { walletStore.fetchBalance().catch(() => {}) })
</script>

<template>
  <Teleport to="body">
    <Transition name="donate-fade">
      <div class="fixed inset-0 z-700 flex items-end sm:items-center justify-center"
        @click.self="emit('close')">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="emit('close')" />

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
              <div class="w-14 h-14 rounded-2xl overflow-hidden border-2 shrink-0"
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
                class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all shrink-0">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <div class="px-6 pb-6 stack-y-5">
              <!-- Wallet balance -->
              <div class="flex items-center justify-center gap-1.5 text-xs text-white/35">
                <BIcon name="Wallet" class="w-3.5 h-3.5" />
                Баланс кошелька:
                <span class="inline-flex items-center gap-1 font-bold text-white/60">
                  {{ walletStore.balance.toFixed(2) }} <BIcon name="Flower2" class="w-3 h-3" />
                </span>
              </div>

              <!-- Amount display -->
              <div class="text-center py-1">
                <p class="flex items-center justify-center gap-2 text-5xl font-black tabular-nums"
                  :style="finalAmount ? `color: ${accent}` : 'color: rgba(255,255,255,0.15)'">
                  {{ finalAmount ? finalAmount.toLocaleString('ru') : '0' }}
                  <BIcon name="Flower2" class="w-8 h-8" />
                </p>
              </div>

              <!-- Preset buttons -->
              <div class="grid grid-cols-4 gap-2">
                <button v-for="preset in PRESETS" :key="preset"
                  @click="pickPreset(preset)"
                  class="py-3 rounded-2xl text-sm font-bold transition-all"
                  :style="selectedAmount === preset
                    ? `background: ${accent}; color: ${onAccent}; box-shadow: 0 4px 14px ${accent}40`
                    : 'background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5)'">
                  {{ preset.toLocaleString('ru') }}
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
                  class="w-full bg-white/5 border rounded-2xl px-4 py-3.5 text-center text-white text-base font-bold placeholder-white/20 outline-hidden transition-all"
                  :style="customAmount
                    ? `border-color: ${accent}50; box-shadow: 0 0 0 3px ${accent}12`
                    : 'border-color: rgba(255,255,255,0.08)'" />
                <BIcon v-if="customAmount" name="Flower2" class="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              </div>

              <!-- Optional message -->
              <input
                v-model="donateMessage"
                type="text"
                maxlength="280"
                placeholder="Сообщение (необязательно)"
                class="w-full bg-white/5 border border-white/8 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden focus:border-white/20 transition-all" />

              <!-- Min amount hint -->
              <p class="flex items-center justify-center gap-1 text-[11px] text-white/25 text-center">
                Минимальная сумма — 10 <BIcon name="Flower2" class="w-3 h-3" />
              </p>

              <p v-if="donateError" class="text-xs text-brand-error text-center">{{ donateError }}</p>

              <!-- Donate button -->
              <button
                @click="sendDonate"
                :disabled="finalAmount < 10 || sending"
                class="w-full py-4 rounded-2xl text-base font-extrabold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                :style="`background: ${accent}; color: ${onAccent}; box-shadow: 0 6px 20px ${accent}35`">
                <BIcon v-if="sending" name="Loader2" class="w-5 h-5 animate-spin" />
                <span v-if="sending">Отправляем…</span>
                <span v-else-if="!finalAmount">Поддержать · —</span>
                <span v-else class="inline-flex items-center gap-1.5">
                  Поддержать · {{ finalAmount.toLocaleString('ru') }} <BIcon name="Flower2" class="w-4 h-4" />
                </span>
              </button>
            </div>
          </template>

          <!-- STEP: Insufficient balance -->
          <template v-else-if="step === 'insufficient'">
            <div class="px-6 py-10 text-center stack-y-5">
              <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-brand-error/15 border-2 border-brand-error/30">
                <BIcon name="AlertCircle" class="w-9 h-9 text-brand-error" />
              </div>
              <div>
                <p class="text-xl font-extrabold text-white">Недостаточно Blooms</p>
                <p class="text-white/50 text-sm mt-1.5">
                  Не хватает
                  <span class="inline-flex items-center gap-1 font-bold text-brand-error">{{ insufficientBy.toFixed(2) }} <BIcon name="Flower2" class="w-3 h-3" /></span>
                  на балансе кошелька
                </p>
              </div>
              <div class="flex flex-col gap-2">
                <button @click="goToWallet"
                  class="w-full py-3.5 rounded-2xl text-sm font-bold transition-all"
                  :style="`background: ${accent}; color: ${onAccent}`">
                  Пополнить кошелёк
                </button>
                <button @click="step = 'pick'"
                  class="w-full py-3 rounded-2xl text-sm font-bold text-white/60 hover:text-white border border-white/10 hover:border-white/20 transition-all">
                  Назад
                </button>
              </div>
            </div>
          </template>

          <!-- STEP: Success -->
          <template v-else-if="step === 'success'">
            <div class="px-6 py-10 text-center stack-y-5">
              <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                :style="`background: ${accent}20; border: 2px solid ${accent}40`">
                <BIcon name="Heart" class="w-9 h-9" :style="`color: ${accent}`" />
              </div>
              <div>
                <p class="text-2xl font-extrabold text-white">Спасибо!</p>
                <p class="text-white/50 text-sm mt-1.5">
                  Ваш донат
                  <span class="inline-flex items-center gap-1 font-bold" :style="`color: ${accent}`">{{ finalAmount.toLocaleString('ru') }} <BIcon name="Flower2" class="w-3 h-3" /></span>
                  успешно отправлен
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
