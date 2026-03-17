<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { useRouter } from 'vue-router'
import { useFriendsStore } from '@/stores/friends'
import type { FriendUser } from '@/stores/friends'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import FriendRequestCard from '@/components/FriendRequestCard.vue'
import PersonCard from '@/components/PersonCard.vue'
import BirthdayCard from '@/components/BirthdayCard.vue'

const router       = useRouter()
const friendsStore = useFriendsStore()

type MainTab = 'friends' | 'followers' | 'following'

const mainTab           = ref<MainTab>('friends')
const onlineFilter      = ref(false)
const searchQuery       = ref('')
const addInput          = ref('')
const addLoading        = ref(false)
const addError          = ref<string | null>(null)
const addSuccess        = ref(false)
const confirmRemoveId   = ref<string | null>(null)
const rightPanel        = ref<'requests' | 'suggestions'>('requests')

onMounted(async () => {
  await Promise.all([
    friendsStore.loadFriends(),
    friendsStore.loadFollowers(),
    friendsStore.loadFollowing(),
    friendsStore.loadRequests(),
    friendsStore.loadSuggestions(),
    friendsStore.loadBirthdays(),
  ])
})

// ── Displayed list depending on active tab ────────────────────────────────────
const displayedList = computed(() => {
  let raw: (FriendUser & { online?: boolean })[] = []
  if (mainTab.value === 'friends')
    raw = onlineFilter.value
      ? [...friendsStore.friends.filter(f => f.online)]
      : [...friendsStore.friends]
  if (mainTab.value === 'followers') raw = [...friendsStore.followers]
  if (mainTab.value === 'following') raw = [...friendsStore.following]

  const q = searchQuery.value.toLowerCase().trim()
  if (q) raw = raw.filter(
    (f) => (f.display_name ?? '').toLowerCase().includes(q) || f.username.toLowerCase().includes(q)
  )

  // Сортировка: сначала онлайн, потом алфавит
  return raw.sort((a, b) => {
    const aOn = (a.online) ?? false
    const bOn = (b.online) ?? false
    if (aOn !== bOn) return aOn ? -1 : 1
    return (a.display_name || a.username).localeCompare(b.display_name || b.username)
  })
})

const isFriendsTab  = computed(() => mainTab.value === 'friends')
const onlineCount   = computed(() => friendsStore.friends.filter(f => f.online).length)

// ── Tab configs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { key: 'friends'   as MainTab, icon: 'Users',      label: langStore.t.tabFriends,      count: friendsStore.friends.length },
  { key: 'followers' as MainTab, icon: 'UserCheck',  label: langStore.t.tabFollowers,  count: friendsStore.followers.length },
  { key: 'following' as MainTab, icon: 'UserPlus',   label: langStore.t.tabFollowing,    count: friendsStore.following.length },
])

// ── Actions ───────────────────────────────────────────────────────────────────
async function handleRemove(friendId: string) { confirmRemoveId.value = friendId }
async function confirmRemove() {
  if (!confirmRemoveId.value) return
  await friendsStore.removeFriend(confirmRemoveId.value)
  confirmRemoveId.value = null
}
function handleMessage(userId: string) { router.push({ name: 'messages', query: { userId } }) }

async function handleSendRequest(targetId: string) {
  if (!targetId.trim()) return
  addError.value = null; addSuccess.value = false; addLoading.value = true
  try {
    await friendsStore.sendRequest(targetId.trim())
    addSuccess.value = true; addInput.value = ''
    setTimeout(() => { addSuccess.value = false }, 3000)
  } catch (e: any) {
    addError.value = e?.response?.data?.error ?? 'Ошибка'
  } finally { addLoading.value = false }
}

async function handleAccept(id: string) { await friendsStore.acceptRequest(id) }
async function handleReject(id: string) { await friendsStore.rejectRequest(id) }

function avatarInitial(name: string | null | undefined) { return (name ?? '?')[0].toUpperCase() }
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-6 pb-28 md:pb-10">
      <AppSidebar />

      <div class="flex-1 min-w-0 flex gap-5">

        <!-- ═══ ЦЕНТР ══════════════════════════════════════════════════ -->
        <div class="flex-1 min-w-0 flex flex-col gap-4">

          <!-- Header -->
          <div class="bg-brand-card border border-brand-border rounded-3xl px-5 py-4 shadow-xl">
            <div class="flex items-center justify-between gap-3 mb-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center">
                  <BIcon name="Users" class="w-5 h-5 text-brand-accent" />
                </div>
                <h1 class="text-xl font-extrabold text-white">{{ langStore.t.pageTitle }}</h1>
              </div>

              <!-- Добавить по ID -->
              <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <input
                  v-model="addInput"
                  type="text"
                  :placeholder="langStore.t.addPlaceholder"
                  class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent transition-colors min-w-0 flex-1 sm:w-40 sm:flex-initial"
                  @keydown.enter="handleSendRequest(addInput)"
                />
                <button
                  :disabled="!addInput.trim() || addLoading"
                  class="px-3 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  @click="handleSendRequest(addInput)"
                >
                  <BIcon name="UserPlus" class="w-4 h-4" />
                  {{ langStore.t.addButton }}
                </button>
              </div>
            </div>

            <p v-if="addError"   class="text-xs text-brand-error   mb-3 -mt-2">{{ addError }}</p>
            <p v-if="addSuccess" class="text-xs text-brand-success mb-3 -mt-2">{{ langStore.t.requestSent }}</p>

            <!-- Main tabs: Друзья / Подписчики / Подписки -->
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex bg-brand-bg rounded-xl p-1 gap-1">
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5',
                    mainTab === tab.key
                      ? 'bg-brand-accent text-white'
                      : 'text-white/55 hover:text-brand-offwhite'
                  ]"
                  @click="mainTab = tab.key; onlineFilter = false; searchQuery = ''"
                >
                  <BIcon :name="tab.icon" class="w-4 h-4" />
                  {{ tab.label }}
                  <span
                    v-if="tab.count > 0"
                    :class="[
                      'text-[10px] rounded-full px-1.5 font-bold',
                      mainTab === tab.key ? 'bg-white/20 text-white' : 'bg-brand-muted/30 text-white/55'
                    ]"
                  >{{ tab.count }}</span>
                </button>
              </div>

              <!-- Онлайн-фильтр (только для вкладки Друзья) -->
              <button
                v-if="isFriendsTab"
                :class="[
                  'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5',
                  onlineFilter ? 'bg-brand-success/20 text-brand-success' : 'bg-brand-bg text-white/55 hover:text-brand-offwhite border border-brand-border'
                ]"
                @click="onlineFilter = !onlineFilter"
              >
                <span :class="['w-2 h-2 rounded-full', onlineFilter ? 'bg-brand-success' : 'bg-brand-muted']" />
                {{ langStore.t.onlineFilter }}
                <span v-if="onlineCount" class="text-[10px] font-bold">{{ onlineCount }}</span>
              </button>

              <!-- Поиск -->
              <div class="relative flex-1 min-w-[140px] max-w-xs">
                <BIcon name="Search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/55 pointer-events-none" />
                <input
                  v-model="searchQuery"
                  type="text"
                  :placeholder="langStore.t.searchPlaceholder"
                  class="w-full bg-brand-bg border border-brand-border rounded-xl pl-9 pr-3 py-2 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent transition-colors"
                />
              </div>
            </div>
          </div>

          <!-- List -->
          <div v-if="friendsStore.isLoading" class="flex items-center justify-center py-16">
            <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
          </div>

          <template v-else-if="displayedList.length">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PersonCard
                v-for="user in displayedList"
                :key="user.id"
                :user="(user as any)"
                :is-friend="isFriendsTab"
                @message="handleMessage"
                @remove="handleRemove"
              />
            </div>
          </template>

          <div v-else class="bg-brand-card border border-brand-border rounded-3xl flex flex-col items-center justify-center py-16 gap-3">
            <BIcon
              :name="mainTab === 'followers' ? 'UserCheck' : mainTab === 'following' ? 'UserPlus' : 'Users'"
              class="w-12 h-12 text-white/35"
            />
            <p class="text-white/55 text-sm">
              <template v-if="mainTab === 'friends'">{{ onlineFilter ? langStore.t.emptyNoOnlineFriends : langStore.t.emptyFriendsList }}</template>
              <template v-else-if="mainTab === 'followers'">{{ langStore.t.emptyFollowers }}</template>
              <template v-else>{{ langStore.t.emptyFollowing }}</template>
            </p>
          </div>
        </div>

        <!-- ═══ ПРАВАЯ ПАНЕЛЬ ══════════════════════════════════════════ -->
        <div class="hidden xl:flex flex-col gap-4 w-[272px] flex-shrink-0">

          <!-- Заявки / Знакомые -->
          <div class="bg-brand-card border border-brand-border rounded-3xl p-4">
            <div class="flex bg-brand-bg rounded-xl p-1 gap-1 mb-4">
              <button
                :class="['flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5', rightPanel === 'requests' ? 'bg-brand-accent text-white' : 'text-white/55 hover:text-brand-offwhite']"
                @click="rightPanel = 'requests'"
              >
                <BIcon name="UserPlus" class="w-3.5 h-3.5" />
                {{ langStore.t.rightPanelRequests }}
                <span v-if="friendsStore.requests.length" class="bg-white/20 rounded-full text-[10px] px-1.5">{{ friendsStore.requests.length }}</span>
              </button>
              <button
                :class="['flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5', rightPanel === 'suggestions' ? 'bg-brand-yellow/20 text-brand-yellow' : 'text-white/55 hover:text-brand-offwhite']"
                @click="rightPanel = 'suggestions'"
              >
                <BIcon name="Sparkles" class="w-3.5 h-3.5" />
                {{ langStore.t.rightPanelSuggestions }}
              </button>
            </div>

            <template v-if="rightPanel === 'requests'">
              <div v-if="friendsStore.requests.length" class="flex flex-col gap-3">
                <FriendRequestCard v-for="req in friendsStore.requests" :key="req.id" :request="req" @accept="handleAccept" @reject="handleReject" />
              </div>
              <div v-else class="flex flex-col items-center gap-2 py-6 text-white/55">
                <BIcon name="UserCheck" class="w-8 h-8 opacity-30" />
                <p class="text-sm">{{ langStore.t.noIncomingRequests }}</p>
              </div>
            </template>

            <template v-else>
              <div v-if="friendsStore.suggestions.length" class="flex flex-col gap-3">
                <div v-for="user in friendsStore.suggestions.slice(0, 8)" :key="user.id" class="flex items-center gap-3 group">
                  <div class="flex-shrink-0 cursor-pointer" @click="router.push(`/profile/${user.username}`)">
                    <img v-if="user.avatar_url" :src="user.avatar_url" class="w-9 h-9 rounded-full object-cover border border-brand-border" />
                    <div v-else class="w-9 h-9 rounded-full border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">
                      {{ avatarInitial(user.display_name || user.username) }}
                    </div>
                  </div>
                  <div class="min-w-0 flex-1 cursor-pointer" @click="router.push(`/profile/${user.username}`)">
                    <p class="text-sm font-semibold text-brand-offwhite truncate leading-tight">{{ user.display_name || user.username }}</p>
                    <p class="text-xs text-white/55 truncate">@{{ user.username }}</p>
                  </div>
                  <button class="flex-shrink-0 w-8 h-8 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/30 flex items-center justify-center text-brand-accent transition-colors" @click="handleSendRequest(user.id)">
                    <BIcon name="UserPlus" class="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div v-else class="flex flex-col items-center gap-2 py-6 text-white/55">
                <BIcon name="Sparkles" class="w-8 h-8 opacity-30" />
                <p class="text-sm">{{ langStore.t.noSuggestions }}</p>
              </div>
            </template>
          </div>

          <!-- Дни рождения -->
          <div class="bg-brand-card border border-brand-border rounded-3xl p-4">
            <h2 class="font-bold text-brand-offwhite text-sm mb-1 flex items-center gap-2">
              <BIcon name="Cake" class="w-4 h-4 text-brand-pink" />
              {{ langStore.t.birthdaysTitle }}
            </h2>
            <p class="text-xs text-white/55 mb-3">{{ langStore.t.birthdaysSubtitle }}</p>
            <div v-if="friendsStore.birthdays.length" class="divide-y divide-brand-border">
              <BirthdayCard v-for="bd in friendsStore.birthdays" :key="bd.id" :birthday="bd" />
            </div>
            <div v-else class="flex flex-col items-center gap-2 py-4 text-white/55">
              <BIcon name="Cake" class="w-7 h-7 opacity-30" />
              <p class="text-xs">{{ langStore.t.noBirthdays }}</p>
            </div>
          </div>

          <!-- Статистика -->
          <div class="bg-brand-card border border-brand-border rounded-3xl p-4">
            <h2 class="font-bold text-brand-offwhite text-sm mb-3 flex items-center gap-2">
              <BIcon name="BarChart2" class="w-4 h-4 text-brand-accent" />
              {{ langStore.t.statsTitle }}
            </h2>
            <div class="grid grid-cols-2 gap-2">
              <div class="bg-brand-bg rounded-2xl p-3 text-center">
                <p class="text-2xl font-bold text-brand-offwhite">{{ friendsStore.friends.length }}</p>
                <p class="text-xs text-white/55 mt-0.5">{{ langStore.t.tabFriends }}</p>
              </div>
              <div class="bg-brand-bg rounded-2xl p-3 text-center">
                <p class="text-2xl font-bold text-brand-success">{{ onlineCount }}</p>
                <p class="text-xs text-white/55 mt-0.5">{{ langStore.t.onlineFilter }}</p>
              </div>
              <div class="bg-brand-bg rounded-2xl p-3 text-center">
                <p class="text-2xl font-bold text-brand-accent">{{ friendsStore.followers.length }}</p>
                <p class="text-xs text-white/55 mt-0.5">{{ langStore.t.tabFollowers }}</p>
              </div>
              <div class="bg-brand-bg rounded-2xl p-3 text-center">
                <p class="text-2xl font-bold text-brand-accent-minus">{{ friendsStore.following.length }}</p>
                <p class="text-xs text-white/55 mt-0.5">{{ langStore.t.tabFollowing }}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Модалка удаления из друзей -->
    <Transition name="fade">
      <div v-if="confirmRemoveId" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" @click.self="confirmRemoveId = null">
        <div class="bg-brand-card border border-brand-border rounded-3xl p-6 max-w-sm w-full shadow-card">
          <h3 class="font-bold text-brand-offwhite text-lg mb-2">{{ langStore.t.confirmRemoveTitle }}</h3>
          <p class="text-white/55 text-sm mb-5">{{ langStore.t.confirmRemoveHint }}</p>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-xl bg-brand-error hover:bg-brand-error/80 text-white font-semibold transition-colors" @click="confirmRemove">{{ langStore.t.confirmRemoveBtn }}</button>
            <button class="flex-1 py-2 rounded-xl bg-brand-muted/30 hover:bg-brand-muted/50 text-brand-offwhite font-semibold transition-colors" @click="confirmRemoveId = null">{{ langStore.t.cancelBtn }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
