<template>
  <div class="den-weekly-top">
    <div class="wt-header">
      <span class="wt-title">Топ недели</span>
      <span class="wt-week">{{ weekLabel }}</span>
    </div>

    <div v-if="isLoading" class="wt-loading">Загрузка...</div>

    <div v-else-if="!top.length" class="wt-empty">Нет данных за эту неделю</div>

    <div v-else class="wt-list">
      <RouterLink
        v-for="entry in top"
        :key="entry.id"
        :to="`/dealers-den/seller/${entry.user.username}`"
        class="wt-entry"
        :class="`rank-${entry.rank}`"
      >
        <span class="rank-badge">{{ rankEmoji(entry.rank) }}</span>
        <img v-if="entry.user.avatar_url" :src="entry.user.avatar_url" class="avatar" alt="" />
        <div v-else class="avatar avatar-placeholder">{{ initials(entry.user) }}</div>
        <div class="entry-info">
          <span class="entry-name">{{ entry.user.display_name || entry.user.username }}</span>
          <span class="entry-stats">{{ entry.sales_count }} продаж · {{ Number(entry.avg_rating).toFixed(1) }}★</span>
        </div>
        <span class="entry-score">{{ Number(entry.score).toFixed(1) }}</span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useDealersDenStore, type DenWeeklyTopEntry } from '../stores/dealersDen'

const store  = useDealersDenStore()
const top    = ref<DenWeeklyTopEntry[]>([])
const weekStart = ref('')
const isLoading = ref(false)

const weekLabel = computed(() => weekStart.value ? `Неделя ${weekStart.value}` : '')

function rankEmoji(rank: number) {
  return ['🥇', '🥈', '🥉'][rank - 1] ?? `#${rank}`
}

function initials(user: { display_name: string | null; username: string }) {
  return (user.display_name || user.username).slice(0, 2).toUpperCase()
}

onMounted(async () => {
  isLoading.value = true
  try {
    const result = await store.loadWeeklyTop()
    top.value = result.top
    weekStart.value = result.weekStart
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.den-weekly-top {
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
}
.wt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #f3f4f6;
}
.wt-title  { font-weight: 700; font-size: 15px; }
.wt-week   { font-size: 12px; color: #9ca3af; }
.wt-loading, .wt-empty { padding: 20px; text-align: center; color: #9ca3af; font-size: 14px; }
.wt-list   { display: flex; flex-direction: column; }
.wt-entry  {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s;
}
.wt-entry:hover { background: #f9fafb; }
.rank-badge { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.avatar-placeholder {
  background: #6366f1;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  border-radius: 50%;
}
.entry-info  { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.entry-name  { font-weight: 600; font-size: 13px; }
.entry-stats { font-size: 11px; color: #9ca3af; }
.entry-score { font-weight: 700; font-size: 14px; color: #6366f1; }
.rank-1 { background: linear-gradient(90deg, #fef3c7 0%, transparent 100%); }
.rank-2 { background: linear-gradient(90deg, #f3f4f6 0%, transparent 100%); }
.rank-3 { background: linear-gradient(90deg, #fef9eb 0%, transparent 100%); }
</style>
