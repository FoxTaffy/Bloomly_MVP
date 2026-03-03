<script setup lang="ts">
import type { GroupAchievement } from '@/stores/groups'

defineProps<{ achievement: GroupAchievement }>()
</script>

<template>
  <div
    class="flex items-center gap-2 bg-brand-bg/60 border border-brand-border rounded-xl px-3 py-2 hover:border-brand-accent/30 transition-colors"
  >
    <span
      class="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
      :style="{ backgroundColor: (achievement.color ?? '#4C67CF') + '20' }"
    >
      {{ achievement.icon }}
    </span>
    <div class="min-w-0">
      <p class="text-white text-xs font-bold truncate">{{ achievement.title }}</p>
      <p class="text-white/30 text-[10px]">
        {{ new Date(achievement.earned_at).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }) }}
      </p>
    </div>
  </div>
</template>
