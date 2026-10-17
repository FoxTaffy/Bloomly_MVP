<script setup lang="ts">
import { ref, watch, watchEffect, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const { badges, automodVersion } = useAdminContext()

// ── AutoMod ───────────────────────────────────────────────────────────
const autoModLogs = ref<any[]>([])
const autoModTotal = ref(0)
const autoModPage = ref(1)
const autoModPages = ref(1)
const isLoadingAutoMod = ref(false)
const autoModActionFilter = ref('')
const autoModCategoryFilter = ref('')

const fetchAutoModLogs = async () => {
  isLoadingAutoMod.value = true
  try {
    const res = await api.get('/admin/automod/logs', {
      params: { page: autoModPage.value, action: autoModActionFilter.value || undefined, category: autoModCategoryFilter.value || undefined },
    })
    if (res.data.success) {
      autoModLogs.value  = res.data.data.logs
      autoModTotal.value = res.data.data.total
      autoModPages.value = res.data.data.pages
    }
  } catch {} finally { isLoadingAutoMod.value = false }
}

const actionColor = (action: string): string => ({
  warn:       '#f59e0b',
  freeze:     '#0ea5e9',
  unfreeze:   '#10b981',
  ban:        '#ef4444',
  flag_post:  '#f97316',
  clear_warns:'#8b5cf6',
  manual:     '#6366f1',
}[action] ?? '#6b7280')

const categoryEmoji = (cat: string): string => ({
  spam:       '🔁',
  toxic:      '🤬',
  duplicate:  '📋',
  fraud:      '🚨',
  suspicious: '👁️',
  manual:     '🛡️',
  other:      '📌',
}[cat] ?? '📌')

onActivated(fetchAutoModLogs)
watch(automodVersion, fetchAutoModLogs)
watchEffect(() => { badges.automod = autoModTotal.value })
</script>

<template>
  <div>
    <!-- Filters -->
    <div class="flex items-center gap-2 mb-5 flex-wrap">
      <select v-model="autoModActionFilter" @change="autoModPage=1; fetchAutoModLogs()"
        class="bg-brand-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-hidden focus:border-rose-500/40 cursor-pointer">
        <option value="">{{ langStore.t.adminAllActionsOption }}</option>
        <option value="warn">⚠️ warn</option>
        <option value="freeze">🧊 freeze</option>
        <option value="unfreeze">🔓 unfreeze</option>
        <option value="ban">🚫 ban</option>
        <option value="flag_post">🚩 flag_post</option>
        <option value="clear_warns">✖ clear_warns</option>
      </select>
      <select v-model="autoModCategoryFilter" @change="autoModPage=1; fetchAutoModLogs()"
        class="bg-brand-card border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-hidden focus:border-rose-500/40 cursor-pointer">
        <option value="">{{ langStore.t.adminAllCategoriesOption }}</option>
        <option value="spam">🔁 spam</option>
        <option value="toxic">🤬 toxic</option>
        <option value="duplicate">📋 duplicate</option>
        <option value="fraud">🚨 fraud</option>
        <option value="suspicious">👁️ suspicious</option>
        <option value="manual">🛡️ manual</option>
      </select>
      <button @click="fetchAutoModLogs()"
        class="px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-xs text-white/50 hover:text-white transition-all">
        <BIcon name="RefreshCw" class="w-3.5 h-3.5" />
      </button>
      <span class="ml-auto text-xs font-bold text-white/30 bg-white/5 px-3 py-2 rounded-xl border border-white/8">{{ autoModTotal }} {{ langStore.t.adminEventsSuffix }}</span>
    </div>

    <!-- Logs -->
    <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div v-if="isLoadingAutoMod" class="divide-y divide-brand-border">
        <div v-for="n in 8" :key="n" class="flex items-center gap-3 px-5 py-3 animate-pulse">
          <div class="w-8 h-8 rounded-full bg-white/8 shrink-0" />
          <div class="flex-1 stack-y-2">
            <div class="h-3 bg-white/8 rounded-full w-48" />
            <div class="h-2 bg-white/5 rounded-full w-32" />
          </div>
          <div class="h-5 w-14 bg-white/8 rounded-full" />
        </div>
      </div>
      <div v-else-if="!autoModLogs.length" class="flex flex-col items-center gap-4 py-20 text-white/25">
        <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">🛡️</div>
        <p class="text-sm font-semibold">{{ langStore.t.adminLogEmpty }}</p>
        <p class="text-xs">{{ langStore.t.adminAutoModNoViolations }}</p>
      </div>
      <div v-else class="divide-y divide-brand-border">
        <div v-for="log in autoModLogs" :key="log.id"
          class="flex items-start gap-3 px-5 py-3.5 hover:bg-white/2 transition-all">
          <!-- Avatar -->
          <img v-if="log.user?.avatar_url" :src="log.user.avatar_url"
            class="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0 mt-0.5" />
          <div v-else
            class="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50 shrink-0 mt-0.5">
            {{ (log.user?.username ?? '?')[0].toUpperCase() }}
          </div>
          <!-- Content -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white flex items-center gap-1.5 flex-wrap">
              <span class="text-base leading-none">{{ categoryEmoji(log.category) }}</span>
              <span class="truncate">@{{ log.user?.username ?? log.user_id }}</span>
              <span class="text-white/30">·</span>
              <span class="font-extrabold uppercase text-[11px] tracking-wide" :style="`color:${actionColor(log.action)}`">{{ log.action }}</span>
            </p>
            <p class="text-xs text-white/50 mt-0.5 line-clamp-2">{{ log.reason }}</p>
            <p v-if="log.details" class="text-[10px] text-white/25 mt-0.5 font-mono truncate">{{ log.details }}</p>
          </div>
          <!-- Time badge -->
          <span class="text-[10px] text-white/25 font-semibold shrink-0 mt-1">{{ formatDate(log.created_at) }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="autoModPages > 1" class="flex items-center justify-center gap-2 mt-4">
      <button @click="autoModPage--; fetchAutoModLogs()" :disabled="autoModPage <= 1"
        class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
        <BIcon name="ChevronLeft" class="w-4 h-4" />
      </button>
      <span class="text-xs font-bold text-white/40 px-3">{{ autoModPage }} / {{ autoModPages }}</span>
      <button @click="autoModPage++; fetchAutoModLogs()" :disabled="autoModPage >= autoModPages"
        class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
        <BIcon name="ChevronRight" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
