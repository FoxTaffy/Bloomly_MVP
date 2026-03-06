<template>
  <div class="sticker-panel w-80 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 380px">

    <!-- Header with search -->
    <div class="flex items-center gap-2 px-3 pt-2.5 pb-2 flex-shrink-0 border-b border-brand-border">
      <BIcon name="Sticker" class="w-4 h-4 text-brand-accent flex-shrink-0" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Поиск стикеров…"
        class="flex-1 text-xs bg-transparent text-white placeholder-white/35 outline-none" />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="text-white/40 hover:text-white transition-colors">
        <BIcon name="X" class="w-3 h-3" />
      </button>
      <router-link
        to="/stickers"
        class="text-white/40 hover:text-brand-accent transition-colors ml-1"
        title="Открыть каталог стикеров">
        <BIcon name="ExternalLink" class="w-3.5 h-3.5" />
      </router-link>
    </div>

    <!-- Pack tabs (hidden during search) -->
    <div v-if="!searchQuery && collection.length" class="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto scrollbar-hide border-b border-brand-border/50">
      <!-- "All" tab -->
      <button
        @click="activePack = '__all__'"
        :class="[
          'flex-shrink-0 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all whitespace-nowrap',
          activePack === '__all__'
            ? 'bg-brand-accent text-white shadow-sm'
            : 'text-white/55 hover:text-white hover:bg-brand-bg',
        ]">
        ✨ Все
      </button>
      <button
        v-for="pack in collection"
        :key="pack.id"
        @click="activePack = pack.id"
        :class="[
          'flex-shrink-0 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all whitespace-nowrap',
          activePack === pack.id
            ? 'bg-brand-accent text-white shadow-sm'
            : 'text-white/55 hover:text-white hover:bg-brand-bg',
        ]">
        <!-- pack cover thumbnail -->
        <span v-if="pack.cover_url" class="inline-flex items-center gap-1.5">
          <img :src="pack.cover_url" class="w-3.5 h-3.5 object-contain" />
          {{ pack.name.length > 14 ? pack.name.slice(0, 13) + '…' : pack.name }}
          <span v-if="ownPackIds.has(pack.id)" class="text-[8px] opacity-70">✏️</span>
        </span>
        <span v-else class="inline-flex items-center gap-1">
          {{ pack.name.length > 14 ? pack.name.slice(0, 13) + '…' : pack.name }}
          <span v-if="ownPackIds.has(pack.id)" class="text-[8px] opacity-70">✏️</span>
        </span>
      </button>
    </div>

    <!-- Sticker grid -->
    <div class="flex-1 overflow-y-auto p-2 min-h-0 scrollbar-hide">

      <!-- Loading -->
      <div v-if="stickersStore.isLoading" class="grid grid-cols-5 gap-1.5">
        <div v-for="i in 15" :key="i" class="aspect-square rounded-xl bg-brand-border animate-pulse" />
      </div>

      <!-- Empty collection -->
      <div v-else-if="!collection.length" class="flex flex-col items-center justify-center h-32 gap-2.5 px-4 text-center">
        <BIcon name="PackageOpen" class="w-9 h-9 text-white/25" />
        <p class="text-xs text-white/50 leading-snug">
          Коллекция пуста.<br>
          <router-link to="/stickers" class="text-brand-accent hover:underline">Найдите паки</router-link>
          в каталоге и добавьте их в коллекцию.
        </p>
      </div>

      <!-- Search: no results -->
      <div v-else-if="searchQuery && !searchResults.length" class="flex flex-col items-center justify-center h-24 gap-2 text-white/45 text-xs">
        <BIcon name="SearchX" class="w-7 h-7 opacity-50" />
        Ничего не найдено
      </div>

      <!-- Search results -->
      <div v-else-if="searchQuery" class="grid grid-cols-5 gap-1.5">
        <button
          v-for="item in searchResults"
          :key="item.url"
          @click="pick(item.url)"
          class="aspect-square rounded-xl bg-white/5 border border-brand-border/40 hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden"
          :title="item.packName">
          <img :src="item.url" class="w-full h-full object-contain" loading="lazy" />
        </button>
      </div>

      <!-- All stickers flat -->
      <div v-else-if="activePack === '__all__'" class="space-y-3">
        <template v-for="pack in collection" :key="pack.id">
          <div>
            <p class="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5 px-0.5">{{ pack.name }}</p>
            <div class="grid grid-cols-5 gap-1.5">
              <button
                v-for="url in pack.stickers"
                :key="url"
                @click="pick(url)"
                class="aspect-square rounded-xl bg-white/5 border border-brand-border/40 hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden">
                <img :src="url" class="w-full h-full object-contain" loading="lazy" />
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Single pack -->
      <div v-else-if="currentPack">
        <div v-if="!currentPack.stickers.length" class="flex flex-col items-center justify-center h-24 gap-2 text-white/45 text-xs">
          <BIcon name="Ghost" class="w-7 h-7 opacity-50" />
          В этом паке нет стикеров
        </div>
        <div v-else class="grid grid-cols-5 gap-1.5">
          <button
            v-for="url in currentPack.stickers"
            :key="url"
            @click="pick(url)"
            class="aspect-square rounded-xl bg-white/5 border border-brand-border/40 hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden">
            <img :src="url" class="w-full h-full object-contain" loading="lazy" />
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useStickersStore } from '@/stores/stickers'

const emit = defineEmits<{ (e: 'pick', url: string): void }>()

const stickersStore = useStickersStore()

const activePack  = ref('__all__')
const searchQuery = ref('')

// ── Data: own packs + collection merged, deduplicated ────────────────────
const collection = computed(() => {
  const seen = new Set<string>()
  const all: typeof stickersStore.myPacks = []
  // Own packs first (marked)
  for (const p of stickersStore.myPacks) {
    if (!seen.has(p.id) && p.stickers.length > 0) { seen.add(p.id); all.push(p) }
  }
  // Then collected packs
  for (const p of stickersStore.myCollection) {
    if (!seen.has(p.id) && p.stickers.length > 0) { seen.add(p.id); all.push(p) }
  }
  return all
})

const ownPackIds = computed(() => new Set(stickersStore.myPacks.map((p) => p.id)))

const currentPack = computed(() =>
  collection.value.find((p) => p.id === activePack.value) ?? null,
)

// ── Search ────────────────────────────────────────────────────────────────
interface FlatSticker { url: string; packName: string }

const searchResults = computed<FlatSticker[]>(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return []
  const results: FlatSticker[] = []
  for (const pack of collection.value) {
    if (pack.name.toLowerCase().includes(q) || pack.tags?.some((t: string) => t.toLowerCase().includes(q))) {
      pack.stickers.forEach((url: string) => results.push({ url, packName: pack.name }))
    }
  }
  return results
})

// ── Actions ───────────────────────────────────────────────────────────────
function pick(url: string) {
  emit('pick', url)
}

onMounted(async () => {
  const tasks: Promise<any>[] = []
  if (!stickersStore.myCollection.length) tasks.push(stickersStore.loadMyCollection())
  if (!stickersStore.myPacks.length)      tasks.push(stickersStore.loadMyPacks())
  await Promise.all(tasks)
})
</script>
