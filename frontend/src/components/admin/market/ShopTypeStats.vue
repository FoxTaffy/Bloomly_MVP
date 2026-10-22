<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatNum, formatDate, barMax } from '../adminHelpers'

// Статистика одного вида товаров магазина: рамки, фоны или темы
const props = defineProps<{ type: 'frame' | 'background' | 'theme' }>()

const data = ref<any>(null)
const failed = ref(false)
const load = async () => {
  data.value = null
  failed.value = false
  try {
    const res = await api.get(`/admin/shop/stats/${props.type}`)
    if (res.data.success) data.value = res.data.data
    else failed.value = true
  } catch { failed.value = true }
}
onMounted(load)
watch(() => props.type, load)

const rub = (n: number) => `${formatNum(n)} ₽`
const tiles = computed(() => {
  const t = data.value?.totals
  if (!t) return []
  return [
    { label: 'Товаров', value: formatNum(t.items), foot: `${t.published} в продаже · ${t.hidden} скрыто`, color: '#4C67CF' },
    { label: 'Платные / бесплатные', value: `${t.paid} / ${t.free}`, color: '#a78bfa' },
    { label: 'Получено пользователями', value: formatNum(t.owners), foot: `+${t.ownersWeek} за неделю`, color: '#10b981' },
    { label: 'Оборот', value: rub(t.turnover), color: '#f59e0b' },
    { label: 'Скачиваний', value: formatNum(t.downloads), color: '#38bdf8' },
  ]
})
const dailyMax = computed(() => barMax(data.value?.daily ?? []))
const topMax = computed(() => Math.max(1, ...(data.value?.top ?? []).map((i: any) => i.owners)))
const price = (i: { price: number; isFree?: boolean; is_free?: boolean }) => (i.isFree ?? i.is_free) || !i.price ? 'Бесплатно' : `${i.price.toLocaleString('ru-RU')} ₽`
</script>

<template>
  <div>
    <div v-if="failed" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
      <p class="text-sm font-semibold">Не удалось загрузить статистику</p>
      <button type="button" @click="load" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 hover:bg-white/12 text-white/70">Повторить</button>
    </div>
    <div v-else-if="!data" class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div v-for="n in 5" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
    </div>

    <template v-else>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div v-for="t in tiles" :key="t.label" class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
          <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1 truncate">{{ t.label }}</p>
          <p class="text-2xl font-black" :style="`color:${t.color}`">{{ t.value }}</p>
          <p v-if="t.foot" class="text-[11px] text-white/35 mt-0.5">{{ t.foot }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <!-- Топ -->
        <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
          <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
            <BIcon name="TrendingUp" class="w-4 h-4 text-emerald-400" />
            <h3 class="font-extrabold text-sm text-white">Популярные</h3>
            <span class="ml-auto text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">по числу получивших</span>
          </div>
          <div v-if="data.top.length" class="divide-y divide-brand-border">
            <div v-for="(i, idx) in data.top" :key="i.id" class="flex items-center gap-3 px-5 py-3">
              <span class="w-5 text-center text-xs font-black" :class="idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-white/20'">{{ idx + 1 }}</span>
              <div class="w-9 h-9 rounded-xl shrink-0 overflow-hidden border border-white/10 bg-white/5">
                <img v-if="i.previewUrl" :src="i.previewUrl" alt="" loading="lazy" class="w-full h-full object-cover" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate">{{ i.name }}</p>
                <div class="h-1 rounded-full bg-white/6 mt-1.5 overflow-hidden"><div class="h-full rounded-full bg-emerald-400" :style="`width:${(i.owners / topMax) * 100}%`" /></div>
              </div>
              <div class="text-right shrink-0">
                <p class="text-sm font-black text-emerald-400">{{ formatNum(i.owners) }}</p>
                <p class="text-[10px] text-white/30">{{ price(i) }}</p>
              </div>
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-12">Пока нет данных</p>
        </div>

        <!-- Динамика -->
        <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
          <div class="flex items-center gap-2 mb-4">
            <BIcon name="Activity" class="w-4 h-4 text-emerald-400" />
            <h3 class="font-extrabold text-sm text-white">Получения по дням</h3>
            <span class="ml-auto text-[10px] text-white/30">последние 30 дней</span>
          </div>
          <div v-if="data.daily.length" class="flex items-end gap-0.5 h-32">
            <div v-for="p in data.daily" :key="p.day" class="flex-1 relative group/bar" :title="`${p.day}: ${p.value}`">
              <div class="w-full rounded-t opacity-70 hover:opacity-100 transition-opacity min-h-[2px]"
                :style="`height:${Math.max(2, (p.value / dailyMax) * 128)}px;background:linear-gradient(to top,#10b981,#34d399)`" />
            </div>
          </div>
          <p v-else class="text-center text-sm text-white/25 py-12">Пока нет данных</p>
        </div>
      </div>

      <!-- Рамки аватара: пользовательские рамки с модерацией -->
      <div v-if="data.avatarFrames" class="rounded-3xl border border-brand-border p-5 mb-4" style="background:#1F223C">
        <div class="flex items-center gap-2 mb-4">
          <BIcon name="Sparkles" class="w-4 h-4 text-fuchsia-400" />
          <h3 class="font-extrabold text-sm text-white">Рамки аватара</h3>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div v-for="c in [
            { l: 'Одобрено', v: data.avatarFrames.approved, c: 'text-emerald-400' },
            { l: 'На проверке', v: data.avatarFrames.pending, c: 'text-amber-400' },
            { l: 'Получено', v: data.avatarFrames.acquired, c: 'text-sky-400' },
            { l: 'Надето сейчас', v: data.avatarFrames.equipped, c: 'text-fuchsia-400' },
          ]" :key="c.l" class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
            <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ c.l }}</p>
            <p class="text-2xl font-black" :class="c.c">{{ formatNum(c.v) }}</p>
          </div>
        </div>
        <div v-if="data.avatarFrames.top.length" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div v-for="f in data.avatarFrames.top" :key="f.id" class="rounded-2xl border border-white/10 p-3 text-center bg-white/3">
            <img :src="f.imageUrl" alt="" loading="lazy" class="w-14 h-14 object-contain mx-auto" />
            <p class="text-xs font-bold text-white truncate mt-2">{{ f.name }}</p>
            <p class="text-[10px] text-white/35">{{ f.owners }} у польз. · {{ f.equipped }} надето</p>
          </div>
        </div>
      </div>

      <!-- Последние получения -->
      <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
        <div class="px-5 py-4 border-b border-brand-border"><h3 class="font-extrabold text-sm text-white">Последние получения</h3></div>
        <div v-if="data.recent.length" class="divide-y divide-brand-border">
          <div v-for="(r, i) in data.recent" :key="i" class="flex items-center gap-3 px-5 py-2.5 text-xs">
            <span class="font-bold text-white truncate">@{{ r.user.username }}</span>
            <span class="text-white/40">→</span>
            <span class="text-white/70 truncate">{{ r.item.name }}</span>
            <span class="ml-auto text-white/40 shrink-0">{{ price(r.item) }} · {{ formatDate(r.purchasedAt) }}</span>
          </div>
        </div>
        <p v-else class="text-center text-sm text-white/25 py-10">Пока нет данных</p>
      </div>
    </template>
  </div>
</template>
