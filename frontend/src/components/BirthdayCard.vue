<script setup lang="ts">
import { computed } from 'vue'
import type { FriendBirthday } from '@/stores/friends'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'

const props = defineProps<{
  birthday: FriendBirthday
}>()

const langStore = useLangStore()

function avatarInitial(name: string | null | undefined) {
  return (name ?? '?')[0].toUpperCase()
}

const label = computed(() => {
  if (props.birthday.daysUntil === 0) return 'Сегодня! 🎉'
  if (props.birthday.daysUntil === 1) return 'Завтра'
  return `Через ${props.birthday.daysUntil} дн.`
})

const labelClass = computed(() => {
  if (props.birthday.daysUntil === 0) return 'text-brand-yellow font-bold'
  if (props.birthday.daysUntil <= 3)  return 'text-brand-warning font-semibold'
  return 'text-white/55'
})

const dateStr = computed(() => {
  const d = new Date(props.birthday.nextBirthday)
  return d.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long' })
})
</script>

<template>
  <router-link
    :to="`/profile/${birthday.username}`"
    class="flex items-center gap-3 py-2.5 cursor-pointer hover:opacity-80 transition-opacity"
  >
    <!-- Avatar -->
    <div class="relative shrink-0">
      <img
        v-if="birthday.avatar_url"
        :src="birthday.avatar_url"
        :alt="birthday.display_name || birthday.username"
        class="w-9 h-9 rounded-full object-cover border border-brand-border"
      />
      <div
        v-else
        class="w-9 h-9 rounded-full border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm"
      >
        {{ avatarInitial(birthday.display_name || birthday.username) }}
      </div>
    </div>

    <!-- Info -->
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-brand-offwhite truncate leading-tight">
        {{ birthday.display_name || birthday.username }}
      </p>
      <p class="text-xs text-white/55">{{ dateStr }}</p>
    </div>

    <!-- Days badge -->
    <span :class="['text-xs shrink-0', labelClass]">{{ label }}</span>
  </router-link>
</template>
