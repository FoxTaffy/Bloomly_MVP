<template>
  <div class="sticker-panel w-72 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 340px">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 pt-2.5 pb-2 flex-shrink-0 border-b border-brand-border">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-white">Стикеры</span>
        <span class="text-[9px] font-bold bg-brand-accent/30 text-brand-accent px-1.5 py-0.5 rounded-full border border-brand-accent/40">BETA</span>
      </div>
      <span class="text-[10px] text-white/55">Скоро в Dealers Den</span>
    </div>

    <!-- Pack tabs -->
    <div class="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto hide-scrollbar border-b border-brand-border/50">
      <button
        v-for="pack in PACKS"
        :key="pack.id"
        @click="activePack = pack.id"
        :class="[
          'flex-shrink-0 px-2.5 py-1 rounded-xl text-xs font-medium transition-all whitespace-nowrap',
          activePack === pack.id
            ? 'bg-brand-accent text-white shadow-sm'
            : 'text-white/55 hover:text-white hover:bg-brand-bg',
        ]"
      >{{ pack.name }}</button>
    </div>

    <!-- Sticker grid -->
    <div class="flex-1 overflow-y-auto p-2 min-h-0">
      <!-- Coming soon state for certain packs -->
      <div v-if="currentPack.comingSoon" class="flex flex-col items-center justify-center h-32 gap-2 text-white/55">
        <BIcon name="Package" class="w-8 h-8 opacity-40" />
        <p class="text-xs text-center">Этот пак появится<br>в Dealers Den</p>
      </div>

      <div v-else class="grid grid-cols-4 gap-1.5">
        <button
          v-for="sticker in currentPack.stickers"
          :key="sticker.id"
          @click="$emit('pick', sticker.url)"
          class="aspect-square rounded-xl overflow-hidden bg-brand-bg border border-brand-border/50 hover:border-brand-accent/50 hover:bg-brand-bg/80 transition-all active:scale-95 flex items-center justify-center p-1.5"
          :title="sticker.name"
        >
          <!-- Emoji-style placeholder sticker -->
          <span class="text-3xl leading-none select-none">{{ sticker.emoji }}</span>
        </button>
      </div>
    </div>

    <!-- Dealers Den promo -->
    <div class="flex items-center gap-2 border-t border-brand-border px-3 py-2 flex-shrink-0 bg-brand-bg/40">
      <BIcon name="ShoppingBag" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
      <p class="text-[10px] text-white/55 leading-tight">
        Эксклюзивные стикер-паки появятся в
        <span class="text-brand-accent font-semibold">Dealers Den</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import BIcon from '@/components/BIcon.vue'

defineEmits<{ (e: 'pick', url: string): void }>()

const activePack = ref('fluffy')

interface Sticker {
  id: string
  name: string
  emoji: string
  url: string  // when real sticker images are available
}

interface Pack {
  id: string
  name: string
  comingSoon?: boolean
  stickers: Sticker[]
}

const PACKS: Pack[] = [
  {
    id: 'fluffy',
    name: '🐾 Мягкие',
    stickers: [
      { id: 'f1',  name: 'Привет',    emoji: '🐻',  url: 'sticker:fluffy:f1' },
      { id: 'f2',  name: 'Обнимашки', emoji: '🐨',  url: 'sticker:fluffy:f2' },
      { id: 'f3',  name: 'Сплю',      emoji: '🦥',  url: 'sticker:fluffy:f3' },
      { id: 'f4',  name: 'Сердечко',  emoji: '🐰',  url: 'sticker:fluffy:f4' },
      { id: 'f5',  name: 'Плачу',     emoji: '🐼',  url: 'sticker:fluffy:f5' },
      { id: 'f6',  name: 'Смеюсь',    emoji: '🦊',  url: 'sticker:fluffy:f6' },
      { id: 'f7',  name: 'Злюсь',     emoji: '🐯',  url: 'sticker:fluffy:f7' },
      { id: 'f8',  name: 'Ем',        emoji: '🐻‍❄️', url: 'sticker:fluffy:f8' },
      { id: 'f9',  name: 'Гуляю',     emoji: '🐕',  url: 'sticker:fluffy:f9' },
      { id: 'f10', name: 'Устал',     emoji: '🦝',  url: 'sticker:fluffy:f10' },
      { id: 'f11', name: 'Думаю',     emoji: '🦦',  url: 'sticker:fluffy:f11' },
      { id: 'f12', name: 'Танцую',    emoji: '🦜',  url: 'sticker:fluffy:f12' },
    ],
  },
  {
    id: 'fursona',
    name: '🎨 Фурсона',
    stickers: [
      { id: 'fu1', name: 'Лиса радуется', emoji: '🦊', url: 'sticker:fursona:fu1' },
      { id: 'fu2', name: 'Волк воет',     emoji: '🐺', url: 'sticker:fursona:fu2' },
      { id: 'fu3', name: 'Дракон огонь',  emoji: '🐲', url: 'sticker:fursona:fu3' },
      { id: 'fu4', name: 'Пони скачет',   emoji: '🦄', url: 'sticker:fursona:fu4' },
      { id: 'fu5', name: 'Пантера',       emoji: '🐆', url: 'sticker:fursona:fu5' },
      { id: 'fu6', name: 'Кот доволен',   emoji: '😺', url: 'sticker:fursona:fu6' },
      { id: 'fu7', name: 'Леопард',       emoji: '🐅', url: 'sticker:fursona:fu7' },
      { id: 'fu8', name: 'Акула',         emoji: '🦈', url: 'sticker:fursona:fu8' },
    ],
  },
  {
    id: 'premium_1',
    name: '💎 Эксклюзив',
    comingSoon: true,
    stickers: [],
  },
  {
    id: 'premium_2',
    name: '🌸 Аниме',
    comingSoon: true,
    stickers: [],
  },
]

const currentPack = computed(() => PACKS.find((p) => p.id === activePack.value) ?? PACKS[0])
</script>
