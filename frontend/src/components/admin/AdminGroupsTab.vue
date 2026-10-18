<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatNum, formatDate } from './adminHelpers'
import { useGroupsT } from './groups/strings'

const langStore = useLangStore()
const gt = useGroupsT()

const GROUP_TYPE_LABEL = computed<Record<string, string>>(() => ({
  event: langStore.t.catEvent, creative: langStore.t.adminGroupTypeCreative, artist: langStore.t.verTypeArtist, static: langStore.t.adminGroupTypeStatic,
  news: langStore.t.adminGroupTypeNews, shop: langStore.t.shop, community: langStore.t.adminGroupTypeCommunity, brand: langStore.t.adminGroupTypeBrand,
}))

// ── State ───────────────────────────────────────────────────────────────
const data = ref<any>(null)
const isLoading = ref(false)
const failed = ref(false)
const view = ref<'groups' | 'events'>('groups')
const search = ref('')
const typeFilter = ref('')
const sort = ref('members')
const page = ref(1)
const eventsFilter = ref<'all' | 'upcoming' | 'past'>('all')
let searchDebounce: ReturnType<typeof setTimeout>

const SORTS = ['members', 'growth', 'posts', 'events', 'rating', 'requests', 'newest'] as const
const SORT_LABEL = computed(() => ({
  members: gt('sMembers'), growth: gt('sGrowth'), posts: gt('sPosts'), events: gt('sEvents'),
  rating: gt('sRating'), requests: gt('sRequests'), newest: gt('sNewest'),
}))

const fetchOverview = async () => {
  isLoading.value = true
  failed.value = false
  try {
    const res = await api.get('/admin/groups-overview', {
      params: {
        search: search.value || undefined, type: typeFilter.value || undefined,
        sort: sort.value, page: page.value, events: eventsFilter.value === 'all' ? undefined : eventsFilter.value,
      },
    })
    if (res.data.success) data.value = res.data.data
    else failed.value = true
  } catch { failed.value = true } finally { isLoading.value = false }
}

const onSearch = () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => { page.value = 1; fetchOverview() }, 300)
}
const setType = (t: string) => { typeFilter.value = typeFilter.value === t ? '' : t; page.value = 1; fetchOverview() }
const setSort = () => { page.value = 1; fetchOverview() }
const setEventsFilter = (f: typeof eventsFilter.value) => { eventsFilter.value = f; fetchOverview() }
const goPage = (n: number) => { page.value = n; fetchOverview() }

const stats = computed(() => data.value?.stats)
const tiles = computed(() => !stats.value ? [] : [
  { label: gt('kGroups'), value: stats.value.groups.total, sub: `+${stats.value.groups.newWeek} ${gt('thisWeek')}`, color: '#4C67CF', bg: 'rgba(76,103,207,0.09)',
    foot: `${stats.value.groups.public} ${gt('publicN')} · ${stats.value.groups.private} ${gt('privateN')}` },
  { label: gt('kMembers'), value: stats.value.members.total, sub: `+${stats.value.members.newWeek} ${gt('thisWeek')}`, color: '#10b981', bg: 'rgba(16,185,129,0.07)',
    foot: `${stats.value.members.avgPerGroup} ${gt('perGroup')}` },
  { label: gt('kPosts'), value: stats.value.posts.total, sub: '', color: '#a78bfa', bg: 'rgba(167,139,250,0.07)',
    foot: `${stats.value.groups.verified} ${gt('verifiedN')} · ${stats.value.groups.nsfw} ${gt('nsfwN')}` },
  { label: gt('kEvents'), value: stats.value.events.total, sub: `${stats.value.events.upcoming} ${gt('upcomingShort')}`, color: '#38bdf8', bg: 'rgba(56,189,248,0.07)',
    foot: `${stats.value.events.past} ${gt('pastShort')} · ${stats.value.events.top} ${gt('topN')}` },
  { label: gt('kAttendees'), value: stats.value.events.attendees, sub: '', color: '#f59e0b', bg: 'rgba(245,158,11,0.07)',
    foot: `${stats.value.groups.dealersDen} ${gt('denN')}` },
  { label: gt('kRequests'), value: stats.value.members.pendingRequests, sub: '', color: '#f43f5e', bg: 'rgba(244,63,94,0.07)', foot: '' },
])

const initial = (name?: string | null) => (name || '?')[0].toUpperCase()
const statusLabel = (e: any) => e.isUpcoming ? gt('upcoming') : gt('past')

onActivated(() => { if (!data.value) fetchOverview() })
</script>

<template>
  <div>
    <div v-if="failed && !data" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
      <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
      <button type="button" @click="fetchOverview" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 hover:bg-white/12 text-white/70 transition-all">{{ gt('retry') }}</button>
    </div>

    <div v-else-if="!data" class="stack-y-5">
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div v-for="n in 6" :key="n" class="h-28 rounded-2xl bg-white/5 animate-pulse" />
      </div>
      <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
    </div>

    <template v-else>
      <!-- Stat tiles -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-4">
        <div v-for="t in tiles" :key="t.label" class="rounded-2xl px-4 py-3" :style="`background:${t.bg}`">
          <p class="text-[10px] font-bold uppercase tracking-wide truncate" :style="`color:${t.color}b3`">{{ t.label }}</p>
          <p class="text-2xl font-black mt-0.5" :style="`color:${t.color}`">{{ formatNum(t.value) }}</p>
          <p v-if="t.sub" class="text-[11px] font-bold text-white/55 mt-0.5">{{ t.sub }}</p>
          <p v-if="t.foot" class="text-[10px] text-white/30 mt-1 truncate">{{ t.foot }}</p>
        </div>
      </div>

      <!-- Type breakdown (click = filter) -->
      <div v-if="stats.byType.length" class="flex flex-wrap items-center gap-2 mb-5">
        <button v-for="t in stats.byType" :key="t.type" type="button" @click="view = 'groups'; setType(t.type)"
          class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
          :class="typeFilter === t.type ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/50 hover:text-white/80'">
          {{ GROUP_TYPE_LABEL[t.type] ?? t.type }}
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10">{{ t.count }}</span>
        </button>
      </div>

      <!-- Groups / Events toggle -->
      <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/4 w-fit">
        <button type="button" @click="view = 'groups'"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
          :class="view === 'groups' ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/40 hover:text-white/70'">
          <BIcon name="Users" class="w-3.5 h-3.5" /> {{ gt('tabGroups') }}
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{{ data.total }}</span>
        </button>
        <button type="button" @click="view = 'events'"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
          :class="view === 'events' ? 'bg-sky-500/20 text-sky-400' : 'text-white/40 hover:text-white/70'">
          <BIcon name="CalendarDays" class="w-3.5 h-3.5" /> {{ gt('tabEvents') }}
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{{ stats.events.total }}</span>
        </button>
      </div>

      <!-- ═════════ Groups ═════════ -->
      <template v-if="view === 'groups'">
        <div class="flex flex-wrap items-center gap-3 mb-5">
          <div class="relative flex-1 max-w-sm min-w-[200px]">
            <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input v-model="search" @input="onSearch" type="text" :placeholder="gt('search')"
              class="w-full bg-white/6 border border-transparent rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                outline-hidden focus:border-brand-accent/40 focus:bg-white/8 transition-all" />
          </div>
          <select v-model="sort" @change="setSort"
            class="bg-white/6 border border-transparent rounded-2xl px-3.5 py-2.5 text-xs font-bold text-white/70 outline-hidden hover:bg-white/8 focus:border-brand-accent/40 cursor-pointer transition-all">
            <option v-for="s in SORTS" :key="s" :value="s" class="bg-[#1F223C]">{{ SORT_LABEL[s] }}</option>
          </select>
          <button v-if="typeFilter" type="button" @click="setType(typeFilter)"
            class="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold bg-brand-accent/15 text-brand-accent">
            {{ GROUP_TYPE_LABEL[typeFilter] ?? typeFilter }} <BIcon name="X" class="w-3 h-3" />
          </button>
        </div>

        <div v-if="!data.groups.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
          <BIcon name="Users" class="w-10 h-10 opacity-40" />
          <p class="text-sm font-semibold">{{ gt('empty') }}</p>
        </div>

        <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4" :class="{ 'opacity-60 pointer-events-none transition-opacity': isLoading }">
          <article v-for="g in data.groups" :key="g.id"
            class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden flex flex-col hover:border-brand-accent/30 transition-all">
            <!-- Banner + avatar -->
            <div class="relative h-24 shrink-0" :style="g.bannerUrl ? '' : `background:linear-gradient(135deg,${g.accentColor || '#4C67CF'}55,rgba(139,92,246,0.15))`">
              <img v-if="g.bannerUrl" :src="g.bannerUrl" alt="" loading="lazy" class="w-full h-full object-cover" />
              <div class="absolute inset-0 bg-linear-to-t/srgb from-black/55 to-transparent" />
              <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5 flex-wrap justify-end">
                <span v-if="g.isVerified" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-500/80 text-white">{{ gt('vVerified') }}</span>
                <span v-if="g.isNsfw" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/80 text-white">NSFW</span>
                <span v-if="!g.isPublic" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/60 text-white/80">{{ gt('vPrivate') }}</span>
              </div>
            </div>

            <div class="p-5 pt-0 flex flex-col gap-4 flex-1">
              <div class="flex items-end gap-3 -mt-7 relative">
                <img v-if="g.avatarUrl" :src="g.avatarUrl" alt="" loading="lazy" class="w-14 h-14 rounded-2xl object-cover border-2 border-brand-card shrink-0" />
                <div v-else class="w-14 h-14 rounded-2xl border-2 border-brand-card bg-brand-accent/25 flex items-center justify-center text-lg font-black text-brand-accent shrink-0">{{ initial(g.name) }}</div>
                <div class="min-w-0 pb-0.5">
                  <p class="font-extrabold text-white truncate">{{ g.name }}</p>
                  <p class="text-xs text-white/40 truncate">/{{ g.slug }} · {{ GROUP_TYPE_LABEL[g.type] ?? g.type }}<template v-if="g.category"> · {{ g.category }}</template></p>
                </div>
              </div>

              <p class="text-xs text-white/50 line-clamp-2 min-h-8" :class="{ 'italic text-white/25': !g.description }">{{ g.description || gt('noDescription') }}</p>

              <!-- Metrics -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div class="rounded-xl bg-white/4 px-3 py-2">
                  <p class="text-[10px] font-bold text-white/35 uppercase">{{ gt('members') }}</p>
                  <p class="text-base font-black text-white">{{ formatNum(g.memberCount) }}</p>
                  <p class="text-[10px] font-bold" :class="g.newMembers ? 'text-emerald-400' : 'text-white/25'">+{{ g.newMembers }} {{ gt('thisWeek') }}</p>
                </div>
                <div class="rounded-xl bg-white/4 px-3 py-2">
                  <p class="text-[10px] font-bold text-white/35 uppercase">{{ gt('posts') }}</p>
                  <p class="text-base font-black text-white">{{ formatNum(g.posts) }}</p>
                  <p class="text-[10px] font-bold" :class="g.postsWeek ? 'text-emerald-400' : 'text-white/25'">+{{ g.postsWeek }} {{ gt('thisWeek') }}</p>
                </div>
                <div class="rounded-xl bg-white/4 px-3 py-2">
                  <p class="text-[10px] font-bold text-white/35 uppercase">{{ gt('events') }}</p>
                  <p class="text-base font-black text-white">{{ g.eventsTotal }}</p>
                  <p class="text-[10px] font-bold" :class="g.eventsUpcoming ? 'text-sky-400' : 'text-white/25'">{{ g.eventsUpcoming }} {{ gt('upcomingShort') }}</p>
                </div>
                <div class="rounded-xl bg-white/4 px-3 py-2">
                  <p class="text-[10px] font-bold text-white/35 uppercase">{{ gt('rating') }}</p>
                  <p class="text-base font-black text-white">{{ g.ratingCount ? g.rating : '—' }}</p>
                  <p class="text-[10px] font-bold text-white/25">{{ g.ratingCount }} ★</p>
                </div>
              </div>

              <!-- Secondary facts -->
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40">
                <span>{{ formatNum(g.subscribers) }} {{ gt('subscribers') }}</span>
                <span :class="g.pendingRequests ? 'text-amber-400 font-bold' : ''">{{ g.pendingRequests }} {{ gt('requests') }}</span>
                <span>{{ formatNum(g.attendeesTotal) }} {{ gt('signups') }}</span>
                <span v-if="g.dealersDen" class="text-amber-400/80">Dealers Den</span>
                <span v-if="g.donations" class="text-emerald-400/80">{{ gt('vDonations') }}</span>
                <span v-if="g.business" class="text-violet-300/80">{{ gt('vBusiness') }}</span>
              </div>
              <p class="text-[11px] text-white/45 truncate">
                <span class="text-white/30">{{ gt('nextEvent') }}:</span>
                <template v-if="g.nextEvent"> {{ g.nextEvent.title }} · {{ formatDate(g.nextEvent.startsAt) }}</template>
                <template v-else> {{ gt('noEvents') }}</template>
              </p>

              <!-- Owner + actions -->
              <div class="mt-auto flex items-center gap-3 pt-3 border-t border-brand-border">
                <img v-if="g.owner.avatarUrl" :src="g.owner.avatarUrl" alt="" loading="lazy" class="w-7 h-7 rounded-full object-cover shrink-0" />
                <div v-else class="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-[10px] font-bold text-white/40 shrink-0">{{ initial(g.owner.displayName || g.owner.username) }}</div>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold text-white/30 uppercase leading-none">{{ gt('owner') }}</p>
                  <router-link :to="`/profile/${g.owner.username}`" target="_blank" class="text-xs font-bold text-white/70 hover:text-brand-accent truncate block">@{{ g.owner.username }}</router-link>
                </div>
                <span class="text-[10px] text-white/25 shrink-0">{{ gt('created') }} {{ formatDate(g.createdAt) }}</span>
                <router-link :to="`/groups/${g.slug}`" target="_blank"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/25 transition-all shrink-0">
                  <BIcon name="ExternalLink" class="w-3.5 h-3.5" /> {{ gt('open') }}
                </router-link>
              </div>
            </div>
          </article>
        </div>

        <div v-if="data.pages > 1" class="flex items-center justify-center gap-2 mt-5">
          <button @click="goPage(page - 1)" :disabled="page <= 1"
            class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 hover:text-white disabled:opacity-30 transition-all">{{ gt('prev') }}</button>
          <span class="text-xs font-bold text-white/40 px-3">{{ page }} / {{ data.pages }}</span>
          <button @click="goPage(page + 1)" :disabled="page >= data.pages"
            class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 hover:text-white disabled:opacity-30 transition-all">{{ gt('next') }}</button>
        </div>
      </template>

      <!-- ═════════ Events ═════════ -->
      <template v-else>
        <div class="flex gap-2 mb-5 flex-wrap">
          <button v-for="f in (['all', 'upcoming', 'past'] as const)" :key="f" @click="setEventsFilter(f)"
            class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
            :class="eventsFilter === f ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/40 hover:text-white/70'">
            {{ { all: gt('fAll'), upcoming: gt('fUpcoming'), past: gt('fPast') }[f] }}
          </button>
        </div>

        <div v-if="!data.events.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
          <BIcon name="CalendarDays" class="w-10 h-10 opacity-40" />
          <p class="text-sm font-semibold">{{ gt('emptyEvents') }}</p>
        </div>

        <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4" :class="{ 'opacity-60 pointer-events-none transition-opacity': isLoading }">
          <router-link v-for="e in data.events" :key="e.id" :to="`/groups/${e.groupSlug}`" target="_blank"
            class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden flex hover:border-brand-accent/30 transition-all"
            :class="{ 'opacity-70': !e.isUpcoming }">
            <div class="w-28 sm:w-36 shrink-0 relative bg-white/4">
              <img v-if="e.bannerUrl" :src="e.bannerUrl" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" />
              <div v-else class="absolute inset-0 flex items-center justify-center text-sky-400/50"><BIcon name="CalendarDays" class="w-9 h-9" /></div>
            </div>
            <div class="p-4 min-w-0 flex-1 flex flex-col gap-2.5">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                  :class="e.isUpcoming ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/35'">{{ statusLabel(e) }}</span>
                <span v-if="e.isTop" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{{ gt('top') }}</span>
                <span v-if="e.isRecurring" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">{{ gt('recurring') }}</span>
                <span v-if="e.shortCode" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/50">{{ e.shortCode }}</span>
              </div>
              <p class="font-extrabold text-white leading-snug line-clamp-2">{{ e.title }}</p>
              <div class="flex items-center gap-2 min-w-0">
                <img v-if="e.groupAvatar" :src="e.groupAvatar" alt="" loading="lazy" class="w-5 h-5 rounded-md object-cover shrink-0" />
                <span class="text-xs font-semibold text-white/60 truncate">{{ e.groupName }}</span>
              </div>
              <p class="text-xs text-white/45">{{ formatDate(e.startsAt) }}<template v-if="e.endsAt"> — {{ formatDate(e.endsAt) }}</template></p>
              <p class="text-xs text-white/35 truncate">{{ e.location || gt('noLocation') }}</p>
              <div class="mt-auto grid grid-cols-3 gap-2 pt-2">
                <div class="rounded-xl bg-white/4 px-2.5 py-1.5">
                  <p class="text-sm font-black text-white">{{ formatNum(e.attendeeCount) }}</p>
                  <p class="text-[10px] text-white/30">{{ gt('signups') }}</p>
                </div>
                <div class="rounded-xl bg-white/4 px-2.5 py-1.5">
                  <p class="text-sm font-black text-emerald-400">{{ e.going }}</p>
                  <p class="text-[10px] text-white/30">{{ gt('going') }} · {{ e.maybe }} {{ gt('maybe') }}</p>
                </div>
                <div class="rounded-xl bg-white/4 px-2.5 py-1.5">
                  <p class="text-sm font-black text-white">{{ e.subEvents }}<span class="text-white/25"> / {{ e.tickets }}</span></p>
                  <p class="text-[10px] text-white/30 truncate" :title="`${gt('program')} / ${gt('tickets')}`">{{ gt('program') }} / {{ gt('tickets') }}</p>
                </div>
              </div>
            </div>
          </router-link>
        </div>
      </template>
    </template>
  </div>
</template>
