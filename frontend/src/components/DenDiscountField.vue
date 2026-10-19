<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import * as fmt from '@/lib/format'
import { DISCOUNT_PRESETS, MAX_DISCOUNT, clampDiscount, discountedPrice } from '@/lib/listingDiscount'
import { useLangStore } from '@/stores/lang'

// Поле «Скидка» для форм создания/редактирования лота: пресеты, свой процент или итоговая цена
// со скидкой (процент считается сам) и живой предпросмотр в валюте лота.
const props = defineProps<{ modelValue: number; price: number; currency: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const langStore = useLangStore()

const mode = ref<'percent' | 'price'>('percent')
const typedPrice = ref<number | ''>('')

const value = computed(() => clampDiscount(props.modelValue))
const hasPrice = computed(() => Number(props.price) > 0)
const finalPrice = computed(() => discountedPrice(props.price, value.value))
const cur = (n: number) => fmt.formatPriceNative(n, props.currency)
const set = (v: unknown) => emit('update:modelValue', clampDiscount(v))

function syncTyped() { typedPrice.value = value.value ? finalPrice.value : '' }
watch(mode, m => { if (m === 'price') syncTyped() })
// пресет/смена базовой цены в режиме «цена» — обновить поле
watch([() => props.modelValue, () => props.price], () => { if (mode.value === 'price' && document.activeElement?.tagName !== 'INPUT') syncTyped() })

function onPriceInput(raw: string) {
  const n = parseFloat(raw)
  typedPrice.value = raw === '' || !Number.isFinite(n) ? '' : n
  if (!hasPrice.value || typedPrice.value === '') return set(0)
  set((1 - Math.min(n, props.price) / props.price) * 100)
}
</script>

<template>
  <div>
    <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenDiscountLabel }}</label>
    <div class="rounded-2xl p-3 stack-y-2.5"
      :style="value ? 'background: rgba(244,63,94,0.07); border: 1px solid rgba(244,63,94,0.3)' : 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08)'">
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" @click="set(0)"
          class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all"
          :class="value === 0 ? 'bg-white/15 text-white' : 'bg-white/5 text-white/45 hover:bg-white/10'">
          {{ langStore.t.dealersDenDiscountNone }}
        </button>
        <button v-for="p in DISCOUNT_PRESETS" :key="p" type="button" @click="set(p)"
          class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all"
          :class="value === p ? 'text-white' : 'bg-white/5 text-white/45 hover:bg-white/10'"
          :style="value === p ? 'background: linear-gradient(135deg, #f43f5e, #fb7185)' : ''">−{{ p }}%</button>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex rounded-xl bg-white/5 p-0.5 shrink-0">
          <button type="button" @click="mode = 'percent'"
            class="px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all"
            :class="mode === 'percent' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'">%</button>
          <button type="button" @click="mode = 'price'"
            class="px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all"
            :class="mode === 'price' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'">{{ currency }}</button>
        </div>
        <div v-if="mode === 'percent'" class="relative flex-1">
          <input :value="value || ''" @input="set(($event.target as HTMLInputElement).value)" type="number" min="0" :max="MAX_DISCOUNT" step="1" placeholder="0"
            class="w-full rounded-xl pl-3 pr-7 py-1.5 text-sm text-white outline-hidden" />
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">%</span>
        </div>
        <div v-else class="relative flex-1">
          <input :value="typedPrice" @input="onPriceInput(($event.target as HTMLInputElement).value)" @blur="syncTyped" type="number" min="0" :max="price" step="0.01"
            :placeholder="langStore.t.dealersDenDiscountByPrice" :disabled="!hasPrice"
            class="w-full rounded-xl pl-3 pr-12 py-1.5 text-sm text-white outline-hidden disabled:opacity-40" />
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">{{ currency }}</span>
        </div>
      </div>

      <p v-if="value && hasPrice" class="text-xs text-white/50 flex items-center gap-1.5 flex-wrap">
        {{ langStore.t.dealersDenDiscountPreview }}
        <span class="text-white/30 line-through tabular-nums">{{ cur(price) }}</span>
        <span class="font-black text-brand-success tabular-nums">{{ cur(finalPrice) }}</span>
        <span class="text-rose-300 font-bold tabular-nums">−{{ value }}%</span>
      </p>
      <p v-else class="text-[11px] text-white/30">{{ mode === 'price' ? langStore.t.dealersDenDiscountByPriceHint : langStore.t.dealersDenDiscountHint }}</p>
    </div>
  </div>
</template>
