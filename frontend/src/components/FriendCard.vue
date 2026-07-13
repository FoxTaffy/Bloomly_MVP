<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
const langStore = useLangStore()
import { useRouter } from 'vue-router'
import BIcon from './BIcon.vue'
import type { Friend } from '@/stores/friends'
import { Smartphone, Tablet, Monitor } from 'lucide-vue-next'
import { deviceKind } from '@/lib/deviceIcon'

const props = defineProps<{
  friend: Friend
}>()

const deviceIconFor = { mobile: Smartphone, tablet: Tablet, desktop: Monitor }

const emit = defineEmits<{
  remove: [id: string]
  message: [id: string]
}>()

const router = useRouter()

function avatarInitial(name: string | null | undefined) {
  return (name ?? '?')[0].toUpperCase()
}
</script>

<template>
  <div
    class="bg-brand-card border border-brand-border rounded-2xl p-4 flex items-center gap-3 hover:border-brand-accent/30 transition-all group cursor-pointer"
    @click="router.push(`/profile/${friend.username}`)"
  >
    <!-- Avatar + online dot -->
    <div class="relative flex-shrink-0">
      <img
        v-if="friend.avatar_url"
        :src="friend.avatar_url"
        :alt="friend.display_name || friend.username"
        class="w-11 h-11 rounded-full object-cover border border-brand-border"
        @error="onAvatarError"
      />
      <div
        v-else
        class="w-11 h-11 rounded-full border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold"
      >
        {{ avatarInitial(friend.display_name || friend.username) }}
      </div>
      <!-- Online indicator — shows the device icon when we know it -->
      <span
        v-if="friend.online && deviceKind(friend.device)"
        :title="friend.device ?? undefined"
        class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-brand-card bg-brand-success flex items-center justify-center"
      >
        <component :is="deviceIconFor[deviceKind(friend.device)!]" class="w-2 h-2 text-black/70" />
      </span>
      <span
        v-else
        :class="[
          'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-brand-card',
          friend.online ? 'bg-brand-success' : 'bg-brand-muted'
        ]"
      />
    </div>

    <!-- Name -->
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-brand-offwhite truncate leading-tight text-sm">
        {{ friend.display_name || friend.username }}
      </p>
      <p class="text-xs text-white/55 truncate">@{{ friend.username }}</p>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button
        class="w-8 h-8 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/30 flex items-center justify-center text-brand-accent transition-colors"
        :title="langStore.t.msgBtnTitle"
        @click.stop="emit('message', friend.id)"
      >
        <BIcon name="MessageCircle" class="w-4 h-4" />
      </button>
      <button
        class="w-8 h-8 rounded-xl bg-brand-error/10 hover:bg-brand-error/20 flex items-center justify-center text-brand-error transition-colors"
        :title="langStore.t.removeFriendTitle"
        @click.stop="emit('remove', friend.id)"
      >
        <BIcon name="UserMinus" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
