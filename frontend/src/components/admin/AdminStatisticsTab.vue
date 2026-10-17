<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import StickerPackDetailModal from '@/components/StickerPackDetailModal.vue'
import { formatNum, barMax } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { stickerStats, networkStats, isLoadingStatistics, fetchStatistics } = useAdminContext()

const statsSubTab = ref<'stickers' | 'network' | 'infra'>('stickers')

const packThumb = (pack: any) => pack.cover_url || pack.stickers?.[pack.cover_sticker_idx ?? 0] || pack.stickers?.[0] || ''

// ── Sticker pack detail modal ───────────────────────────────────────────
const openedPackId = ref<string | null>(null)
const openStickerPackDetail = (packId: string) => { openedPackId.value = packId }
const closeStickerPackDetail = () => { openedPackId.value = null }

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
  stickerStats.value = null
  networkStats.value = null
  fetchStatistics()
}

onActivated(fetchStatistics)
</script>

<template>
  <div>

    <!-- Sub-tabs -->
    <div class="flex gap-2 mb-6">
      <button @click="statsSubTab='stickers'"
        class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
        :class="statsSubTab==='stickers'
          ? 'text-white border border-emerald-500/30'
          : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
        :style="statsSubTab==='stickers' ? 'background:rgba(16,185,129,0.12)' : ''">
        <BIcon name="Sticker" class="w-4 h-4" /> {{ langStore.t.stickers }}
      </button>
      <button @click="statsSubTab='network'"
        class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
        :class="statsSubTab==='network'
          ? 'text-white border border-emerald-500/30'
          : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
        :style="statsSubTab==='network' ? 'background:rgba(16,185,129,0.12)' : ''">
        <BIcon name="Globe" class="w-4 h-4" /> {{ langStore.t.adminNetworkLabel }}
      </button>
      <button @click="statsSubTab='infra'; if (!infraOverview) fetchInfraOverview()"
        class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
        :class="statsSubTab==='infra'
          ? 'text-white border border-emerald-500/30'
          : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
        :style="statsSubTab==='infra' ? 'background:rgba(16,185,129,0.12)' : ''">
        <BIcon name="Server" class="w-4 h-4" /> {{ langStore.t.adminNavInfra }}
      </button>
      <button @click="statsSubTab==='infra' ? (infraOverview=null, fetchInfraOverview()) : refreshStatistics()"
        class="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs text-white/40 hover:text-white bg-white/[0.03] border border-brand-border transition-all">
        <BIcon name="RefreshCw" class="w-3.5 h-3.5" /> {{ langStore.t.adminRefreshBtn }}
      </button>
    </div>

    <!-- Loading skeleton -->
    <template v-if="statsSubTab !== 'infra' && isLoadingStatistics">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="n in 4" :key="n" class="rounded-3xl border border-brand-border p-6 animate-pulse" style="background:#1F223C">
          <div class="h-4 bg-white/[0.08] rounded-full w-32 mb-4" />
          <div class="space-y-2">
            <div v-for="i in 5" :key="i" class="h-6 bg-white/5 rounded-xl" :style="`width:${60+i*8}%`" />
          </div>
        </div>
      </div>
    </template>

    <!-- ─── INFRASTRUCTURE sub-tab loading ──────────────────────── -->
    <template v-else-if="statsSubTab === 'infra' && isLoadingInfra">
      <div class="space-y-5">
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div v-for="n in 3" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
        </div>
        <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
      </div>
    </template>

    <!-- ─── STICKERS sub-tab ─────────────────────────────────── -->
    <template v-else-if="statsSubTab === 'stickers' && stickerStats">

      <!-- Top row summary -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminPacksTotalLabel }}</p>
          <p class="text-2xl font-black text-white">{{ formatNum(stickerStats.totals.totalPacks) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTop1UsageLabel }}</p>
          <p class="text-2xl font-black text-emerald-400">{{ formatNum(stickerStats.topPacks[0]?.use_count ?? 0) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTop1DownloadsLabel }}</p>
          <p class="text-2xl font-black text-indigo-400">{{ formatNum(stickerStats.topPacks[0]?.downloads_count ?? 0) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminUniqueStickersLabel }}</p>
          <p class="text-2xl font-black text-white">{{ formatNum(stickerStats.totals.uniqueStickers) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTotalDownloadsLabel }}</p>
          <p class="text-2xl font-black text-sky-400">{{ formatNum(stickerStats.totals.totalDownloads) }}</p>
        </div>
        <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTotalFavoritesLabel }}</p>
          <p class="text-2xl font-black text-rose-400">{{ formatNum(stickerStats.totals.totalFavorites) }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        <!-- Top Packs list -->
        <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
          <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
            <BIcon name="TrendingUp" class="w-4 h-4 text-emerald-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopStickerPacksTitle }}</h3>
            <span class="ml-auto text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{{ langStore.t.adminByUsageLabel }}</span>
          </div>
          <div class="divide-y divide-brand-border">
            <div v-for="(pack, idx) in stickerStats.topPacks.slice(0,10)" :key="pack.id"
              @click="openStickerPackDetail(pack.id)"
              class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
              <span class="w-5 text-center text-xs font-black"
                :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">
                {{ idx+1 }}
              </span>
              <div class="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden border border-white/10"
                :style="pack.cover_bg_color ? `background:${pack.cover_bg_color}` : 'background:rgba(255,255,255,0.05)'">
                <img v-if="packThumb(pack)" :src="packThumb(pack)" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-lg">🎭</div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate flex items-center gap-1.5">
                  {{ pack.name }}
                  <span v-if="pack.is_nsfw" class="text-[9px] font-extrabold px-1 py-0.5 rounded bg-rose-500/20 text-rose-400">18+</span>
                </p>
                <p class="text-xs text-white/35 truncate">@{{ pack.author?.username ?? '—' }}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-sm font-black text-emerald-400">{{ formatNum(pack.use_count) }}</p>
                <p class="text-[10px] text-white/25">{{ formatNum(pack.downloads_count) }} {{ langStore.t.adminDownloadsShortSuffix }}</p>
              </div>
              <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 flex-shrink-0" />
            </div>
          </div>
        </div>

        <!-- Daily usage chart -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="Activity" class="w-4 h-4 text-emerald-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminStickerUsageTitle }}</h3>
            <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminLast30DaysLabel }}</span>
          </div>
          <div v-if="stickerStats.dailyUsage.length" class="flex items-end gap-0.5 h-32">
            <div v-for="(point, idx) in stickerStats.dailyUsage" :key="idx"
              class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
              <div class="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none z-10">
                {{ point.value }}
              </div>
              <div class="w-full rounded-t transition-all hover:opacity-100 opacity-70 min-h-[2px]"
                :style="`height:${Math.max(2, (point.value / barMax(stickerStats.dailyUsage)) * 128)}px;
                  background:linear-gradient(to top,#10b981,#34d399)`" />
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-12">{{ langStore.t.adminNoDataLabel }}</p>
        </div>
      </div>

      <!-- By Age / Species / Country charts -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

        <!-- By Age -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="CalendarDays" class="w-4 h-4 text-indigo-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminByAgeTitle }}</h3>
          </div>
          <div v-if="stickerStats.byAge.length" class="space-y-2">
            <div v-for="item in stickerStats.byAge" :key="item.label" class="group">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-white/60 font-semibold">{{ item.label }}</span>
                <span class="text-white font-black">{{ formatNum(item.value) }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-full transition-all"
                  :style="`width:${(item.value/barMax(stickerStats.byAge))*100}%;background:linear-gradient(to right,#6366f1,#8b5cf6)`" />
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
        </div>

        <!-- By Species -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="PawPrint" class="w-4 h-4 text-amber-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminBySpeciesTitle }}</h3>
          </div>
          <div v-if="stickerStats.bySpecies.length" class="space-y-2">
            <div v-for="item in stickerStats.bySpecies.slice(0,8)" :key="item.label" class="group">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-white/60 font-semibold capitalize truncate max-w-[120px]">{{ item.label }}</span>
                <span class="text-white font-black">{{ formatNum(item.value) }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-full transition-all"
                  :style="`width:${(item.value/barMax(stickerStats.bySpecies))*100}%;background:linear-gradient(to right,#f59e0b,#fbbf24)`" />
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
        </div>

        <!-- By Country -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="MapPin" class="w-4 h-4 text-rose-400" />
            <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminByCountryTitle }}</h3>
          </div>
          <div v-if="stickerStats.byCountry.length" class="space-y-2">
            <div v-for="item in stickerStats.byCountry.slice(0,8)" :key="item.label" class="group">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-white/60 font-semibold truncate max-w-[120px]">{{ item.label }}</span>
                <span class="text-white font-black">{{ formatNum(item.value) }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                <div class="h-full rounded-full transition-all"
                  :style="`width:${(item.value/barMax(stickerStats.byCountry))*100}%;background:linear-gradient(to right,#ef4444,#f87171)`" />
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
        </div>
      </div>

      <!-- Top individual stickers -->
      <div class="rounded-3xl border border-brand-border p-5 mt-4" style="background:#1F223C">
        <div class="flex items-center gap-2 mb-4">
          <BIcon name="Sparkles" class="w-4 h-4 text-fuchsia-400" />
          <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopStickersTitle }}</h3>
          <span class="ml-auto text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{{ langStore.t.adminByUsageLabel }}</span>
        </div>
        <div v-if="stickerStats.topStickers.length" class="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12 gap-3">
          <div v-for="s in stickerStats.topStickers" :key="s.url"
            @click="s.packId && openStickerPackDetail(s.packId)"
            class="group relative rounded-xl overflow-hidden border border-white/10 aspect-square bg-white/[0.03]"
            :class="s.packId ? 'cursor-pointer hover:border-fuchsia-400/40' : ''"
            :title="s.packName ?? ''">
            <img :src="s.url" class="w-full h-full object-contain p-1" loading="lazy" />
            <span class="absolute bottom-0 right-0 text-[9px] font-black text-white bg-black/70 px-1.5 py-0.5 rounded-tl-lg">
              {{ formatNum(s.total) }}
            </span>
          </div>
        </div>
        <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
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
          <div v-if="networkStats.usersBySpecies.length" class="space-y-2.5">
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
          <div v-if="networkStats.usersByAge.length" class="space-y-2.5">
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
          <div v-if="networkStats.usersByPronoun.length" class="space-y-2.5">
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
              class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
              <span class="w-5 text-center text-xs font-black"
                :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
              <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" />
              <div v-else class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/15 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
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
              class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
              <span class="w-5 text-center text-xs font-black"
                :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
              <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" />
              <div v-else class="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/15 flex items-center justify-center text-xs font-bold text-yellow-300 flex-shrink-0">
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
            class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
            <span class="w-5 text-center text-xs font-black"
              :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
            <img v-if="g.avatarUrl" :src="g.avatarUrl" class="w-8 h-8 rounded-xl object-cover border border-white/10 flex-shrink-0" />
            <div v-else class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/15 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">
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
            <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
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

  <StickerPackDetailModal v-if="openedPackId" :pack-id="openedPackId" @close="closeStickerPackDetail" />
  </div>
</template>
