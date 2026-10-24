<script setup lang="ts">
import type { StickerSuggestion } from '@/composables/useStickerSuggest'

// Полоска подсказанных стикеров над полем ввода. Нажатие отправляет стикер вместо введённого эмодзи.
defineProps<{ items: StickerSuggestion[] }>()
const emit = defineEmits<{ (e: 'pick', url: string): void }>()
</script>

<template>
  <Transition name="sticker-suggest">
    <div v-if="items.length" role="listbox" aria-label="Стикеры по эмодзи"
      class="sticker-suggest absolute left-0 right-0 bottom-full mb-2 z-40 flex gap-1.5 overflow-x-auto p-1.5 rounded-2xl bg-brand-card border border-brand-border shadow-2xl">
      <button v-for="s in items" :key="s.url" type="button" role="option" aria-label="Отправить стикер"
        @mousedown.prevent @click="emit('pick', s.url)"
        class="relative shrink-0 w-14 h-14 rounded-xl bg-white/5 border border-transparent hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-colors p-1">
        <img :src="s.url" alt="" class="w-full h-full object-contain pointer-events-none" loading="lazy" />
        <span v-if="s.nsfw" class="absolute top-0.5 right-0.5 text-[7px] bg-pink-500/80 text-white px-0.5 rounded-sm leading-none py-px font-bold">18+</span>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.sticker-suggest { scrollbar-width: thin; }
.sticker-suggest-enter-active, .sticker-suggest-leave-active { transition: opacity .12s, transform .12s; }
.sticker-suggest-enter-from, .sticker-suggest-leave-to { opacity: 0; transform: translateY(4px); }
</style>
