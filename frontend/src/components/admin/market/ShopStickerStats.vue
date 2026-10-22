<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'
import StickerPackDetailModal from '@/components/StickerPackDetailModal.vue'
import { formatNum, barMax } from '../adminHelpers'
import { useAdminContext } from '../adminContext'

// Статистика стикеров — вкладка «Стикеры» в статистике Bloomly Shop
const langStore = useLangStore()
const { stickerStats, isLoadingStatistics, fetchStatistics } = useAdminContext()

const packThumb = (pack: any) => pack.cover_url || pack.stickers?.[pack.cover_sticker_idx ?? 0] || pack.stickers?.[0] || ''

const openedPackId = ref<string | null>(null)
const openStickerPackDetail = (packId: string) => { openedPackId.value = packId }
const closeStickerPackDetail = () => { openedPackId.value = null }

onMounted(fetchStatistics)
</script>

<template>
  <div>
    <div v-if="isLoadingStatistics && !stickerStats" class="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <div v-for="n in 6" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
    </div>
    <div v-else-if="stickerStats">

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
              class="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-all cursor-pointer">
              <span class="w-5 text-center text-xs font-black"
                :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">
                {{ idx+1 }}
              </span>
              <div class="w-9 h-9 rounded-xl shrink-0 overflow-hidden border border-white/10"
                :style="pack.cover_bg_color ? `background:${pack.cover_bg_color}` : 'background:rgba(255,255,255,0.05)'">
                <img v-if="packThumb(pack)" :src="packThumb(pack)" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-lg">🎭</div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate flex items-center gap-1.5">
                  {{ pack.name }}
                  <span v-if="pack.is_nsfw" class="text-[9px] font-extrabold px-1 py-0.5 rounded-sm bg-rose-500/20 text-rose-400">18+</span>
                </p>
                <p class="text-xs text-white/35 truncate">@{{ pack.author?.username ?? '—' }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-black text-emerald-400">{{ formatNum(pack.use_count) }}</p>
                <p class="text-[10px] text-white/25">{{ formatNum(pack.downloads_count) }} {{ langStore.t.adminDownloadsShortSuffix }}</p>
              </div>
              <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 shrink-0" />
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
          <div v-if="stickerStats.byAge.length" class="stack-y-2">
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
          <div v-if="stickerStats.bySpecies.length" class="stack-y-2">
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
          <div v-if="stickerStats.byCountry.length" class="stack-y-2">
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
            class="group relative rounded-xl overflow-hidden border border-white/10 aspect-square bg-white/3"
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

    </div>
    <p v-else class="text-center text-sm text-white/25 py-16">{{ langStore.t.adminNoDataLabel }}</p>
    <StickerPackDetailModal v-if="openedPackId" :pack-id="openedPackId" @close="closeStickerPackDetail" />
  </div>
</template>
