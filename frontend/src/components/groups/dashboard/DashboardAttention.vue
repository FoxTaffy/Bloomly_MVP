<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{
  overdue: number
  soon: number
  lots: number
  inbox: number
  showOrders: boolean
  showLots: boolean
}>()
const emit = defineEmits<{ (e: 'open', section: string): void }>()

interface Item { key: string; section: string; icon: string; label: string; hint: string; count: number; tone: 'danger' | 'warn' | 'accent' }

const items = computed<Item[]>(() => {
  const list: Item[] = []
  if (props.showOrders) {
    list.push({ key: 'overdue', section: 'orders', icon: 'AlertTriangle', label: 'Просрочены', hint: 'дедлайн заказа прошёл', count: props.overdue, tone: 'danger' })
    list.push({ key: 'soon', section: 'orders', icon: 'Clock', label: 'Скоро срок', hint: 'меньше суток до дедлайна', count: props.soon, tone: 'warn' })
  }
  if (props.showLots) list.push({ key: 'lots', section: 'lot-applications', icon: 'Send', label: 'Заявки на лоты', hint: 'ждут решения', count: props.lots, tone: 'accent' })
  list.push({ key: 'inbox', section: 'inbox', icon: 'Inbox', label: 'Обращения', hint: 'ждут ответа', count: props.inbox, tone: 'accent' })
  return list
})

const active = computed(() => items.value.filter(i => i.count > 0))

const TONE: Record<Item['tone'], string> = {
  danger: 'border-brand-error/40 bg-brand-error/10 text-brand-error',
  warn: 'border-amber-500/35 bg-amber-500/10 text-amber-400',
  accent: 'border-brand-accent/35 bg-brand-accent/10 text-brand-accent',
}
</script>

<template>
  <section class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
    <h2 class="text-sm font-extrabold text-white mb-3 flex items-center gap-2">
      <BIcon name="Bell" class="w-4 h-4 text-brand-accent" /> Требует внимания
    </h2>

    <div v-if="active.length" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <button v-for="i in active" :key="i.key" type="button"
        class="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all hover:brightness-125"
        :class="[TONE[i.tone], i.tone === 'danger' && 'animate-pulse-soft']"
        @click="emit('open', i.section)">
        <BIcon :name="i.icon" class="w-5 h-5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-white">{{ i.label }}</p>
          <p class="text-[11px] text-white/45">{{ i.hint }}</p>
        </div>
        <span class="text-2xl font-extrabold leading-none">{{ i.count }}</span>
      </button>
    </div>
    <p v-else class="flex items-center gap-2 text-sm text-white/45">
      <BIcon name="CheckCircle2" class="w-4 h-4 text-emerald-400" /> Всё спокойно: просрочек и новых обращений нет
    </p>
  </section>
</template>

<style scoped>
@keyframes pulse-soft { 0%, 100% { box-shadow: 0 0 0 0 rgb(239 68 68 / .35) } 50% { box-shadow: 0 0 0 6px rgb(239 68 68 / 0) } }
.animate-pulse-soft { animation: pulse-soft 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .animate-pulse-soft { animation: none; } }
</style>
