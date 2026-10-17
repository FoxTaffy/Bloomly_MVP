<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatNum, formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()

// ── Groups & Events ─────────────────────────────────────────────────────
const groupsOverview = ref<any>(null)
const isLoadingGroupsOverview = ref(false)
const GROUP_TYPE_LABEL = computed<Record<string, string>>(() => ({
  event: langStore.t.catEvent, creative: langStore.t.adminGroupTypeCreative, artist: langStore.t.verTypeArtist, static: langStore.t.adminGroupTypeStatic,
  news: langStore.t.adminGroupTypeNews, shop: langStore.t.shop, community: langStore.t.adminGroupTypeCommunity, brand: langStore.t.adminGroupTypeBrand,
}))
const fetchGroupsOverview = async () => {
  if (groupsOverview.value) return
  isLoadingGroupsOverview.value = true
  try {
    const res = await api.get('/admin/groups-overview')
    if (res.data.success) groupsOverview.value = res.data.data
  } catch {} finally { isLoadingGroupsOverview.value = false }
}

onActivated(fetchGroupsOverview)
</script>

<template>
  <div>
    <div v-if="isLoadingGroupsOverview" class="stack-y-5">
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div v-for="n in 6" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
      </div>
      <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
    </div>
    <template v-else-if="groupsOverview">
      <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">{{ langStore.t.groups }}</h2>
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
        <router-link v-for="g in groupsOverview.groups" :key="g.id" :to="`/groups/${g.slug}`" target="_blank"
          class="rounded-2xl border border-brand-border bg-brand-card p-4 hover:border-brand-accent/30 transition-all overflow-hidden relative">
          <div class="absolute top-0 left-0 right-0 h-[3px] bg-brand-accent" />
          <p class="font-bold text-white text-sm truncate mt-1">{{ g.name }}</p>
          <p class="text-xs text-white/35 mt-0.5">{{ GROUP_TYPE_LABEL[g.type] ?? g.type }}</p>
          <p class="text-xs text-white/50 mt-2 flex items-center gap-1.5">
            <BIcon name="Users" class="w-3.5 h-3.5" /> {{ formatNum(g.memberCount) }} {{ langStore.t.adminParticipantsSuffix }}
          </p>
        </router-link>
        <p v-if="!groupsOverview.groups.length" class="col-span-full text-center text-sm text-white/25 py-10">{{ langStore.t.adminNoGroupsYet }}</p>
      </div>

      <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">{{ langStore.t.adminUpcomingEventsTitle }}</h2>
      <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
        <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr]">
          <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColEvent }}</span>
          <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColGroup }}</span>
          <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColDate }}</span>
          <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColParticipants }}</span>
          <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.statusFieldLabel }}</span>
        </div>
        <div v-if="!groupsOverview.events.length" class="flex flex-col items-center gap-3 py-16 text-white/25">
          <BIcon name="CalendarDays" class="w-10 h-10 opacity-40" />
          <p class="text-sm font-semibold">{{ langStore.t.adminNoEventsFound }}</p>
        </div>
        <div v-else class="divide-y divide-brand-border">
          <router-link v-for="e in groupsOverview.events" :key="e.id" :to="`/groups/${e.groupSlug}`" target="_blank"
            class="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr] gap-2 lg:gap-3 items-center px-5 py-3.5 hover:bg-white/3 transition-all">
            <p class="text-sm font-bold text-white truncate">{{ e.title }}</p>
            <p class="text-xs text-white/50 truncate">{{ e.groupName }}</p>
            <p class="text-xs text-white/50">{{ formatDate(e.startsAt) }}</p>
            <p class="text-xs text-white/70 font-semibold">{{ formatNum(e.attendeeCount) }}</p>
            <span class="text-[10px] font-extrabold px-2 py-1 rounded-full w-fit"
              :class="e.isUpcoming ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/30'">
              {{ e.isUpcoming ? langStore.t.adminUpcomingLabel : langStore.t.adminPastLabel }}
            </span>
          </router-link>
        </div>
      </div>
    </template>
  </div>
</template>
