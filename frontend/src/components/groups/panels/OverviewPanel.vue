<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type OrderStatus } from '@/stores/groups'

const props = defineProps<{ groupId: string }>()

const groupsStore = useGroupsStore()
const loading = ref(false)
const stats = ref<{ postsCount: number; messagesCount: number; ordersByStatus: Record<OrderStatus, number> } | null>(null)

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  WAITING: { label: 'Ожидание', color: '#94a3b8' },
  SKETCH: { label: 'Скетч', color: '#f59e0b' },
  LINEART: { label: 'Лайнарт', color: '#3b82f6' },
  COLORING: { label: 'Раскраска', color: '#8b5cf6' },
  FINISHED: { label: 'Готово', color: '#10b981' },
}

async function load() {
  if (!props.groupId) return
  loading.value = true
  try {
    stats.value = await groupsStore.fetchBusinessStats(props.groupId)
  } finally {
    loading.value = false
  }
}

watch(() => props.groupId, load)
onMounted(load)

const totalOrders = () => stats.value ? Object.values(stats.value.ordersByStatus).reduce((a, b) => a + b, 0) : 0
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
        <BIcon name="BarChart3" class="w-5 h-5 text-brand-accent" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Обзор</h1>
        <p class="text-xs text-white/40">Основные показатели группы</p>
      </div>
    </div>

    <div v-if="loading" class="px-6 py-16 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
    </div>

    <div v-else-if="stats" class="p-6 stack-y-6">
      <!-- Stat tiles -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-1">
            <BIcon name="Newspaper" class="w-4 h-4 text-brand-accent" />
            <p class="text-[11px] text-white/40 uppercase tracking-wide font-bold">Посты</p>
          </div>
          <p class="text-2xl font-extrabold text-white">{{ stats.postsCount }}</p>
        </div>
        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-1">
            <BIcon name="MessageCircle" class="w-4 h-4 text-brand-accent" />
            <p class="text-[11px] text-white/40 uppercase tracking-wide font-bold">Сообщения</p>
          </div>
          <p class="text-2xl font-extrabold text-white">{{ stats.messagesCount }}</p>
        </div>
        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 mb-1">
            <BIcon name="Briefcase" class="w-4 h-4 text-brand-accent" />
            <p class="text-[11px] text-white/40 uppercase tracking-wide font-bold">Заказы</p>
          </div>
          <p class="text-2xl font-extrabold text-white">{{ totalOrders() }}</p>
        </div>
      </div>

      <!-- Orders by status breakdown -->
      <div v-if="totalOrders() > 0">
        <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3 px-1">Заказы по статусам</p>
        <div class="stack-y-2">
          <div v-for="(count, status) in stats.ordersByStatus" :key="status" v-show="count > 0"
            class="flex items-center gap-3">
            <span class="text-xs font-semibold text-white/60 w-24 shrink-0">{{ STATUS_META[status].label }}</span>
            <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all"
                :style="`width:${(count / totalOrders()) * 100}%; background:${STATUS_META[status].color}`" />
            </div>
            <span class="text-xs font-bold text-white/50 w-6 text-right shrink-0">{{ count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
