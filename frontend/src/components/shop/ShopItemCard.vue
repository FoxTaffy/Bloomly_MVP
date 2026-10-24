<script setup lang="ts">
import { computed } from 'vue'
import type { ShopItem } from '@/stores/shop'
import { typeMeta, isFreeItem, fmtPrice } from '@/lib/shop'
import { useNsfwMode } from '@/composables/useNsfwMode'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{ item: ShopItem; busy?: boolean }>()
defineEmits<{ acquire: [item: ShopItem] }>()

const { nsfwEnabled } = useNsfwMode()
const meta = computed(() => typeMeta(props.item.type))
const free = computed(() => isFreeItem(props.item))
const blurred = computed(() => props.item.is_nsfw && !nsfwEnabled.value)
</script>

<template>
  <div class="card-surface group hover:-translate-y-0.5 transition-all" :class="meta.hover">
    <div class="relative w-full overflow-hidden bg-brand-bg aspect-4/3">
      <img v-if="item.preview_url" :src="item.preview_url" :alt="item.name" loading="lazy"
        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
      <div v-else class="w-full h-full flex items-center justify-center bg-linear-to-br" :class="meta.fallback">
        <BIcon :name="meta.icon" class="w-12 h-12 text-white/10" />
      </div>
      <div class="absolute inset-0 bg-linear-to-t/srgb from-black/60 via-transparent to-transparent" />

      <span class="chip absolute top-2 left-2" :class="meta.badge">
        <BIcon :name="meta.icon" class="w-2.5 h-2.5" /> {{ meta.label }}
      </span>
      <span v-if="item.is_official" class="chip absolute top-2 right-2 bg-brand-purple/20 border-brand-purple/40 text-brand-purple">
        <BIcon name="ShieldCheck" class="w-2.5 h-2.5" /> Bloomly
      </span>
      <span v-if="!item.owned && free" class="chip absolute bottom-2 left-2 bg-brand-success/20 border-brand-success/30 text-brand-success">
        БЕСПЛАТНО
      </span>
      <span v-if="item.downloads_count" class="chip absolute bottom-2 right-2 border-transparent bg-black/40 text-white/50">
        <BIcon name="Download" class="w-2.5 h-2.5" /> {{ item.downloads_count }}
      </span>

      <div v-if="blurred" class="absolute inset-0 backdrop-blur-md flex items-center justify-center">
        <span class="text-xs text-white/60 font-bold bg-black/50 px-2 py-1 rounded-full">18+</span>
      </div>
    </div>

    <div class="p-3 flex items-start justify-between gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ item.name }}</h3>
        <p v-if="item.description" class="text-[10px] text-white/40 mt-0.5 line-clamp-1">{{ item.description }}</p>
        <div v-if="item.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
          <span v-for="tag in item.tags.slice(0, 3)" :key="tag"
            class="text-[9px] text-white/30 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full">{{ tag }}</span>
        </div>
      </div>

      <div class="shrink-0 flex flex-col items-end gap-1">
        <span class="text-sm font-black tabular-nums leading-none" :class="free ? 'text-brand-success' : 'text-brand-yellow'">
          {{ fmtPrice(item.price) }}
        </span>
        <button v-if="!item.owned" @click.stop="$emit('acquire', item)" :disabled="busy"
          class="inline-flex items-center gap-1 text-[9px] font-extrabold px-2.5 py-1 rounded-lg shadow-md disabled:opacity-50 text-white whitespace-nowrap hover:opacity-90 transition-opacity"
          :class="free ? 'bg-brand-success' : 'bg-brand-gradient'">
          <span v-if="busy" class="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
          <template v-else>
            <BIcon :name="free ? 'Download' : 'ShoppingCart'" class="w-2.5 h-2.5" />
            {{ free ? 'Получить' : 'Купить' }}
          </template>
        </button>
        <span v-else class="inline-flex items-center gap-1 text-[9px] font-extrabold text-brand-success">
          <BIcon name="Check" class="w-2.5 h-2.5" /> В коллекции
        </span>
      </div>
    </div>
  </div>
</template>
