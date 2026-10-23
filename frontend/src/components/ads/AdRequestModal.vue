<template>
  <Teleport to="body">
    <Transition name="ad-req-backdrop">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-300 flex items-end sm:items-center justify-center sm:p-4"
        @click.self="close"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="close" />

        <Transition name="ad-req-panel">
          <div
            v-if="modelValue"
            class="relative w-full sm:max-w-sm bg-[#13131f] rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          >
            <div class="sm:hidden flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 rounded-full bg-white/15" />
            </div>

            <div class="flex items-center justify-between px-5 py-4 border-b border-white/6">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center">
                  <BIcon name="Megaphone" class="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <h3 class="text-sm font-extrabold text-white leading-none">Разместить рекламу</h3>
                  <p class="text-[11px] text-white/35 mt-0.5">Оплата в BLM, запуск после модерации</p>
                </div>
              </div>
              <button
                @click="close"
                class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <Transition name="fade" mode="out-in">
              <!-- Success -->
              <div v-if="sent" key="success" class="p-8 text-center">
                <div class="relative w-16 h-16 mx-auto mb-4">
                  <div class="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style="animation-duration:1.5s" />
                  <div class="relative w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <BIcon name="CheckCircle2" class="w-8 h-8 text-emerald-400" />
                  </div>
                </div>
                <h4 class="text-white font-extrabold text-base mb-1">Оплачено, баннер на модерации</h4>
                <p class="text-white/40 text-sm">Срок показа начнётся с момента одобрения. Если откажем, вернём {{ paidPrice }} BLM на баланс</p>
              </div>

              <!-- Logged out -->
              <div v-else-if="!auth.isAuthenticated" key="guest" class="p-8 text-center">
                <BIcon name="Lock" class="w-10 h-10 text-white/20 mx-auto mb-3" />
                <h4 class="text-white font-extrabold text-base mb-1">Войдите в аккаунт</h4>
                <p class="text-white/40 text-sm">Чтобы оставить заявку на размещение рекламы, нужно войти</p>
              </div>

              <!-- Form -->
              <div v-else key="form" class="p-4 stack-y-3 max-h-[70vh] overflow-y-auto overscroll-contain">
                <div class="stack-y-2">
                  <p class="text-[10px] font-bold text-white/30 uppercase tracking-wide">Место размещения</p>
                  <div class="grid grid-cols-2 gap-2">
                    <button v-for="p in placementOptions" :key="p.placement" type="button" @click="placement = p.placement"
                      class="text-left px-3 py-2 rounded-2xl border transition-all"
                      :class="placement === p.placement ? 'border-brand-accent/60 bg-brand-accent/10' : 'border-white/10 bg-white/5 hover:border-white/20'">
                      <span class="block text-xs font-bold text-white/85">{{ PLACEMENT_LABEL[p.placement] }}</span>
                      <span class="block text-[10px] text-white/40 mt-0.5">от {{ p.prices.day }} BLM / сут.</span>
                    </button>
                  </div>
                  <div class="flex gap-2">
                    <button v-for="b in (['day', 'week'] as const)" :key="b" type="button" @click="setBilling(b)"
                      class="flex-1 py-2 rounded-xl border text-xs font-bold transition-all"
                      :class="billing === b ? 'border-brand-accent/60 bg-brand-accent/10 text-white' : 'border-white/10 bg-white/5 text-white/55'">
                      {{ b === 'day' ? 'Сутки' : 'Неделя' }}
                    </button>
                    <div class="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-1">
                      <button type="button" class="w-7 h-8 text-white/60 hover:text-white disabled:opacity-30" :disabled="periods <= 1" @click="periods--">−</button>
                      <span class="w-8 text-center text-sm font-bold text-white tabular-nums">{{ periods }}</span>
                      <button type="button" class="w-7 h-8 text-white/60 hover:text-white disabled:opacity-30" :disabled="periods >= maxPeriods" @click="periods++">+</button>
                    </div>
                  </div>
                  <div v-if="pricing" class="rounded-2xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-[11px] text-white/55">
                    <div class="flex items-center justify-between">
                      <span>{{ periods }} {{ billing === 'week' ? 'нед.' : 'сут.' }} · {{ PLACEMENT_LABEL[placement] }}</span>
                      <span class="flex items-center gap-1.5">
                        <span v-if="pricing.discountPct > 0" class="line-through text-white/30">{{ quote.base }}</span>
                        <span class="text-sm font-extrabold text-white">{{ quote.price }} BLM</span>
                      </span>
                    </div>
                    <p v-if="pricing.discountPct > 0" class="text-emerald-400 mt-1">Скидка тарифа −{{ pricing.discountPct }}% уже учтена</p>
                    <p v-if="localPrice" class="text-white/35 mt-0.5">≈ {{ localPrice }}</p>
                    <p class="mt-1" :class="canAfford ? 'text-white/40' : 'text-rose-400'">
                      На балансе {{ pricing.balance.toFixed(2) }} BLM<template v-if="pricing.promoBalance > 0"> + {{ pricing.promoBalance.toFixed(2) }} Promo (тратится первым)</template>
                    </p>
                  </div>
                </div>

                <input
                  v-model="title"
                  class="ad-req-input"
                  placeholder="Название / заголовок объявления *"
                  maxlength="120"
                />
                <textarea
                  v-model="description"
                  class="ad-req-input resize-none"
                  rows="3"
                  placeholder="Краткое описание (необязательно)"
                  maxlength="400"
                />
                <input
                  v-model="linkUrl"
                  class="ad-req-input"
                  placeholder="Ссылка (https://…) *"
                />
                <input
                  v-model="contactInfo"
                  class="ad-req-input"
                  placeholder="Как с вами связаться (Telegram, e-mail…)"
                  maxlength="200"
                />
                <div v-if="imageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/8 rounded-2xl">
                  <img :src="imageUrl" class="w-16 h-12 object-cover rounded-xl shrink-0 border border-white/10" />
                  <p class="text-[10px] text-white/30 truncate flex-1">{{ imageUrl }}</p>
                  <button type="button" @click="imageUrl = ''"
                    class="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center shrink-0 transition-colors">
                    <BIcon name="X" class="w-3.5 h-3.5" />
                  </button>
                </div>
                <MediaUpload v-else type="banners" accept="image/*" @uploaded="(urls) => imageUrl = urls[0] ?? ''" />

                <p v-if="errorMsg" class="text-rose-400 text-xs font-semibold px-1">{{ errorMsg }}</p>

                <div class="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    @click="close"
                    class="flex-1 py-3 rounded-2xl border border-white/8 text-white/40 text-sm font-bold hover:bg-white/5 hover:text-white/60 transition-all"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    @click="submit"
                    :disabled="!title.trim() || !linkUrl.trim() || isSending || !pricing || !canAfford"
                    class="flex-2 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-extrabold disabled:opacity-30 transition-all hover:opacity-90 active:scale-[0.98]"
                    style="background: linear-gradient(135deg, #FF6B9D, #7c3aed)"
                  >
                    <span v-if="isSending" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <BIcon v-else name="Lock" class="w-4 h-4" />
                    {{ isSending ? 'Оплата…' : `Оплатить ${quote.price} BLM` }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BIcon from '../BIcon.vue'
import MediaUpload from '../MediaUpload.vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useWalletStore } from '@/stores/wallet'
import { apiErrorCode, apiErrorMessage } from '@/lib/apiError'
import { adPrice, type AdBilling, type AdPlacement, type AdPricing } from '@/lib/adPricing'
import { blmLocal } from '@/lib/format'

const props = defineProps<{ modelValue: boolean; placement?: AdPlacement }>()
const emit = defineEmits<{ (e: 'update:modelValue', val: boolean): void }>()

const auth = useAuthStore()
const walletStore = useWalletStore()

const PLACEMENT_LABEL: Record<AdPlacement, string> = {
  feed_top: 'Верх ленты',
  groups_page: 'Страница «Группы»',
  left_menu: 'Левое меню',
  right_column: 'Правая колонка',
}

const title = ref('')
const description = ref('')
const linkUrl = ref('')
const contactInfo = ref('')
const imageUrl = ref('')
const sent = ref(false)
const isSending = ref(false)
const errorMsg = ref('')
const paidPrice = ref(0)

const pricing = ref<AdPricing | null>(null)
const placement = ref<AdPlacement>(props.placement ?? 'feed_top')
const billing = ref<AdBilling>('week')
const periods = ref(1)

const placementOptions = computed(() => pricing.value?.placements ?? [])
const maxPeriods = computed(() => pricing.value?.maxPeriods[billing.value] ?? 1)
const quote = computed(() => {
  const base = pricing.value?.placements.find(p => p.placement === placement.value)?.prices[billing.value] ?? 0
  return adPrice(base, periods.value, pricing.value?.discountPct ?? 0)
})
const canAfford = computed(() => !!pricing.value && pricing.value.balance + pricing.value.promoBalance + 1e-9 >= quote.value.price)
const localPrice = computed(() => blmLocal(quote.value.price))

function setBilling(b: AdBilling) {
  billing.value = b
  periods.value = Math.min(periods.value, pricing.value?.maxPeriods[b] ?? 1)
}

async function loadPricing() {
  try {
    const res = await api.get('/admin/ads/pricing')
    pricing.value = res.data.data
  } catch {
    errorMsg.value = 'Не удалось загрузить цены. Попробуйте позже.'
  }
}

watch(() => props.modelValue, (v) => {
  if (v) {
    if (props.placement) placement.value = props.placement
    if (auth.isAuthenticated) void loadPricing()
    return
  }
  setTimeout(() => {
    title.value = ''
    description.value = ''
    linkUrl.value = ''
    contactInfo.value = ''
    imageUrl.value = ''
    sent.value = false
    errorMsg.value = ''
    periods.value = 1
  }, 300)
})

function close() {
  emit('update:modelValue', false)
}

const ERROR_TEXT: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Недостаточно BLM — пополните баланс',
  INVALID_AD_LINK: 'Недопустимая ссылка: разрешены только http(s), mailto и tel',
}

async function submit() {
  if (!title.value.trim() || !linkUrl.value.trim() || isSending.value || !canAfford.value) return
  isSending.value = true
  errorMsg.value = ''
  try {
    const res = await api.post('/admin/ads', {
      title: title.value.trim(),
      description: description.value.trim() || undefined,
      imageUrl: imageUrl.value || undefined,
      linkUrl: linkUrl.value.trim(),
      contactInfo: contactInfo.value.trim() || undefined,
      placement: placement.value,
      billing: billing.value,
      periods: periods.value,
    })
    paidPrice.value = Number(res.data.data.quote.price)
    void walletStore.fetchBalance().catch(() => {})
    sent.value = true
    setTimeout(() => close(), 3500)
  } catch (e) {
    errorMsg.value = ERROR_TEXT[apiErrorCode(e) ?? ''] ?? apiErrorMessage(e) ?? 'Не удалось оплатить рекламу. Попробуйте позже.'
  } finally {
    isSending.value = false
  }
}
</script>

<style scoped>
.ad-req-input {
  width: 100%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  color: white;
  font-size: 0.875rem;
  outline: none;
  transition: all 0.15s ease;
}
.ad-req-input::placeholder { color: rgba(255,255,255,0.2); }
.ad-req-input:focus { border-color: rgba(255,107,157,0.4); background: rgba(255,255,255,0.06); }

.ad-req-backdrop-enter-active,
.ad-req-backdrop-leave-active { transition: opacity 0.25s ease; }
.ad-req-backdrop-enter-from,
.ad-req-backdrop-leave-to { opacity: 0; }

.ad-req-panel-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.ad-req-panel-leave-active { transition: all 0.2s ease; }
.ad-req-panel-enter-from { opacity: 0; transform: translateY(24px) scale(0.96); }
.ad-req-panel-leave-to { opacity: 0; transform: translateY(12px) scale(0.98); }

@media (max-width: 639px) {
  .ad-req-panel-enter-from { transform: translateY(100%); }
  .ad-req-panel-leave-to { transform: translateY(100%); }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
