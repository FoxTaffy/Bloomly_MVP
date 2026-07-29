<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '../api'
import BIcon from './BIcon.vue'

const props = defineProps<{ packId: string }>()
const emit = defineEmits<{ close: [] }>()

const isLoading = ref(true)
const error = ref('')
const detail = ref<any>(null)

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const barMax = (arr: { value: number }[]) => Math.max(...arr.map(x => x.value), 1)

const cover = computed(() => {
  const p = detail.value?.pack
  if (!p) return ''
  return p.cover_url || p.stickers?.[p.cover_sticker_idx ?? 0] || p.stickers?.[0] || ''
})

const fetchDetail = async () => {
  isLoading.value = true
  error.value = ''
  try {
    const res = await api.get(`/admin/stats/stickers/${props.packId}`)
    if (res.data.success) detail.value = res.data.data
    else error.value = 'Не удалось загрузить статистику пака'
  } catch (e: any) {
    error.value = e?.response?.data?.error?.message ?? 'Не удалось загрузить статистику пака'
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchDetail)
</script>

<template>
  <Teleport to="body">
    <Transition name="resolve-fade" appear>
      <div class="fixed inset-0 z-[750] flex items-end sm:items-center justify-center" @click.self="emit('close')">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

        <div class="relative w-full sm:max-w-2xl bg-[#13131f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden z-10 max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10 flex-shrink-0">
            <h2 class="text-lg font-extrabold text-white">Статистика стикер-пака</h2>
            <button @click="emit('close')"
              class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90 flex-shrink-0">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <div class="px-6 py-5 space-y-5 overflow-y-auto">
            <div v-if="isLoading" class="flex items-center justify-center py-16">
              <div class="w-8 h-8 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
            </div>

            <p v-else-if="error" class="text-center text-sm text-rose-400 py-16">{{ error }}</p>

            <template v-else-if="detail">
              <!-- Pack header -->
              <div class="flex items-center gap-3">
                <div class="w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden border border-white/10"
                  :style="detail.pack.cover_bg_color ? `background:${detail.pack.cover_bg_color}` : 'background:rgba(255,255,255,0.05)'">
                  <img v-if="cover" :src="cover" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center text-2xl">🎭</div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-base font-extrabold text-white truncate flex items-center gap-1.5">
                    {{ detail.pack.name }}
                    <span v-if="detail.pack.is_nsfw" class="text-[9px] font-extrabold px-1 py-0.5 rounded bg-rose-500/20 text-rose-400">18+</span>
                  </p>
                  <p class="text-xs text-white/40 truncate">@{{ detail.pack.author?.username ?? '—' }}</p>
                  <div v-if="detail.pack.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
                    <span v-for="tag in detail.pack.tags.slice(0,6)" :key="tag"
                      class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40">#{{ tag }}</span>
                  </div>
                </div>
              </div>

              <!-- Stats row -->
              <div class="grid grid-cols-4 gap-2">
                <div class="rounded-xl border border-white/10 px-2.5 py-2 text-center" style="background:rgba(255,255,255,0.03)">
                  <p class="text-[9px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Использований</p>
                  <p class="text-lg font-black text-emerald-400">{{ formatNum(detail.pack.use_count) }}</p>
                </div>
                <div class="rounded-xl border border-white/10 px-2.5 py-2 text-center" style="background:rgba(255,255,255,0.03)">
                  <p class="text-[9px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Скачиваний</p>
                  <p class="text-lg font-black text-indigo-400">{{ formatNum(detail.pack.downloads_count) }}</p>
                </div>
                <div class="rounded-xl border border-white/10 px-2.5 py-2 text-center" style="background:rgba(255,255,255,0.03)">
                  <p class="text-[9px] font-bold text-white/35 uppercase tracking-wide mb-0.5">Коллекций</p>
                  <p class="text-lg font-black text-sky-400">{{ formatNum(detail.collectors) }}</p>
                </div>
                <div class="rounded-xl border border-white/10 px-2.5 py-2 text-center" style="background:rgba(255,255,255,0.03)">
                  <p class="text-[9px] font-bold text-white/35 uppercase tracking-wide mb-0.5">В избранном</p>
                  <p class="text-lg font-black text-rose-400">{{ formatNum(detail.favorites) }}</p>
                </div>
              </div>

              <!-- Daily usage -->
              <div>
                <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Использование · 30 дней</p>
                <div v-if="detail.dailyUsage.length" class="flex items-end gap-0.5 h-24 rounded-xl border border-white/10 p-3" style="background:rgba(255,255,255,0.03)">
                  <div v-for="(point, idx) in detail.dailyUsage" :key="idx"
                    class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
                    <div class="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                      text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none z-10">
                      {{ point.value }}
                    </div>
                    <div class="w-full rounded-t transition-all hover:opacity-100 opacity-70 min-h-[2px]"
                      :style="`height:${Math.max(2, (point.value / barMax(detail.dailyUsage)) * 72)}px; background:linear-gradient(to top,#10b981,#34d399)`" />
                  </div>
                </div>
                <p v-else class="text-center text-xs text-white/25 py-6 rounded-xl border border-white/10" style="background:rgba(255,255,255,0.03)">Нет данных</p>
              </div>

              <!-- Top stickers in pack -->
              <div v-if="detail.topStickersInPack.length">
                <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Топ стикеров в паке</p>
                <div class="grid grid-cols-6 sm:grid-cols-8 gap-2">
                  <div v-for="s in detail.topStickersInPack" :key="s.url"
                    class="relative rounded-lg overflow-hidden border border-white/10 aspect-square bg-white/[0.03]">
                    <img :src="s.url" class="w-full h-full object-contain p-1" loading="lazy" />
                    <span class="absolute bottom-0 right-0 text-[8px] font-black text-white bg-black/70 px-1 rounded-tl-md">{{ formatNum(s.total) }}</span>
                  </div>
                </div>
              </div>

              <!-- By age / country -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div v-if="detail.byAge.length">
                  <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">По возрасту</p>
                  <div class="space-y-1.5">
                    <div v-for="item in detail.byAge" :key="item.label">
                      <div class="flex items-center justify-between text-[11px] mb-0.5">
                        <span class="text-white/60 font-semibold">{{ item.label }}</span>
                        <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                      </div>
                      <div class="h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                        <div class="h-full rounded-full" :style="`width:${(item.value/barMax(detail.byAge))*100}%;background:linear-gradient(to right,#6366f1,#8b5cf6)`" />
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="detail.byCountry.length">
                  <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">По стране</p>
                  <div class="space-y-1.5">
                    <div v-for="item in detail.byCountry" :key="item.label">
                      <div class="flex items-center justify-between text-[11px] mb-0.5">
                        <span class="text-white/60 font-semibold truncate max-w-[140px]">{{ item.label }}</span>
                        <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                      </div>
                      <div class="h-1.5 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                        <div class="h-full rounded-full" :style="`width:${(item.value/barMax(detail.byCountry))*100}%;background:linear-gradient(to right,#ef4444,#f87171)`" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.resolve-fade-enter-active, .resolve-fade-leave-active { transition: opacity 0.2s ease; }
.resolve-fade-enter-from, .resolve-fade-leave-to { opacity: 0; }
</style>
