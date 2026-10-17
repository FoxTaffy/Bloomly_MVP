<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { computed } from 'vue'

const props = defineProps<{
  shortCode: string
  eventTitle?: string
  startsAt?: string
  endsAt?: string
  status?: string
  bannerUrl?: string | null
  groupName?: string
  groupAvatar?: string | null
  locationName?: string | null
  attendeeCount?: number
}>()

/** Количество дней до начала */
const daysLeft = computed((): number | null => {
  if (!props.startsAt) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = new Date(props.startsAt)
  start.setHours(0, 0, 0, 0)
  const diff = Math.round((start.getTime() - now.getTime()) / 86400000)
  return diff >= 0 ? diff : null
})

const daysLabel = computed((): string | null => {
  const d = daysLeft.value
  if (d === null) return null
  if (d === 0) return 'сегодня'
  if (d === 1) return 'завтра'
  return `через ${d} дн.`
})

const daysUrgent = computed(() => {
  const d = daysLeft.value
  return d !== null && d <= 1
})

/** Диапазон дат */
const dateRange = computed(() => {
  if (!props.startsAt) return null
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const start = fmt(props.startsAt)
  if (!props.endsAt || props.endsAt === props.startsAt) return start
  return `${start} — ${fmt(props.endsAt)}`
})

/** Метка статуса */
const ticketLabel = computed((): { text: string; cls: string } | null => {
  switch (props.status) {
    case 'teaser':       return { text: 'Скоро анонс',    cls: 'text-white/40' }
    case 'announced':    return { text: 'Анонсировано',   cls: 'text-blue-400' }
    case 'tickets_open': return { text: 'Билеты открыты', cls: 'text-green-400' }
    case 'sold_out':     return { text: 'Билеты проданы', cls: 'text-red-400' }
    case 'active':       return { text: 'Идёт сейчас',   cls: 'text-yellow-400' }
    case 'finished':     return { text: 'Завершено',      cls: 'text-white/30' }
    default:             return null
  }
})

const fmtNum = (n?: number) => {
  if (n === undefined) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}K`
  return String(n)
}

</script>

<template>
  <span class="inline-flex select-none cursor-pointer align-middle">

    <!-- Бейдж (компактный) -->
    <span class="soon-badge inline-flex items-stretch gap-0 rounded-xl overflow-hidden whitespace-nowrap">
      <!-- Стрелка + SOON -->
      <span class="soon-left flex flex-col items-center justify-center px-2 py-1.5 gap-[2px] shrink-0">
        <svg class="w-3 h-3 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
        <span class="text-[6px] font-black tracking-[0.18em] text-white/40 leading-none">SOON</span>
      </span>
      <!-- Разделитель -->
      <span class="w-px bg-white/10 shrink-0 my-1.5"></span>
      <!-- Код -->
      <span class="flex items-center px-2.5 text-[12px] font-black tracking-wider text-white leading-none">{{ shortCode }}</span>
    </span>

  </span>
</template>

<style scoped>
.soon-badge {
  background: #111427;
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.soon-badge:hover {
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5), 0 0 10px rgba(76, 103, 207, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.soon-left {
  background: rgba(255, 255, 255, 0.04);
}
.banner-fallback {
  background: linear-gradient(135deg, #1a1d35 0%, #111427 100%);
}
.banner-overlay {
  background: linear-gradient(to top, rgba(12, 14, 32, 0.9) 0%, transparent 100%);
}
</style>
