<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
    <div class="p-5 stack-y-4">
      <!-- Badges -->
      <div class="flex items-center gap-2 flex-wrap">
        <span class="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border"
          :class="isFull || listing.status !== 'active'
            ? 'bg-brand-error/10 border-brand-error/25 text-brand-error'
            : 'bg-brand-success/10 border-brand-success/25 text-brand-success'">
          <span class="w-1.5 h-1.5 rounded-full bg-current" />
          {{ isFull ? 'Слоты заняты' : listing.status === 'active' ? 'Открыто' : 'Закрыто' }}
        </span>
        <span class="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-violet-500/10 border-violet-400/25 text-violet-300">
          <BIcon name="ListOrdered" class="w-3 h-3" /> Коммишен
        </span>
        <span v-if="listing.is_nsfw" class="text-[10px] font-bold px-2.5 py-1 rounded-full border bg-brand-error/10 border-brand-error/25 text-brand-error">18+</span>
      </div>

      <!-- Title + rating -->
      <div>
        <h1 class="text-2xl font-black text-white leading-tight">{{ listing.title }}</h1>
        <p class="flex items-center gap-1.5 text-xs text-white/40 mt-2">
          <BIcon name="Eye" class="w-3.5 h-3.5" /> {{ (listing.views_count ?? 0).toLocaleString('ru-RU') }} просмотров
        </p>
        <p v-if="reviewCount" class="flex items-center gap-1.5 text-xs text-white/45 mt-1">
          <span class="text-brand-yellow">★</span>
          <span class="font-bold text-white/80">{{ avgRating.toFixed(1) }}</span>
          · {{ reviewCount }} {{ plural(reviewCount, 'отзыв', 'отзыва', 'отзывов') }}
        </p>
      </div>

      <!-- Formats -->
      <div v-if="formats.length" class="stack-y-2">
        <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Формат</p>
        <div class="grid gap-2" :style="`grid-template-columns: repeat(${Math.min(formats.length, 3)}, minmax(0, 1fr))`">
          <button v-for="(f, i) in formats" :key="f.name" type="button" @click="formatIdx = i"
            class="rounded-2xl border px-2 py-3 text-center transition-all"
            :class="formatIdx === i
              ? 'bg-brand-accent/15 border-brand-accent/60 text-white'
              : 'bg-white/3 border-brand-border text-white/70 hover:border-white/20'">
            <p class="text-sm font-extrabold truncate">{{ f.name }}</p>
            <p class="text-[11px] mt-0.5" :class="formatIdx === i ? 'text-brand-accent' : 'text-white/35'">{{ formatPrice(f.price, listing.currency) }}</p>
          </button>
        </div>
      </div>

      <!-- Add-ons -->
      <div v-if="addons.length" class="stack-y-2">
        <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Дополнительно</p>
        <button v-for="(a, i) in addons" :key="a.name" type="button" @click="toggleAddon(i)"
          class="w-full flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all"
          :class="pickedAddons.has(i) ? 'bg-brand-accent/10 border-brand-accent/50' : 'bg-white/3 border-brand-border hover:border-white/20'">
          <span class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0"
            :class="pickedAddons.has(i) ? 'bg-brand-accent border-brand-accent' : 'border-white/25'">
            <BIcon v-if="pickedAddons.has(i)" name="Check" class="w-3.5 h-3.5 text-white" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-bold text-white truncate">{{ a.name }}</span>
            <span v-if="a.hint" class="block text-[11px] text-white/35 truncate">{{ a.hint }}</span>
          </span>
          <span class="text-sm font-bold text-white/80 shrink-0">+{{ formatPrice(a.price, listing.currency) }}</span>
        </button>
      </div>

      <!-- Slots -->
      <div v-if="listing.commission_slots_total" class="stack-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-white/45">Свободно слотов</span>
          <span class="font-bold text-white">{{ freeSlots }} из {{ listing.commission_slots_total }}</span>
        </div>
        <div class="flex gap-1.5">
          <span v-for="n in Math.min(listing.commission_slots_total, 12)" :key="n" class="flex-1 h-1 rounded-full"
            :style="n <= takenBars ? 'background: rgba(255,255,255,0.12)' : 'background: linear-gradient(90deg, #a78bfa, #7c3aed)'" />
        </div>
      </div>

      <!-- Custom form fields -->
      <div v-if="listing.commission_form_fields?.length" class="stack-y-3">
        <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Информация о заказе</p>
        <div v-for="field in listing.commission_form_fields" :key="field.label" class="stack-y-1.5">
          <label class="text-xs text-white/60 font-medium">
            {{ field.label }}<span v-if="field.required" class="text-brand-error ml-1">*</span>
          </label>
          <textarea v-if="field.type === 'textarea'" v-model="formData[field.label]" rows="2"
            class="w-full bg-brand-bg border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-hidden focus:border-violet-500/50 resize-none transition-all"
            :placeholder="field.label" />
          <input v-else v-model="formData[field.label]" type="text"
            class="w-full bg-brand-bg border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-hidden focus:border-violet-500/50 transition-all"
            :placeholder="field.label" />
        </div>
      </div>

      <!-- Escrow note -->
      <div class="flex items-start gap-2.5 rounded-2xl bg-black/20 border border-brand-border px-3.5 py-3">
        <BIcon name="ShieldCheck" class="w-4 h-4 text-brand-success shrink-0 mt-0.5" />
        <p class="text-[11px] text-white/45 leading-relaxed">
          Деньги хранятся у Bloomly и уходят художнику только после одобрения этапа. Если что-то пошло не так — открой спор.
        </p>
      </div>
    </div>

    <!-- Total + CTA -->
    <div class="px-5 py-4 bg-black/20 border-t border-brand-border stack-y-3">
      <div class="flex items-end justify-between">
        <div>
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-1">Итого</p>
          <p class="text-3xl font-black text-brand-yellow leading-none tabular-nums">{{ formatPrice(total, listing.currency) }}</p>
        </div>
        <div class="text-right text-[11px] text-white/40">
          <p>Предоплата 50%</p>
          <p class="font-bold text-white/70 tabular-nums">{{ formatPrice(total / 2, listing.currency) }}</p>
        </div>
      </div>

      <p v-if="error" class="text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-3 py-2">{{ error }}</p>

      <template v-if="!isFull && listing.status === 'active'">
        <button v-if="canBook" @click="book" :disabled="booking || !requiredFilled"
          class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all hover:opacity-90 active:scale-[0.98] text-sm disabled:opacity-40"
          :class="'bg-brand-gradient'">
          <span v-if="booking" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <BIcon v-else name="PenLine" class="w-4 h-4" />
          {{ booking ? 'Оформляем…' : 'Оформить заказ' }}
        </button>
        <button v-else-if="!isLoggedIn" @click="router.push({ name: 'login' })"
          class="w-full flex items-center justify-center gap-2 py-3.5 text-white/60 font-bold rounded-2xl border border-brand-border hover:border-violet-500/40 hover:text-white transition-all text-sm">
          <BIcon name="LogIn" class="w-4 h-4" /> Войти для заказа
        </button>
        <p v-else-if="isOwnListing" class="text-center text-xs text-white/25 py-1">Это ваш лот</p>
      </template>
      <p v-else class="text-center text-xs font-bold text-brand-error py-1">Все слоты заняты</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useDealersDenStore, type DealerListing } from '@/stores/dealersDen'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/lib/apiError'
import { formatPrice } from '@/lib/format'

const props = defineProps<{ listing: DealerListing; avgRating: number; reviewCount: number }>()
const emit  = defineEmits<{ (e: 'booked', data: { booking: any; queuePosition: number }): void }>()

const store  = useDealersDenStore()
const auth   = useAuthStore()
const router = useRouter()

const booking  = ref(false)
const error    = ref('')
const formData = ref<Record<string, string>>({})

const formats = computed(() => props.listing.commission_details?.formats ?? [])
const addons  = computed(() => props.listing.commission_details?.addons ?? [])
const formatIdx    = ref(formats.value.length > 2 ? 1 : 0)
const pickedAddons = ref<Set<number>>(new Set())

function toggleAddon(i: number) {
  const next = new Set(pickedAddons.value)
  if (next.has(i)) next.delete(i); else next.add(i)
  pickedAddons.value = next
}

const total = computed(() => {
  const base = formats.value.length ? formats.value[formatIdx.value].price : parseFloat(String(props.listing.price))
  const extra = [...pickedAddons.value].reduce((s, i) => s + (addons.value[i]?.price ?? 0), 0)
  return base + extra
})

const isLoggedIn   = computed(() => !!auth.user)
const isOwnListing = computed(() => auth.user?.id === props.listing.seller_id)
const taken = computed(() => props.listing.commission_slots_taken)
const isFull = computed(() => {
  const t = props.listing.commission_slots_total
  return t !== null && t !== undefined && taken.value >= t
})
const freeSlots = computed(() => Math.max(0, (props.listing.commission_slots_total ?? 0) - taken.value))
const takenBars = computed(() => {
  const t = props.listing.commission_slots_total ?? 0
  return t > 12 ? Math.round((taken.value / t) * 12) : taken.value
})
const canBook = computed(() => isLoggedIn.value && !isOwnListing.value && props.listing.status === 'active')
const requiredFilled = computed(() =>
  (props.listing.commission_form_fields ?? []).every(f => !f.required || !!formData.value[f.label]?.trim()))

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  return m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many
}

async function book() {
  if (booking.value) return
  booking.value = true
  error.value = ''
  try {
    const payload: Record<string, unknown> = { ...formData.value }
    if (formats.value.length) payload['Формат'] = formats.value[formatIdx.value].name
    if (pickedAddons.value.size) payload['Дополнительно'] = [...pickedAddons.value].map(i => addons.value[i].name).join(', ')
    payload['Итого'] = formatPrice(total.value, props.listing.currency)
    emit('booked', await store.createBooking(props.listing.id, payload))
  } catch (e) {
    error.value = errorMessage(e) ?? 'Не удалось оформить заказ'
  } finally {
    booking.value = false
  }
}
</script>
