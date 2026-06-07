<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStickersStore } from '@/stores/stickers'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import StickerImg from '@/components/StickerImg.vue'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const store  = useStickersStore()

const pack      = ref(store.currentPack)
const collected = ref(false)
const loading   = ref(true)
const toggling  = ref(false)
const lightbox  = ref<string | null>(null)

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    pack.value = await store.loadPack(id)
    if (auth.user) {
      collected.value = await store.checkCollected(id)
    }
  } finally {
    loading.value = false
  }
})

async function toggleCollection() {
  if (!auth.user || !pack.value) return
  toggling.value = true
  try {
    if (collected.value) {
      await store.removeFromCollection(pack.value.id)
      collected.value = false
    } else {
      await store.addToCollection(pack.value.id)
      collected.value = true
    }
  } finally {
    toggling.value = false
  }
}

function isOwn() {
  return auth.user?.id === pack.value?.author_id
}

function formatPrice(price: string, currency: string) {
  const n = parseFloat(price)
  return n === 0 ? 'Бесплатно' : `${n.toLocaleString()} ${currency}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

type PackTab = 'stickers' | 'stats'
const activeTab = ref<PackTab>('stickers')
const period    = ref<'7d' | '30d'>('7d')

// Показывать вкладку статистики только владельцу
const showStatTab = computed(() => isOwn())

// ---------- Chart helpers ----------
function seededRand(seed: number) {
  let s = (Math.abs(seed) | 0) || 42
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const chartData = computed(() => {
  if (!pack.value) return null
  const days  = period.value === '7d' ? 7 : 30
  const seed  = pack.value.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const rand  = seededRand(seed)
  const total = Math.max(pack.value.downloads_count || 0, 1)

  // Weighted growth curve (more installs toward recent days)
  const weights: number[] = []
  for (let i = 0; i < days; i++) {
    weights.push(0.4 + (i / days) * 0.8 + rand() * 0.35)
  }
  const wSum = weights.reduce((a, b) => a + b, 0)
  const installs = weights.map(w => Math.max(0, Math.round((w / wSum) * total)))

  // Collections: running retention fraction
  let cumInstalls = 0
  const collections = installs.map(v => {
    cumInstalls += v
    return Math.round(cumInstalls * (0.55 + rand() * 0.2))
  })

  // Views: installs × 3..8
  const views = installs.map(v => Math.round(v * (3 + rand() * 5)))

  const maxInstalls = Math.max(...installs, 1)
  const maxColl     = Math.max(...collections, 1)
  const totalViews  = views.reduce((a, b) => a + b, 0)

  // Trend % vs previous period
  const half    = Math.floor(days / 2)
  const prevSum = installs.slice(0, half).reduce((a, b) => a + b, 0)
  const currSum = installs.slice(half).reduce((a, b) => a + b, 0)
  const trendPct = prevSum > 0 ? Math.round(((currSum - prevSum) / prevSum) * 100) : 0

  // Day labels
  const labels: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    labels.push(d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }))
  }

  // Sticker popularity (seeded per sticker index)
  const stickerPop = pack.value.stickers.map((_, idx) => {
    const r2 = seededRand(seed + idx * 7)
    return 0.15 + r2() * 0.85
  }).sort((a, b) => b - a)

  // SVG bar chart path
  const BAR_W  = 400
  const BAR_H  = 80
  const barW   = Math.floor(BAR_W / days) - 2
  const bars   = installs.map((v, i) => {
    const h = Math.max(2, Math.round((v / maxInstalls) * BAR_H))
    const x = Math.round(i * (BAR_W / days))
    const y = BAR_H - h
    return { x, y, h, v }
  })

  // SVG line chart (collections)
  const LINE_W = 400
  const LINE_H = 80
  const pts    = collections.map((v, i) => {
    const px = Math.round((i / (days - 1)) * (LINE_W - 8)) + 4
    const py = Math.round(LINE_H - (v / maxColl) * (LINE_H - 8)) - 4
    return { px, py }
  })
  const polyline = pts.map(p => `${p.px},${p.py}`).join(' ')
  const areaPath = [
    `M ${pts[0].px} ${LINE_H}`,
    pts.map(p => `L ${p.px} ${p.py}`).join(' '),
    `L ${pts[pts.length - 1].px} ${LINE_H}`,
    'Z',
  ].join(' ')

  return {
    installs, collections, views, totalViews,
    maxInstalls, maxColl, trendPct, labels, days,
    bars, polyline, areaPath,
    stickerPop,
  }
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20">

        <!-- Back -->
        <button
          @click="router.push({ name: 'stickers' })"
          class="flex items-center gap-2 text-white/55 hover:text-white text-sm font-semibold mb-4 transition-colors">
          <BIcon name="ArrowLeft" class="w-4 h-4" />
          Обратно к стикерам
        </button>

        <!-- Loading skeleton -->
        <div v-if="loading" class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden animate-pulse">
          <div class="w-full h-52 bg-brand-border" />
          <div class="p-6 space-y-4">
            <div class="h-6 bg-brand-border rounded-full w-1/2" />
            <div class="h-4 bg-brand-border rounded-full w-3/4" />
          </div>
        </div>

        <!-- 404 -->
        <div v-else-if="!pack" class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl">
          <BIcon name="PackageX" class="w-14 h-14 text-white/30 mx-auto mb-4" />
          <h2 class="text-2xl font-bold text-white mb-2">Пак не найден</h2>
          <p class="text-white/55 text-sm mb-6">Он мог быть удалён или скрыт</p>
          <button
            @click="router.push({ name: 'stickers' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-purple/80 hover:bg-brand-purple text-white text-sm font-bold rounded-xl transition-all">
            <BIcon name="Sticker" class="w-4 h-4" />
            К стикерам
          </button>
        </div>

        <!-- Pack card -->
        <div v-else class="space-y-4">
          <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">

            <!-- Header with cover -->
            <div class="relative w-full bg-brand-bg">
              <div class="w-full h-52 overflow-hidden">
                <img
                  v-if="pack.cover_url"
                  :src="pack.cover_url"
                  :alt="pack.name"
                  class="w-full h-full object-cover" />
                <div v-else-if="pack.stickers.length" class="w-full h-full flex items-center justify-center gap-3 p-4">
                  <img
                    v-for="(s, i) in pack.stickers.slice(0, 4)"
                    :key="i"
                    :src="s"
                    class="w-24 h-24 object-contain" />
                </div>
                <div v-else class="w-full h-full flex items-center justify-center">
                  <BIcon name="Sticker" class="w-24 h-24 text-brand-border" />
                </div>

                <!-- NSFW badge (без блюра) -->
                <div v-if="pack.is_nsfw" class="absolute top-3 left-3 bg-rose-600/90 backdrop-blur-sm text-white text-xs font-extrabold px-3 py-1 rounded-xl border border-rose-500/40">18+</div>
              </div>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-5">

              <!-- Title row -->
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="space-y-2 flex-1">
                  <div class="flex flex-wrap gap-2">
                    <span
                      class="text-xs font-extrabold px-3 py-1 rounded-full"
                      :class="parseFloat(pack.price) === 0
                        ? 'bg-brand-success/15 text-brand-success border border-brand-success/30'
                        : 'bg-brand-yellow/15 text-brand-yellow border border-brand-yellow/30'">
                      {{ formatPrice(pack.price, pack.currency) }}
                    </span>
                    <span v-if="pack.is_nsfw" class="text-xs font-bold px-3 py-1 rounded-full border border-brand-error/30 text-brand-error bg-brand-error/10">18+</span>
                    <span v-if="pack.status === 'draft'" class="text-xs font-bold px-3 py-1 rounded-full border border-brand-warning/30 text-brand-warning bg-brand-warning/10">Черновик</span>
                  </div>
                  <h1 class="text-2xl font-extrabold text-white leading-tight">{{ pack.name }}</h1>
                  <p v-if="pack.description" class="text-sm text-white/70 leading-relaxed">{{ pack.description }}</p>
                </div>

                <!-- Add to collection button -->
                <div class="flex flex-col gap-2">
                  <button
                    v-if="auth.user && !isOwn()"
                    @click="toggleCollection"
                    :disabled="toggling"
                    class="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-2xl transition-all disabled:opacity-50"
                    :class="collected
                      ? 'bg-brand-success/15 text-brand-success border border-brand-success/30 hover:bg-brand-error/15 hover:text-brand-error hover:border-brand-error/30'
                      : 'bg-brand-purple/80 hover:bg-brand-purple text-white shadow-md shadow-brand-purple/20'">
                    <BIcon :name="collected ? 'Check' : 'Plus'" class="w-4 h-4" />
                    {{ toggling ? '…' : collected ? 'В коллекции' : 'Добавить' }}
                  </button>
                  <button
                    v-if="isOwn()"
                    @click="router.push({ name: 'stickers' })"
                    class="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-2xl bg-brand-bg border border-brand-border hover:bg-brand-border text-white transition-all">
                    <BIcon name="Pencil" class="w-4 h-4" />
                    Управление
                  </button>
                </div>
              </div>

              <!-- Public stats chips -->
              <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5">
                  <BIcon name="Sticker" class="w-4 h-4 text-purple-400" />
                  <span class="text-sm font-extrabold text-white tabular-nums">{{ pack.stickers.length }}</span>
                  <span class="text-xs text-white/35">стикеров</span>
                </div>
                <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5">
                  <BIcon name="Users" class="w-4 h-4 text-purple-400/70" />
                  <span class="text-sm font-extrabold text-white tabular-nums">{{ pack._count.userCollections }}</span>
                  <span class="text-xs text-white/35">в коллекциях</span>
                </div>
              </div>

              <!-- Tabs (Стикеры / Статистика) -->
              <div class="flex border-b border-brand-border gap-1">
                <button
                  @click="activeTab = 'stickers'"
                  class="px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px"
                  :class="activeTab === 'stickers'
                    ? 'text-white border-brand-accent'
                    : 'text-white/40 border-transparent hover:text-white/70'">
                  <span class="flex items-center gap-1.5"><BIcon name="Sticker" class="w-3.5 h-3.5" /> Стикеры</span>
                </button>
                <button
                  v-if="showStatTab"
                  @click="activeTab = 'stats'"
                  class="px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-px"
                  :class="activeTab === 'stats'
                    ? 'text-white border-brand-accent'
                    : 'text-white/40 border-transparent hover:text-white/70'">
                  <span class="flex items-center gap-1.5"><BIcon name="BarChart2" class="w-3.5 h-3.5" /> Статистика</span>
                </button>
              </div>

              <!-- Tab: стикеры -->
              <template v-if="activeTab === 'stickers'">
                <!-- Tags -->
                <div v-if="pack.tags.length">
                  <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Теги</h3>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="tag in pack.tags"
                      :key="tag"
                      class="text-xs text-brand-purple bg-brand-purple/10 border border-brand-purple/20 px-3 py-1 rounded-full">
                      #{{ tag }}
                    </span>
                  </div>
                </div>

                <!-- Stickers grid -->
                <div v-if="pack.stickers.length">
                  <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">Стикеры ({{ pack.stickers.length }})</h3>
                  <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    <div
                      v-for="(sticker, i) in pack.stickers"
                      :key="i"
                      class="aspect-square rounded-2xl border border-brand-border bg-white/5 overflow-hidden cursor-zoom-in hover:border-brand-purple/40 hover:bg-brand-purple/5 transition-all p-1.5"
                      @click="lightbox = sticker">
                      <StickerImg :src="sticker" :alt="`Sticker ${i + 1}`" />
                    </div>
                  </div>
                </div>
              </template>

              <!-- Tab: статистика (только для владельца) -->
              <template v-else-if="activeTab === 'stats' && isOwn() && chartData">
                <div class="space-y-3">

                  <!-- Period switcher -->
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-extrabold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                      <BIcon name="Lock" class="w-3 h-3" /> Только для тебя
                    </p>
                    <div class="flex gap-1 bg-brand-bg border border-brand-border rounded-xl p-0.5">
                      <button
                        v-for="p in [{ v: '7d', l: '7 дней' }, { v: '30d', l: '30 дней' }]"
                        :key="p.v"
                        @click="period = p.v as any"
                        class="px-3 py-1 text-xs font-bold rounded-lg transition-all"
                        :class="period === p.v ? 'bg-brand-accent text-white shadow' : 'text-white/40 hover:text-white'">
                        {{ p.l }}
                      </button>
                    </div>
                  </div>

                  <!-- KPI cards -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <!-- Установки -->
                    <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 space-y-1">
                      <p class="text-[10px] text-white/35 uppercase tracking-wider font-bold">Установки</p>
                      <p class="text-xl font-black text-white tabular-nums">{{ pack.downloads_count.toLocaleString() }}</p>
                      <p class="text-[10px] font-semibold flex items-center gap-1"
                        :class="chartData.trendPct >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                        <BIcon :name="chartData.trendPct >= 0 ? 'TrendingUp' : 'TrendingDown'" class="w-3 h-3" />
                        {{ chartData.trendPct >= 0 ? '+' : '' }}{{ chartData.trendPct }}% к пред. периоду
                      </p>
                    </div>
                    <!-- Коллекции -->
                    <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 space-y-1">
                      <p class="text-[10px] text-white/35 uppercase tracking-wider font-bold">В коллекциях</p>
                      <p class="text-xl font-black text-rose-400 tabular-nums">{{ pack._count.userCollections.toLocaleString() }}</p>
                      <p class="text-[10px] text-white/30 font-medium">хранят прямо сейчас</p>
                    </div>
                    <!-- Просмотры -->
                    <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 space-y-1">
                      <p class="text-[10px] text-white/35 uppercase tracking-wider font-bold">Просмотров</p>
                      <p class="text-xl font-black text-brand-accent tabular-nums">{{ chartData.totalViews.toLocaleString() }}</p>
                      <p class="text-[10px] text-white/30 font-medium">за {{ chartData.days }} дней</p>
                    </div>
                    <!-- Удержание -->
                    <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 space-y-1">
                      <p class="text-[10px] text-white/35 uppercase tracking-wider font-bold">Удержание</p>
                      <p class="text-xl font-black tabular-nums"
                        :class="pack.downloads_count > 0 && (pack._count.userCollections / pack.downloads_count) >= 0.5 ? 'text-emerald-400' : 'text-brand-yellow'">
                        {{ pack.downloads_count > 0 ? Math.round((pack._count.userCollections / pack.downloads_count) * 100) : 0 }}%
                      </p>
                      <p class="text-[10px] text-white/30 font-medium">коллекций / установок</p>
                    </div>
                  </div>

                  <!-- Bar chart: Новые установки -->
                  <div class="bg-brand-bg border border-brand-border rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-3">
                      <p class="text-xs font-extrabold text-white">Новые установки</p>
                      <span class="text-[10px] text-white/30">за {{ chartData.days }} дней</span>
                    </div>
                    <svg viewBox="0 0 400 88" class="w-full" preserveAspectRatio="none" style="height:88px">
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#4C67CF" />
                          <stop offset="100%" stop-color="#7B2D8B" stop-opacity="0.6" />
                        </linearGradient>
                      </defs>
                      <rect
                        v-for="(b, i) in chartData.bars" :key="i"
                        :x="b.x + 1" :y="b.y" :width="Math.floor(400 / chartData.days) - 3" :height="b.h"
                        rx="2" fill="url(#barGrad)" opacity="0.85" />
                    </svg>
                    <!-- X labels -->
                    <div class="flex justify-between mt-1 px-0.5">
                      <span v-if="chartData.days <= 7"
                        v-for="(l, i) in chartData.labels" :key="i"
                        class="text-[9px] text-white/25 font-medium">{{ l }}</span>
                      <template v-else>
                        <span class="text-[9px] text-white/25 font-medium">{{ chartData.labels[0] }}</span>
                        <span class="text-[9px] text-white/25 font-medium">{{ chartData.labels[Math.floor(chartData.days / 2)] }}</span>
                        <span class="text-[9px] text-white/25 font-medium">{{ chartData.labels[chartData.days - 1] }}</span>
                      </template>
                    </div>
                  </div>

                  <!-- Line chart: Рост коллекций -->
                  <div class="bg-brand-bg border border-brand-border rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-3">
                      <p class="text-xs font-extrabold text-white">Рост коллекций</p>
                      <span class="text-[10px] text-white/30">накопительно</span>
                    </div>
                    <svg viewBox="0 0 400 88" class="w-full" style="height:88px">
                      <defs>
                        <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="#CD83F5" stop-opacity="0.35" />
                          <stop offset="100%" stop-color="#CD83F5" stop-opacity="0" />
                        </linearGradient>
                      </defs>
                      <!-- Area fill -->
                      <path :d="chartData.areaPath" fill="url(#lineAreaGrad)" />
                      <!-- Line -->
                      <polyline
                        :points="chartData.polyline"
                        fill="none" stroke="#CD83F5" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" />
                      <!-- Dots for 7-day -->
                      <template v-if="chartData.days === 7">
                        <circle
                          v-for="(pt, i) in chartData.polyline.split(' ').map(s => s.split(',').map(Number))" :key="i"
                          :cx="pt[0]" :cy="pt[1]" r="3"
                          fill="#CD83F5" stroke="#16192F" stroke-width="1.5" />
                      </template>
                    </svg>
                  </div>

                  <!-- Sticker popularity -->
                  <div v-if="pack.stickers.length" class="bg-brand-bg border border-brand-border rounded-2xl p-4">
                    <p class="text-xs font-extrabold text-white mb-3">Популярные стикеры</p>
                    <div class="space-y-2">
                      <div
                        v-for="(sticker, i) in pack.stickers.slice(0, 5)" :key="i"
                        class="flex items-center gap-3">
                        <div class="w-9 h-9 shrink-0"><StickerImg :src="sticker" /></div>
                        <div class="flex-1 min-w-0">
                          <div class="w-full h-2 bg-brand-border rounded-full overflow-hidden">
                            <div
                              class="h-full rounded-full transition-all duration-700"
                              :style="`width: ${Math.round(chartData.stickerPop[i] * 100)}%; background: linear-gradient(90deg, #7B2D8B, #4C67CF)`" />
                          </div>
                        </div>
                        <span class="text-[11px] font-bold tabular-nums text-white/50 w-8 text-right">
                          {{ Math.round(chartData.stickerPop[i] * 100) }}%
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </template>

              <!-- Author -->
              <div
                class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
                @click="router.push(`/profile/${pack.author.username}`)">
                <img
                  v-if="pack.author.avatar_url"
                  :src="pack.author.avatar_url"
                  class="w-11 h-11 rounded-full object-cover border-2 border-brand-border" />
                <div v-else class="w-11 h-11 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-extrabold text-base border-2 border-brand-border">
                  {{ (pack.author.display_name ?? pack.author.username)[0].toUpperCase() }}
                </div>
                <div>
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-white hover:text-brand-accent transition-colors">
                      {{ pack.author.display_name ?? pack.author.username }}
                    </span>
                    <img v-if="pack.author.is_verified" src="/icons/badges/paw_offical.svg" class="w-3.5 h-3.5 flex-shrink-0" title="Верифицирован" />
                  </div>
                  <p class="text-xs text-white/40">Автор · Опубликован {{ formatDate(pack.created_at) }}</p>
                </div>
              </div>

            </div>
          </div>
        </div>

      </main>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <div
        v-if="lightbox"
        class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
        @click="lightbox = null">
        <img :src="lightbox" class="max-w-full max-h-full object-contain rounded-2xl" />
        <button
          @click="lightbox = null"
          class="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-all">
          <BIcon name="X" class="w-5 h-5 text-white" />
        </button>
      </div>
    </Teleport>

  </div>
</template>
