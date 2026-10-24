<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore } from '@/stores/lang'
import { FEED_TABS, FEED_SORT_OPTIONS, type FeedMode, type FeedSort } from '@/lib/feed'
import BIcon from '../BIcon.vue'

const props = defineProps<{
  mode: FeedMode
  sort: FeedSort
  /** Сортировка есть только у общих вкладок */
  sortable: boolean
  nsfwEnabled: boolean
}>()
const emit = defineEmits<{
  (e: 'update:mode', value: FeedMode): void
  (e: 'update:sort', value: FeedSort): void
}>()

const langStore = useLangStore()
const tabs = computed(() => FEED_TABS.filter((tab) => !tab.nsfwOnly || props.nsfwEnabled))
const labelOf = (key: string): string => (langStore.t as Record<string, string>)[key] ?? key
</script>

<template>
  <div class="flex items-center gap-2 max-md:-mx-1">
    <div
      role="tablist"
      aria-label="Лента"
      class="flex flex-1 min-w-0 items-center gap-1 p-1 rounded-3xl bg-brand-card/50 border border-brand-border m-scroll-row"
    >
      <button
        v-for="tab in tabs"
        :key="tab.mode"
        type="button"
        role="tab"
        class="feed-tab"
        :aria-selected="mode === tab.mode"
        @click="emit('update:mode', tab.mode)"
      >
        <BIcon :name="tab.icon" class="w-4 h-4" aria-hidden="true" />
        {{ labelOf(tab.label) }}
      </button>
    </div>

    <label v-if="sortable" class="inline-flex items-center gap-1.5 shrink-0 text-white/55">
      <BIcon name="ArrowUpDown" class="w-4 h-4 shrink-0" aria-hidden="true" />
      <span class="sr-only">Сортировка ленты</span>
      <select
        :value="sort"
        aria-label="Сортировка ленты"
        class="field-input min-h-9 font-semibold"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value as FeedSort)"
      >
        <option v-for="option in FEED_SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
  </div>
</template>
