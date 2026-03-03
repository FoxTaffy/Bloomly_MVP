<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'
import type { Group } from '@/stores/groups'

const props = defineProps<{ group: Group }>()
const emit = defineEmits<{ (e: 'click'): void }>()

const typeLabel: Record<string, string> = {
  event: 'Ивент',
  creative: 'Художник',
  static: 'Паблик',
  news: 'Новости',
  shop: 'Магазин',
  community: 'Сообщество',
  brand: 'Бренд',
}

const typeColor: Record<string, string> = {
  event: 'bg-brand-success/15 text-brand-success border-brand-success/20',
  creative: 'bg-brand-purple/15 text-brand-purple border-brand-purple/20',
  static: 'bg-brand-accent/15 text-brand-accent border-brand-accent/20',
  news: 'bg-sky-500/15 text-sky-400 border-sky-400/20',
  shop: 'bg-amber-500/15 text-amber-400 border-amber-400/20',
  community: 'bg-emerald-500/15 text-emerald-400 border-emerald-400/20',
  brand: 'bg-rose-500/15 text-rose-400 border-rose-400/20',
}

const typeIcon: Record<string, string> = {
  event: 'CalendarDays',
  creative: 'Palette',
  static: 'Image',
  news: 'Newspaper',
  shop: 'ShoppingBag',
  community: 'Users',
  brand: 'Building2',
}

function fmtMembers(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}
</script>

<template>
  <div
    class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/30 transition-all duration-300 cursor-pointer shadow-card group/card flex h-[88px]"
    @click="emit('click')"
  >
    <!-- Square avatar (left) -->
    <div class="w-[88px] h-[88px] shrink-0 overflow-hidden relative">
      <img
        v-if="group.avatar_url"
        :src="group.avatar_url"
        :alt="group.name"
        class="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center"
        :style="{ background: `linear-gradient(135deg, ${group.accent_color || '#4C67CF'}33, ${group.accent_color || '#CD83F5'}22)` }"
      >
        <BIcon :name="typeIcon[group.type] ?? 'Grid'" class="w-8 h-8" :style="{ color: group.accent_color || '#4C67CF' }" />
      </div>
    </div>

    <!-- Content (right) -->
    <div class="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center relative">
      <!-- Type badge (top-right corner) -->
      <span class="absolute top-2 right-2.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border"
        :class="typeColor[group.type] ?? 'bg-brand-accent/15 text-brand-accent border-brand-accent/20'">
        {{ typeLabel[group.type] ?? group.type }}
      </span>

      <!-- Name -->
      <h3 class="text-white font-extrabold text-sm truncate pr-20 leading-tight">{{ group.name }}</h3>

      <!-- Slug -->
      <p class="text-white/35 text-xs truncate mt-0.5">@{{ group.slug }}</p>

      <!-- Members -->
      <div class="flex items-center gap-3 mt-1.5 text-xs text-white/50">
        <span class="flex items-center gap-1">
          <BIcon name="Users" class="w-3 h-3" />
          {{ fmtMembers(group.subscriber_count > 0 ? group.subscriber_count : group._count.members) }} участников
        </span>
        <span v-if="group.is_nsfw" class="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-brand-error/15 text-brand-error">18+</span>
      </div>
    </div>
  </div>
</template>
