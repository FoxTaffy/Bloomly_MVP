<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useNotifToast } from '@/composables/useNotifToast'
import { useWarningModalStore } from '@/stores/warningModal'
import BIcon from './BIcon.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'

const router = useRouter()
const { toasts, remove } = useNotifToast()
const warningModal = useWarningModalStore()

const badgeIcon: Record<string, string> = {
  LIKE:    'Heart',
  COMMENT: 'MessageSquare',
  REPAW:   'Repeat2',
  FOLLOW:  'UserPlus',
  MENTION: 'AtSign',
  RELATIONSHIP_REQUEST:  'HeartHandshake',
  RELATIONSHIP_ACCEPTED: 'Heart',
  FOLLOW_POST: 'FileText',
  GROUP_POST:  'FileText',
  GROUP_EVENT: 'Calendar',
  GROUP_JOIN:  'Users',
  MESSAGE:     'MessageCircle',
  automod_warn: 'ShieldAlert',
}

const badgeColor: Record<string, string> = {
  LIKE:    'bg-rose-500',
  COMMENT: 'bg-brand-accent',
  REPAW:   'bg-emerald-500',
  FOLLOW:  'bg-violet-500',
  MENTION: 'bg-amber-500',
  RELATIONSHIP_REQUEST:  'bg-pink-500',
  RELATIONSHIP_ACCEPTED: 'bg-pink-500',
  FOLLOW_POST: 'bg-violet-500',
  GROUP_POST:  'bg-brand-accent',
  GROUP_EVENT: 'bg-amber-500',
  GROUP_JOIN:  'bg-emerald-500',
  MESSAGE:     'bg-sky-500',
  automod_warn: 'bg-amber-500',
}

function onClick(t: typeof toasts.value[0]) {
  if (t.type === 'automod_warn') {
    warningModal.open({ type: t.type, meta: t.meta })
  } else if (t.convId) {
    router.push({ name: 'messages', query: { c: t.convId } })
  } else if (t.postId) {
    router.push(`/post/${t.postId}`)
  } else if (t.senderUsername) {
    router.push(`/profile/${t.senderUsername}`)
  }
  remove(t.id)
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-20 md:bottom-6 right-4 z-[9000] flex flex-col gap-2.5 items-end pointer-events-none" style="max-width: 340px">
      <TransitionGroup name="notif-toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto flex items-start gap-3 px-4 py-3 backdrop-blur-xl rounded-2xl shadow-2xl cursor-pointer transition-colors w-[320px]"
          :class="t.type === 'automod_warn'
            ? 'bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15'
            : 'bg-brand-card/95 border border-brand-border hover:bg-brand-card'"
          @click="onClick(t)"
        >
          <!-- Avatar + badge -->
          <div class="relative flex-shrink-0">
            <img
              :src="t.senderAvatar || '/icons/badges/NN.jpg'"
              class="w-10 h-10 rounded-full object-cover border border-brand-border"
              @error="onAvatarError"
            />
            <div
              class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-brand-card flex items-center justify-center text-white"
              :class="badgeColor[t.type] ?? 'bg-white/20'"
            >
              <BIcon :name="badgeIcon[t.type] ?? 'Bell'" class="w-2.5 h-2.5" />
            </div>
          </div>

          <!-- Text -->
          <div class="min-w-0 flex-1">
            <p class="text-sm text-white leading-snug">
              <span class="font-semibold">{{ t.senderName }}</span>
              {{ ' ' }}{{ t.message }}
            </p>
          </div>

          <!-- Close -->
          <button
            class="flex-shrink-0 text-white/35 hover:text-white transition-colors -mt-0.5"
            @click.stop="remove(t.id)"
          >
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.notif-toast-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.notif-toast-leave-active {
  transition: all 0.25s ease-in;
}
.notif-toast-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}
.notif-toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}
</style>
