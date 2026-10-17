<script setup lang="ts">
import { useFinanceT } from './strings'
import { rub, bc, dateTime, STATUS_STYLE } from './financeFormat'

export interface PaymentRowData {
  id: string; purpose: string; provider: string; status: string; amount: number; tier: string | null; period: string | null
  recurring: boolean; reason: string | null; createdAt: string; paidAt: string | null; method: string | null
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}
defineProps<{ rows: PaymentRowData[]; empty: string; busyId?: string | null }>()
const emit = defineEmits<{ approve: [id: string]; reject: [id: string] }>()
const t = useFinanceT()

const what = (p: PaymentRowData) => {
  const base = t(`pur_${p.purpose}`)
  if (p.purpose !== 'subscription' || !p.tier) return base
  return `${base} ${p.tier[0].toUpperCase()}${p.tier.slice(1)} · ${p.period === 'year' ? t('sYear') : t('sMonth')}`
}
// Оплата подписки с баланса хранится в рублях, но списаны Blooms — показываем в Bloom по базовому курсу
const money = (p: PaymentRowData) => (p.provider === 'wallet' ? bc(Math.ceil((p.amount / 90) * 100 - 1e-6) / 100) : rub(p.amount))
const methodLabel = (p: PaymentRowData) => (p.provider === 'wallet' ? t('viaBalance') : t(`mType_${p.method ?? 'unknown'}`))
</script>

<template>
  <p v-if="!rows.length" class="text-xs text-white/25 text-center py-8">{{ empty }}</p>
  <ul v-else class="divide-y divide-white/[0.05]">
    <li v-for="p in rows" :key="p.id" class="py-2.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
      <router-link :to="`/profile/${p.user.username}`" target="_blank" class="flex items-center gap-2.5 min-w-0 sm:w-48 flex-shrink-0 group">
        <img v-if="p.user.avatar_url" :src="p.user.avatar_url" class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" alt="" />
        <div v-else class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-brand-accent/20 text-brand-accent flex-shrink-0">{{ (p.user.display_name || p.user.username)[0].toUpperCase() }}</div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-white truncate group-hover:underline">{{ p.user.display_name || p.user.username }}</p>
          <p class="text-[11px] text-white/35 truncate">@{{ p.user.username }}</p>
        </div>
      </router-link>
      <div class="flex-1 min-w-0 order-last sm:order-none basis-full sm:basis-auto">
        <p class="text-sm text-white/85 truncate">{{ what(p) }}</p>
        <p class="text-[11px] text-white/35 truncate">
          {{ methodLabel(p) }}<template v-if="p.recurring"> · {{ t('auto') }}</template> · {{ dateTime(p.paidAt || p.createdAt) }}
          <template v-if="p.reason"> · {{ p.reason }}</template>
        </p>
      </div>
      <span class="text-sm font-black text-white tabular-nums flex-shrink-0">{{ money(p) }}</span>
      <span class="flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full flex-shrink-0" :class="(STATUS_STYLE[p.status] ?? STATUS_STYLE.pending).cls">
        <span aria-hidden="true">{{ (STATUS_STYLE[p.status] ?? STATUS_STYLE.pending).glyph }}</span>{{ t(`st_${p.status}`) }}
      </span>
      <span v-if="p.status === 'review'" class="flex gap-1.5 flex-shrink-0">
        <button type="button" :disabled="busyId === p.id" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40" @click="emit('approve', p.id)">{{ t('approve') }}</button>
        <button type="button" :disabled="busyId === p.id" class="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-40" @click="emit('reject', p.id)">{{ t('reject') }}</button>
      </span>
    </li>
  </ul>
</template>
