<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useNotifToast } from '@/composables/useNotifToast'
import { useWarningModalStore } from '@/stores/warningModal'
import BIcon from './BIcon.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { notifBadgeIcon, notifBadgeColor } from '@/lib/notifVisuals'

const router = useRouter()
const { toasts, remove } = useNotifToast()
const warningModal = useWarningModalStore()

function onClick(t: typeof toasts.value[0]) {
  if (t.type === 'automod_warn') {
    warningModal.open({ type: t.type, meta: t.meta })
  } else if (t.isGroupDm && t.groupSlug) {
    // A member wrote to the group — staff go straight to the shared "Обращения" inbox,
    // never to /messages (they aren't a participant of the member's personal thread).
    router.push({ name: 'group-dashboard', params: { slugOrId: t.groupSlug }, query: { section: 'inbox' } })
  } else if (t.convId) {
    router.push({ name: 'messages', query: { c: t.convId } })
  } else if (t.type === 'RELATIONSHIP_REQUEST') {
    // Accept/decline happens from the notifications list, not a fire-and-forget toast.
    router.push('/notifications')
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
    <div class="fixed bottom-20 md:bottom-6 right-4 z-9000 flex flex-col gap-2.5 items-end pointer-events-none" style="max-width: 340px">
      <TransitionGroup name="notif-toast" tag="div" class="flex flex-col items-end gap-2.5">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="notif-toast-card group pointer-events-auto relative w-[320px] overflow-hidden flex items-start gap-3 pl-3.5 pr-3 py-3 rounded-2xl border shadow-[0_18px_44px_rgba(0,0,0,0.35)] cursor-pointer transition-all duration-200 backdrop-blur-xl bg-linear-to-br/srgb from-white/8 via-brand-card/95 to-brand-card/90"
          :class="t.type === 'automod_warn'
            ? 'border-amber-400/35 hover:border-amber-300/50 shadow-[0_18px_44px_rgba(245,158,11,0.18)]'
            : 'border-brand-border/80 hover:border-brand-accent/40'"
          @click="onClick(t)"
        >
          <!-- Accent stripe in the notification type's colour -->
          <span class="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" :class="notifBadgeColor(t.type)" />

          <!-- Avatar + type badge -->
          <div class="relative shrink-0 mt-0.5">
            <img
              :src="t.senderAvatar || '/icons/badges/NN.jpg'"
              class="w-10 h-10 rounded-full object-cover ring-2 ring-brand-card/80 shadow-lg"
              @error="onAvatarError"
            />
            <div
              class="absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full ring-2 ring-brand-card flex items-center justify-center text-white shadow-xs"
              :class="notifBadgeColor(t.type)"
            >
              <BIcon :name="notifBadgeIcon(t.type)" class="w-3 h-3" />
            </div>
          </div>

          <!-- Text -->
          <div class="min-w-0 flex-1 pt-0.5">
            <p class="text-[13px] font-extrabold text-white leading-tight truncate">{{ t.senderName }}</p>
            <p class="text-[13px] text-white/70 leading-snug mt-0.5 line-clamp-2 wrap-break-word">{{ t.message }}</p>
          </div>

          <!-- Close -->
          <button
            class="shrink-0 -mt-1 -mr-0.5 p-1 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Закрыть"
            @click.stop="remove(t.id)"
          >
            <BIcon name="X" class="w-3.5 h-3.5" />
          </button>

          <!-- Lifetime bar -->
          <span class="notif-toast-progress absolute left-0 bottom-0 h-[2px] w-full origin-left bg-linear-to-r/srgb from-brand-accent via-white/80 to-white/40" />
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.notif-toast-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.notif-toast-leave-active {
  transition: all 0.25s ease-in;
}
.notif-toast-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.92);
}
.notif-toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.92);
}

.notif-toast-progress {
  animation: notif-toast-drain 5s linear forwards;
}
.notif-toast-card:hover .notif-toast-progress {
  animation-play-state: paused;
}
@keyframes notif-toast-drain {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}
</style>
