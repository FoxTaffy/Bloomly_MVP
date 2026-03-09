<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'
import type { Group } from '@/stores/groups'

const props = defineProps<{ group: Group }>()
const emit = defineEmits<{ (e: 'click'): void }>()

const typeLabel: Record<string, string> = {
  event: 'Ивент', creative: 'Художник', static: 'Паблик',
  news: 'Новости', shop: 'Магазин', community: 'Сообщество', brand: 'Бренд',
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
  event: 'CalendarDays', creative: 'Palette', static: 'Image',
  news: 'Newspaper', shop: 'ShoppingBag', community: 'Users', brand: 'Building2',
}

function fmtMembers(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}

function bannerGradient(color: string | null | undefined) {
  return 'linear-gradient(135deg, ' + (color || '#4C67CF') + '55, ' + (color || '#CD83F5') + '33)'
}
</script>

<template>
  <div
    class="bg-brand-card border border-brand-border rounded-2xl hover:border-brand-accent/40 transition-all group/card flex flex-col cursor-pointer relative overflow-visible"
    @click="emit('click')"
  >
    <!-- Banner -->
    <div
      class="relative h-20 flex-shrink-0 rounded-t-2xl overflow-hidden"
      :style="group.banner_url ? '' : 'background: ' + bannerGradient(group.accent_color)"
    >
      <img v-if="group.banner_url" :src="group.banner_url" :alt="group.name"
        class="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500" />
      <div v-else class="absolute inset-0 opacity-15"
        style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 14px 14px;" />

      <!-- 18+ badge -->
      <span v-if="group.is_nsfw"
        class="absolute top-2 right-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-brand-error/80 text-white border border-brand-error/30 backdrop-blur-sm">
        18+
      </span>
    </div>

    <!-- Body -->
    <div class="px-4 pb-3 pt-0 flex flex-col gap-1.5 flex-1 rounded-b-2xl bg-brand-card relative z-10 overflow-visible">
      <!-- Square avatar floating out of banner -->
      <div class="-mt-7 mb-0.5">
        <div class="w-14 h-14 rounded-xl overflow-hidden border-[3px] border-brand-card shadow">
          <img v-if="group.avatar_url" :src="group.avatar_url" :alt="group.name" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full flex items-center justify-center"
            :style="'background: ' + bannerGradient(group.accent_color)">
            <BIcon :name="typeIcon[group.type] ?? 'Grid'" class="w-6 h-6"
              :style="{ color: group.accent_color || '#a855f7' }" />
          </div>
        </div>
      </div>

      <!-- Name + slug -->
      <p class="font-bold text-white text-sm leading-tight truncate">{{ group.name }}</p>
      <p class="text-xs text-white/40 truncate mt-[-4px]">@{{ group.slug }}</p>

      <!-- Footer: members -->
      <div class="flex items-center gap-1.5 text-xs text-white/40 mt-auto pt-1.5">
        <BIcon name="Users" class="w-3 h-3" />
        <span>{{ fmtMembers(group.subscriber_count > 0 ? group.subscriber_count : group._count.members) }} участников</span>
      </div>
    </div>
  </div>
</template>
