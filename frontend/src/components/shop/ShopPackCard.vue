<script setup lang="ts">
import { computed } from 'vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'

// Пак приходит из stickers-стора; поля, которые нужны карточке, перечислены здесь
const props = defineProps<{ pack: any; own?: boolean }>()
defineEmits<{ open: []; edit: []; remove: [] }>()

const { nsfwEnabled } = useNsfwMode()
const langStore = useLangStore()

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

      <span class="chip absolute top-2 left-2 text-brand-pink bg-brand-pink/15 border-brand-pink/25">
        <BIcon name="Smile" class="w-2.5 h-2.5" /> {{ stickers.length }} шт.
      </span>
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
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ pack.name }}</h3>
          <div v-if="pack.author?.username" class="flex items-center gap-1 mt-0.5">
            <img v-if="pack.author.avatar_url" :src="pack.author.avatar_url" class="w-3.5 h-3.5 rounded-full object-cover border border-brand-pink/20 shrink-0" />
            <span class="text-[10px] text-brand-pink/70 truncate font-medium">{{ pack.author.display_name ?? pack.author.username }}</span>
            <BIcon v-if="pack.author.is_verified" name="BadgeCheck" class="w-2.5 h-2.5 text-brand-accent shrink-0" :title="langStore.t.verBadgeGenericLabel" />
          </div>
        </div>
        <div class="shrink-0 flex items-center gap-0.5 text-[10px] text-white/35 font-bold">
          <BIcon name="Heart" class="w-2.5 h-2.5" /> {{ pack._count?.userCollections ?? 0 }}
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
