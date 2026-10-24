<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import api from '@/api'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { formatCount } from '@/lib/utils'
import BIcon from '../BIcon.vue'

interface TrendingTag { name: string; totalCount: number; trend: 'up' | 'down' | 'stable' }

const TREND_ICON = { up: 'TrendingUp', down: 'TrendingDown', stable: 'Minus' } as const
const TREND_TONE = { up: 'text-brand-success', down: 'text-brand-error', stable: 'text-white/55' } as const
const VISIBLE_TAGS = 10

const langStore = useLangStore()
const { nsfwEnabled } = useNsfwMode()

const tags = ref<TrendingTag[]>([])
const isLoading = ref(true)
let requestSeq = 0

async function refresh() {
  const seq = ++requestSeq
  isLoading.value = true
  try {
    const res = await api.get('/posts/trending-tags', { params: { includeNsfw: nsfwEnabled.value ? 'true' : 'false' } })
    if (seq === requestSeq && res.data.success) tags.value = res.data.data.tags
  } catch { /* список останется прежним */ } finally {
    if (seq === requestSeq) isLoading.value = false
  }
}

onMounted(refresh)
watch(nsfwEnabled, refresh)
// После публикации поста список тегов может измениться
defineExpose({ refresh })
</script>

<template>
  <section>
    <h3 class="font-bold text-white mb-4">{{ langStore.t.popularTags }}</h3>
    <div v-if="isLoading && !tags.length" class="stack-y-3">
      <div v-for="n in 5" :key="n" class="flex items-center justify-between">
        <div class="skeleton h-4 w-24"></div>
        <div class="skeleton h-4 w-12"></div>
      </div>
    </div>
    <p v-else-if="!tags.length" class="text-center py-6 text-xs text-white/55">{{ langStore.t.noHashtagsYet }}</p>
    <div v-else class="stack-y-3">
      <router-link
        v-for="tag in tags.slice(0, VISIBLE_TAGS)"
        :key="tag.name"
        :to="{ path: '/search', query: { q: tag.name } }"
        class="flex items-center justify-between group"
      >
        <span class="text-sm text-white/55 group-hover:text-white transition-colors">{{ tag.name }}</span>
        <span class="flex items-center gap-1.5 text-xs font-bold" :class="TREND_TONE[tag.trend]">
          <BIcon :name="TREND_ICON[tag.trend]" class="w-3 h-3" />
          {{ formatCount(tag.totalCount) }}
        </span>
      </router-link>
    </div>
  </section>
</template>
