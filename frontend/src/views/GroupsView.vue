<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import GroupCard from '@/components/groups/GroupCard.vue'
import EventCard from '@/components/groups/EventCard.vue'
import SoonBadge from '@/components/groups/SoonBadge.vue'
import CreateGroupModal from '@/components/groups/CreateGroupModal.vue'
import { useGroupsStore, type GroupType } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useLangStore } from '@/stores/lang'

const router = useRouter()
const { nsfwEnabled: nsfwMode } = useNsfwMode()
const langStore = useLangStore()
const activeNav = ref('groups')
const showCreateModal = ref(false)
const search = ref('')
const showCategoryDropdown = ref(false)

const groupsStore = useGroupsStore()
const authStore = useAuthStore()

// Sidebar navigation
const sidebarTab = ref<'my' | 'for_you' | 'managed'>('my')

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
    list = groupsStore.myGroups
      .filter(m => ['owner', 'admin'].includes(m.role))
      .map(m => m.group)
  } else {
    // for_you
    list = groupsStore.groups
  }

  // Apply category filter
  if (selectedCategory.value !== 'all') {
    // map 'event' category key to group type 'event'
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
    groupsStore.loadMyGroups(),
    authStore.user ? groupsStore.loadMySoonBadges(authStore.user.id) : Promise.resolve(),
  ])
}

onMounted(async () => { await Promise.all([loadData(), loadStaticData()]) })

function selectCategory(key: string) {
  selectedCategory.value = key
  showCategoryDropdown.value = false
  loadData()
}

function switchSidebarTab(tab: typeof sidebarTab.value) {
  sidebarTab.value = tab
  if (tab === 'for_you') {
    loadData()
  } else {
    groupsStore.loadMyGroups()
  }
}

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

        <!-- ════════ AD BANNER PLACEHOLDER ════════ -->
        <div class="mb-6 rounded-3xl overflow-hidden border border-brand-border relative"
          style="background: linear-gradient(110deg, #0f0c29 0%, #1a0d35 35%, #0d1b35 65%, #0c1a0f 100%)">
          <!-- Grid pattern overlay -->
          <div class="absolute inset-0 opacity-[0.04] pointer-events-none"
            style="background-image: linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px); background-size: 32px 32px" />
          <!-- Glow effects -->
          <div class="absolute top-0 left-1/4 w-64 h-32 rounded-full opacity-20 blur-3xl pointer-events-none"
            style="background: radial-gradient(circle, #a855f7, transparent 70%)" />
          <div class="absolute bottom-0 right-1/4 w-48 h-24 rounded-full opacity-15 blur-2xl pointer-events-none"
            style="background: radial-gradient(circle, #3b82f6, transparent 70%)" />

          <div class="relative z-10 px-6 py-7 flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
            <div class="flex items-start gap-4">
              <!-- Icon with glow -->
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                style="background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%); box-shadow: 0 0 20px rgba(168,85,247,0.4)">
                <BIcon name="Megaphone" class="w-7 h-7 text-white" />
              </div>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full"
                    style="background: linear-gradient(90deg, #a855f7, #3b82f6); color: white">РЕКЛАМА</span>
                </div>
                <h3 class="text-white font-black text-base leading-snug">Bloomly Business — продвижение для брендов</h3>
                <p class="text-white/50 text-xs mt-1.5 leading-relaxed">Рекламные баннеры · Продвижение группы · Аналитика аудитории</p>
                <div class="flex items-center gap-3 mt-2.5">
                  <span class="text-[10px] text-white/30 flex items-center gap-1">
                    <BIcon name="Users" class="w-3 h-3" />
                    1,200+ брендов
                  </span>
                  <span class="text-[10px] text-white/30 flex items-center gap-1">
                    <BIcon name="TrendingUp" class="w-3 h-3" />
                    До 5х больше охвата
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 sm:shrink-0">
              <button class="px-4 py-2.5 rounded-xl text-xs font-bold border border-white/10 text-white/60 hover:text-white/80 hover:border-white/20 transition-colors">
                Узнать больше
              </button>
              <button class="px-4 py-2.5 rounded-xl text-xs font-black text-white transition-all hover:brightness-110"
                style="background: linear-gradient(90deg, #a855f7, #3b82f6); box-shadow: 0 0 16px rgba(168,85,247,0.35)">
                Подключиться →
              </button>
            </div>
          </div>
        </div>

        <!-- ════════ SEARCH + CATEGORIES + CREATE ════════ -->
        <div class="flex items-center gap-3 mb-6">
          <!-- Search -->
          <div class="relative flex-1">
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
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-brand-card border border-brand-border text-sm font-semibold text-white/70 hover:border-brand-accent/40 transition-colors whitespace-nowrap"
              @click="showCategoryDropdown = !showCategoryDropdown"
            >
              <BIcon name="Filter" class="w-4 h-4" />
              {{ selectedCategoryLabel }}
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
            class="px-4 py-2.5 rounded-2xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-colors shadow-accent flex items-center gap-2 shrink-0"
            @click="showCreateModal = true"
          >
            <BIcon name="Plus" class="w-4 h-4" />
            <span class="hidden sm:inline">{{ langStore.t.createGroup }}</span>
          </button>
        </div>

        <!-- ════════ MAIN CONTENT + SIDEBAR ════════ -->
        <div class="flex gap-6">
          <!-- Left: Groups Grid (2 columns) -->
          <div class="flex-1 min-w-0">
            <div v-if="groupsStore.isLoading" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div v-for="i in 6" :key="i" class="bg-brand-card border border-brand-border rounded-2xl h-[160px] animate-pulse" />
            </div>
            <div v-else-if="displayGroups.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <GroupCard
                v-for="group in displayGroups"
                :key="group.id"
                :group="group"
                @click="router.push({ name: 'group-detail', params: { slugOrId: group.slug } })"
              />
            </div>
            <div v-else class="text-center py-16">
              <div class="w-16 h-16 rounded-3xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto mb-4">
                <BIcon name="Grid" class="w-8 h-8 text-brand-accent" />
              </div>
              <p class="text-white/40 text-sm">Групп пока нет. Создай первую!</p>
            </div>
          </div>

          <!-- Right: Sidebar -->
          <div class="hidden lg:block w-72 shrink-0 space-y-4">
            <!-- Navigation tabs -->
            <div class="bg-brand-card border border-brand-border rounded-2xl p-3 space-y-1">
              <button
                v-for="tab in [
                  { key: 'my' as const,      label: langStore.t.mySubscriptions, icon: 'Heart' },
                  { key: 'for_you' as const, label: langStore.t.forYou,          icon: 'Sparkles' },
                  { key: 'managed' as const, label: langStore.t.managed,         icon: 'ShieldCheck' },
                ]"
                :key="tab.key"
                class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                :class="sidebarTab === tab.key
                  ? 'bg-brand-accent/10 text-brand-accent'
                  : 'text-white/50 hover:text-white/80 hover:bg-brand-bg/40'"
                @click="switchSidebarTab(tab.key)"
              >
                <BIcon :name="tab.icon" class="w-4 h-4" />
                {{ tab.label }}
              </button>
            </div>

            <!-- Category tags -->
            <div class="bg-brand-card border border-brand-border rounded-2xl p-4">
              <h3 class="text-sm font-extrabold text-white mb-3 flex items-center gap-2">
                <BIcon name="Tag" class="w-4 h-4 text-brand-accent" />
                {{ langStore.t.categoriesLabel }}
              </h3>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="cat in categories.filter(c => c.key !== 'all')"
                  :key="cat.key"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
                  :class="selectedCategory === cat.key
                    ? 'bg-brand-accent text-white border-brand-accent'
                    : 'bg-brand-bg/60 text-white/60 border-brand-border hover:border-brand-accent/40 hover:text-white/80'"
                  @click="selectCategory(cat.key)"
                >
                  <BIcon :name="cat.icon" class="w-3 h-3" />
                  {{ cat.label }}
                </button>
              </div>
            </div>

            <!-- Upcoming events: Скоро! -->
            <div v-if="upcomingEvents.length" class="bg-brand-card border border-brand-border rounded-2xl p-4">
              <h3 class="text-sm font-extrabold text-white mb-3 flex items-center gap-2">
                <BIcon name="Flame" class="w-4 h-4 text-amber-400" />
                {{ langStore.t.upcoming }}
              </h3>
              <div class="space-y-2.5">
                <div
                  v-for="ev in upcomingEvents"
                  :key="ev.id"
                  class="flex gap-3 cursor-pointer hover:bg-brand-bg/40 rounded-xl p-2 -mx-1 transition-colors items-center"
                  @click="router.push({ name: 'group-detail', params: { slugOrId: ev.group?.slug || ev.group_id } })"
                >
                  <!-- Group avatar -->
                  <div class="w-11 h-11 rounded-xl overflow-hidden shrink-0 border-2 border-brand-border">
                    <img v-if="ev.group?.avatar_url" :src="ev.group.avatar_url" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full flex items-center justify-center"
                      :style="ev.group?.accent_color ? `background:${ev.group.accent_color}33` : 'background:#4C67CF33'">
                      <BIcon name="CalendarDays" class="w-5 h-5 text-brand-accent" />
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <!-- Event title -->
                    <p class="text-white text-xs font-bold truncate leading-tight">{{ ev.title }}</p>
                    <!-- Group name -->
                    <p v-if="ev.group?.name" class="text-white/50 text-[10px] truncate mt-0.5">{{ ev.group.name }}</p>
                    <!-- Date + members row -->
                    <div class="flex items-center gap-2.5 mt-1">
                      <span class="flex items-center gap-1 text-brand-accent text-[10px] font-semibold">
                        <BIcon name="CalendarDays" class="w-2.5 h-2.5" />
                        {{ fmt(ev.starts_at) }}
                      </span>
                      <span v-if="ev.group && (ev.group.subscriber_count > 0 || ev.group._count?.members > 0)"
                        class="flex items-center gap-1 text-white/40 text-[10px]">
                        <BIcon name="Users" class="w-2.5 h-2.5" />
                        {{ fmtMembers(ev.group.subscriber_count > 0 ? ev.group.subscriber_count : ev.group._count?.members ?? 0) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Close dropdown on outside click -->
    <div v-if="showCategoryDropdown" class="fixed inset-0 z-40" @click="showCategoryDropdown = false" />

    <!-- Create group modal -->
    <CreateGroupModal
      v-if="showCreateModal"
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
