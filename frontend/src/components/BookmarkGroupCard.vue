<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from './BIcon.vue'

const props = defineProps<{ group: any }>()
const emit  = defineEmits<{ unbookmarked: [id: string] }>()

const router    = useRouter()
const langStore = useLangStore()
const removing  = ref(false)

const typeLabel: Record<string, string> = {
  event: 'Ивент', creative: 'Художник', static: 'Паблик',
  news: 'Новости', shop: 'Магазин', community: 'Сообщество', brand: 'Бренд',
}
const typeColor: Record<string, string> = {
  event:     'bg-brand-success/15 text-brand-success border-brand-success/20',
  creative:  'bg-purple-500/15 text-purple-400 border-purple-400/20',
  static:    'bg-brand-accent/15 text-brand-accent border-brand-accent/20',
  news:      'bg-sky-500/15 text-sky-400 border-sky-400/20',
  shop:      'bg-amber-500/15 text-amber-400 border-amber-400/20',
  community: 'bg-emerald-500/15 text-emerald-400 border-emerald-400/20',
  brand:     'bg-rose-500/15 text-rose-400 border-rose-400/20',
}
const typeIcon: Record<string, string> = {
  event: 'CalendarDays', creative: 'Palette', static: 'Image',
  news: 'Newspaper', shop: 'ShoppingBag', community: 'Users', brand: 'Building2',
}

function bannerGradient(color: string | null | undefined) {
  return 'linear-gradient(135deg, ' + (color || '#4C67CF') + '55, ' + (color || '#CD83F5') + '33)'
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}

async function removeBookmark() {
  removing.value = true
  try {
    await api.post(`/bookmarks/groups/${props.group.id}`)
    emit('unbookmarked', props.group.id)
  } catch {}
  finally { removing.value = false }
}
</script>

<template>
  <div
    class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/40 transition-all group flex flex-col cursor-pointer"
    @click="router.push(`/groups/${group.slug}`)">

    <!-- Banner -->
    <div
      class="relative h-16 shrink-0"
      :style="group.banner_url ? '' : 'background: ' + bannerGradient(group.accent_color)">
      <img v-if="group.banner_url" :src="group.banner_url" :alt="group.name" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <div v-else class="absolute inset-0 opacity-10"
        style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 14px 14px;" />

      <!-- 18+ badge -->
      <span v-if="group.is_nsfw"
        class="absolute top-2 left-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-brand-error/80 text-white border border-brand-error/30 backdrop-blur-xs">
        18+
      </span>

      <!-- Remove button -->
      <button
        @click.stop="removeBookmark"
        :disabled="removing"
        class="absolute top-2 right-2 p-1.5 rounded-xl bg-black/50 backdrop-blur-xs text-white/70 hover:text-yellow-400 hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30"
        :title="langStore.t.unbookmarkGroup">
        <BIcon name="BookmarkX" class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Body -->
    <div class="px-3 pb-3 pt-0 flex flex-col gap-1.5 flex-1">
      <!-- Avatar -->
      <div class="-mt-6 mb-1">
        <div class="w-12 h-12 rounded-xl overflow-hidden border-[3px] border-brand-card shadow-sm"
          :style="!group.avatar_url ? 'background: ' + bannerGradient(group.accent_color) : ''">
          <img v-if="group.avatar_url" :src="group.avatar_url" :alt="group.name" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full flex items-center justify-center">
            <BIcon :name="typeIcon[group.type] ?? 'Grid'" class="w-5 h-5" :style="{ color: group.accent_color || '#a855f7' }" />
          </div>
        </div>
      </div>

      <!-- Name + type badge -->
      <div>
        <div class="flex items-center gap-1.5 min-w-0">
          <p class="font-bold text-sm text-white truncate leading-tight">{{ group.name }}</p>
          <BIcon v-if="group.is_verified" name="BadgeCheck" class="w-3.5 h-3.5 shrink-0 text-brand-accent" />
        </div>
        <span v-if="typeLabel[group.type]"
          class="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border mt-0.5"
          :class="typeColor[group.type] ?? 'bg-brand-bg text-white/40 border-white/10'">
          {{ typeLabel[group.type] }}
        </span>
      </div>

      <!-- Description -->
      <p v-if="group.description" class="text-[11px] text-white/40 line-clamp-2 leading-relaxed">{{ group.description }}</p>

      <!-- Members count -->
      <div class="flex items-center gap-1 text-xs text-white/40 mt-auto pt-1">
        <BIcon name="Users" class="w-3 h-3" />
        {{ fmtNum(group.members_count || group._count?.members || 0) }} {{ langStore.t.membersCount }}
      </div>
    </div>
  </div>
</template>
