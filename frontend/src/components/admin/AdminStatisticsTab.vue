<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatNum, barMax } from './adminHelpers'
import AdminOnlineTab from './AdminOnlineTab.vue'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { networkStats, isLoadingStatistics, fetchStatistics, statsSubTab } = useAdminContext()

// ── Infrastructure ────────────────────────────────────────────────────────
const infraOverview = ref<any>(null)
const isLoadingInfra = ref(false)
const fetchInfraOverview = async () => {
  if (infraOverview.value) return
  isLoadingInfra.value = true
  try {
    const res = await api.get('/admin/infra-overview')
    if (res.data.success) infraOverview.value = res.data.data
  } catch {} finally { isLoadingInfra.value = false }
}
const formatBytes = (bytes: number) => {
  const units = [langStore.t.adminUnitBytes, langStore.t.adminUnitKB, langStore.t.adminUnitMB, langStore.t.adminUnitGB, langStore.t.adminUnitTB]
  if (!bytes) return `0 ${units[0]}`
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}
const FOLDER_LABEL = computed<Record<string, string>>(() => ({
  posts: langStore.t.adminFolderPostImages, avatars: langStore.t.adminFolderAvatars, banners: langStore.t.adminFolderBanners, stickers: langStore.t.stickers,
  video: langStore.t.adminFolderVideo, stories: langStore.t.adminFolderStories, other: langStore.t.other, messages: langStore.t.adminFolderDmAttachments,
  backgrounds: langStore.t.adminFolderProfileBackgrounds, fursona: langStore.t.adminFolderFursonaPhotos, fursuit: langStore.t.fursuitPhotoLabel, comments: langStore.t.adminFolderCommentAttachments,
}))

const topKnownCountryLabel = computed(() => {
  const rows = networkStats.value?.usersByCountry ?? []
  return rows.find((r: any) => r.label && r.label !== 'Не указана')?.label ?? '—'
})

const refreshStatistics = () => {
  networkStats.value = null
  fetchStatistics()
}

onActivated(fetchStatistics)
</script>

<template>
  <div>

    <!-- Sub-tabs -->
    <div class="flex gap-2 mb-6">
      <button @click="statsSubTab='network'"
        class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
        :class="statsSubTab==='network'
          ? 'text-white border border-emerald-500/30'
          : 'text-white/40 hover:text-white/70 bg-white/3 border border-brand-border'"
        :style="statsSubTab==='network' ? 'background:rgba(16,185,129,0.12)' : ''">
        <BIcon name="Globe" class="w-4 h-4" /> {{ langStore.t.adminNetworkLabel }}
      </button>
      <button @click="statsSubTab='infra'; if (!infraOverview) fetchInfraOverview()"
        class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
        :class="statsSubTab==='infra'
          ? 'text-white border border-emerald-500/30'
          : 'text-white/40 hover:text-white/70 bg-white/3 border border-brand-border'"
        :style="statsSubTab==='infra' ? 'background:rgba(16,185,129,0.12)' : ''">
        <BIcon name="Server" class="w-4 h-4" /> {{ langStore.t.adminNavInfra }}
      </button>
      <button @click="statsSubTab='online'"
        class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
        :class="statsSubTab==='online'
          ? 'text-white border border-emerald-500/30'
          : 'text-white/40 hover:text-white/70 bg-white/3 border border-brand-border'"
        :style="statsSubTab==='online' ? 'background:rgba(16,185,129,0.12)' : ''">
        <BIcon name="Activity" class="w-4 h-4" /> Онлайн и активность
      </button>
      <button v-if="statsSubTab !== 'online'" @click="statsSubTab==='infra' ? (infraOverview=null, fetchInfraOverview()) : refreshStatistics()"
        class="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs text-white/40 hover:text-white bg-white/3 border border-brand-border transition-all">
        <BIcon name="RefreshCw" class="w-3.5 h-3.5" /> {{ langStore.t.adminRefreshBtn }}
      </button>
    </div>

    <!-- ─── ONLINE sub-tab ─────────────────────────────────────── -->
    <AdminOnlineTab v-if="statsSubTab === 'online'" />

    <!-- Loading skeleton -->
    <template v-else-if="statsSubTab !== 'infra' && isLoadingStatistics">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="n in 4" :key="n" class="rounded-3xl border border-brand-border p-6 animate-pulse" style="background:#1F223C">
          <div class="h-4 bg-white/8 rounded-full w-32 mb-4" />
          <div class="stack-y-2">
            <div v-for="i in 5" :key="i" class="h-6 bg-white/5 rounded-xl" :style="`width:${60+i*8}%`" />
          </div>
        </div>
      </div>
    </template>

    <!-- ─── INFRASTRUCTURE sub-tab loading ──────────────────────── -->
    <template v-else-if="statsSubTab === 'infra' && isLoadingInfra">
      <div class="stack-y-5">
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div v-for="n in 3" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
        </div>
        <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
      </div>
    </template>

    <!-- ─── NETWORK sub-tab ─────────────────────────────────── -->
    <template v-else-if="statsSubTab === 'network' && networkStats">

      <!-- Summary cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminStatTotalUsers }}</p>
          <p class="text-2xl font-black text-white">{{ formatNum(networkStats.totalUsers) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTotalGroupsLabel }}</p>
          <p class="text-2xl font-black text-purple-400">{{ formatNum(networkStats.totalGroups) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTopCountryLabel }}</p>
          <p class="text-lg font-black text-white truncate">{{ topKnownCountryLabel }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTopSpeciesLabel }}</p>
          <p class="text-lg font-black text-white truncate capitalize">{{ networkStats.usersBySpecies[0]?.label ?? '—' }}</p>
        </div>
      </div>

      <!-- Charts row 2: by species / country / age / pronouns -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        <!-- By Species -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="PawPrint" class="w-4 h-4 text-amber-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersBySpeciesTitle }}</h3>
          </div>
          <div v-if="networkStats.usersBySpecies.length" class="stack-y-2.5">
            <div v-for="item in networkStats.usersBySpecies.slice(0,10)" :key="item.label">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-white/60 font-semibold capitalize truncate max-w-[140px]">{{ item.label }}</span>
                <span class="text-white font-black">{{ formatNum(item.value) }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-full"
                  :style="`width:${(item.value/barMax(networkStats.usersBySpecies))*100}%;background:linear-gradient(to right,#f59e0b,#fbbf24)`" />
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        <!-- By Age -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="CalendarDays" class="w-4 h-4 text-indigo-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersByAgeTitle }}</h3>
          </div>
          <div v-if="networkStats.usersByAge.length" class="stack-y-2.5">
            <div v-for="item in networkStats.usersByAge" :key="item.label">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-white/60 font-semibold">{{ item.label }}</span>
                <span class="text-white font-black">{{ formatNum(item.value) }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-full"
                  :style="`width:${(item.value/barMax(networkStats.usersByAge))*100}%;background:linear-gradient(to right,#6366f1,#818cf8)`" />
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
        </div>

        <!-- By Pronouns -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="Heart" class="w-4 h-4 text-pink-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersByPronounTitle }}</h3>
          </div>
          <div v-if="networkStats.usersByPronoun.length" class="stack-y-2.5">
            <div v-for="item in networkStats.usersByPronoun" :key="item.label">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-white/60 font-semibold truncate max-w-[140px]">{{ item.label }}</span>
                <span class="text-white font-black">{{ formatNum(item.value) }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-full"
                  :style="`width:${(item.value/barMax(networkStats.usersByPronoun))*100}%;background:linear-gradient(to right,#ec4899,#f472b6)`" />
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
        </div>
      </div>

      <!-- Top posters + most followed -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        <!-- Top posters -->
        <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
          <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
            <BIcon name="Pencil" class="w-4 h-4 text-sky-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopPostersTitle }}</h3>
          </div>
          <div class="divide-y divide-brand-border">
            <div v-for="(u, idx) in networkStats.topPosters" :key="u.userId"
              @click="u.username && router.push({ name: 'profile', params: { username: u.username } })"
              class="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-all cursor-pointer">
              <span class="w-5 text-center text-xs font-black"
                :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
              <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
              <div v-else class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/15 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                {{ (u.displayName || u.username || '?')[0].toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate">{{ u.displayName || u.username }}</p>
                <p class="text-xs text-white/35">@{{ u.username }}</p>
              </div>
              <span class="text-sm font-black text-sky-400">{{ formatNum(u.count) }}</span>
            </div>
          </div>
        </div>

        <!-- Most followed -->
        <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
          <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
            <BIcon name="Star" class="w-4 h-4 text-yellow-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminMostFollowedTitle }}</h3>
            <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminByFollowersLabel }}</span>
          </div>
          <div class="divide-y divide-brand-border">
            <div v-for="(u, idx) in networkStats.mostFollowed" :key="u.userId"
              @click="u.username && router.push({ name: 'profile', params: { username: u.username } })"
              class="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-all cursor-pointer">
              <span class="w-5 text-center text-xs font-black"
                :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
              <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
              <div v-else class="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/15 flex items-center justify-center text-xs font-bold text-yellow-300 shrink-0">
                {{ (u.displayName || u.username || '?')[0].toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate">{{ u.displayName || u.username }}</p>
                <p class="text-xs text-white/35">@{{ u.username }}</p>
              </div>
              <span class="text-sm font-black text-yellow-400">{{ formatNum(u.count) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Top groups -->
      <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
        <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
          <BIcon name="Users" class="w-4 h-4 text-purple-400" />
          <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopGroupsTitle }}</h3>
          <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminByMembersLabel }}</span>
        </div>
        <div class="divide-y divide-brand-border">
          <div v-for="(g, idx) in networkStats.topGroups" :key="g.id"
            @click="router.push({ name: 'group-detail', params: { slugOrId: g.id } })"
            class="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-all cursor-pointer">
            <span class="w-5 text-center text-xs font-black"
              :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
            <img v-if="g.avatarUrl" :src="g.avatarUrl" class="w-8 h-8 rounded-xl object-cover border border-white/10 shrink-0" />
            <div v-else class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/15 flex items-center justify-center text-xs font-bold text-purple-300 shrink-0">
              {{ g.name[0]?.toUpperCase() ?? '?' }}
            </div>
            <p class="flex-1 text-sm font-bold text-white truncate">{{ g.name }}</p>
            <span class="text-sm font-black text-purple-400">{{ formatNum(g.memberCount) }}</span>
          </div>
        </div>
      </div>

    </template>

    <!-- ─── INFRASTRUCTURE sub-tab ─────────────────────────────── -->
    <template v-else-if="statsSubTab === 'infra' && infraOverview">
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminS3UsedLabel }}</p>
          <p class="text-2xl font-black text-white">{{ formatBytes(infraOverview.storage.totalBytes) }}</p>
          <p class="text-xs font-semibold text-brand-accent mt-1">{{ formatNum(infraOverview.storage.totalObjects) }} {{ langStore.t.adminFilesSuffix }}</p>
        </div>
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminStickersInSystemLabel }}</p>
          <p class="text-2xl font-black text-white">{{ formatNum(infraOverview.stickers.fileCount) }}</p>
          <p class="text-xs font-semibold text-emerald-400 mt-1">{{ langStore.t.adminInPrefix }} {{ infraOverview.stickers.packCount }} {{ langStore.t.adminPacksUsageSuffix }}</p>
        </div>
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminDealersDenLotsLabel }}</p>
          <p class="text-2xl font-black text-white">{{ infraOverview.dealersDen.activeListings }}</p>
          <p class="text-xs font-semibold text-amber-400 mt-1">{{ infraOverview.dealersDen.soldThisMonthCount }} {{ langStore.t.adminSalesThisMonthSuffix }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-5">
        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminS3StorageTitle }}</h3>
          <p class="text-xs text-white/40 mb-3">{{ formatBytes(infraOverview.storage.totalBytes) }} {{ langStore.t.adminInPrefix }} {{ infraOverview.storage.totalObjects }} {{ langStore.t.adminFilesLocativeSuffix }}</p>
          <div v-for="f in infraOverview.storage.byFolder" :key="f.folder" class="mb-3 last:mb-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-white/60">{{ FOLDER_LABEL[f.folder] ?? f.folder }}</span>
              <span class="text-xs font-bold text-white">{{ formatBytes(f.bytes) }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div class="h-full rounded-full bg-brand-accent" :style="`width:${Math.round((f.bytes / infraOverview.storage.totalBytes) * 100)}%`" />
            </div>
          </div>
          <p v-if="!infraOverview.storage.byFolder.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminStorageEmpty }}</p>
        </div>
      </div>
    </template>

    <!-- Empty state when no data yet -->
    <div v-else-if="(statsSubTab === 'infra' && !isLoadingInfra) || (statsSubTab !== 'infra' && !isLoadingStatistics)" class="flex flex-col items-center gap-4 py-24 text-white/25">
      <BIcon name="BarChart2" class="w-12 h-12 opacity-30" />
      <p class="text-sm font-semibold">{{ langStore.t.adminNoDataLabel }}</p>
    </div>

  </div>
</template>
