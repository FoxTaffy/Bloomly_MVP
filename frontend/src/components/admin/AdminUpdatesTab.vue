<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import { formatDate, formatNum } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const { confirmDialog } = useConfirm()
const { reportAdminError } = useAdminContext()

// Рассылки: сообщение попадает в «Уведомления» выбранной аудитории (вкладка «Система»)
type Audience = 'all' | 'premium' | 'new' | 'staff'
const TITLE_MAX = 200
const BODY_MAX = 2000

const broadcasts = ref<any[]>([])
const isLoadingBroadcasts = ref(false)
const loadFailed = ref(false)
const counts = ref<Record<Audience, number> | null>(null)
const title = ref('')
const body = ref('')
const audience = ref<Audience>('all')
const isSending = ref(false)
const justSent = ref<number | null>(null)

const AUDIENCES = computed<{ key: Audience; label: string; icon: string; color: string }[]>(() => [
  { key: 'all',     label: langStore.t.adminAudienceAll,     icon: 'Users',      color: '#6d83e8' },
  { key: 'premium', label: langStore.t.adminAudiencePremium, icon: 'Sparkles',   color: '#a78bfa' },
  { key: 'new',     label: langStore.t.adminAudienceNew,     icon: 'UserPlus',   color: '#34d399' },
  { key: 'staff',   label: langStore.t.adminAudienceStaff,   icon: 'ShieldCheck', color: '#f59e0b' },
])
const audienceLabel = (a: string) => AUDIENCES.value.find(x => x.key === a)?.label ?? a
const recipients = computed(() => counts.value?.[audience.value] ?? null)

const fetchAll = async () => {
  isLoadingBroadcasts.value = true
  loadFailed.value = false
  try {
    const [h, c] = await Promise.all([api.get('/admin/broadcasts'), api.get('/admin/broadcasts/audience')])
    if (h.data.success) broadcasts.value = h.data.data.broadcasts
    if (c.data.success) counts.value = c.data.data.counts
  } catch { loadFailed.value = true } finally { isLoadingBroadcasts.value = false }
}

const canSend = computed(() => !!title.value.trim() && !!body.value.trim() && title.value.length <= TITLE_MAX && body.value.length <= BODY_MAX && !isSending.value && recipients.value !== 0)

const send = async () => {
  if (!canSend.value) return
  const n = recipients.value
  const ok = await confirmDialog(`Отправить «${title.value.trim()}» — ${audienceLabel(audience.value)}${n != null ? ` (${formatNum(n)} чел.)` : ''}? Отменить рассылку после отправки нельзя.`)
  if (!ok) return
  isSending.value = true
  try {
    const res = await api.post('/admin/broadcasts', { title: title.value.trim(), body: body.value.trim(), audience: audience.value })
    if (res.data.success) {
      broadcasts.value.unshift({ ...res.data.data.broadcast, opens: 0 })
      justSent.value = res.data.data.broadcast.recipient_count
      title.value = ''
      body.value = ''
      setTimeout(() => { justSent.value = null }, 6000)
    }
  } catch (e) { reportAdminError(e) } finally { isSending.value = false }
}

const openRate = (b: any) => (b.recipient_count > 0 ? Math.round((b.opens / b.recipient_count) * 100) : 0)
const totals = computed(() => {
  const sent = broadcasts.value.reduce((s, b) => s + b.recipient_count, 0)
  const opens = broadcasts.value.reduce((s, b) => s + b.opens, 0)
  return { count: broadcasts.value.length, sent, rate: sent ? Math.round((opens / sent) * 100) : 0 }
})

onActivated(fetchAll)
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-5">
    <!-- Новая рассылка -->
    <div class="xl:col-span-3 rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5 min-w-0">
      <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminNewBroadcastTitle }}</h3>

      <p class="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-2">Кому</p>
      <div class="grid grid-cols-2 gap-2 mb-4">
        <button v-for="a in AUDIENCES" :key="a.key" type="button" @click="audience = a.key"
          class="text-left rounded-xl border p-3 transition-all"
          :class="audience === a.key ? 'border-brand-accent/60 bg-brand-accent/10' : 'border-white/8 bg-white/3 hover:bg-white/6'">
          <div class="flex items-center gap-2">
            <BIcon :name="a.icon" class="w-4 h-4 shrink-0" :style="`color:${a.color}`" />
            <span class="text-xs font-bold text-white/85 truncate">{{ a.label }}</span>
          </div>
          <p class="text-lg font-black text-white mt-1 leading-none">{{ counts ? formatNum(counts[a.key]) : '…' }}</p>
        </button>
      </div>

      <div class="stack-y-3">
        <div>
          <input v-model="title" :maxlength="TITLE_MAX" :placeholder="langStore.t.adminNotificationTitlePlaceholder" class="adm-input" />
          <p class="text-[10px] text-right mt-1" :class="title.length > TITLE_MAX * 0.9 ? 'text-amber-400' : 'text-white/25'">{{ title.length }} / {{ TITLE_MAX }}</p>
        </div>
        <div>
          <textarea v-model="body" :maxlength="BODY_MAX" :placeholder="langStore.t.adminMessageTextPlaceholder" class="adm-input resize-none h-32" />
          <p class="text-[10px] text-right mt-1" :class="body.length > BODY_MAX * 0.9 ? 'text-amber-400' : 'text-white/25'">{{ body.length }} / {{ BODY_MAX }}</p>
        </div>
      </div>

      <!-- Как увидит получатель -->
      <div v-if="title.trim() || body.trim()" class="mt-3 rounded-xl border border-white/8 bg-white/3 p-3">
        <p class="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">Так увидит получатель</p>
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center shrink-0 text-base">📣</div>
          <p class="text-sm text-white/80 min-w-0 wrap-break-word">
            <b class="text-white">{{ title.trim() || '…' }}</b><template v-if="body.trim()"> — {{ body.trim() }}</template>
          </p>
        </div>
      </div>

      <button @click="send" :disabled="!canSend"
        class="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
        style="background:linear-gradient(135deg,#4C67CF,#8b5cf6)">
        <BIcon name="Send" class="w-4 h-4" />
        {{ isSending ? langStore.t.adminSendingLabel : langStore.t.adminSendBroadcastBtn }}<template v-if="recipients != null && !isSending"> · {{ formatNum(recipients) }}</template>
      </button>
      <p v-if="justSent !== null" class="mt-3 text-xs font-bold text-emerald-400 flex items-center gap-1.5">
        <BIcon name="CheckCircle2" class="w-3.5 h-3.5" /> Отправлено: {{ formatNum(justSent) }} получателям
      </p>
    </div>

    <!-- История -->
    <div class="xl:col-span-2 rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5 min-w-0">
      <div class="flex items-center justify-between gap-3 mb-4">
        <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminBroadcastHistoryTitle }}</h3>
        <button type="button" @click="fetchAll" :disabled="isLoadingBroadcasts" title="Обновить"
          class="w-7 h-7 rounded-lg bg-white/5 border border-white/8 text-white/40 hover:text-white flex items-center justify-center disabled:opacity-40">
          <BIcon name="RefreshCw" class="w-3.5 h-3.5" :class="isLoadingBroadcasts ? 'animate-spin' : ''" />
        </button>
      </div>

      <div v-if="broadcasts.length" class="grid grid-cols-3 gap-2 mb-4">
        <div class="rounded-xl bg-white/4 p-2.5 text-center"><p class="text-base font-black text-white">{{ totals.count }}</p><p class="text-[10px] text-white/40">рассылок</p></div>
        <div class="rounded-xl bg-white/4 p-2.5 text-center"><p class="text-base font-black text-white">{{ formatNum(totals.sent) }}</p><p class="text-[10px] text-white/40">доставлено</p></div>
        <div class="rounded-xl bg-white/4 p-2.5 text-center"><p class="text-base font-black text-white">{{ totals.rate }}%</p><p class="text-[10px] text-white/40">прочитано</p></div>
      </div>

      <div v-if="isLoadingBroadcasts && !broadcasts.length" class="stack-y-3">
        <div v-for="n in 3" :key="n" class="h-16 rounded-xl bg-white/5 animate-pulse" />
      </div>
      <div v-else-if="loadFailed && !broadcasts.length" class="text-center py-10 text-white/35">
        <p class="text-xs font-semibold mb-2">{{ langStore.t.adminLoadFailed }}</p>
        <button @click="fetchAll" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/8 text-white/60 hover:text-white">{{ langStore.t.adminRetryBtn }}</button>
      </div>
      <div v-else-if="!broadcasts.length" class="text-xs text-white/25 text-center py-10">{{ langStore.t.adminNoBroadcastsYet }}</div>
      <div v-else class="divide-y divide-brand-border -mx-1 max-h-[560px] overflow-y-auto">
        <div v-for="b in broadcasts" :key="b.id" class="py-3 px-1">
          <div class="flex items-start justify-between gap-3">
            <p class="font-bold text-sm text-white min-w-0 wrap-break-word">{{ b.title }}</p>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/6 text-white/55 shrink-0">{{ audienceLabel(b.audience) }}</span>
          </div>
          <p v-if="b.body" class="text-xs text-white/45 mt-0.5 line-clamp-2">{{ b.body }}</p>
          <div class="flex items-center gap-2 mt-2">
            <div class="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden"><div class="h-full rounded-full bg-emerald-400" :style="`width:${openRate(b)}%`" /></div>
            <span class="text-[10px] font-bold text-white/50 shrink-0">{{ b.opens }} / {{ b.recipient_count }} · {{ openRate(b) }}%</span>
          </div>
          <p class="text-[10px] text-white/30 mt-1">{{ formatDate(b.created_at) }}<template v-if="b.actor"> · {{ b.actor.display_name || b.actor.username }}</template></p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
