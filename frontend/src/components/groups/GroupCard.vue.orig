<script setup lang="ts">
import { ref } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { Group } from '@/stores/groups'

const props = defineProps<{ group: Group }>()
const emit = defineEmits<{
  (e: 'click'): void
  (e: 'bookmark'): void
  (e: 'notify'): void
  (e: 'unsubscribe'): void
}>()

const showMenu = ref(false)

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
    <div class="px-4 pb-3 pt-0 flex flex-col gap-1 flex-1 rounded-b-2xl bg-brand-card relative z-10 overflow-visible">
      <!-- Avatar row + three-dot menu -->
      <div class="-mt-7 mb-0.5 flex items-start justify-between">
        <div class="w-14 h-14 rounded-xl overflow-hidden border-[3px] border-brand-card shadow">
          <img v-if="group.avatar_url" :src="group.avatar_url" :alt="group.name" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full flex items-center justify-center"
            :style="'background: ' + bannerGradient(group.accent_color)">
            <BIcon :name="typeIcon[group.type] ?? 'Grid'" class="w-6 h-6"
              :style="{ color: group.accent_color || '#a855f7' }" />
          </div>
        </div>

        <!-- Three-dot button -->
        <div class="relative mt-8" @click.stop>
          <button
            class="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-brand-bg/60 transition-colors"
            @click="showMenu = !showMenu"
          >
            <BIcon name="MoreHorizontal" class="w-4 h-4" />
          </button>
          <!-- Dropdown -->
          <Transition name="dropdown-card">
            <div v-if="showMenu"
              class="absolute right-0 top-full mt-1 bg-brand-card border border-brand-border rounded-xl shadow-2xl py-1.5 min-w-[176px] z-50">
              <button class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-white/70 hover:bg-brand-bg/50 hover:text-white transition-colors"
                @click="emit('bookmark'); showMenu = false">
                <BIcon name="Bookmark" class="w-3.5 h-3.5 text-brand-accent" />
                Сохранить в закладки
              </button>
              <button class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-white/70 hover:bg-brand-bg/50 hover:text-white transition-colors"
                @click="emit('notify'); showMenu = false">
                <BIcon name="Bell" class="w-3.5 h-3.5 text-brand-accent" />
                Уведомлять о постах
              </button>
              <div class="my-1 border-t border-brand-border/50" />
              <button class="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-brand-error/80 hover:bg-brand-error/10 hover:text-brand-error transition-colors"
                @click="emit('unsubscribe'); showMenu = false">
                <BIcon name="LogOut" class="w-3.5 h-3.5" />
                Отписаться
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Name only -->
      <p class="font-bold text-white text-sm leading-tight truncate">{{ group.name }}</p>

      <!-- Brief description -->
      <p v-if="group.description" class="text-[11px] text-white/40 line-clamp-2 leading-relaxed mt-0.5">{{ group.description }}</p>

      <!-- Footer: members -->
      <div class="flex items-center gap-1.5 text-xs text-white/40 mt-auto pt-1.5">
        <BIcon name="Users" class="w-3 h-3" />
        <span>{{ fmtMembers(group.subscriber_count > 0 ? group.subscriber_count : group._count.members) }} участников</span>
      </div>
    </div>

    <!-- Close menu on outside click -->
    <div v-if="showMenu" class="fixed inset-0 z-40" @click.stop="showMenu = false" />
  </div>
</template>

<style scoped>
.dropdown-card-enter-active,
.dropdown-card-leave-active {
  transition: all 0.12s ease;
}
.dropdown-card-enter-from,
.dropdown-card-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
