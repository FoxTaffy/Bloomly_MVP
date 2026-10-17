<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import GroupCard from '@/components/groups/GroupCard.vue'
import EventCard from '@/components/groups/EventCard.vue'
import SoonBadge from '@/components/groups/SoonBadge.vue'
import CreateGroupModal from '@/components/groups/CreateGroupModal.vue'
import AdSlot from '@/components/ads/AdSlot.vue'
import { useGroupsStore, type GroupType } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useLangStore } from '@/stores/lang'
import api from '@/api'

const router = useRouter()
const route = useRoute()
const { nsfwEnabled: nsfwMode } = useNsfwMode()
const langStore = useLangStore()
const activeNav = ref('groups')
const showCreateModal = ref(false)
const createInitialType = ref<GroupType | undefined>()
const search = ref('')
const showCategoryDropdown = ref(false)

const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

// Pinned groups tracking
const pinnedGroupIds = computed(() => {
  const ids = new Set<string>()
  groupsStore.myGroups.forEach(m => { if (m.is_pinned) ids.add(m.group_id) })
  return ids
})

// Membership tracking — used to hide "unsubscribe"/"notify" actions for groups the user hasn't joined
const memberGroupIds = computed(() => {
  const ids = new Set<string>()
  groupsStore.myGroups.forEach(m => ids.add(m.group_id))
  return ids
})

// Groups the user owns/admins/moderates — eligible for the "Обращения pending" card badge
const managedGroupIds = computed(() => {
  const ids = new Set<string>()
  groupsStore.myGroups.forEach(m => { if (['owner', 'admin', 'moderator'].includes(m.role)) ids.add(m.group_id) })
  return ids
})

async function handleBookmark(groupId: string) {
  try {
    await groupsStore.togglePinGroup(groupId)
  } catch {}
}

async function handleUnsubscribe(groupId: string) {
  try {
    await groupsStore.leaveGroup(groupId)
  } catch {}
}

async function handleNotify(groupId: string) {
  try {
    await groupsStore.toggleGroupNotification(groupId)
  } catch {}
}

// Sidebar navigation
const sidebarTab = ref<'my' | 'for_you' | 'trending' | 'afisha' | 'managed'>('my')

// Category filter (via dropdown)
const selectedCategory = ref<string>('all')
const categories = computed(() => [
  { key: 'all',       label: langStore.t.categoriesLabel, icon: 'Grid' },
  { key: 'community', label: langStore.t.catCommunity,    icon: 'Users' },
  { key: 'event',     label: langStore.t.catEvent,        icon: 'CalendarDays' },
  { key: 'creative',  label: langStore.t.catCreative,     icon: 'Palette' },
  { key: 'news',      label: langStore.t.catNews,         icon: 'Newspaper' },
  { key: 'shop',      label: langStore.t.catShop,         icon: 'ShoppingBag' },
  { key: 'brand',     label: langStore.t.catBrand,        icon: 'Building2' },
])

const displayGroups = computed(() => {
  let list: any[] = []

  if (sidebarTab.value === 'my') {
    list = groupsStore.myGroups.map(m => m.group)
  } else if (sidebarTab.value === 'managed') {
    list = groupsStore.managedGroups
  } else if (sidebarTab.value === 'trending') {
    list = groupsStore.trendingGroups
  } else {
    // for_you
    list = groupsStore.groups
  }

  // Category filter (not applied for afisha tab)
  if (sidebarTab.value !== 'afisha' && selectedCategory.value !== 'all') {
    list = list.filter(g => g.type === selectedCategory.value)
  }

  return list
})

const upcomingEvents = computed(() =>
  groupsStore.events.filter(e => new Date(e.starts_at) > new Date()).slice(0, 6)
)

const selectedCategoryLabel = computed(() =>
  categories.value.find(c => c.key === selectedCategory.value)?.label || langStore.t.categoriesLabel
)

async function loadData() {
  const typeMap: Record<string, GroupType | undefined> = {
    event: 'event', creative: 'creative', static: 'static',
    news: 'news', shop: 'shop', community: 'community', brand: 'brand',
  }
  await groupsStore.loadGroups({
    type: selectedCategory.value !== 'all' ? typeMap[selectedCategory.value] : undefined,
    search: search.value || undefined,
  })
}

// Load stable data once (events, memberships, badges) — not on every filter change
async function loadStaticData() {
  await Promise.all([
    groupsStore.loadEvents({ upcoming: true, limit: 6 }),
    authStore.user ? groupsStore.loadMyGroups() : Promise.resolve(),
    authStore.user ? groupsStore.loadMySoonBadges(authStore.user.id) : Promise.resolve(),
    authStore.user ? messagesStore.fetchMyGroupInboxCounts() : Promise.resolve(),
  ])
}

const activeAds = ref<any[]>([])
const adSlotMode = computed<'ads' | 'offer' | 'hidden'>(() => {
  const tier = authStore.user?.subscription_tier ?? 'free'
  if (tier === 'lite' || tier === 'pro') return 'hidden'
  if (tier === 'business') return 'offer'
  return 'ads'
})
async function loadActiveAds() {
  if (adSlotMode.value !== 'ads') return
  try {
    const res = await api.get('/admin/ads/active')
    if (res.data.success) activeAds.value = res.data.data.ads
  } catch {}
}

onMounted(async () => {
  const q = route.query.create
  if (typeof q === 'string') {
    if (q !== '1') createInitialType.value = q as GroupType
    showCreateModal.value = true
    router.replace({ name: 'groups' })
  }
  await Promise.all([loadData(), loadStaticData(), loadActiveAds()])
})

function selectCategory(key: string) {
  selectedCategory.value = key
  showCategoryDropdown.value = false
  loadData()
}

function switchSidebarTab(tab: typeof sidebarTab.value) {
  if (tab === sidebarTab.value) return
  sidebarTab.value = tab
  if (tab === 'for_you') {
    loadData()
  } else if (tab === 'trending') {
    groupsStore.loadTrending()
  } else if (tab === 'afisha') {
    groupsStore.loadEvents({ upcoming: true, limit: 20 })
  } else if (authStore.user) {
    groupsStore.loadMyGroups()
  }
}

// ── Animated sliding pill behind the active tab (mirrors the Friends tabs) ──
const tabBarEl = ref<HTMLElement | null>(null)
const tabButtonEls = ref<Record<string, HTMLElement>>({})
const tabSlider = ref({ left: 0, width: 0, ready: false })

function setTabRef(key: string) {
  return (el: any) => { if (el) tabButtonEls.value[key] = el as HTMLElement }
}

function updateTabSlider() {
  const bar = tabBarEl.value
  const btn = tabButtonEls.value[sidebarTab.value]
  if (!bar || !btn) return
  const barRect = bar.getBoundingClientRect()
  const btnRect = btn.getBoundingClientRect()
  // scrollLeft is non-zero only when the bar is a horizontal scroller (mobile)
  tabSlider.value = { left: btnRect.left - barRect.left + bar.scrollLeft, width: btnRect.width, ready: true }
  if (bar.scrollWidth > bar.clientWidth) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

watch(sidebarTab, () => nextTick(updateTabSlider))
onMounted(() => {
  nextTick(updateTabSlider)
  window.addEventListener('resize', updateTabSlider)
})
onUnmounted(() => window.removeEventListener('resize', updateTabSlider))

async function handleCreateGroup(input: any) {
  const group = await groupsStore.createGroup({
    name: input.name,
    slug: input.slug,
    type: input.type,
    description: input.description,
    isPublic: input.isPublic,
    accentColor: input.accentColor,
    avatarUrl: input.avatarUrl || undefined,
    bannerUrl: input.bannerUrl || undefined,
    socialLinks: input.socialLinks || undefined,
  })
  if (!group) return

  if (input.type === 'event' && input.eventTitle) {
    await groupsStore.createEvent(group.id, {
      title: input.eventTitle,
      shortCode: input.eventShortCode,
      startsAt: input.eventStartsAt,
      endsAt: input.eventEndsAt,
      locationName: input.eventLocation || undefined,
      isRecurring: input.eventIsRecurring || false,
      isTop: input.eventIsTop || false,
    })
  }

  if (input.type === 'creative' && input.commissionStatus) {
    await groupsStore.updateCommission(group.id, {
      status: input.commissionStatus,
      currency: input.commissionCurrency || 'USD',
      maxQueue: input.commissionMaxQueue || 5,
    })
  }

  if (input.type === 'shop' && input.shopCurrency) {
    await groupsStore.updateCommission(group.id, {
      status: 'open',
      currency: input.shopCurrency,
    })
  }

  showCreateModal.value = false
  router.push({ name: 'group-detail', params: { slugOrId: group.slug } })
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function fmtMembers(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0 pb-28">

        <!-- ════════ AD SLOT ════════ -->
        <div v-if="adSlotMode !== 'hidden'" class="mb-6">
          <AdSlot v-if="adSlotMode === 'offer'" variant="hero" :ad="null" />
          <AdSlot v-else-if="activeAds[0]" variant="hero" :ad="activeAds[0]" />
        </div>

        <!-- ════════ SEARCH + CATEGORIES + CREATE ════════ -->
        <div class="flex items-center gap-3 mb-6 max-md:gap-2 max-md:mb-4">
          <!-- Search -->
          <div class="relative flex-1 max-md:min-w-0">
            <BIcon name="Search" class="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              v-model="search"
              placeholder="Поиск групп..."
              class="w-full bg-brand-card border border-brand-border rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-brand-accent focus:outline-none"
              @keyup.enter="loadData"
            />
          </div>

          <!-- Category dropdown -->
          <div class="relative">
            <button
              class="flex items-center gap-2 px-4 py-2.5 max-md:px-3 max-md:gap-1.5 rounded-2xl bg-brand-card border border-brand-border text-sm font-semibold text-white/70 hover:border-brand-accent/40 transition-colors whitespace-nowrap"
              @click="showCategoryDropdown = !showCategoryDropdown"
            >
              <BIcon name="Filter" class="w-4 h-4 max-md:shrink-0" />
              <span class="max-md:max-w-[88px] max-md:truncate">{{ selectedCategoryLabel }}</span>
              <BIcon name="ChevronDown" class="w-3 h-3 text-white/30 transition-transform" :class="showCategoryDropdown ? 'rotate-180' : ''" />
            </button>
            <Transition name="dropdown">
              <div v-if="showCategoryDropdown"
                class="absolute right-0 top-full mt-2 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-2 min-w-[180px] z-50">
                <button
                  v-for="cat in categories"
                  :key="cat.key"
                  class="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-brand-bg/40"
                  :class="selectedCategory === cat.key ? 'text-brand-accent font-bold' : 'text-white/60'"
                  @click="selectCategory(cat.key)"
                >
                  <BIcon :name="cat.icon" class="w-4 h-4" />
                  {{ cat.label }}
                </button>
              </div>
            </Transition>
          </div>

          <!-- Create button -->
          <button
            class="px-4 py-2.5 max-md:px-3 rounded-2xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-colors shadow-accent flex items-center gap-2 shrink-0"
            @click="showCreateModal = true"
          >
            <BIcon name="Plus" class="w-4 h-4" />
            <span class="hidden sm:inline">{{ langStore.t.createGroup }}</span>
          </button>
        </div>

        <!-- ════════ TAB BAR ════════ -->
        <div ref="tabBarEl" class="relative flex items-center gap-2 mb-5 flex-wrap m-scroll-row max-md:-mx-3 max-md:px-3 max-md:mb-4">
          <!-- Sliding highlight — animates to whichever tab is active -->
          <div
            v-if="tabSlider.ready"
            class="absolute top-0 h-full rounded-xl bg-brand-accent/15 border border-brand-accent/40 transition-[left,width] duration-300 ease-out pointer-events-none z-0"
            :style="{ left: tabSlider.left + 'px', width: tabSlider.width + 'px' }"
          />
          <button
            v-for="tab in [
              { key: 'my'       as const, label: langStore.t.mySubscriptions, icon: 'Heart' },
              { key: 'for_you'  as const, label: langStore.t.forYou,          icon: 'Sparkles' },
              { key: 'trending' as const, label: 'В тренде',                  icon: 'TrendingUp' },
              { key: 'afisha'   as const, label: 'Афиша',                     icon: 'CalendarDays' },
              { key: 'managed'  as const, label: langStore.t.managed,         icon: 'ShieldCheck' },
            ]"
            :key="tab.key"
            :ref="setTabRef(tab.key)"
            class="relative z-10 flex items-center gap-2 px-4 py-2 max-md:px-3.5 rounded-xl text-sm font-semibold max-md:whitespace-nowrap transition-colors border"
            :class="sidebarTab === tab.key
              ? 'text-brand-accent border-transparent'
              : 'text-white/50 hover:text-white border-brand-border hover:border-brand-accent/30 bg-brand-card'"
            @click="switchSidebarTab(tab.key)"
          >
            <BIcon :name="tab.icon" class="w-4 h-4" />
            {{ tab.label }}
          </button>
        </div>

        <!-- ════════ AFISHA TAB ════════ -->
        <template v-if="sidebarTab === 'afisha'">
          <div v-if="groupsStore.isLoading" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-for="i in 4" :key="i" class="bg-brand-card border border-brand-border rounded-2xl h-40 animate-pulse" />
          </div>
          <div v-else-if="upcomingEvents.length === 0" class="text-center py-16">
            <div class="w-16 h-16 rounded-3xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto mb-4">
              <BIcon name="CalendarDays" class="w-8 h-8 text-brand-accent" />
            </div>
            <p class="text-white/40 text-sm">Предстоящих событий пока нет</p>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EventCard
              v-for="event in upcomingEvents"
              :key="event.id"
              :event="event"
              @click="router.push({ name: 'group-detail', params: { slugOrId: event.group?.slug || event.group_id } })"
            />
          </div>
        </template>

        <!-- ════════ GROUPS GRID ════════ -->
        <template v-else>
          <div v-if="groupsStore.isLoading || groupsStore.isTrendingLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div v-for="i in 6" :key="i" class="bg-brand-card border border-brand-border rounded-2xl h-[160px] animate-pulse" />
          </div>
          <div v-else-if="displayGroups.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <GroupCard
              v-for="group in displayGroups"
              :key="group.id"
              :group="group"
              :is-pinned="pinnedGroupIds.has(group.id)"
              :is-member="memberGroupIds.has(group.id)"
              :pending-replies="managedGroupIds.has(group.id) ? (messagesStore.groupInboxCounts[group.id] ?? 0) : 0"
              @bookmark="handleBookmark(group.id)"
              @notify="handleNotify(group.id)"
              @unsubscribe="handleUnsubscribe(group.id)"
            />
          </div>
          <div v-else class="text-center py-16">
            <div class="w-16 h-16 rounded-3xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto mb-4">
              <BIcon name="Grid" class="w-8 h-8 text-brand-accent" />
            </div>
            <p class="text-white/40 text-sm">Групп пока нет. Создай первую!</p>
          </div>
        </template>
      </main>
    </div>

    <!-- Close dropdown on outside click -->
    <div v-if="showCategoryDropdown" class="fixed inset-0 z-40" @click="showCategoryDropdown = false" />

    <!-- Create group modal -->
    <CreateGroupModal
      v-if="showCreateModal"
      :initial-type="createInitialType"
      @create="handleCreateGroup"
      @close="showCreateModal = false"
    />
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
