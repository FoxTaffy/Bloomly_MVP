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
                <h2 class="font-bold text-white text-sm">Сообщения</h2>
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
                title="Новый диалог"
              >
                <BIcon name="SquarePen" class="w-4 h-4" />
              </button>
            </div>

            <!-- Tab switcher: Личные / Группы -->
            <div class="flex gap-1 px-4 py-2 border-b border-brand-border flex-shrink-0">
              <button @click="chatTab = 'dm'"
                class="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all"
                :class="chatTab === 'dm' ? 'bg-brand-accent text-white' : 'text-white/50 hover:text-white hover:bg-white/5'">
                Личные
              </button>
              <button @click="chatTab = 'groups'; loadGroupList()"
                class="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all"
                :class="chatTab === 'groups' ? 'bg-brand-accent text-white' : 'text-white/50 hover:text-white hover:bg-white/5'">
                Группы
              </button>
            </div>

            <!-- DM conversations list -->
            <ConversationList
              v-if="chatTab === 'dm'"
              :active-id="store.activeId"
              :hide-header="true"
              @select="onSelectConversation"
              @new-conversation="showNewDm = true"
            />

            <!-- Group chat list -->
            <div v-else class="flex-1 overflow-y-auto">
              <div v-if="groupListLoading" class="flex items-center justify-center py-10">
                <div class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
              </div>
              <template v-else>
                <!-- Private group chats (created via "Создать группу") -->
                <template v-if="privateGroupConvs.length">
                  <div class="px-4 py-2 text-[10px] font-bold text-white/30 uppercase tracking-wider">Беседы</div>
                  <button v-for="conv in privateGroupConvs" :key="conv.id"
                    @click="openPrivateGroupConv(conv.id)"
                    class="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-bg transition-colors text-left"
                    :class="activeConvId === conv.id ? 'bg-brand-bg border-r-2 border-brand-accent' : ''">
                    <div class="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-brand-accent/20 flex items-center justify-center">
                      <img v-if="conv.avatar_url" :src="conv.avatar_url" class="w-full h-full object-cover" />
                      <BIcon v-else name="MessagesSquare" class="w-5 h-5 text-brand-accent/60" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-white truncate">{{ conv.name || 'Беседа' }}</p>
                      <p class="text-xs text-white/40 truncate">{{ conv.other_participants.length + 1 }} участника(-ов)</p>
                    </div>
                  </button>
                </template>

                <!-- Community groups -->
                <template v-if="groupMemberships.length">
                  <div class="px-4 py-2 text-[10px] font-bold text-white/30 uppercase tracking-wider">Сообщества</div>
                  <button v-for="m in groupMemberships" :key="m.group_id"
                    @click="openGroupChat(m.group_id, m.group.name, m.group.avatar_url)"
                    class="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-bg transition-colors text-left"
                    :class="activeGroupId === m.group_id ? 'bg-brand-bg border-r-2 border-brand-accent' : ''">
                    <div class="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-brand-accent/20 flex items-center justify-center">
                      <img v-if="m.group.avatar_url" :src="m.group.avatar_url" class="w-full h-full object-cover" />
                      <BIcon v-else name="Users" class="w-5 h-5 text-brand-accent/60" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-white truncate">{{ m.group.name }}</p>
                      <p class="text-xs text-white/40 truncate">@{{ m.group.slug }}</p>
                    </div>
                  </button>
                </template>

                <!-- Empty state -->
                <div v-if="!privateGroupConvs.length && !groupMemberships.length" class="flex flex-col items-center justify-center py-10 gap-3 text-center px-6">
                  <BIcon name="Users" class="w-10 h-10 text-white/20" />
                  <p class="text-sm text-white/40">У вас нет групп и бесед</p>
                </div>
              </template>
            </div>
          </div>

          <!-- ── Right panel: chat window or empty state ─────────────────── -->
          <div :class="[
            'flex-1 min-w-0 flex flex-col overflow-hidden',
            !activeConvId && !activeGroupId && 'hidden sm:flex',
          ]">
            <ChatWindow
              v-if="canShowChatWindow && chatTab === 'dm'"
              :conv-id="activeConvId!"
              :other="activeOther"
              :conv="activeConv"
              @back="store.closeConversation()"
              @archived="store.closeConversation()"
            />

            <!-- Group chat window -->
            <div v-else-if="activeGroupId && chatTab === 'groups'" class="flex flex-col flex-1 min-h-0">
              <!-- Group chat header -->
              <div class="flex items-center gap-3 px-4 py-3 border-b border-brand-border flex-shrink-0">
                <button @click="activeGroupId = null" class="p-1.5 rounded-xl hover:bg-white/10 sm:hidden">
                  <BIcon name="ArrowLeft" class="w-4 h-4" />
                </button>
                <div class="w-8 h-8 rounded-xl overflow-hidden bg-brand-accent/20 flex items-center justify-center flex-shrink-0">
                  <img v-if="activeGroupAvatar" :src="activeGroupAvatar" class="w-full h-full object-cover" />
                  <BIcon v-else name="Users" class="w-4 h-4 text-brand-accent/60" />
                </div>
                <span class="font-bold text-sm text-white">{{ activeGroupName }}</span>
              </div>
              <!-- Messages -->
              <div ref="groupMsgContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                <div v-if="groupMsgLoading" class="flex justify-center py-6">
                  <div class="w-5 h-5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div v-for="msg in groupMessages" :key="msg.id"
                  class="flex items-start gap-2"
                  :class="msg.user_id === auth.user?.id ? 'flex-row-reverse' : ''">
                  <div class="w-7 h-7 rounded-full overflow-hidden bg-brand-accent/20 flex items-center justify-center flex-shrink-0">
                    <img v-if="msg.user.avatar_url" :src="msg.user.avatar_url" class="w-full h-full object-cover" />
                    <span v-else class="text-[10px] font-bold text-brand-accent">{{ (msg.user.display_name || msg.user.username)[0].toUpperCase() }}</span>
                  </div>
                  <div :class="msg.user_id === auth.user?.id ? 'items-end' : 'items-start'" class="flex flex-col gap-0.5">
                    <span class="text-[10px] text-white/40 px-1">{{ msg.user.display_name || msg.user.username }}</span>
                    <div class="max-w-[260px] px-3 py-2 rounded-2xl text-sm"
                      :class="msg.user_id === auth.user?.id ? 'bg-brand-accent text-white rounded-tr-sm' : 'bg-brand-card border border-brand-border text-white rounded-tl-sm'">
                      {{ msg.text }}
                    </div>
                  </div>
                </div>
              </div>
              <!-- Input -->
              <form @submit.prevent="sendGroupMsg" class="flex items-center gap-2 px-4 py-3 border-t border-brand-border flex-shrink-0">
                <input v-model="groupMsgInput" type="text" placeholder="Сообщение группе…"
                  class="flex-1 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-brand-accent/60 transition-colors" />
                <button type="submit" :disabled="!groupMsgInput.trim() || groupMsgSending"
                  class="p-2.5 rounded-2xl bg-brand-accent text-white disabled:opacity-40 transition-all hover:bg-brand-accent-plus active:scale-95">
                  <BIcon name="Send" class="w-4 h-4" />
                </button>
              </form>
            </div>

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
                <h2 class="text-xl font-bold text-white mb-1.5">Ваши сообщения</h2>
                <p class="text-white/55 text-sm max-w-xs">
                  Выберите диалог слева или начните новую переписку с кем-нибудь
                </p>
              </div>
              <button
                @click="showNewDm = true"
                class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-semibold transition-all shadow-lg shadow-brand-accent/20 active:scale-95"
              >
                <BIcon name="SquarePen" class="w-4 h-4" />
                Написать сообщение
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
                <h3 class="font-bold text-white text-sm">Новое сообщение</h3>
                <p class="text-[11px] text-white/55">Найдите пользователя для диалога</p>
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
                  placeholder="Поиск по имени или @нику..."
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
                  Пользователи не найдены
                </div>
                <div v-else-if="!dmSearch" class="text-center text-white/55 text-xs py-4 opacity-60">
                  Начните вводить имя пользователя
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import ConversationList from '@/components/ConversationList.vue'
import ChatWindow from '@/components/ChatWindow.vue'
import { useMessagesStore, type MsgSender } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore, type GroupMessage, type GroupMembership } from '@/stores/groups'
import { wsClient } from '@/lib/wsClient'
import api from '@/api'

const store  = useMessagesStore()
const auth   = useAuthStore()
const groups = useGroupsStore()
const route  = useRoute()
const router = useRouter()

const showNewDm  = ref(false)
const dmSearch   = ref('')
const dmLoading  = ref(false)
const dmResults  = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])

let dmSearchTimer: ReturnType<typeof setTimeout> | null = null

// ── Tab ──────────────────────────────────────────────────────────────────────
const chatTab = ref<'dm' | 'groups'>('dm')

// ── Group chat state ─────────────────────────────────────────────────────────
const groupMemberships = ref<GroupMembership[]>([])
const groupListLoading = ref(false)
const activeGroupId    = ref<string | null>(null)
const activeGroupName  = ref('')
const activeGroupAvatar = ref<string | null>(null)
const groupMessages    = ref<GroupMessage[]>([])
const groupMsgLoading  = ref(false)
const groupMsgInput    = ref('')
const groupMsgSending  = ref(false)
const groupMsgContainer = ref<HTMLElement | null>(null)

async function loadGroupList() {
  if (groupMemberships.value.length) return
  groupListLoading.value = true
  try {
    await groups.loadMyGroups()
    groupMemberships.value = groups.myGroups
  } finally {
    groupListLoading.value = false
  }
}

async function openGroupChat(groupId: string, name: string, avatar: string | null) {
  // Prefer community Conversation (Conversation type='community') over legacy GroupMessage
  try {
    const convId = await store.openGroupConversation(groupId)
    if (convId) {
      chatTab.value = 'dm'
      return
    }
  } catch {}

  // Fallback: legacy GroupMessage chat
  activeGroupId.value = groupId
  activeGroupName.value = name
  activeGroupAvatar.value = avatar
  groupMessages.value = []
  groupMsgLoading.value = true
  try {
    groupMessages.value = await groups.loadGroupMessages(groupId)
    await nextTick()
    if (groupMsgContainer.value) groupMsgContainer.value.scrollTop = groupMsgContainer.value.scrollHeight
  } finally {
    groupMsgLoading.value = false
  }
}

async function sendGroupMsg() {
  if (!groupMsgInput.value.trim() || !activeGroupId.value || groupMsgSending.value) return
  const text = groupMsgInput.value.trim()
  groupMsgInput.value = ''
  groupMsgSending.value = true
  try {
    wsClient.send({ type: 'group_message_send', groupId: activeGroupId.value, content: text })
    // Optimistic: will be confirmed by incoming group_message WS event
    // Fallback: if WS is not connected, use REST
  } finally {
    groupMsgSending.value = false
  }
}

// ── Private group conversations (from messages store) ───────────────────────
const privateGroupConvs = computed(() =>
  store.conversations.filter((c) => c.is_group && !c.my_participant?.archived)
)

async function openPrivateGroupConv(convId: string) {
  chatTab.value = 'dm'
  activeGroupId.value = null
  await store.selectConversation(convId)
}

// ── Active conversation helpers ─────────────────────────────────────────────
 const activeConvId = computed(() => store.activeId)

const activeConv = computed(() =>
  store.conversations.find((c) => c.id === activeConvId.value)
)

const activeOther = computed<MsgSender | undefined>(() => {
  if (!activeConvId.value) return undefined
  return activeConv.value?.other_participants?.[0]?.user
})

// Show chat window when conv is a group/community (no single "other" needed) or when activeOther exists
const canShowChatWindow = computed(() =>
  !!activeConvId.value && (!!activeOther.value || !!(activeConv.value?.is_group))
)

// ── Lifecycle ───────────────────────────────────────────────────────────────
let unsubGroupWs: (() => void) | null = null

onMounted(async () => {
  store.startListening()
  await store.fetchConversations()

  // Subscribe to incoming group messages
  unsubGroupWs = wsClient.on('group_message', (payload) => {
    if (payload.groupId === activeGroupId.value) {
      groupMessages.value.push(payload.message as GroupMessage)
      nextTick(() => {
        if (groupMsgContainer.value) groupMsgContainer.value.scrollTop = groupMsgContainer.value.scrollHeight
      })
    }
  })

  // Support ?userId=xxx deep link (e.g. "Send message" button on profile)
  const targetUser = route.query.userId as string | undefined
  if (targetUser) {
    const convId = await store.openConversation(targetUser)
    await store.selectConversation(convId)
    router.replace({ name: 'messages' })
  }
})

onUnmounted(() => {
  store.stopListening()
  if (unsubGroupWs) { unsubGroupWs(); unsubGroupWs = null }
})

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
  const id = await store.openConversation(userId)
  await store.selectConversation(id)
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
