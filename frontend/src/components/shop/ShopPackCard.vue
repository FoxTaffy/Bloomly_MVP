<script setup lang="ts">
import { computed } from 'vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import BIcon from '@/components/BIcon.vue'
import UserBadges from '@/components/UserBadges.vue'

// Пак приходит из stickers-стора; поля, которые нужны карточке, перечислены здесь
const props = defineProps<{ pack: any; own?: boolean }>()
defineEmits<{ open: []; edit: []; remove: [] }>()

const { nsfwEnabled } = useNsfwMode()

const VISIBILITY_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  own:    { label: 'Свой',           icon: 'Lock',  cls: 'text-white/70 bg-black/40 border-white/15' },
  invite: { label: 'По приглашению', icon: 'Link2', cls: 'text-sky-300 bg-sky-500/20 border-sky-400/30' },
  paid:   { label: '',               icon: 'Crown', cls: 'text-amber-300 bg-amber-500/20 border-amber-400/30' },
}
const badge = computed(() => (props.pack.in_collection ? null : VISIBILITY_BADGE[props.pack.visibility ?? ''] ?? null))
const stickers = computed<string[]>(() => props.pack.stickers ?? [])
</script>

<template>
  <div @click="$emit('open')" class="card-surface group cursor-pointer hover:border-brand-pink/50 hover:-translate-y-0.5 hover:shadow-brand-pink/10 transition-all">
    <div class="relative w-full overflow-hidden aspect-4/3 bg-brand-card" :style="pack.cover_bg_color ? { background: pack.cover_bg_color } : undefined">
      <img v-if="pack.cover_url" :src="pack.cover_url" :alt="pack.name" loading="lazy"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      <div v-else-if="stickers.length" class="w-full h-full grid grid-cols-2 gap-1.5 p-3 items-center justify-items-center">
        <img v-for="(st, i) in stickers.slice(0, 4)" :key="i" :src="st" loading="lazy"
          class="w-14 h-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
      </div>
      <span v-else class="absolute inset-0 flex items-center justify-center text-5xl select-none group-hover:scale-110 transition-transform duration-300">🐾</span>

      <div class="absolute inset-0 bg-linear-to-t/srgb from-black/75 via-black/10 to-transparent" />

      <div v-if="pack.cover_url && stickers.length" class="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
        <div v-for="(st, i) in stickers.slice(0, 4)" :key="i"
          class="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-xs border border-white/15 flex items-center justify-center shrink-0 overflow-hidden">
          <img :src="st" class="w-full h-full object-contain p-0.5" />
        </div>
        <div v-if="stickers.length > 4" class="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-xs border border-white/15 flex items-center justify-center shrink-0">
          <span class="text-[9px] font-extrabold text-white/60">+{{ stickers.length - 4 }}</span>
        </div>
      </div>

      <span v-if="badge" class="chip absolute top-2 right-2" :class="badge.cls">
        <BIcon :name="badge.icon" class="w-2.5 h-2.5" />
        {{ pack.visibility === 'paid' ? `${parseFloat(pack.price)} ${pack.currency}` : badge.label }}
      </span>
      <span v-if="pack.in_collection" class="chip absolute top-2 right-2 text-brand-success bg-brand-success/15 border-brand-success/25">
        <BIcon name="Check" class="w-2.5 h-2.5" /> Есть
      </span>

      <div v-if="pack.is_nsfw && !nsfwEnabled" class="absolute inset-0 backdrop-blur-md flex items-center justify-center">
        <span class="text-xs text-white/60 font-bold bg-black/50 px-2 py-1 rounded-full">18+</span>
      </div>
    </div>

    <div class="p-3">
      <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ pack.name }}</h3>
      <div v-if="pack.author?.username" class="flex items-center gap-1.5 mt-1 min-w-0">
        <img v-if="pack.author.avatar_url" :src="pack.author.avatar_url" class="w-4 h-4 rounded-full object-cover shrink-0" />
        <span class="text-[10px] text-brand-pink/80 truncate font-semibold">{{ pack.author.display_name ?? pack.author.username }}</span>
        <UserBadges :user="pack.author" />
      </div>

      <div class="grid grid-cols-2 gap-1.5 mt-2.5">
        <div class="flex items-center justify-center gap-1.5 rounded-xl bg-brand-pink/10 border border-brand-pink/15 py-1.5" title="Стикеров в паке">
          <BIcon name="Smile" class="w-3 h-3 text-brand-pink" />
          <span class="text-[11px] font-extrabold text-white tabular-nums">{{ stickers.length }}</span>
        </div>
        <div class="flex items-center justify-center gap-1.5 rounded-xl bg-brand-error/10 border border-brand-error/15 py-1.5" title="В коллекциях">
          <BIcon name="Heart" class="w-3 h-3 text-brand-error" />
          <span class="text-[11px] font-extrabold text-white tabular-nums">{{ pack._count?.userCollections ?? 0 }}</span>
        </div>
      </div>

      <div v-if="own" class="flex gap-1.5 mt-2">
        <button @click.stop="$emit('edit')"
          class="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold bg-white/8 hover:bg-white/15 text-white/80 transition-all">
          <BIcon name="Pencil" class="w-3 h-3" /> Изменить
        </button>
        <button @click.stop="$emit('remove')" title="Удалить"
          class="w-8 inline-flex items-center justify-center rounded-xl bg-white/8 hover:bg-brand-error/25 text-white/60 hover:text-brand-error transition-all">
          <BIcon name="Trash2" class="w-3 h-3" />
        </button>
      </div>

      <div v-if="pack.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
        <span v-for="tag in pack.tags.slice(0, 5)" :key="tag"
          class="text-[9px] text-brand-pink/70 bg-brand-pink/10 border border-brand-pink/20 px-1.5 py-0.5 rounded-full font-bold">#{{ tag }}</span>
      </div>
    </div>
  </div>
</template>
