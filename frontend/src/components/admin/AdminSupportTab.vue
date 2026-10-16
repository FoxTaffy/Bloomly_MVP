<script setup lang="ts">
import { ref, computed, watchEffect, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import TicketAttachments from '@/components/TicketAttachments.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const { badges, reportAdminError } = useAdminContext()

// ── Support tickets ──────────────────────────────────────────────────
const supportTickets = ref<any[]>([])
const supportFilter = ref<'' | 'open' | 'in_progress' | 'resolved' | 'closed'>('')
const isLoadingSupport = ref(false)
const supportReplyDrafts = ref<Record<string, string>>({})

const SUPPORT_TYPE_LABEL = computed<Record<string, string>>(() => ({ bug: langStore.t.helpTypeShortBug, feedback: langStore.t.helpTypeShortFeedback, question: langStore.t.helpTypeShortQuestion, other: langStore.t.other }))
const SUPPORT_STATUS_LABEL = computed<Record<string, string>>(() => ({ open: langStore.t.helpStatusOpen, in_progress: langStore.t.helpStatusInProgress, resolved: langStore.t.helpStatusResolved, closed: langStore.t.helpStatusClosed }))
const SUPPORT_STATUS_COLOR: Record<string, string> = { open: '#f59e0b', in_progress: '#38bdf8', resolved: '#10b981', closed: '#6b7280' }

const supportSenderLabel = (m: any) => {
  if (m.sender_type === 'admin') return `${langStore.t.adminSenderAdmin}${m.sender?.username ? ` (@${m.sender.username})` : ''}`
  if (m.sender_type === 'external') return langStore.t.adminSenderExternal
  return `${langStore.t.adminSenderUser}${m.sender?.username ? ` (@${m.sender.username})` : ''}`
}

const supportLoadError = ref(false)
const supportBusy = ref<Record<string, boolean>>({})
let supportFetchSeq = 0

const fetchSupportTickets = async () => {
  const seq = ++supportFetchSeq
  isLoadingSupport.value = true
  supportLoadError.value = false
  try {
    const res = await api.get('/support/admin/tickets', { params: { status: supportFilter.value || undefined } })
    // Ignore stale responses (filter clicked again while this one was in flight)
    if (seq === supportFetchSeq && res.data.success && Array.isArray(res.data.data?.tickets)) {
      supportTickets.value = res.data.data.tickets
    }
  } catch { if (seq === supportFetchSeq) supportLoadError.value = true } finally {
    if (seq === supportFetchSeq) isLoadingSupport.value = false
  }
}

const replySupportTicket = async (ticketId: string, status?: string) => {
  if (supportBusy.value[ticketId]) return
  const idx = supportTickets.value.findIndex(t => t.id === ticketId)
  if (idx === -1) return
  const reply = supportReplyDrafts.value[ticketId]?.trim()
  const previous = supportTickets.value[idx]
  supportBusy.value[ticketId] = true
  // Optimistic status change; rolled back below if the request fails
  if (status) supportTickets.value[idx] = { ...previous, status }
  try {
    const res = await api.patch(`/support/admin/tickets/${ticketId}`, {
      ...(status ? { status } : {}),
      ...(reply ? { admin_reply: reply } : {}),
    })
    const updated = res.data?.success ? res.data.data?.ticket : null
    if (!updated) throw new Error('empty response')
    const i = supportTickets.value.findIndex(t => t.id === ticketId)
    if (i !== -1) supportTickets.value[i] = { ...supportTickets.value[i], ...updated }
    delete supportReplyDrafts.value[ticketId]
  } catch (e) {
    const i = supportTickets.value.findIndex(t => t.id === ticketId)
    if (i !== -1) supportTickets.value[i] = previous
    reportAdminError(e)
  } finally { delete supportBusy.value[ticketId] }
}

onActivated(() => { if (!supportTickets.value.length) fetchSupportTickets() })
watchEffect(() => { badges.support = supportTickets.value.filter((t: any) => t.status === 'open').length })
</script>

<template>
  <div>
    <!-- Filter pills -->
    <div class="flex gap-2 mb-5 flex-wrap">
      <button v-for="s in (['', 'open', 'in_progress', 'resolved', 'closed'] as const)" :key="s"
        @click="supportFilter = s; fetchSupportTickets()"
        class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
        :class="supportFilter === s
          ? 'bg-[#4C67CF]/15 border-[#4C67CF]/25 text-[#8fa0ec]'
          : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
        {{ s === '' ? langStore.t.tabAll : SUPPORT_STATUS_LABEL[s] }}
      </button>
    </div>

    <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div v-if="isLoadingSupport" class="divide-y divide-brand-border">
        <div v-for="n in 4" :key="n" class="flex gap-3 px-5 py-4 animate-pulse">
          <div class="flex-1 space-y-2">
            <div class="h-3 bg-white/[0.08] rounded-full w-48" /><div class="h-2 bg-white/5 rounded-full w-32" />
          </div>
        </div>
      </div>
      <div v-else-if="supportLoadError && supportTickets.length === 0" class="flex flex-col items-center gap-3 py-16 text-white/30">
        <p class="text-sm font-semibold">{{ langStore.t.adminLoadFailed }}</p>
        <button @click="fetchSupportTickets" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/60 hover:text-white transition-all">{{ langStore.t.adminRetryBtn }}</button>
      </div>
      <div v-else-if="supportTickets.length === 0"
        class="flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="LifeBuoy" class="w-10 h-10 opacity-40" />
        <p class="text-sm font-semibold">{{ langStore.t.adminNoTicketsFound }}</p>
      </div>
      <div v-else class="divide-y divide-brand-border">
        <div v-for="ticket in supportTickets" :key="ticket.id" class="px-5 py-4 hover:bg-white/[0.03] transition-all">
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0 mt-1.5">
              <div class="w-2.5 h-2.5 rounded-full" :style="`background:${SUPPORT_STATUS_COLOR[ticket.status]}`" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-xs font-bold px-2 py-0.5 rounded-full border"
                  :style="`color:${SUPPORT_STATUS_COLOR[ticket.status]};background:${SUPPORT_STATUS_COLOR[ticket.status]}1a;border-color:${SUPPORT_STATUS_COLOR[ticket.status]}30`">
                  {{ SUPPORT_STATUS_LABEL[ticket.status] }}
                </span>
                <span class="text-[10px] text-white/25 uppercase font-bold">{{ SUPPORT_TYPE_LABEL[ticket.type] ?? ticket.type }}</span>
                <span class="text-[10px] text-white/25">{{ formatDate(ticket.created_at) }}</span>
                <span v-if="ticket.source === 'email'" class="text-[10px] text-[#8fa0ec] font-bold">· {{ langStore.t.adminTicketSourceEmail }}</span>
              </div>
              <p class="text-sm text-white/80 font-bold">{{ ticket.subject }}</p>
              <p class="text-xs text-white/30 mt-1.5">
                <template v-if="ticket.user?.username">{{ langStore.t.adminFromPrefix }} @{{ ticket.user.username }}</template>
                <template v-else-if="ticket.external_email">{{ langStore.t.adminFromPrefix }} {{ ticket.external_email }}</template>
                <span v-if="ticket.contact_email && ticket.contact_email !== ticket.external_email"> · {{ ticket.contact_email }}</span>
              </p>

              <div class="mt-3 space-y-2">
                <div v-for="m in ticket.messages" :key="m.id"
                  class="px-3 py-2 rounded-xl border"
                  :class="m.sender_type === 'admin' ? 'bg-[#4C67CF]/[0.08] border-[#4C67CF]/20' : 'bg-white/5 border-white/[0.06]'">
                  <p class="text-[10px] font-bold mb-0.5" :class="m.sender_type === 'admin' ? 'text-[#8fa0ec]' : 'text-white/30'">
                    {{ supportSenderLabel(m) }}
                  </p>
                  <p class="text-xs text-white/70 whitespace-pre-wrap">{{ m.body }}</p>
                  <TicketAttachments :urls="m.attachment_urls" />
                </div>
              </div>

              <div class="mt-3 flex flex-col sm:flex-row gap-2">
                <input v-model="supportReplyDrafts[ticket.id]" type="text" :placeholder="langStore.t.adminReplyToUserPlaceholder"
                  class="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#4C67CF]/40" />
                <div class="flex gap-2 flex-shrink-0">
                  <button @click="replySupportTicket(ticket.id, 'in_progress')" :disabled="supportBusy[ticket.id]"
                    class="disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 transition-all">
                    {{ langStore.t.adminMarkInProgressBtn }}
                  </button>
                  <button @click="replySupportTicket(ticket.id, 'resolved')" :disabled="supportBusy[ticket.id]"
                    class="disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    ✓ {{ langStore.t.adminMarkResolvedBtn }}
                  </button>
                  <button @click="replySupportTicket(ticket.id, 'closed')" :disabled="supportBusy[ticket.id]"
                    class="disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/40 hover:text-white transition-all">
                    {{ langStore.t.adminCloseBtn }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
