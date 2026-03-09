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

const router = useRouter()
const { nsfwEnabled: nsfwMode } = useNsfwMode()
const activeNav = ref('groups')
const showCreateModal = ref(false)
const search = ref('')
const showCategoryDropdown = ref(false)

const groupsStore = useGroupsStore()
const authStore = useAuthStore()

// Sidebar navigation
const sidebarTab = ref<'all' | 'my' | 'for_you' | 'trending'>('all')

// Category filter (via dropdown)
const selectedCategory = ref<string>('all')
const categories = [
  { key: 'all', label: 'Все категории', icon: 'Grid' },
  { key: 'community', label: 'Сообщества', icon: 'Users' },
  { key: 'event', label: 'Афиша', icon: 'CalendarDays' },
  { key: 'creative', label: 'Творчество', icon: 'Palette' },
  { key: 'news', label: 'Каналы', icon: 'Newspaper' },
  { key: 'shop', label: 'Магазины', icon: 'ShoppingBag' },
  { key: 'brand', label: 'Бренды', icon: 'Building2' },
]

const displayGroups = computed(() => {
  let list: any[] = []

  if (sidebarTab.value === 'my') {
    list = groupsStore.myGroups.map(m => m.group)
  } else if (sidebarTab.value === 'trending') {
    // Sort by subscriber count (trending)
    list = [...groupsStore.groups].sort((a, b) => (b.subscriber_count || b._count.members) - (a.subscriber_count || a._count.members))
  } else {
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
  categories.find(c => c.key === selectedCategory.value)?.label || 'Все категории'
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
  if (tab === 'all' || tab === 'trending') {
    loadData()
  } else if (tab === 'my') {
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
        <div class="mb-6 rounded-3xl overflow-hidden border border-brand-border bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-brand-card relative">
          <div class="px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <BIcon name="Megaphone" class="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 class="text-white font-extrabold text-sm">Бизнес-тариф Bloomly</h3>
                <p class="text-white/40 text-xs mt-0.5">Продвигайте свою группу с помощью рекламных баннеров</p>
              </div>
            </div>
            <button class="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-400/20 hover:bg-amber-500/30 transition-colors">
              Подробнее
            </button>
          </div>
        </div>

        <!-- ════════ SOON BADGES ════════ -->
        <div v-if="groupsStore.mySoonBadges.length" class="flex flex-wrap gap-2 mb-5">
          <SoonBadge
            v-for="badge in groupsStore.mySoonBadges"
            :key="badge.id"
            :short-code="badge.event.short_code"
            class="cursor-pointer hover:scale-105 transition-transform"
            @click="router.push(`/events/${badge.event.id}`)"
          />
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
            <span class="hidden sm:inline">Создать группу</span>
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
                  { key: 'all' as const, label: 'Все группы', icon: 'Grid' },
                  { key: 'my' as const, label: 'Мои подписки', icon: 'Heart' },
                  { key: 'for_you' as const, label: 'Для вас', icon: 'Sparkles' },
                  { key: 'trending' as const, label: 'В тренде', icon: 'TrendingUp' },
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
                Категории
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
                Скоро!
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
