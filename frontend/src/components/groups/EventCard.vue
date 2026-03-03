<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { EventItem } from '@/stores/groups'

const props = defineProps<{ event: EventItem; compact?: boolean }>()
const emit = defineEmits<{ (e: 'click'): void; (e: 'soon'): void }>()

const daysLeft = computed(() => {
  const diff = new Date(props.event.starts_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86_400_000))
})

const dateRange = computed(() => {
  const fmt = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const s = new Date(props.event.starts_at)
  const e = new Date(props.event.ends_at)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}-${e.getDate()} ${s.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`
  }
  return `${fmt(props.event.starts_at)} — ${fmt(props.event.ends_at)}`
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    announced: 'Анонсировано',
    tickets_open: 'Билеты открыты',
    sold_out: 'Sold Out',
    active: 'Идёт сейчас',
    finished: 'Завершено',
    teaser: 'Тизер',
  }
  return map[props.event.status] ?? props.event.status
})

const statusColor = computed(() => {
  const map: Record<string, string> = {
    announced: 'text-brand-success',
    tickets_open: 'text-brand-success',
    sold_out: 'text-brand-error',
    active: 'text-brand-yellow',
    finished: 'text-brand-muted',
    teaser: 'text-brand-purple',
  }
  return map[props.event.status] ?? 'text-white/50'
})

const attendeeLabel = computed(() => {
  const n = props.event.attendee_count
  if (n >= 1000) return `${(n / 1000).toFixed(0)}к участников`
  return `${n} участников`
})

const accentColor = computed(() => props.event.theme?.accent ?? props.event.group?.accent_color ?? '#4C67CF')
</script>

<template>
  <div
    class="group/card bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-card hover:border-brand-accent/40 transition-all duration-300 cursor-pointer"
    @click="emit('click')"
  >
    <!-- Banner -->
    <div class="relative h-28 overflow-hidden">
      <img
        v-if="event.banner_url"
        :src="event.banner_url"
        :alt="event.title"
        class="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
      />
      <div v-else class="w-full h-full bg-gradient-to-br from-brand-accent/30 to-brand-purple/30" />
      <!-- Overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <!-- Title on banner -->
      <div class="absolute bottom-2 left-3 right-10">
        <h3 class="text-white font-extrabold text-base leading-tight drop-shadow-lg truncate">
          {{ event.title }}
        </h3>
        <p class="text-white/70 text-xs mt-0.5">
          <template v-if="daysLeft > 0">осталось {{ daysLeft }} дней</template>
          <template v-else-if="event.status === 'active'">Идёт сейчас!</template>
          <template v-else>Завершено</template>
        </p>
      </div>
      <!-- Settings gear -->
      <button
        class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors"
        @click.stop
      >
        <BIcon name="Settings" class="w-3.5 h-3.5 text-white/70" />
      </button>
    </div>

    <!-- Info -->
    <div class="px-3.5 py-3 space-y-2">
      <!-- Date -->
      <div class="flex items-center gap-2 text-white/70 text-xs">
        <BIcon name="Calendar" class="w-3.5 h-3.5 shrink-0" />
        <span>{{ dateRange }}</span>
      </div>
      <!-- Location -->
      <div v-if="event.location_name" class="flex items-center gap-2 text-white/70 text-xs">
        <BIcon name="MapPin" class="w-3.5 h-3.5 shrink-0" />
        <span class="truncate">{{ event.location_name }}</span>
      </div>
      <!-- Attendees + Top -->
      <div class="flex items-center gap-3 text-xs">
        <div class="flex items-center gap-1.5 text-white/70">
          <BIcon name="Users" class="w-3.5 h-3.5" />
          <span>{{ attendeeLabel }}</span>
        </div>
        <span
          v-if="event.is_top"
          class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
          :class="event.status === 'tickets_open' ? 'bg-brand-yellow/15 text-brand-yellow' : 'bg-brand-accent/15 text-brand-accent-minus'"
        >
          Топ событие
        </span>
      </div>
      <!-- Status -->
      <div class="flex items-center gap-1.5 text-xs font-bold" :class="statusColor">
        <span class="w-4 h-4 rounded-md bg-brand-success/15 flex items-center justify-center">
          <BIcon name="CheckCircle" class="w-3 h-3" />
        </span>
        {{ statusLabel }}
      </div>
    </div>
  </div>
</template>
