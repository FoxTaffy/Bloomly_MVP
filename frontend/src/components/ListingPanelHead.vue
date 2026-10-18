<template>
  <div class="stack-y-2.5 pb-1">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border"
        :style="`color: ${theme.accent}; border-color: ${theme.accent}55; background: ${theme.accent}14`">
        <BIcon :name="theme.icon" class="w-3.5 h-3.5" /> {{ theme.label }}
      </span>
      <span v-if="listing.is_nsfw" class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-brand-error/15 text-brand-error">18+</span>
      <span class="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-white/6 text-white/60">
        <BIcon :name="listing.type === 'physical' ? 'Package' : 'Download'" class="w-3.5 h-3.5" />
        {{ listing.type === 'physical' ? 'Физическое' : listing.type === 'digital' ? 'Цифровое' : 'Цифровое и физическое' }}
      </span>
    </div>
    <h1 class="text-2xl font-black text-white leading-tight">{{ listing.title }}</h1>
    <p class="flex items-center gap-1.5 text-xs text-white/40">
      <BIcon name="Eye" class="w-3.5 h-3.5" /> {{ (listing.views_count ?? 0).toLocaleString('ru-RU') }} {{ plural(listing.views_count ?? 0) }}
      <template v-if="wishlistCount">
        <span>·</span><BIcon name="Bookmark" class="w-3.5 h-3.5" /> {{ wishlistCount }}
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'
import type { DealerListing } from '@/stores/dealersDen'
defineProps<{ listing: DealerListing; theme: { accent: string; icon: string; label: string }; wishlistCount: number }>()

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'просмотр'
  return m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'просмотра' : 'просмотров'
}
</script>
