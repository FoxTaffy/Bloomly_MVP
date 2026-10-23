<template>
  <div class="stack-y-4">
    <!-- About -->
    <section v-if="listing.description || draws.length || doesntDraw.length || listing.tags.length"
      class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl stack-y-4">
      <h3 class="text-[10px] font-bold text-white/35 uppercase tracking-widest">О заказе</h3>
      <p v-if="listing.description" class="text-sm text-white/75 leading-relaxed whitespace-pre-line">{{ listing.description }}</p>

      <div v-if="draws.length || doesntDraw.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div v-if="draws.length" class="rounded-2xl border border-brand-success/25 bg-brand-success/6 p-3.5 stack-y-2.5">
          <p class="flex items-center gap-1.5 text-xs font-bold text-brand-success"><BIcon name="Check" class="w-3.5 h-3.5" /> Рисую</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="d in draws" :key="d" class="text-[11px] font-medium text-white/75 bg-white/6 rounded-full px-2.5 py-1">{{ d }}</span>
          </div>
        </div>
        <div v-if="doesntDraw.length" class="rounded-2xl border border-brand-error/25 bg-brand-error/6 p-3.5 stack-y-2.5">
          <p class="flex items-center gap-1.5 text-xs font-bold text-brand-error"><BIcon name="X" class="w-3.5 h-3.5" /> Не рисую</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="d in doesntDraw" :key="d" class="text-[11px] font-medium text-white/75 bg-white/6 rounded-full px-2.5 py-1">{{ d }}</span>
          </div>
        </div>
      </div>

      <div v-if="listing.tags.length" class="flex flex-wrap gap-2">
        <button v-for="tag in listing.tags" :key="tag" type="button" @click="$emit('tag', tag)"
          class="text-xs text-brand-accent bg-brand-accent/8 hover:bg-brand-accent/15 border border-brand-accent/20 px-3 py-1 rounded-full transition-colors">
          #{{ tag }}
        </button>
      </div>
    </section>

    <!-- Process -->
    <section class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl stack-y-3">
      <h3 class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Как проходит заказ</h3>
      <p class="text-sm text-white/55">Ты одобряешь каждый этап — художник не идёт дальше без твоего «ок».</p>
      <span v-if="listing.group?.safe_deals_enabled !== false" class="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border bg-brand-success/10 border-brand-success/25 text-brand-success">
        <BIcon name="ShieldCheck" class="w-3.5 h-3.5" /> Безопасная сделка
      </span>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div v-for="(s, i) in steps" :key="s.title" class="rounded-2xl border border-brand-border bg-black/20 p-3.5">
          <div class="flex items-center justify-between mb-3">
            <span class="w-8 h-8 rounded-lg bg-brand-accent/15 flex items-center justify-center">
              <BIcon :name="s.icon" class="w-4 h-4 text-brand-accent" />
            </span>
            <span class="text-[10px] font-bold text-white/25 tabular-nums">{{ String(i + 1).padStart(2, '0') }}</span>
          </div>
          <p class="text-sm font-extrabold text-white">{{ s.title }}</p>
          <p class="text-[11px] text-white/40 mt-1 leading-snug">{{ s.text }}</p>
        </div>
      </div>
    </section>

    <!-- Terms -->
    <section v-if="terms.length" class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl stack-y-3">
      <h3 class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Условия</h3>
      <div class="grid grid-cols-2 rounded-2xl border border-brand-border overflow-hidden bg-black/20">
        <div v-for="(t, i) in terms" :key="t.label" class="flex items-start gap-2.5 p-3.5 border-brand-border"
          :class="[i % 2 === 0 ? 'border-r' : '', i < terms.length - (terms.length % 2 === 0 ? 2 : 1) ? 'border-b' : '']">
          <BIcon :name="t.icon" class="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
          <div class="min-w-0">
            <p class="text-[11px] text-white/35">{{ t.label }}</p>
            <p class="text-sm font-bold text-white truncate">{{ t.value }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { DealerListing } from '@/stores/dealersDen'

const props = defineProps<{ listing: DealerListing }>()
defineEmits<{ (e: 'tag', tag: string): void }>()

const details    = computed(() => props.listing.commission_details ?? {})
const draws      = computed(() => details.value.draws ?? [])
const doesntDraw = computed(() => details.value.doesntDraw ?? [])

const steps = [
  { icon: 'FileText',  title: 'Заявка',        text: 'Описываешь идею и прикладываешь реф' },
  { icon: 'Wallet',    title: 'Предоплата 50%', text: 'Хранится у Bloomly до сдачи' },
  { icon: 'Pencil',    title: 'Эскиз',          text: 'Правки по договорённости' },
  { icon: 'Palette',   title: 'Цвет',           text: 'WIP-апдейты в чате заказа' },
  { icon: 'Download',  title: 'Финал',          text: 'Оплата остатка и исходники' },
]

const terms = computed(() => {
  const t = details.value.terms ?? {}
  return [
    props.listing.commission_eta_days != null ? { icon: 'Timer',     label: 'Срок',     value: `~${props.listing.commission_eta_days} дн.` } : null,
    t.revisions ? { icon: 'RefreshCw', label: 'Правки',   value: t.revisions } : null,
    t.file      ? { icon: 'Image',     label: 'Файл',     value: t.file } : null,
    t.rights    ? { icon: 'Scale',     label: 'Права',    value: t.rights } : null,
    t.refund    ? { icon: 'RotateCcw', label: 'Возврат',  value: t.refund } : null,
    t.languages ? { icon: 'Languages', label: 'Общение',  value: t.languages } : null,
  ].filter((x): x is { icon: string; label: string; value: string } => !!x)
})
</script>
