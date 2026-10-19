<script setup lang="ts">
import { computed } from 'vue'
import * as fmt from '@/lib/format'
import { DISCOUNT_PRESETS, MAX_DISCOUNT, clampDiscount, discountedPrice } from '@/lib/listingDiscount'
import { useLangStore } from '@/stores/lang'

// Поле «Скидка» для форм создания/редактирования лота: быстрые пресеты, свой процент и живой предпросмотр цены.
const props = defineProps<{ modelValue: number; price: number; currency: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const langStore = useLangStore()

const value = computed(() => clampDiscount(props.modelValue))
const hasPrice = computed(() => Number(props.price) > 0)
const preview = computed(() => fmt.formatPrice(discountedPrice(props.price, value.value), props.currency))
const set = (v: unknown) => emit('update:modelValue', clampDiscount(v))
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
        <div class="relative ml-auto w-24">
          <input :value="value || ''" @input="set(($event.target as HTMLInputElement).value)" type="number" min="0" :max="MAX_DISCOUNT" step="1" placeholder="0"
            class="w-full rounded-xl pl-3 pr-7 py-1.5 text-sm text-white outline-hidden text-right" />
          <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">%</span>
        </div>
      </div>
      <p v-if="value && hasPrice" class="text-xs text-white/50 flex items-center gap-1.5 flex-wrap">
        {{ langStore.t.dealersDenDiscountPreview }}
        <span class="text-white/30 line-through tabular-nums">{{ fmt.formatPrice(price, currency) }}</span>
        <span class="font-black text-brand-success tabular-nums">{{ preview }}</span>
      </p>
      <p v-else class="text-[11px] text-white/30">{{ langStore.t.dealersDenDiscountHint }}</p>
    </div>
  </div>
</template>
