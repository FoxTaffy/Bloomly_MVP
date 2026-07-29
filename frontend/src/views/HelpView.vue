<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import api from '@/api'

const nsfwMode = useNsfwMode().nsfwEnabled
const auth = useAuthStore()
const langStore = useLangStore()

type SectionKey = 'faq' | 'report' | 'tickets' | 'contacts'
const section = ref<SectionKey>('faq')

const sections = computed<{ key: SectionKey; label: string; icon: string }[]>(() => [
  { key: 'faq',      label: langStore.t.helpTabFaq,      icon: 'CircleHelp' },
  { key: 'report',   label: langStore.t.helpTabReport,   icon: 'Bug' },
  { key: 'tickets',  label: langStore.t.helpTabTickets,  icon: 'MessageSquare' },
  { key: 'contacts', label: langStore.t.helpTabContacts, icon: 'Mail' },
])

// ── Toast ─────────────────────────────────────────────────────────────
const toast = reactive({ show: false, type: 'success' as 'success' | 'error', message: '' })
let toastTimer = 0
function showToast(type: 'success' | 'error', message: string) {
  clearTimeout(toastTimer)
  Object.assign(toast, { show: true, type, message })
  toastTimer = window.setTimeout(() => { toast.show = false }, 3500)
}

// ── FAQ ───────────────────────────────────────────────────────────────
const FAQ_ITEMS = computed(() => {
  const t = langStore.t as any
  return Array.from({ length: 10 }, (_, i) => ({
    q: t[`helpFaqQ${i + 1}`] as string,
    a: t[`helpFaqA${i + 1}`] as string,
  }))
})
const openFaq = ref<number | null>(null)
function toggleFaq(i: number) { openFaq.value = openFaq.value === i ? null : i }

// ── FAQ expand/collapse animation ───────────────────────────────────────
function onFaqEnter(el: Element) {
  const e = el as HTMLElement
  e.style.height = '0px'
  e.style.opacity = '0'
  void e.offsetHeight
  e.style.height = e.scrollHeight + 'px'
  e.style.opacity = '1'
}
function onFaqAfterEnter(el: Element) {
  (el as HTMLElement).style.height = 'auto'
}
function onFaqLeave(el: Element) {
  const e = el as HTMLElement
  e.style.height = e.scrollHeight + 'px'
  e.style.opacity = '1'
  void e.offsetHeight
  e.style.height = '0px'
  e.style.opacity = '0'
}

// ── Report form ───────────────────────────────────────────────────────
const TYPE_OPTIONS = computed<{ value: string; label: string; icon: string }[]>(() => [
  { value: 'bug',      label: langStore.t.helpTypeOptBug,      icon: 'Bug' },
  { value: 'feedback', label: langStore.t.helpTypeOptFeedback, icon: 'Lightbulb' },
  { value: 'question', label: langStore.t.helpTypeOptQuestion, icon: 'CircleHelp' },
  { value: 'other',    label: langStore.t.helpTypeOptOther,    icon: 'Ellipsis' },
])

const MAX_ATTACHMENT_FILES = 5

const form = reactive({
  type: 'bug',
  subject: '',
  message: '',
  contact_email: '',
  attachment_urls: [] as string[],
})
const isSubmitting = ref(false)
const mediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

function onAttachmentsUploaded(urls: string[]) {
  form.attachment_urls = urls
}

onMounted(() => {
  form.contact_email = auth.user?.email ?? ''
})

const canSubmit = computed(() => form.subject.trim().length >= 3 && form.message.trim().length >= 10)

async function submitTicket() {
  if (!canSubmit.value || isSubmitting.value) return
  isSubmitting.value = true
  try {
    const res = await api.post('/support/tickets', { ...form })
    if (res.data.success) {
      tickets.value.unshift(res.data.data.ticket)
      form.subject = ''
      form.message = ''
      form.attachment_urls = []
      mediaUploadRef.value?.clearAll()
      showToast('success', langStore.t.helpToastSuccess)
      section.value = 'tickets'
    }
  } catch {
    showToast('error', langStore.t.helpToastError)
  } finally {
    isSubmitting.value = false
  }
}

// ── My tickets ────────────────────────────────────────────────────────
const tickets = ref<any[]>([])
const isLoadingTickets = ref(false)
const TYPE_LABEL = computed<Record<string, string>>(() => ({
  bug: langStore.t.helpTypeShortBug,
  feedback: langStore.t.helpTypeShortFeedback,
  question: langStore.t.helpTypeShortQuestion,
  other: langStore.t.helpTypeShortOther,
}))
const STATUS_LABEL = computed<Record<string, string>>(() => ({
  open: langStore.t.helpStatusOpen,
  in_progress: langStore.t.helpStatusInProgress,
  resolved: langStore.t.helpStatusResolved,
  closed: langStore.t.helpStatusClosed,
}))
const STATUS_COLOR: Record<string, string> = { open: '#f59e0b', in_progress: '#38bdf8', resolved: '#10b981', closed: '#6b7280' }
const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })

async function fetchTickets() {
  isLoadingTickets.value = true
  try {
    const res = await api.get('/support/tickets')
    if (res.data.success) tickets.value = res.data.data.tickets
  } catch {} finally { isLoadingTickets.value = false }
}

onMounted(fetchTickets)

// ── Ticket thread replies ────────────────────────────────────────────────
const replyDrafts = reactive<Record<string, string>>({})
const sendingReply = reactive<Record<string, boolean>>({})
const senderLabel = (m: any) =>
  m.sender_type === 'admin' ? langStore.t.helpAdminReplyLabel
  : m.sender_type === 'external' ? langStore.t.helpSenderYouEmail
  : langStore.t.helpSenderYou

async function sendReply(ticketId: string) {
  const message = replyDrafts[ticketId]?.trim()
  if (!message || sendingReply[ticketId]) return
  sendingReply[ticketId] = true
  try {
    const res = await api.post(`/support/tickets/${ticketId}/messages`, { message })
    if (res.data.success) {
      const idx = tickets.value.findIndex(t => t.id === ticketId)
      if (idx !== -1) tickets.value[idx].messages.push(res.data.data.message)
      delete replyDrafts[ticketId]
    }
  } catch {
    showToast('error', langStore.t.helpToastError)
  } finally {
    sendingReply[ticketId] = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">

    <Transition name="toast">
      <div v-if="toast.show"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border backdrop-blur-lg pointer-events-none"
        :class="toast.type === 'success'
          ? 'bg-brand-success/10 border-brand-success/30 text-brand-success'
          : 'bg-brand-error/10 border-brand-error/30 text-brand-error'">
        <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        {{ toast.message }}
      </div>
    </Transition>

    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-28 md:pb-10">
      <AppSidebar />

      <main class="flex-1 min-w-0 max-w-3xl">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-brand-accent/15">
            <BIcon name="CircleHelp" class="w-5 h-5 text-brand-accent" />
          </div>
          <div>
            <h1 class="font-extrabold text-white text-xl leading-none">{{ langStore.t.help }}</h1>
            <p class="text-xs text-white/40 mt-1">{{ langStore.t.helpSubtitle }}</p>
          </div>
        </div>

        <!-- Section tabs -->
        <div class="flex gap-2 mb-6 flex-wrap">
          <button v-for="s in sections" :key="s.key" @click="section = s.key"
            class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all"
            :class="section === s.key
              ? 'bg-brand-accent/15 border-brand-accent/30 text-brand-accent'
              : 'bg-brand-card border-brand-border text-white/45 hover:text-white/80'">
            <BIcon :name="s.icon" class="w-4 h-4" />
            {{ s.label }}
          </button>
        </div>

        <!-- ── FAQ ─────────────────────────────────────────────────── -->
        <section v-if="section === 'faq'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl divide-y divide-brand-border overflow-hidden">
          <div v-for="(item, i) in FAQ_ITEMS" :key="i">
            <button @click="toggleFaq(i)" class="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-all">
              <span class="text-sm font-bold text-white/85">{{ item.q }}</span>
              <BIcon name="ChevronDown" class="w-4 h-4 text-white/30 flex-shrink-0 transition-transform duration-300" :class="openFaq === i ? 'rotate-180' : ''" />
            </button>
            <Transition name="faq" @enter="onFaqEnter" @after-enter="onFaqAfterEnter" @leave="onFaqLeave">
              <div v-if="openFaq === i" class="px-5 pb-4 -mt-1 overflow-hidden">
                <p class="text-sm text-white/55 leading-relaxed">{{ item.a }}</p>
              </div>
            </Transition>
          </div>
        </section>

        <!-- ── Report a problem ───────────────────────────────────────── -->
        <section v-else-if="section === 'report'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-5 md:p-6">
          <p class="text-xs text-white/40 mb-5">{{ langStore.t.helpReportIntro }}</p>

          <div class="mb-5">
            <label class="block text-xs font-bold text-white/40 mb-2">{{ langStore.t.helpTypeLabel }}</label>
            <div class="flex gap-2 flex-wrap">
              <button v-for="t in TYPE_OPTIONS" :key="t.value" @click="form.type = t.value"
                class="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all"
                :class="form.type === t.value
                  ? 'bg-brand-accent/15 border-brand-accent/30 text-brand-accent'
                  : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
                <BIcon :name="t.icon" class="w-3.5 h-3.5" />
                {{ t.label }}
              </button>
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-xs font-bold text-white/40 mb-2">{{ langStore.t.helpSubjectLabel }}</label>
            <input v-model="form.subject" type="text" maxlength="150" :placeholder="langStore.t.helpSubjectPlaceholder"
              class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/40" />
          </div>

          <div class="mb-4">
            <label class="block text-xs font-bold text-white/40 mb-2">{{ langStore.t.helpMessageLabel }}</label>
            <textarea v-model="form.message" rows="5" maxlength="3000" :placeholder="langStore.t.helpMessagePlaceholder"
              class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/40 resize-none"></textarea>
          </div>

          <div class="mb-5">
            <label class="block text-xs font-bold text-white/40 mb-2">{{ langStore.t.helpAttachmentsLabel }}</label>
            <MediaUpload ref="mediaUploadRef" folder="reports" accept="image/*" :multiple="true" :max-files="MAX_ATTACHMENT_FILES" :max-size-mb="10" @uploaded="onAttachmentsUploaded" />
          </div>

          <div class="mb-5">
            <label class="block text-xs font-bold text-white/40 mb-2">{{ langStore.t.helpEmailLabel }}</label>
            <input v-model="form.contact_email" type="email" placeholder="you@example.com"
              class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/40" />
          </div>

          <button @click="submitTicket" :disabled="!canSubmit || isSubmitting"
            class="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold bg-brand-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all">
            {{ isSubmitting ? langStore.t.helpSubmitting : langStore.t.helpSubmitBtn }}
          </button>
        </section>

        <!-- ── My tickets ──────────────────────────────────────────────── -->
        <section v-else-if="section === 'tickets'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
          <div v-if="isLoadingTickets" class="divide-y divide-brand-border">
            <div v-for="n in 3" :key="n" class="flex gap-3 px-5 py-4 animate-pulse">
              <div class="flex-1 space-y-2">
                <div class="h-3 bg-white/[0.08] rounded-full w-48" /><div class="h-2 bg-white/5 rounded-full w-32" />
              </div>
            </div>
          </div>
          <div v-else-if="tickets.length === 0" class="flex flex-col items-center gap-3 py-16 text-white/25">
            <BIcon name="MessageSquare" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">{{ langStore.t.helpTicketsEmpty }}</p>
            <button @click="section = 'report'" class="text-xs font-bold text-brand-accent hover:underline">{{ langStore.t.helpTabReport }}</button>
          </div>
          <div v-else class="divide-y divide-brand-border">
            <div v-for="t in tickets" :key="t.id" class="px-5 py-4">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-xs font-bold px-2 py-0.5 rounded-full border"
                  :style="`color:${STATUS_COLOR[t.status]};background:${STATUS_COLOR[t.status]}1a;border-color:${STATUS_COLOR[t.status]}30`">
                  {{ STATUS_LABEL[t.status] }}
                </span>
                <span class="text-[10px] text-white/25 uppercase font-bold">{{ TYPE_LABEL[t.type] ?? t.type }}</span>
                <span class="text-[10px] text-white/25">{{ formatDate(t.created_at) }}</span>
                <span v-if="t.source === 'email'" class="text-[10px] text-brand-accent/70 font-bold">· {{ langStore.t.helpTicketSourceEmail }}</span>
              </div>
              <p class="text-sm font-bold text-white/85">{{ t.subject }}</p>

              <div class="mt-3 space-y-2">
                <div v-for="m in t.messages" :key="m.id"
                  class="px-3 py-2 rounded-xl border"
                  :class="m.sender_type === 'admin' ? 'bg-brand-accent/[0.06] border-brand-accent/20' : 'bg-white/5 border-white/[0.06]'">
                  <p class="text-[10px] font-bold mb-0.5" :class="m.sender_type === 'admin' ? 'text-brand-accent/80' : 'text-white/30'">
                    {{ senderLabel(m) }}
                  </p>
                  <p class="text-xs text-white/70 whitespace-pre-wrap">{{ m.body }}</p>
                  <div v-if="m.attachment_urls?.length" class="flex gap-2 mt-2 flex-wrap">
                    <a v-for="(url, ai) in m.attachment_urls" :key="ai" :href="url" target="_blank" rel="noopener"
                      class="w-16 h-16 rounded-lg overflow-hidden border border-white/[0.08] flex-shrink-0">
                      <img :src="url" class="w-full h-full object-cover" />
                    </a>
                  </div>
                </div>
              </div>

              <div class="mt-3 flex gap-2">
                <input v-model="replyDrafts[t.id]" type="text" :placeholder="langStore.t.helpTicketReplyPlaceholder"
                  @keydown.enter="sendReply(t.id)"
                  class="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white/85 placeholder-white/25 focus:outline-none focus:border-brand-accent/40" />
                <button @click="sendReply(t.id)" :disabled="!replyDrafts[t.id]?.trim() || sendingReply[t.id]"
                  class="px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all">
                  {{ langStore.t.helpTicketSendBtn }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Contacts ────────────────────────────────────────────────── -->
        <section v-else-if="section === 'contacts'" class="space-y-4">
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-5 md:p-6">
            <h2 class="font-bold text-white text-sm mb-4">{{ langStore.t.helpContactsDirectTitle }}</h2>
            <div class="space-y-3">
              <a href="mailto:support@bloomly.fun" class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <div class="w-9 h-9 rounded-xl bg-brand-accent/15 flex items-center justify-center flex-shrink-0">
                  <BIcon name="Mail" class="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <p class="text-sm font-bold text-white/85">support@bloomly.fun</p>
                  <p class="text-xs text-white/35">{{ langStore.t.helpContactSupportDesc }}</p>
                </div>
              </a>
              <a href="mailto:privacy@bloomly.fun" class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <div class="w-9 h-9 rounded-xl bg-brand-accent/15 flex items-center justify-center flex-shrink-0">
                  <BIcon name="ShieldCheck" class="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <p class="text-sm font-bold text-white/85">privacy@bloomly.fun</p>
                  <p class="text-xs text-white/35">{{ langStore.t.helpContactPrivacyDesc }}</p>
                </div>
              </a>
            </div>
          </div>

          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-5 md:p-6">
            <h2 class="font-bold text-white text-sm mb-4">{{ langStore.t.helpCommunityTitle }}</h2>
            <div class="space-y-3">
              <a href="https://t.me/Bloomly_news" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <div class="w-9 h-9 rounded-xl bg-[#26A5E4]/15 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" class="w-4 h-4" fill="#26A5E4" xmlns="http://www.w3.org/2000/svg"><path d="M21.94 4.11c.28-1.19-.87-2.16-1.99-1.72L2.4 9.63c-1.2.47-1.19 2.16.02 2.61l4.4 1.63 1.7 5.48c.24.76 1.2 1.01 1.79.46l2.51-2.36 4.47 3.34c.9.67 2.19.18 2.42-.93l3.23-15.75zM8.5 13.6l9.3-6.03c.24-.15.48.16.27.35l-7.7 7.05a1 1 0 0 0-.32.62l-.24 2.3-1.31-4.29z"/></svg>
                </div>
                <div>
                  <p class="text-sm font-bold text-white/85">Telegram</p>
                  <p class="text-xs text-white/35">{{ langStore.t.helpTelegramDesc }}</p>
                </div>
              </a>
              <a href="https://discord.gg/ARnCAYSEyr" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <div class="w-9 h-9 rounded-xl bg-[#5865F2]/15 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" class="w-4 h-4" fill="#5865F2" xmlns="http://www.w3.org/2000/svg"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.27 18.27 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04c-1.7.29-3.36.8-4.89 1.52a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.83 19.83 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.83-9.67-3.53-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.17 1.1 2.15 2.42 0 1.34-.95 2.42-2.15 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.17 1.1 2.15 2.42 0 1.34-.94 2.42-2.15 2.42z"/></svg>
                </div>
                <div>
                  <p class="text-sm font-bold text-white/85">Discord</p>
                  <p class="text-xs text-white/35">{{ langStore.t.helpDiscordDesc }}</p>
                </div>
              </a>
            </div>
          </div>

          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-5 md:p-6">
            <h2 class="font-bold text-white text-sm mb-3">{{ langStore.t.helpDocsTitle }}</h2>
            <div class="flex flex-wrap gap-2">
              <router-link :to="{ name: 'terms' }" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/60 hover:text-white transition-all">{{ langStore.t.termsTitle }}</router-link>
              <router-link :to="{ name: 'privacy' }" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/60 hover:text-white transition-all">{{ langStore.t.privacyTitle }}</router-link>
            </div>
          </div>

          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-5 md:p-6">
            <h2 class="font-bold text-white text-sm mb-2">{{ langStore.t.helpResponseTimeTitle }}</h2>
            <p class="text-xs text-white/45 leading-relaxed">{{ langStore.t.helpResponseTimeText }}</p>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.88); }

.faq-enter-active, .faq-leave-active { transition: height 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease; }
</style>
