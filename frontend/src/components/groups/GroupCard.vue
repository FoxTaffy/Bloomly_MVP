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
    class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group/card flex flex-col"
    @click="emit('click')"
  >
    <!-- Banner / Cover -->
    <div class="relative h-24 overflow-hidden">
      <img
        v-if="group.banner_url"
        :src="group.banner_url"
        :alt="group.name"
        class="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500"
      />
      <div
        v-else
        class="w-full h-full"
        :style="{ background: `linear-gradient(135deg, ${group.accent_color || '#4C67CF'}55, ${group.accent_color || '#CD83F5'}33)` }"
      >
        <!-- subtle pattern -->
        <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 14px 14px;" />
      </div>

      <!-- Type badge overlay -->
      <span class="absolute top-2 left-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border backdrop-blur-sm"
        :class="typeColor[group.type] ?? 'bg-brand-accent/80 text-white border-brand-accent/30'">
        {{ typeLabel[group.type] ?? group.type }}
      </span>

      <!-- 18+ badge -->
      <span v-if="group.is_nsfw" class="absolute top-2 right-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-brand-error/80 text-white border border-brand-error/30 backdrop-blur-sm">18+</span>
    </div>

    <!-- Avatar floating on banner edge -->
    <div class="px-3 flex items-end gap-3 -mt-5 mb-1.5">
      <div class="w-10 h-10 rounded-xl overflow-hidden border-2 border-brand-card shrink-0 shadow">
        <img
          v-if="group.avatar_url"
          :src="group.avatar_url"
          :alt="group.name"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center"
          :style="{ background: `linear-gradient(135deg, ${group.accent_color || '#4C67CF'}44, ${group.accent_color || '#CD83F5'}33)` }"
        >
          <BIcon :name="typeIcon[group.type] ?? 'Grid'" class="w-5 h-5" :style="{ color: group.accent_color || '#a855f7' }" />
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="px-3 pb-3 flex flex-col gap-1 flex-1">
      <h3 class="text-white font-bold text-sm leading-tight line-clamp-1">{{ group.name }}</h3>
      <p class="text-white/35 text-xs truncate">@{{ group.slug }}</p>

      <p v-if="group.description" class="text-white/50 text-xs line-clamp-2 mt-0.5">{{ group.description }}</p>

      <div class="flex items-center gap-1.5 mt-auto pt-2 text-xs text-white/40">
        <BIcon name="Users" class="w-3 h-3" />
        <span>{{ fmtMembers(group.subscriber_count > 0 ? group.subscriber_count : group._count.members) }}</span>
        <span class="text-white/20">·</span>
        <span>участников</span>
      </div>
    </div>
  </div>
</template>
