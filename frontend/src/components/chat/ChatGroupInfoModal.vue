<template>
<!-- ── Group Info Modal (centered — same shell as the DM info / edit-group modals) ── -->
<Teleport to="body">
  <Transition name="fade">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="emit('close')">
      <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:90vh">

        <!-- Cover (colored banner behind avatar + name, plain card bg for the action row) -->
        <div class="relative flex-shrink-0">
          <div class="relative pt-4 pb-5 px-3 text-center overflow-hidden bg-gradient-to-br from-brand-accent/30 to-purple-900/40">
            <img v-if="conv?.banner_url" :src="conv.banner_url" class="absolute inset-0 w-full h-full object-cover" />
            <div v-else-if="bannerCollage.length" class="absolute inset-0 flex">
              <div v-for="m in bannerCollage" :key="m.id" class="flex-1 h-full relative">
                <img v-if="m.avatar_url" :src="m.avatar_url" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold text-lg">
                  {{ (m.display_name || m.username || '?')[0].toUpperCase() }}
                </div>
              </div>
            </div>
            <!-- Darken for legibility of the close/settings buttons, avatar ring and text -->
            <div v-if="conv?.banner_url || bannerCollage.length" class="absolute inset-0 bg-black/30" />

            <!-- Close button -->
            <button @click="emit('close')"
              class="absolute top-3 left-3 w-8 h-8 rounded-xl bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
            <!-- Settings (admin only) -->
            <button v-if="myRole === 'admin'" @click="emit('edit-group')"
              class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-all">
              <BIcon name="Settings" class="w-4 h-4" />
            </button>
            <!-- Avatar -->
            <div class="relative w-20 h-20 rounded-2xl overflow-hidden shadow-xl mx-auto ring-2 ring-white/20">
              <img v-if="conv?.avatar_url" :src="conv.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
              <div v-else-if="bannerCollage.length" class="w-full h-full grid grid-cols-2">
                <div v-for="m in bannerCollage.slice(0, 4)" :key="m.id" class="relative">
                  <img v-if="m.avatar_url" :src="m.avatar_url" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold">
                    {{ (m.display_name || m.username || '?')[0].toUpperCase() }}
                  </div>
                </div>
              </div>
              <div v-else class="w-full h-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-2xl">
                {{ (conv?.name ?? 'G')[0].toUpperCase() }}
              </div>
            </div>
            <h3 class="relative text-base font-bold text-white truncate mt-2.5 drop-shadow">{{ conv?.name || langStore.t.chatGroupFallbackName }}</h3>
            <p class="relative text-xs text-white/70 mt-0.5 drop-shadow">{{ groupMembers.length }} {{ langStore.t.membersUnit }}</p>
          </div>

          <!-- Action row (plain card background) -->
          <div class="flex justify-center gap-2 px-3 py-3">
            <button v-if="conv?.group_id" @click="emit('invite')"
              class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg text-white/60 hover:text-brand-accent hover:bg-brand-accent/10 transition-all text-xs font-semibold">
              <BIcon name="Send" class="w-4 h-4" />
              {{ langStore.t.chatInviteAction }}
            </button>
            <button v-if="myRole === 'admin'" @click="showAddMember = !showAddMember; addMemberSearch = ''; addMemberResults = []"
              :class="['flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all text-xs font-semibold',
                showAddMember ? 'bg-brand-accent/20 text-brand-accent' : 'bg-brand-bg text-white/60 hover:text-brand-accent hover:bg-brand-accent/10']">
              <BIcon name="UserPlus" class="w-4 h-4" />
              {{ langStore.t.addButton }}
            </button>
            <button @click="goToGroup()"
              class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg text-white/60 hover:text-brand-accent hover:bg-brand-accent/10 transition-all text-xs font-semibold">
              <BIcon name="Users2" class="w-4 h-4" />
              {{ langStore.t.contextGoToGroup }}
            </button>
            <button @click="emit('archive')"
              class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg text-white/60 hover:text-white/90 hover:bg-brand-bg/80 transition-all text-xs font-semibold">
              <BIcon :name="conv?.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4" />
              {{ conv?.my_participant?.archived ? langStore.t.chatUnarchiveShort : langStore.t.archiveBtn }}
            </button>
          </div>
        </div>

        <!-- Group link (real page, not a fake invite link) -->
        <div v-if="conv?.group_id" class="flex items-center gap-2 px-4 py-2.5 border-t border-b border-brand-border flex-shrink-0">
          <BIcon name="Link" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
          <span class="flex-1 min-w-0 text-xs text-brand-accent truncate cursor-pointer hover:underline" @click="goToGroup()">
            {{ groupPageUrl }}
          </span>
          <button @click="copyGroupLink" class="flex-shrink-0 text-white/40 hover:text-white transition-colors" :title="langStore.t.exportCopyLink">
            <BIcon :name="groupLinkCopied ? 'Check' : 'Copy'" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Scrollable body: media list → participants header → search → member list (one continuous flow, no tabs) -->
        <div class="flex-1 overflow-y-auto min-h-0">

          <ChatMediaStatsList :stats="mediaStats" :loading="mediaStatsLoading" row-class="px-4" @open="emit('open-media', $event)" />

          <!-- Participants header -->
          <div class="flex items-center gap-2 px-4 py-3 mt-1 border-t border-brand-border">
            <BIcon name="Users" class="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
            <span class="text-xs font-bold text-white/50 uppercase tracking-wide">
              {{ groupMembers.length }} {{ langStore.t.membersUnit }}{{ groupOnlineCount ? `, ${groupOnlineCount} ${langStore.t.chatOnlineNow}` : '' }}
            </span>
          </div>

          <!-- Member search -->
          <div class="px-3 pb-2">
            <div class="flex items-center gap-2 bg-brand-bg rounded-2xl px-3 py-2">
              <BIcon name="Search" class="w-3.5 h-3.5 text-white/35 flex-shrink-0" />
              <input
                v-model="memberSearchQuery"
                type="text"
                :placeholder="langStore.t.chatSearchMembersPlaceholder"
                class="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none" />
              <button v-if="memberSearchQuery" @click="memberSearchQuery = ''" class="text-white/30 hover:text-white">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Add member (admin only) -->
          <button v-if="myRole === 'admin' && !showAddMember" @click="showAddMember = true; addMemberSearch = ''; addMemberResults = []"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-brand-accent hover:bg-brand-bg/40 transition-colors text-left text-sm font-semibold">
            <BIcon name="UserPlus" class="w-4 h-4 flex-shrink-0" />
            {{ langStore.t.chatAddMembersAction }}
          </button>

          <!-- Add member search panel (admin only) -->
          <Transition name="fade">
            <div v-if="showAddMember && myRole === 'admin'" class="px-3 pt-1 pb-2 border-b border-brand-border/60">
              <div class="flex items-center gap-2 bg-brand-bg rounded-2xl px-3 py-2">
                <BIcon name="Search" class="w-3.5 h-3.5 text-white/35 flex-shrink-0" />
                <input
                  v-model="addMemberSearch"
                  @input="debouncedAddMemberSearch"
                  type="text"
                  :placeholder="langStore.t.chatSearchUsersPlaceholder"
                  class="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
                  autofocus />
                <button @click="showAddMember = false; addMemberSearch = ''; addMemberResults = []" class="text-white/30 hover:text-white">
                  <BIcon name="X" class="w-3.5 h-3.5" />
                </button>
              </div>
              <!-- Search results -->
              <div v-if="addMemberResults.length" class="mt-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                <button
                  v-for="u in addMemberResults" :key="u.id"
                  @click="doAddMember(u)"
                  :disabled="groupMembers.some(m => m.user_id === u.id)"
                  :class="['w-full flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors text-left',
                    groupMembers.some(m => m.user_id === u.id)
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-brand-accent/10 cursor-pointer']"
                >
                  <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover flex-shrink-0" @error="onAvatarError" />
                  <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
                    {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-white font-medium truncate">{{ u.display_name || u.username }}</p>
                    <p class="text-[11px] text-white/40 truncate">@{{ u.username }}</p>
                  </div>
                  <BIcon
                    :name="groupMembers.some(m => m.user_id === u.id) ? 'Check' : 'UserPlus'"
                    :class="['w-3.5 h-3.5 flex-shrink-0', groupMembers.some(m => m.user_id === u.id) ? 'text-brand-accent' : 'text-white/40']" />
                </button>
              </div>
              <p v-else-if="addMemberSearch.length >= 2 && !addMemberLoading" class="text-center text-xs text-white/30 py-3">{{ langStore.t.chatNoOneFound }}</p>
              <p v-if="addMemberLoading" class="flex justify-center py-2">
                <BIcon name="Loader2" class="w-4 h-4 animate-spin text-white/40" />
              </p>
            </div>
          </Transition>

          <!-- Member list -->
          <p v-if="membersLoading" class="flex items-center justify-center py-8 text-white/55 text-sm gap-2">
            <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
          </p>
          <p v-else-if="!filteredGroupMembers.length" class="text-center text-xs text-white/30 py-6">{{ langStore.t.chatNoOneFound }}</p>
          <router-link v-for="m in filteredGroupMembers" :key="m.user_id" :to="`/profile/${m.user?.username}`" class="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-bg/40 transition-colors cursor-pointer">
            <div class="relative flex-shrink-0">
              <img v-if="m.user?.avatar_url" :src="m.user.avatar_url" class="w-8 h-8 rounded-full object-cover" @error="onAvatarError" />
              <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold">
                {{ (m.user?.display_name || m.user?.username || '?')[0].toUpperCase() }}
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-white font-medium truncate leading-tight">{{ m.user?.display_name || m.user?.username }}</p>
              <p class="text-xs truncate" :class="groupOnlineStatus[m.user_id] ? 'text-green-400' : 'text-white/45'">
                {{ groupOnlineStatus[m.user_id] ? langStore.t.chatOnlineNow : `@${m.user?.username}` }}
              </p>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span v-if="m.role === 'admin'" class="text-[9px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full border border-brand-accent/25 font-bold">{{ langStore.t.chatAdminBadge }}</span>
              <template v-if="myRole === 'admin' && m.user_id !== auth.user?.id">
                <button @click.stop="kickMember(m.user_id)" class="p-1 rounded-lg text-white/40 hover:text-brand-error transition-colors" :title="langStore.t.chatKickMemberTitle">
                  <BIcon name="UserX" class="w-3.5 h-3.5" />
                </button>
                <button @click.stop="toggleMemberRole(m)" class="p-1 rounded-lg text-white/40 hover:text-brand-accent transition-colors" :title="m.role === 'admin' ? langStore.t.chatDemoteAdminTitle : langStore.t.chatPromoteAdminTitle">
                  <BIcon :name="m.role === 'admin' ? 'ShieldOff' : 'ShieldCheck'" class="w-3.5 h-3.5" />
                </button>
              </template>
            </div>
          </router-link>
        </div>
      </div>
    </div>
  </Transition>
</Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import type { Conversation } from '@/stores/messages'
import BIcon from '@/components/BIcon.vue'
import ChatMediaStatsList, { type MediaStat } from '@/components/chat/ChatMediaStatsList.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useCopyFeedback } from '@/composables/useCopyFeedback'
import type { useGroupChatManagement } from '@/composables/chat/useGroupChatManagement'

/** Group chat info: cover, quick actions, group link, media counters and the member list. */
const props = defineProps<{
  open: boolean
  conv?: Conversation
  myRole: string
  /** Shared with ChatWindow (header + edit-group modal use the same member list). */
  group: ReturnType<typeof useGroupChatManagement>
  mediaStats: MediaStat[]
  mediaStatsLoading: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit-group'): void
  (e: 'invite'): void
  (e: 'archive'): void
  (e: 'open-media', type: string): void
}>()

const auth = useAuthStore()
const langStore = useLangStore()
const router = useRouter()

const {
  groupMembers, membersLoading, bannerCollage, memberSearchQuery, filteredGroupMembers,
  groupOnlineStatus, groupOnlineCount, kickMember, toggleMemberRole,
  showAddMember, addMemberSearch, addMemberResults, addMemberLoading, debouncedAddMemberSearch, doAddMember,
} = props.group

// Group page link (real URL — not a fake VK-style invite link)
const groupPageUrl = computed(() => props.conv?.group_id ? `${location.host}/groups/${props.conv.group_id}` : '')
const { copied: groupLinkCopied, copy } = useCopyFeedback()
function copyGroupLink() {
  if (props.conv?.group_id) copy(`${location.origin}/groups/${props.conv.group_id}`)
}

function goToGroup() {
  if (props.conv?.group_id) router.push(`/groups/${props.conv.group_id}`)
  emit('close')
}
</script>
