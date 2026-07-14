<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-14 md:pt-24 px-0 md:px-4 gap-4 md:gap-8">
      <!-- Left navigation sidebar (same as every other page) -->
      <AppSidebar />

      <!-- ── Main content ──────────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-24 md:pb-6">

        <!-- Chat card — two-panel layout inside a rounded card -->
        <div
          class="flex bg-brand-card border border-brand-border rounded-none sm:rounded-3xl overflow-hidden shadow-xl h-[calc(100dvh-3.5rem-62px)] md:h-[calc(100dvh-8rem)]"
        >

          <!-- ── Left panel: conversation list ──────────────────────────── -->
          <div :class="[
            'flex-col border-r border-brand-border overflow-hidden transition-all duration-200',
            'w-full sm:w-72 md:w-80 flex-shrink-0',
            activeConvId ? 'hidden sm:flex' : 'flex',
          ]">

            <!-- Panel header -->
            <div class="flex items-center justify-between px-4 py-3.5 border-b border-brand-border flex-shrink-0 bg-brand-card/80">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-xl bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center">
                  <BIcon name="MessageCircle" class="w-3.5 h-3.5 text-brand-accent" />
                </div>
                <h2 class="font-bold text-white text-sm">{{ langStore.t.messagesPageTitle }}</h2>
                <span
                  v-if="store.unreadCount > 0"
                  class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-accent text-white text-[10px] font-bold"
                >
                  {{ store.unreadCount > 99 ? '99+' : store.unreadCount }}
                </span>
              </div>
              <button
                @click="showNewDm = true"
                class="p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-brand-accent transition-all"
                :title="langStore.t.newConvBtn"
              >
                <BIcon name="SquarePen" class="w-4 h-4" />
              </button>
            </div>

            <!-- Conversations list — tabs (Личные/Беседы/Группы) are ConversationList's own built-in category switcher -->
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
            'flex-1 min-w-0 flex flex-col overflow-hidden',
            !activeConvId && 'hidden sm:flex',
          ]">
            <ChatWindow
              v-if="canShowChatWindow"
              :conv-id="activeConvId!"
              :other="activeOther"
              :conv="activeConv"
              @back="store.closeConversation()"
              @archived="store.closeConversation()"
            />

            <!-- Empty state — no conversation selected -->
            <div
              v-else
              class="flex-1 flex flex-col items-center justify-center gap-5 text-center p-10 bg-brand-bg"
            >
              <div class="relative">
                <div class="w-24 h-24 rounded-3xl bg-brand-card border border-brand-border flex items-center justify-center shadow-xl">
                  <BIcon name="MessageCircle" class="w-12 h-12 text-brand-accent/60" />
                </div>
                <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/30">
                  <BIcon name="Sparkles" class="w-4 h-4 text-white" />
                </div>
              </div>
              <div>
                <h2 class="text-xl font-bold text-white mb-1.5">{{ langStore.t.msgsEmptyTitle }}</h2>
                <p class="text-white/55 text-sm max-w-xs">
                  {{ langStore.t.msgsEmptyHint }}
                </p>
              </div>
              <button
                @click="showNewDm = true"
                class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-semibold transition-all shadow-lg shadow-brand-accent/20 active:scale-95"
              >
                <BIcon name="SquarePen" class="w-4 h-4" />
                {{ langStore.t.writeMsgBtn }}
              </button>
            </div>
          </div>

        </div><!-- /chat card -->
      </main>
    </div>

    <!-- ── New DM modal ───────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNewDm"
          class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          @click.self="showNewDm = false; dmSearch = ''; dmResults = []"
        >
          <div class="bg-brand-card border border-brand-border rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <!-- Header -->
            <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-brand-border">
              <div class="w-8 h-8 rounded-xl bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center flex-shrink-0">
                <BIcon name="SquarePen" class="w-4 h-4 text-brand-accent" />
              </div>
              <div class="flex-1">
                <h3 class="font-bold text-white text-sm">{{ langStore.t.newDmTitle }}</h3>
                <p class="text-[11px] text-white/55">{{ langStore.t.newDmSubtitle }}</p>
              </div>
              <button
                @click="showNewDm = false; dmSearch = ''; dmResults = []"
                class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-white/8 transition-all"
              >
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- User search -->
            <div class="p-4">
              <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 mb-3 focus-within:border-brand-accent/60 transition-colors">
                <BIcon name="Search" class="w-4 h-4 text-white/55 flex-shrink-0" />
                <input
                  v-model="dmSearch"
                  type="text"
                  :placeholder="langStore.t.dmSearchPlaceholder"
                  class="bg-transparent text-sm text-white placeholder-brand-muted outline-none flex-1"
                  @input="onDmSearch"
                  autofocus
                />
                <BIcon v-if="dmLoading" name="Loader2" class="w-4 h-4 text-white/55 animate-spin flex-shrink-0" />
              </div>

              <!-- Search results -->
              <div class="max-h-60 overflow-y-auto space-y-0.5">
                <div v-if="!dmResults.length && dmSearch && !dmLoading" class="text-center text-white/55 text-sm py-6">
                  <BIcon name="UserX" class="w-8 h-8 mx-auto mb-2 opacity-40" />
                  {{ langStore.t.dmNoResults }}
                </div>
                <div v-else-if="!dmSearch" class="text-center text-white/55 text-xs py-4 opacity-60">
                  {{ langStore.t.dmStartTypingHint }}
                </div>
                <button
                  v-for="u in dmResults"
                  :key="u.id"
                  @click="startDm(u.id)"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-bg transition-colors text-left group"
                >
                  <div class="relative flex-shrink-0">
                    <img
                      v-if="u.avatar_url"
                      :src="u.avatar_url"
                      :alt="u.username"
                      class="w-9 h-9 rounded-full object-cover border border-brand-border group-hover:border-brand-accent/40 transition-colors"
                    />
                    <div
                      v-else
                      class="w-9 h-9 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-sm group-hover:border-brand-accent/40 transition-colors"
                    >
                      {{ (u.display_name || u.username)[0].toUpperCase() }}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-white truncate">{{ u.display_name || u.username }}</p>
                    <p class="text-xs text-white/55 truncate">@{{ u.username }}</p>
                  </div>
                  <BIcon name="MessageCircle" class="w-4 h-4 text-brand-accent opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import BIcon from '@/components/BIcon.vue'
import ConversationList from '@/components/ConversationList.vue'
import ChatWindow from '@/components/ChatWindow.vue'
import { useMessagesStore, type MsgSender } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'

const store  = useMessagesStore()
const auth   = useAuthStore()
const route  = useRoute()
const router = useRouter()

const showNewDm  = ref(false)
const dmSearch   = ref('')
const dmLoading  = ref(false)
const dmResults  = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])

let dmSearchTimer: ReturnType<typeof setTimeout> | null = null

// ── Active conversation helpers ─────────────────────────────────────────────
 const activeConvId = computed(() => store.activeId)

const activeConv = computed(() =>
  store.conversations.find((c) => c.id === activeConvId.value)
)

const activeOther = computed<MsgSender | undefined>(() => {
  if (!activeConvId.value) return undefined
  return activeConv.value?.other_participants?.[0]?.user
})

// Show chat window for any active conversation (group, DM, notes)
const canShowChatWindow = computed(() => !!activeConvId.value)

// ── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  store.startListening()
  await store.fetchConversations()

  // Support ?userId=xxx deep link (e.g. "Send message" button on profile)
  const targetUser = route.query.userId as string | undefined
  if (targetUser) {
    try {
      const convId = await store.openConversation(targetUser)
      await store.selectConversation(convId)
    } catch { /* user blocked us, deleted account, etc. — just drop the deep link */ }
    router.replace({ name: 'messages' })
  }
})

// Note: intentionally NOT calling store.stopListening() here — the WS subscription
// is shared app-wide (kept alive from AppHeader) so unread counts / conversation
// previews keep updating in real time after the user navigates away from this page.

watch(activeConvId, async (id) => {
  if (id && !store.messages[id]) {
    await store.fetchMessages(id)
    await store.markRead(id)
  }
}, { immediate: true })

// ── Conversation selection ──────────────────────────────────────────────────
async function onSelectConversation(id: string) {
  await store.selectConversation(id)
}

// ── New DM search ───────────────────────────────────────────────────────────
function onDmSearch() {
  if (dmSearchTimer) clearTimeout(dmSearchTimer)
  if (!dmSearch.value.trim()) { dmResults.value = []; return }
  dmSearchTimer = setTimeout(searchUsers, 350)
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
  showNewDm.value = false
  dmSearch.value  = ''
  dmResults.value = []
  try {
    const id = await store.openConversation(userId)
    await store.selectConversation(id)
  } catch { /* silent — e.g. blocked / messages disabled */ }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
