<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito overflow-hidden">
    <AppHeader />

    <div class="max-w-[1680px] mx-auto flex pt-14 md:pt-24 px-0 md:px-3 lg:px-4 gap-0 md:gap-4">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-0 md:pb-4">
        <div
          class="msgs-shell relative flex overflow-hidden h-[calc(100dvh-3.5rem-62px)] md:h-[calc(100dvh-7.25rem)] md:rounded-[28px] md:border md:border-white/[0.07] md:shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        >
          <div class="pointer-events-none absolute inset-0 msgs-glow" aria-hidden="true" />

          <!-- ── Left panel: conversation list ──────────────────────────── -->
          <div :class="[
            'relative z-10 flex-col overflow-hidden transition-all duration-200',
            'w-full sm:w-[300px] md:w-[340px] xl:w-[380px] shrink-0',
            'bg-brand-card/90 backdrop-blur-xl border-r border-white/6',
            activeConvId ? 'hidden sm:flex' : 'flex',
          ]">
            <div class="flex items-center justify-between px-4 py-3.5 shrink-0">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-2xl bg-linear-to-br/srgb from-brand-accent to-brand-purple/80 flex items-center justify-center shadow-lg shadow-brand-accent/25">
                  <BIcon name="MessageCircle" class="w-4 h-4 text-white" />
                </div>
                <div class="min-w-0">
                  <h2 class="font-extrabold text-white text-[15px] leading-tight truncate">{{ langStore.t.messagesPageTitle }}</h2>
                  <p v-if="inboxSubtitle" class="text-[11px] text-brand-accent font-semibold truncate">
                    {{ inboxSubtitle }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <button
                  @click="showNewDm = true"
                  class="p-2 rounded-xl bg-brand-accent/15 text-brand-accent hover:bg-brand-accent hover:text-white transition-all active:scale-95"
                  :title="langStore.t.newConvBtn"
                >
                  <BIcon name="SquarePen" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <BirthdayBanner @message="startDm" />

            <ConversationList
              :active-id="store.activeId"
              :hide-header="true"
              conv-filter="all"
              @select="onSelectConversation"
              @new-conversation="showNewDm = true"
            />
          </div>

          <!-- ── Right panel: chat window or empty state ─────────────────── -->
          <div :class="[
            'relative z-10 flex-1 min-w-0 flex flex-col overflow-hidden',
            !activeConvId && 'hidden sm:flex',
          ]">
            <ChatWindow
              v-if="canShowChatWindow"
              :conv-id="activeConvId!"
              :other="activeOther"
              :conv="activeConv"
              @back="closeChat"
              @archived="closeChat"
            />

            <div
              v-else
              class="flex-1 flex flex-col items-center justify-center gap-6 text-center p-10 msgs-empty"
            >
              <div class="relative">
                <div class="absolute inset-0 blur-2xl bg-brand-accent/25 rounded-full scale-125" />
                <div class="relative w-28 h-28 rounded-[32px] bg-brand-card/80 border border-white/10 flex items-center justify-center shadow-2xl">
                  <BIcon name="MessageCircle" class="w-14 h-14 text-brand-accent" />
                </div>
                <div class="absolute -bottom-1 -right-1 w-9 h-9 rounded-2xl bg-linear-to-br/srgb from-brand-accent to-brand-purple flex items-center justify-center shadow-lg">
                  <BIcon name="Sparkles" class="w-4 h-4 text-white" />
                </div>
              </div>
              <div>
                <h2 class="text-2xl font-extrabold text-white mb-2 tracking-tight">{{ langStore.t.msgsEmptyTitle }}</h2>
                <p class="text-white/50 text-sm max-w-sm leading-relaxed">
                  {{ langStore.t.msgsEmptyHint }}
                </p>
              </div>
              <div class="flex flex-wrap items-center justify-center gap-2">
                <button
                  @click="showNewDm = true"
                  class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold transition-all shadow-lg shadow-brand-accent/25 active:scale-95"
                >
                  <BIcon name="SquarePen" class="w-4 h-4" />
                  {{ langStore.t.writeMsgBtn }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- ── New DM modal ───────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNewDm"
          class="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          @click.self="closeNewDm"
        >
          <div class="bg-brand-card border border-white/10 rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden">
            <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/6">
              <div class="w-9 h-9 rounded-2xl bg-linear-to-br/srgb from-brand-accent/30 to-brand-purple/20 border border-brand-accent/20 flex items-center justify-center shrink-0">
                <BIcon name="SquarePen" class="w-4 h-4 text-brand-accent" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-bold text-white text-sm">{{ langStore.t.newDmTitle }}</h3>
                <p class="text-[11px] text-white/45">{{ langStore.t.newDmSubtitle }}</p>
              </div>
              <button
                @click="closeNewDm"
                class="p-1.5 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-all"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <div class="p-4">
              <div class="flex items-center gap-2 bg-brand-bg border border-white/8 rounded-2xl px-4 py-2.5 mb-3 focus-within:border-brand-accent/60 transition-colors">
                <BIcon name="Search" class="w-4 h-4 text-white/45 shrink-0" />
                <input
                  v-model="dmSearch"
                  type="text"
                  :placeholder="langStore.t.dmSearchPlaceholder"
                  class="bg-transparent text-sm text-white placeholder-brand-muted outline-hidden flex-1"
                  @input="onDmSearch"
                  autofocus
                />
                <BIcon v-if="dmLoading" name="Loader2" class="w-4 h-4 text-white/45 animate-spin shrink-0" />
              </div>

              <div class="max-h-72 overflow-y-auto stack-y-0.5">
                <div v-if="!dmResults.length && dmSearch && !dmLoading" class="text-center text-white/45 text-sm py-8">
                  <BIcon name="UserX" class="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {{ langStore.t.dmNoResults }}
                </div>

                <template v-else-if="!dmSearch">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-white/30 px-2 py-1.5">
                    {{ langStore.t.dmFriendsHint }}
                  </p>
                  <div v-if="friendsStore.isLoading && !quickDmPeople.length" class="flex justify-center py-8">
                    <BIcon name="Loader2" class="w-5 h-5 text-white/40 animate-spin" />
                  </div>
                  <div v-else-if="!quickDmPeople.length" class="text-center text-white/40 text-xs py-6 px-4">
                    {{ langStore.t.dmStartTypingHint }}
                  </div>
                  <button
                    v-for="u in quickDmPeople"
                    :key="u.id"
                    @click="startDm(u.id)"
                    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-bg transition-colors text-left group"
                  >
                    <div class="relative shrink-0">
                      <img
                        v-if="u.avatar_url"
                        :src="u.avatar_url"
                        :alt="u.username"
                        class="w-10 h-10 rounded-full object-cover ring-2 ring-white/8 group-hover:ring-brand-accent/40 transition-all"
                      />
                      <div
                        v-else
                        class="w-10 h-10 rounded-full bg-brand-accent/20 ring-2 ring-white/8 flex items-center justify-center text-brand-accent font-bold text-sm group-hover:ring-brand-accent/40 transition-all"
                      >
                        {{ (u.display_name || u.username)[0].toUpperCase() }}
                      </div>
                      <span
                        v-if="u.online"
                        class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-brand-success border-2 border-brand-card"
                      />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-white truncate">{{ u.display_name || u.username }}</p>
                      <p class="text-xs truncate" :class="u.online ? 'text-brand-success' : 'text-white/40'">
                        {{ u.online ? langStore.t.onlineStatus : '@' + u.username }}
                      </p>
                    </div>
                    <BIcon name="MessageCircle" class="w-4 h-4 text-brand-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                </template>

                <button
                  v-for="u in dmResults"
                  :key="u.id"
                  @click="startDm(u.id)"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-bg transition-colors text-left group"
                >
                  <div class="relative shrink-0">
                    <img
                      v-if="u.avatar_url"
                      :src="u.avatar_url"
                      :alt="u.username"
                      class="w-10 h-10 rounded-full object-cover ring-2 ring-white/8 group-hover:ring-brand-accent/40 transition-all"
                    />
                    <div
                      v-else
                      class="w-10 h-10 rounded-full bg-brand-accent/20 ring-2 ring-white/8 flex items-center justify-center text-brand-accent font-bold text-sm group-hover:ring-brand-accent/40 transition-all"
                    >
                      {{ (u.display_name || u.username)[0].toUpperCase() }}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-white truncate">{{ u.display_name || u.username }}</p>
                    <p class="text-xs text-white/40 truncate">@{{ u.username }}</p>
                  </div>
                  <BIcon name="MessageCircle" class="w-4 h-4 text-brand-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import BIcon from '@/components/BIcon.vue'
import ConversationList from '@/components/ConversationList.vue'
import BirthdayBanner from '@/components/BirthdayBanner.vue'
import ChatWindow from '@/components/ChatWindow.vue'
import { useMessagesStore, type MsgSender } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import api from '@/api'

const store  = useMessagesStore()
const auth   = useAuthStore()
const friendsStore = useFriendsStore()
const route  = useRoute()
const router = useRouter()

const showNewDm  = ref(false)
const dmSearch   = ref('')
const dmLoading  = ref(false)
const dmResults  = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])

let dmSearchTimer: ReturnType<typeof setTimeout> | null = null
let syncingUrl = false

const activeConvId = computed(() => store.activeId)

const activeConv = computed(() =>
  store.conversations.find((c) => c.id === activeConvId.value)
)

const activeOther = computed<MsgSender | undefined>(() => {
  if (!activeConvId.value) return undefined
  const c = activeConv.value
  if (c?.type === 'community' && c.group_dm_user_id) {
    if (c.group_dm_user_id === auth.user?.id) {
      return { id: c.group_id ?? c.id, username: c.name ?? 'Группа', display_name: c.name, avatar_url: c.avatar_url } as MsgSender
    }
    return c.other_participants?.[0]?.user
  }
  return c?.other_participants?.[0]?.user
})

const canShowChatWindow = computed(() => !!activeConvId.value)

const inboxSubtitle = computed(() => {
  const n = (store.unreadCount || 0) + (store.groupUnreadCount || 0)
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
})

const quickDmPeople = computed(() => {
  const list = [...friendsStore.friends]
  list.sort((a, b) => Number(b.online) - Number(a.online))
  return list.slice(0, 12)
})

function closeNewDm() {
  showNewDm.value = false
  dmSearch.value = ''
  dmResults.value = []
}

function closeChat() {
  store.closeConversation()
  syncUrl(null)
}

function syncUrl(convId: string | null) {
  const current = (route.query.c as string | undefined) || undefined
  const next = convId || undefined
  if (current === next) return
  syncingUrl = true
  router.replace({ name: 'messages', query: next ? { c: next } : {} }).finally(() => {
    syncingUrl = false
  })
}

onMounted(async () => {
  store.startListening()
  await store.fetchConversations()

  const targetUser = route.query.userId as string | undefined
  if (targetUser) {
    try {
      const convId = await store.openConversation(targetUser)
      await store.selectConversation(convId)
      syncUrl(convId)
    } catch { /* blocked / deleted */ }
    return
  }

  const fromQuery = route.query.c as string | undefined
  if (fromQuery) {
    try {
      await store.selectConversation(fromQuery)
    } catch {
      syncUrl(null)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  // Вышли из раздела — чат больше не «открыт»: иначе новые сообщения не попадают в счётчик
  // и сразу помечаются прочитанными, пока пользователь на другой странице.
  store.closeConversation()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (showNewDm.value) {
      closeNewDm()
      return
    }
    if (store.activeId) closeChat()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

watch(activeConvId, async (id) => {
  if (id && !store.messages[id]) {
    try {
      await store.fetchMessages(id)
    } catch {
      // selectConversation() already resets the active chat on a failed load
    }
  }
  if (!syncingUrl && !route.query.userId) syncUrl(id)
}, { immediate: true })

watch(showNewDm, (open) => {
  if (open && !friendsStore.friends.length) friendsStore.loadFriends()
})

async function onSelectConversation(id: string) {
  await store.selectConversation(id)
  syncUrl(id)
}

function onDmSearch() {
  if (dmSearchTimer) clearTimeout(dmSearchTimer)
  if (!dmSearch.value.trim()) { dmResults.value = []; return }
  dmSearchTimer = setTimeout(searchUsers, 280)
}

async function searchUsers() {
  dmLoading.value = true
  try {
    const res = await api.get('/users/search', { params: { q: dmSearch.value, limit: 10 } })
    dmResults.value = (res.data.data?.users ?? []).filter((u: any) => u.id !== auth.user?.id)
  } catch {
    dmResults.value = []
  } finally {
    dmLoading.value = false
  }
}

async function startDm(userId: string) {
  closeNewDm()
  try {
    const id = await store.openConversation(userId)
    await store.selectConversation(id)
    syncUrl(id)
  } catch { /* silent */ }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.msgs-shell {
  background: linear-gradient(180deg, rgba(31, 34, 60, 0.96) 0%, #16192F 42%);
}

.msgs-glow {
  background:
    radial-gradient(ellipse 80% 50% at 0% 0%, rgba(76, 103, 207, 0.18), transparent 55%),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(205, 131, 245, 0.1), transparent 50%);
}

.msgs-empty {
  background:
    radial-gradient(ellipse 50% 40% at 50% 40%, rgba(76, 103, 207, 0.14), transparent 70%),
    #16192F;
}
</style>
