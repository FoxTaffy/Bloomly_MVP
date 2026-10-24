<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { safeColor } from '@/lib/feed'
import BIcon from '../BIcon.vue'
import EntityAvatar from '../shared/EntityAvatar.vue'

const auth = useAuthStore()
const langStore = useLangStore()

const events = ref<any[]>([])
const isLoading = ref(true)

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** «12 окт 18:00 – 21:00», «12 – 14 окт 2026» или «30 окт – 2 ноя 2026» */
function formatEventDate(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const time = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (s.toDateString() === e.toDateString()) return `${s.getDate()} ${MONTHS[s.getMonth()]} ${time(s)} – ${time(e)}`
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
}

const fetchEvents = (location?: string) =>
  api.get('/groups/events', { params: { upcoming: true, sort: 'popular', limit: 6, location } })
    .then((res) => (res.data?.data?.events ?? []) as any[])

// События из страны пользователя поднимаем наверх, дальше — по числу участников и ближайшей дате.
// Если в его стране ничего нет, показываем общие.
async function load() {
  try {
    const country = auth.user?.country || ''
    let list = await fetchEvents(country || undefined)
    if (!list.length && country) list = await fetchEvents()
    else if (country) {
      const loc = country.toLowerCase()
      const isLocal = (ev: any) => ((ev.location_name || '').toLowerCase().includes(loc) ? 1 : 0)
      list.sort((a, b) =>
        isLocal(b) - isLocal(a)
        || b.attendee_count - a.attendee_count
        || new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    }
    events.value = list
  } catch { /* блок событий необязателен */ } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section v-if="isLoading || events.length" class="panel-card p-5 max-md:p-4">
    <div class="flex items-center justify-between gap-3 mb-4">
      <h3 class="font-bold text-white flex items-center gap-2 max-md:min-w-0 max-md:text-[15px] max-md:leading-snug">
        <BIcon name="Calendar" class="w-4 h-4 text-brand-accent shrink-0" />
        {{ langStore.t.upcomingEvents }}
      </h3>
      <router-link
        to="/groups?type=event"
        class="text-xs text-brand-accent font-semibold hover:text-brand-accent-plus transition-colors max-md:whitespace-nowrap max-md:shrink-0 max-md:px-2.5 max-md:py-1.5 max-md:rounded-xl max-md:bg-brand-accent/10"
      >{{ langStore.t.seeAllBtn }}</router-link>
    </div>

    <div class="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
      <template v-if="isLoading">
        <div v-for="n in 3" :key="n" class="min-w-[260px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border">
          <div class="skeleton h-28 rounded-none"></div>
          <div class="p-3 stack-y-2"><div class="skeleton h-3 w-2/3"></div><div class="skeleton h-3 w-1/2"></div></div>
        </div>
      </template>

      <router-link
        v-for="ev in (isLoading ? [] : events)"
        :key="ev.id"
        :to="'/events/' + ev.id"
        class="min-w-[260px] max-w-[280px] max-md:min-w-[230px] max-md:max-w-[250px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border hover:border-brand-accent/40 transition-all group/ev shrink-0"
      >
        <div class="h-28 relative overflow-hidden">
          <img
            v-if="ev.banner_url || ev.group?.banner_url"
            :src="ev.banner_url || ev.group?.banner_url"
            :alt="ev.title"
            loading="lazy"
            class="w-full h-full object-cover group-hover/ev:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="h-full w-full"
            :style="{ background: `linear-gradient(135deg, ${safeColor(ev.group?.accent_color)}44, ${safeColor(ev.group?.accent_color)}11)` }"
          ></div>
          <div class="absolute inset-0 bg-linear-to-t/srgb from-black/60 to-transparent"></div>
          <div class="absolute bottom-2 left-2 right-2 flex items-end justify-between">
            <div class="bg-black/50 backdrop-blur-xs px-2 py-1 rounded-lg text-[11px] font-bold text-white truncate max-w-[75%]">{{ ev.title }}</div>
            <div v-if="ev.attendee_count > 0" class="bg-brand-accent/80 backdrop-blur-xs px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white flex items-center gap-1 shrink-0">
              <BIcon name="Users" class="w-2.5 h-2.5" />
              {{ ev.attendee_count }}
            </div>
          </div>
        </div>
        <div class="p-3 stack-y-1.5">
          <div class="flex items-center gap-1.5 text-[11px] text-white/55">
            <BIcon name="Calendar" class="w-3 h-3 shrink-0" />
            <span>{{ formatEventDate(ev.starts_at, ev.ends_at) }}</span>
          </div>
          <div v-if="ev.location_name" class="flex items-center gap-1.5 text-[11px] text-white/55">
            <BIcon name="MapPin" class="w-3 h-3 shrink-0" />
            <span class="truncate">{{ ev.location_name }}</span>
          </div>
          <div v-if="ev.group" class="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-brand-border/40">
            <EntityAvatar :src="ev.group.avatar_url" :name="ev.group.name" square class="w-4 h-4 text-[8px] !rounded-[3px]" />
            <span class="text-[10px] text-white/40 truncate">{{ ev.group.name }}</span>
          </div>
        </div>
      </router-link>
    </div>
  </section>
</template>
