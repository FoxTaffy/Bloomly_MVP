<template>
<!-- ── DM Info Modal (centered) ──────────────────────────────────── -->
<Teleport to="body">
  <Transition name="fade">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="emit('close')">
      <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:90vh">
        <!-- Cover (colored banner behind avatar + name, plain card bg for the action row) -->
        <div class="relative flex-shrink-0">
          <div class="relative pt-4 pb-5 px-5 text-center overflow-hidden bg-gradient-to-br from-brand-accent/30 to-purple-900/40">
            <img v-if="other?.banner_url" :src="other.banner_url" class="absolute inset-0 w-full h-full object-cover" />
            <div v-if="other?.banner_url" class="absolute inset-0 bg-black/30" />

            <!-- Close button -->
            <button @click="emit('close')"
              class="absolute top-3 left-3 w-8 h-8 rounded-xl bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
            <!-- Avatar -->
            <div class="relative inline-block">
              <img v-if="other?.avatar_url" :src="other.avatar_url" :alt="other.username"
                class="w-20 h-20 rounded-full object-cover shadow-xl ring-2 ring-white/20" @error="onAvatarError" />
              <div v-else class="w-20 h-20 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-2xl shadow-xl ring-2 ring-white/20">
                {{ (other?.display_name || other?.username || '?')[0].toUpperCase() }}
              </div>
              <!-- Online dot -->
              <span v-if="online && !deviceIcon" class="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-brand-card" />
              <span v-else-if="online" :title="device ?? undefined"
                class="absolute bottom-1 right-1 w-4.5 h-4.5 bg-green-500 rounded-full border-2 border-brand-card flex items-center justify-center">
                <BIcon :name="deviceIcon!" class="w-2.5 h-2.5 text-black/70" />
              </span>
            </div>
            <h3 class="relative text-base font-bold text-white truncate mt-2.5 flex items-center justify-center gap-1.5 drop-shadow">
              {{ other?.display_name || other?.username }}
              <span v-if="other?.deceased_at" :title="langStore.t.chatRipTitle">🪦</span>
            </h3>
            <p class="relative text-xs mt-0.5 flex items-center justify-center gap-1 drop-shadow" :class="online ? 'text-green-400' : 'text-white/70'">
              {{ online ? langStore.t.chatOnlineBulleted : `● ${lastSeenLabel}` }}
              <BIcon v-if="online && deviceIcon" :name="deviceIcon!" class="w-3 h-3" :title="device ?? undefined" />
            </p>
          </div>

          <!-- Quick actions (plain card background) -->
          <div class="flex justify-center gap-2 px-5 py-3">
            <router-link :to="`/profile/${other?.username}`" @click="emit('close')"
              class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg hover:bg-brand-accent/10 text-white/60 hover:text-brand-accent transition-all text-xs font-semibold">
              <BIcon name="User" class="w-4 h-4" />
              {{ langStore.t.profile }}
            </router-link>
            <button v-if="!isGroupDm" @click="emit('archive')"
              class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg hover:bg-brand-bg/80 text-white/60 hover:text-white/90 transition-all text-xs font-semibold">
              <BIcon :name="conv?.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4" />
              {{ conv?.my_participant?.archived ? langStore.t.chatUnarchiveShort : langStore.t.archiveBtn }}
            </button>
            <button v-if="!isGroupDm" @click="emit('block')"
              :class="['flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all text-xs font-semibold',
                isBlocked ? 'bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/25' : 'bg-brand-bg text-white/60 hover:text-brand-error hover:bg-brand-error/10']">
              <BIcon :name="isBlocked ? 'ShieldOff' : 'ShieldAlert'" class="w-4 h-4" />
              {{ isBlocked ? langStore.t.chatUnblockShort : langStore.t.chatBlockShort }}
            </button>
          </div>
        </div>

        <!-- Username row (clicking anywhere in the row copies it, not just the icon) -->
        <div class="flex items-center gap-2 px-5 py-2.5 border-t border-b border-brand-border flex-shrink-0 cursor-pointer hover:bg-brand-bg/40 transition-colors"
          @click="copyUsername" :title="langStore.t.chatCopyTitle">
          <span class="text-brand-accent font-bold text-xs flex-shrink-0">@</span>
          <span class="flex-1 min-w-0 text-sm text-white/80 truncate">{{ other?.username }}</span>
          <button class="flex-shrink-0 text-white/40 hover:text-white transition-colors">
            <BIcon :name="usernameCopied ? 'Check' : 'Copy'" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Media stats list -->
        <div class="flex-1 overflow-y-auto min-h-0 py-1">
          <ChatMediaStatsList :stats="mediaStats" :loading="mediaStatsLoading" :empty-label="langStore.t.chatNoMediaLabel" row-class="px-5" @open="emit('open-media', $event)" />
        </div>

        <!-- Danger zone -->
        <div class="px-5 py-3 flex-shrink-0 border-t border-brand-border">
          <button @click="emit('delete')"
            class="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm text-brand-error hover:bg-brand-error/10 transition-colors font-medium">
            <BIcon name="Trash2" class="w-4 h-4" />
            {{ langStore.t.contextDeleteConv }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</Teleport>
</template>

<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
import type { Conversation, MsgSender } from '@/stores/messages'
import BIcon from '@/components/BIcon.vue'
import ChatMediaStatsList, { type MediaStat } from '@/components/chat/ChatMediaStatsList.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useCopyFeedback } from '@/composables/useCopyFeedback'

/** One-on-one chat info: partner card, presence, quick actions and media counters. */
const props = defineProps<{
  open: boolean
  conv?: Conversation
  other: MsgSender | undefined
  isGroupDm: boolean
  isBlocked: boolean
  online: boolean
  device: string | null
  deviceIcon: string | null
  lastSeenLabel: string
  mediaStats: MediaStat[]
  mediaStatsLoading: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'archive'): void
  (e: 'block'): void
  (e: 'delete'): void
  (e: 'open-media', type: string): void
}>()

const langStore = useLangStore()

// Clicking anywhere in the username row copies it
const { copied: usernameCopied, copy } = useCopyFeedback()
function copyUsername() {
  if (props.other?.username) copy(props.other.username)
}
</script>
