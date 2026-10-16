<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'
import type { AdminTab } from './adminContext'

// Группы пунктов меню админки. Один и тот же список рисуется и в боковой панели (десктоп),
// и в выезжающем меню (телефон), поэтому разметка живёт здесь.
export interface AdminNavItem {
  tab: AdminTab
  label: string
  icon: string
  color: string
  badge: string | number | null
}
export interface AdminNavGroup {
  label: string | null
  items: AdminNavItem[]
}

defineProps<{ groups: AdminNavGroup[]; activeTab: AdminTab }>()
const emit = defineEmits<{ select: [tab: AdminTab] }>()
</script>

<template>
  <div class="space-y-4">
    <div v-for="group in groups" :key="group.label ?? 'root'" class="space-y-0.5">
      <p v-if="group.label" class="px-3 mb-1.5 text-[10px] font-extrabold text-white/25 tracking-[0.15em] uppercase">{{ group.label }}</p>
      <button v-for="item in group.items" :key="item.tab" @click="emit('select', item.tab)"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group relative"
        :class="activeTab === item.tab
          ? 'text-white bg-brand-accent/15'
          : 'text-white/50 hover:text-white/80 hover:bg-white/5'">
        <div class="relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200"
          :class="activeTab === item.tab ? 'bg-brand-accent/25' : 'group-hover:bg-white/5'">
          <BIcon :name="item.icon" class="w-3.5 h-3.5 transition-all duration-200" :class="activeTab === item.tab ? 'text-brand-accent' : ''" />
        </div>
        <span class="relative flex-1 text-left text-[13px]">{{ item.label }}</span>
        <span v-if="item.badge" class="relative text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
          :style="`background:${item.color}22;color:${item.color}`">
          {{ item.badge }}
        </span>
      </button>
    </div>
  </div>
</template>
