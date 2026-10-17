<script setup lang="ts">
import { useRouter } from 'vue-router'
import BIcon from './BIcon.vue'
import type { FriendRequest } from '@/stores/friends'

const props = defineProps<{
  request: FriendRequest
  mutualCount?: number
}>()

const emit = defineEmits<{
  accept: [id: string]
  reject: [id: string]
}>()

const router = useRouter()

function avatarInitial(name: string | null | undefined) {
  return (name ?? '?')[0].toUpperCase()
}
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-2xl p-4 flex flex-col gap-3 hover:border-brand-accent/30 transition-all">
    <!-- Top row: avatar + info -->
    <div
      class="flex items-center gap-3 cursor-pointer"
      @click="router.push(`/profile/${request.user.username}`)"
    >
      <!-- Avatar -->
      <div class="relative shrink-0">
        <img
          v-if="request.user.avatar_url"
          :src="request.user.avatar_url"
          :alt="request.user.display_name || request.user.username"
          class="w-12 h-12 rounded-full object-cover border border-brand-border"
        />
        <div
          v-else
          class="w-12 h-12 rounded-full border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-lg"
        >
          {{ avatarInitial(request.user.display_name || request.user.username) }}
        </div>
      </div>

      <!-- Name + meta -->
      <div class="min-w-0 flex-1">
        <p class="font-bold text-brand-offwhite truncate leading-tight">
          {{ request.user.display_name || request.user.username }}
        </p>
        <p class="text-xs text-white/55 truncate">@{{ request.user.username }}</p>
        <div class="flex items-center gap-1 mt-0.5 text-xs text-white/55">
          <BIcon v-if="request.user.location" name="MapPin" class="w-3 h-3 shrink-0" />
          <span v-if="request.user.location" class="truncate">{{ request.user.location }}</span>
          <template v-if="mutualCount">
            <span v-if="request.user.location" class="mx-1">·</span>
            <BIcon name="Users" class="w-3 h-3 shrink-0" />
            <span>{{ mutualCount }} общих</span>
          </template>
        </div>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex gap-2">
      <button
        class="flex-1 py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-semibold transition-colors"
        @click.stop="emit('accept', request.id)"
      >
        Добавить
      </button>
      <button
        class="flex-1 py-1.5 rounded-xl bg-brand-muted/30 hover:bg-brand-muted/50 text-brand-offwhite text-sm font-semibold transition-colors"
        @click.stop="emit('reject', request.id)"
      >
        Отклонить
      </button>
    </div>
  </div>
</template>
