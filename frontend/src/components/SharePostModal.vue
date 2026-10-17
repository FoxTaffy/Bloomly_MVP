<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useFriendsStore } from '@/stores/friends'
import { useMessagesStore } from '@/stores/messages'
import BIcon from './BIcon.vue'

const props = defineProps<{ postId: string; postUrl: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const friendsStore = useFriendsStore()
const messagesStore = useMessagesStore()

const loading = ref(true)
const search = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

type Target = { type: 'conversation' | 'friend'; id: string; name: string; avatarUrl: string | null }
const selected = ref<Target | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      friendsStore.friends.length ? Promise.resolve() : friendsStore.loadFriends(),
      messagesStore.fetchConversations(),
    ])
  } finally {
    loading.value = false
    nextTick(() => searchInput.value?.focus())
  }
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !sending.value) emit('close')
}

// Only 1:1 chats make sense as a "share with a person" target
const directConversations = computed(() => messagesStore.conversations.filter(c => !c.is_group))
const hasAnyTargets = computed(() => directConversations.value.length > 0 || friendsStore.friends.length > 0)

const filteredConversations = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return directConversations.value.slice(0, 8)
  return directConversations.value.filter((c) => {
    const other = c.other_participants?.[0]?.user
    const name = (other?.display_name || other?.username || c.name || '').toLowerCase()
    return name.includes(q)
  })
})

// Skip friends who already have a chat shown above, so the same person isn't listed twice
const conversationUserIds = computed(() =>
  new Set(directConversations.value.map((c) => c.other_participants?.[0]?.user_id).filter(Boolean))
)

const filteredFriends = computed(() => {
  const q = search.value.trim().toLowerCase()
  return friendsStore.friends.filter((f) => {
    if (conversationUserIds.value.has(f.id)) return false
    const name = (f.display_name || f.username).toLowerCase()
    return !q || name.includes(q)
  })
})

function pickConversation(c: any) {
  if (sending.value) return
  const other = c.other_participants?.[0]?.user
  selected.value = { type: 'conversation', id: c.id, name: other?.display_name || other?.username || c.name || 'Чат', avatarUrl: other?.avatar_url ?? c.avatar_url ?? null }
}
function pickFriend(f: any) {
  if (sending.value) return
  selected.value = { type: 'friend', id: f.id, name: f.display_name || f.username, avatarUrl: f.avatar_url ?? null }
}

// ── Send with a 5s undo window ───────────────────────────────────────────────
const CANCEL_WINDOW_MS = 5000
const RING_CIRCUMFERENCE = 44 // 2 * π * r(7)

const sending = ref(false)
const sent = ref(false)
const ringDrained = ref(false)
const sendError = ref('')
let sendTimer: ReturnType<typeof setTimeout> | null = null
// Frozen at the moment "Отправить" is clicked — switching the selection while the
// countdown is running must not silently redirect the send to a different person.
let armedTarget: Target | null = null

function startSend() {
  if (!selected.value || sending.value) return
  armedTarget = selected.value
  sendError.value = ''
  sending.value = true
  ringDrained.value = false
  requestAnimationFrame(() => { ringDrained.value = true })
  sendTimer = setTimeout(commitSend, CANCEL_WINDOW_MS)
}

function cancelSend() {
  if (sendTimer) { clearTimeout(sendTimer); sendTimer = null }
  armedTarget = null
  sending.value = false
  ringDrained.value = false
}

async function commitSend() {
  sendTimer = null
  const target = armedTarget
  if (!target) return
  try {
    const convId = target.type === 'friend' ? await messagesStore.openConversation(target.id) : target.id
    await messagesStore.sendPostShare(convId, props.postId)
    sent.value = true
    setTimeout(() => emit('close'), 1100)
  } catch {
    sending.value = false
    sendError.value = 'Не удалось отправить. Попробуйте ещё раз.'
  }
}

// ── Quick actions retained from the old share dropdown ───────────────────────
const linkCopied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.postUrl)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {}
}

const embedCopied = ref(false)
async function copyEmbed() {
  const embedCode = `<iframe src="${props.postUrl}" width="560" height="315" frameborder="0"></iframe>`
  try {
    await navigator.clipboard.writeText(embedCode)
    embedCopied.value = true
    setTimeout(() => { embedCopied.value = false }, 2000)
  } catch {}
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-9999 flex items-center justify-center px-4"
      style="background: rgba(0,0,0,0.6)"
      @click.self="!sending && emit('close')"
    >
      <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border shrink-0">
          <h3 class="font-bold text-white flex items-center gap-2">
            <BIcon name="Share2" class="w-4.5 h-4.5 text-brand-accent" /> Поделиться постом
          </h3>
          <button @click="!sending && emit('close')" :disabled="sending"
            class="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>

        <!-- Search -->
        <div class="px-5 pt-4 shrink-0">
          <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-bg border border-brand-border focus-within:border-brand-accent/50 transition-colors">
            <BIcon name="Search" class="w-4 h-4 text-white/35 shrink-0" />
            <input ref="searchInput" v-model="search" placeholder="Найти друга..." :disabled="sending"
              class="bg-transparent text-sm text-white placeholder-brand-muted outline-hidden w-full disabled:cursor-not-allowed" />
          </div>
        </div>

        <!-- Target list -->
        <div class="flex-1 overflow-y-auto px-5 py-3 stack-y-1 min-h-[200px] transition-opacity" :class="sending ? 'opacity-40 pointer-events-none' : ''">
          <div v-if="loading" class="flex items-center justify-center py-10">
            <BIcon name="Loader2" class="w-6 h-6 text-white/30 animate-spin" />
          </div>

          <template v-else>
            <p v-if="filteredConversations.length" class="text-[10px] font-bold uppercase tracking-wide text-white/35 px-1 pt-1 pb-0.5">Чаты</p>
            <button v-for="c in filteredConversations" :key="c.id" @click="pickConversation(c)"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all"
              :class="selected?.type === 'conversation' && selected.id === c.id ? 'bg-brand-accent/15 border-brand-accent/40 scale-[1.01]' : 'hover:bg-white/5 border-transparent'">
              <img v-if="c.other_participants?.[0]?.user?.avatar_url" :src="c.other_participants[0].user.avatar_url" class="w-8 h-8 rounded-full object-cover border border-brand-border shrink-0" />
              <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-xs font-bold text-brand-accent shrink-0">
                {{ (c.other_participants?.[0]?.user?.display_name || c.other_participants?.[0]?.user?.username || '?')[0].toUpperCase() }}
              </div>
              <span class="text-sm text-white font-semibold truncate">{{ c.other_participants?.[0]?.user?.display_name || c.other_participants?.[0]?.user?.username }}</span>
              <span class="w-5 h-5 rounded-full flex items-center justify-center ml-auto shrink-0 transition-colors"
                :class="selected?.type === 'conversation' && selected.id === c.id ? 'bg-brand-accent' : ''">
                <BIcon v-if="selected?.type === 'conversation' && selected.id === c.id" name="Check" class="w-3.5 h-3.5 text-white" />
              </span>
            </button>

            <p v-if="filteredFriends.length" class="text-[10px] font-bold uppercase tracking-wide text-white/35 px-1 pt-2 pb-0.5">Друзья</p>
            <button v-for="f in filteredFriends" :key="f.id" @click="pickFriend(f)"
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all"
              :class="selected?.type === 'friend' && selected.id === f.id ? 'bg-brand-accent/15 border-brand-accent/40 scale-[1.01]' : 'hover:bg-white/5 border-transparent'">
              <img v-if="f.avatar_url" :src="f.avatar_url" class="w-8 h-8 rounded-full object-cover border border-brand-border shrink-0" />
              <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-xs font-bold text-brand-accent shrink-0">
                {{ (f.display_name || f.username)[0].toUpperCase() }}
              </div>
              <span class="text-sm text-white font-semibold truncate">{{ f.display_name || f.username }}</span>
              <span class="w-5 h-5 rounded-full flex items-center justify-center ml-auto shrink-0 transition-colors"
                :class="selected?.type === 'friend' && selected.id === f.id ? 'bg-brand-accent' : ''">
                <BIcon v-if="selected?.type === 'friend' && selected.id === f.id" name="Check" class="w-3.5 h-3.5 text-white" />
              </span>
            </button>

            <div v-if="!filteredConversations.length && !filteredFriends.length" class="py-10 text-center text-white/35 text-sm flex flex-col items-center gap-2">
              <BIcon :name="hasAnyTargets ? 'SearchX' : 'UserX'" class="w-8 h-8 opacity-40" />
              {{ hasAnyTargets ? 'Никого не найдено' : 'Пока нет друзей или чатов' }}
            </div>
          </template>
        </div>

        <!-- Footer: selection + quick actions + send -->
        <div class="border-t border-brand-border shrink-0">
          <div v-if="selected" class="flex items-center gap-2 px-5 pt-3 text-xs text-white/45">
            <span>Кому:</span>
            <img v-if="selected.avatarUrl" :src="selected.avatarUrl" class="w-4 h-4 rounded-full object-cover shrink-0" />
            <span class="text-white/80 font-semibold truncate">{{ selected.name }}</span>
          </div>
          <p v-if="sendError" class="px-5 pt-2 text-xs text-brand-error">{{ sendError }}</p>

          <div class="flex items-center gap-2 px-5 py-4">
            <button @click="copyLink" title="Копировать ссылку" :disabled="sending"
              class="p-2 rounded-xl border border-brand-border text-white/55 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
              <BIcon :name="linkCopied ? 'CheckCheck' : 'Link'" class="w-4 h-4" />
            </button>
            <button @click="copyEmbed" title="Код для встраивания" :disabled="sending"
              class="p-2 rounded-xl border border-brand-border text-white/55 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
              <BIcon :name="embedCopied ? 'CheckCheck' : 'Code2'" class="w-4 h-4" />
            </button>

            <div class="flex-1" />

            <Transition name="fade" mode="out-in">
              <div v-if="sent" key="sent" class="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-brand-success">
                <BIcon name="CheckCircle" class="w-4 h-4" /> Отправлено
              </div>
              <button v-else-if="sending" key="sending" @click="cancelSend"
                class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-bg border border-brand-border hover:border-rose-500/50 hover:text-rose-400 text-white text-sm font-bold rounded-2xl transition-colors">
                <svg class="w-4 h-4 -rotate-90 shrink-0" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2" class="text-white/15" />
                  <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                    :stroke-dasharray="RING_CIRCUMFERENCE"
                    :stroke-dashoffset="ringDrained ? RING_CIRCUMFERENCE : 0"
                    style="transition: stroke-dashoffset 5s linear" />
                </svg>
                Отменить
              </button>
              <button v-else key="idle" @click="startSend" :disabled="!selected"
                class="inline-flex items-center gap-2 px-5 py-2.5 bg-linear-to-r/srgb from-brand-accent to-brand-accent-plus text-white text-sm font-bold rounded-2xl shadow-lg shadow-brand-accent/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all">
                <BIcon name="Send" class="w-4 h-4" /> Отправить
              </button>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
