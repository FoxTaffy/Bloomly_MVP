<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, onMounted, computed } from 'vue'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import { useWarningModalStore } from '@/stores/warningModal'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useLangStore } from '@/stores/lang'
import { isDenNotification, denNotificationKey } from '@/lib/denNotifications'
import { notifBadgeIcon, notifBadgeColor } from '@/lib/notifVisuals'
import * as fmt from '@/lib/format'

const warningModal = useWarningModalStore()
const langStore = useLangStore()

const notifications = ref<any[]>([])
const isLoading = ref(false)
const unreadCount = computed(() => notifications.value.filter((n: any) => !n.is_read).length)

const normalizeNotif = (n: any) => ({ ...n, is_read: n.is_read ?? n.read ?? false })

const fetchAll = async () => {
  isLoading.value = true
  try {
    const res = await api.get('/notifications')
    if (res.data.success) notifications.value = res.data.data.notifications.map(normalizeNotif)
  } catch {} finally { isLoading.value = false }
}

const markAllRead = async () => {
  try {
    await api.post('/notifications/read', {})
    notifications.value.forEach((n: any) => { n.is_read = true })
  } catch {}
}

const AUTOMOD_TYPES = ['automod_warn', 'automod_freeze', 'automod_unfreeze', 'automod_ban', 'automod_clear_warns', 'automod_appeal_accepted', 'automod_appeal_rejected', 'admin_broadcast', 'avatar_frame_approved', 'avatar_frame_rejected']
const isAutomodNotif = (n: any) => AUTOMOD_TYPES.includes(n.type)

const automodMessage = (n: any) => {
  const meta = n.meta || {}
  switch (n.type) {
    case 'automod_warn': return `⚠️ Предупреждение ${meta.count ?? '?'} из ${meta.limit ?? 5}${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_freeze': return `🧊 Аккаунт временно заморожен${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_unfreeze': return '🔓 Заморозка снята, аккаунт снова активен'
    case 'automod_ban': return `🚫 Аккаунт заблокирован${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_clear_warns': return '✅ Предупреждения сброшены модератором'
    case 'automod_appeal_accepted': return '✅ Апелляция одобрена'
    case 'automod_appeal_rejected': return '❌ Апелляция отклонена'
    case 'admin_broadcast': return `📣 ${meta.title ?? ''}${meta.body ? ' — ' + meta.body : ''}`
    case 'avatar_frame_approved': return `🖼️ Рамка «${meta.name ?? ''}» одобрена и доступна в Ярмарке`
    case 'avatar_frame_rejected': return `🖼️ Рамка «${meta.name ?? ''}» отклонена${meta.reason ? ' — ' + meta.reason : ''}`
    default: return ''
  }
}

const notifTypeLabel = (type: string) => {
  const t = langStore.t as any
  if (isDenNotification(type)) return t[denNotificationKey(type)] ?? t.notifGeneric
  const key = type.toUpperCase()
  if (key === 'FRIEND_REQUEST') return t.notifFriendRequest
  if (key === 'FRIEND_ACCEPT') return t.notifFriendAccept
  const map: Record<string, string> = {
    LIKE: 'поставил(а) + вашей публикации', COMMENT: 'прокомментировал(а) вашу публикацию',
    REPAW: 'поставил(а) RePaw вашей публикации', FOLLOW: 'подписался(ась) на вас',
    MENTION: 'упомянул(а) вас', FOLLOW_POST: 'опубликовал(а) новый пост', GROUP_POST: 'новый пост в сообществе',
    RELATIONSHIP_REQUEST: 'хочет быть вашим партнёром 💕', RELATIONSHIP_ACCEPTED: 'принял(а) ваш запрос в отношения ❤️',
  }
  // Unknown type: neutral sentence in the UI language, never the raw type code.
  return map[key] ?? t.notifGeneric
}

// ── Relationship request actions ──────────────────────────────────────────────
const relActionLoading = ref<Record<string, boolean>>({})

const acceptRelationship = async (n: any) => {
  const reqId = n.ref_id
  if (!reqId) return
  relActionLoading.value[n.id] = true
  try {
    await api.post(`/relationships/${reqId}/accept`)
    n._relDone = 'accepted'
  } catch (e) {
    alert(apiErrorMessage(e) ?? 'Ошибка')
  } finally { relActionLoading.value[n.id] = false }
}

const declineRelationship = async (n: any) => {
  const reqId = n.ref_id
  if (!reqId) return
  relActionLoading.value[n.id] = true
  try {
    await api.post(`/relationships/${reqId}/decline`)
    n._relDone = 'declined'
  } catch (e) {
    alert(apiErrorMessage(e) ?? 'Ошибка')
  } finally { relActionLoading.value[n.id] = false }
}

const formatDate = (d: string) => fmt.formatRelativeShort(d, { maxDays: 7, datePreset: 'numericShort', locale: 'ru-RU' })

// ── Display identity for a notification — real user, or the group it was sent "as" ──
const identityIsGroup = (n: any): boolean => !!n.senderGroup
const identityAvatar = (n: any): string | null => n.senderGroup?.avatar_url ?? n.sender?.avatar_url ?? null
const identityName = (n: any): string => n.senderGroup?.name || n.sender?.display_name || n.sender?.username || ''
const identityHref = (n: any): string | null => {
  if (n.senderGroup?.slug) return `/groups/${n.senderGroup.slug}`
  if (n.sender?.username) return `/profile/${n.sender.username}`
  return null
}

// Real link target — null for automod_warn (opens a modal instead of navigating) and
// RELATIONSHIP_REQUEST (row shows Accept/Decline buttons instead of navigating away).
const notifHref = (n: any): string | null => {
  if (n.type === 'automod_warn' || n.type === 'RELATIONSHIP_REQUEST') return null
  if (identityIsGroup(n)) return identityHref(n)
  if (n.sender?.username && ['FOLLOW', 'RELATIONSHIP_ACCEPTED', 'follow', 'relationship_accepted'].includes(n.type)) {
    return `/profile/${n.sender.username}`
  }
  if (n.post_id) return `/post/${n.post_id}`
  if (n.sender?.username) return `/profile/${n.sender.username}`
  return null
}

const onClick = async (n: any) => {
  if (!n.is_read) {
    n.is_read = true
    try { await api.post('/notifications/read', { ids: [n.id] }) } catch {}
  }
  if (n.type === 'automod_warn') warningModal.open(n)
}

onMounted(fetchAll)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 max-w-2xl">
        <div class="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(98,109,255,0.26),transparent_35%),linear-gradient(135deg,rgba(18,19,33,0.96),rgba(26,31,52,0.92))] px-5 py-4 shadow-[0_18px_48px_rgba(17,22,39,0.45)] mb-4 backdrop-blur-sm">
          <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/70 to-transparent" />
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-accent/25 via-brand-accent/10 to-transparent border border-brand-accent/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_25px_rgba(95,112,255,0.2)]">
                <BIcon name="Bell" class="w-5 h-5 text-brand-accent" />
              </div>
              <div class="min-w-0">
                <p class="text-[10px] uppercase tracking-[0.24em] text-white/45">Центр уведомлений</p>
                <h1 class="text-xl font-extrabold text-white truncate">Все уведомления</h1>
              </div>
            </div>
            <button
              @click="markAllRead"
              :disabled="unreadCount === 0"
              class="inline-flex items-center gap-2 text-xs font-semibold transition-all rounded-full border px-3 py-1.5 min-w-[110px] justify-center"
              :class="unreadCount > 0
                ? 'text-brand-accent border-brand-accent/35 bg-brand-accent/8 hover:bg-brand-accent/12 hover:text-white shadow-[0_0_18px_rgba(95,112,255,0.12)]'
                : 'text-white/30 border-white/10 bg-white/[0.02] cursor-not-allowed'"
            >
              <span>{{ unreadCount > 0 ? `${unreadCount} новых` : 'Все прочитаны' }}</span>
            </button>
          </div>
        </div>

        <div v-if="isLoading" class="space-y-2">
          <div v-for="n in 6" :key="n" class="h-16 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />
        </div>
        <div v-else-if="notifications.length === 0"
          class="rounded-3xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
          <BIcon name="BellOff" class="w-10 h-10 opacity-40" />
          <p class="text-sm font-semibold">Уведомлений нет</p>
        </div>
        <div v-else class="space-y-2.5">
          <component :is="notifHref(n) ? 'router-link' : 'div'" v-for="n in notifications" :key="n.id"
            :to="notifHref(n) ?? undefined"
            class="group relative flex items-start gap-3.5 pl-4 pr-3.5 py-3 rounded-[22px] cursor-pointer transition-all duration-200 overflow-hidden border"
            :class="[
              n.type === 'automod_warn' ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/25' :
              !n.is_read ? 'bg-[linear-gradient(135deg,rgba(98,109,255,0.12),rgba(18,19,33,0.96))] hover:bg-[linear-gradient(135deg,rgba(98,109,255,0.18),rgba(18,19,33,0.98))] border-brand-accent/20 shadow-[0_12px_30px_rgba(76,103,207,0.12)]' : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10',
            ]"
            @click="onClick(n)">
            <span v-if="!n.is_read" class="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-brand-accent via-brand-accent/80 to-brand-accent/50" />

            <div class="relative flex-shrink-0 pt-0.5">
              <div v-if="isAutomodNotif(n)" class="w-11 h-11 rounded-full bg-gradient-to-br from-[#4C67CF] via-[#7c3aed] to-[#ec4899] flex items-center justify-center ring-1 ring-white/10 shadow-[0_10px_22px_rgba(99,102,241,0.35)]">
                <span class="text-white font-black text-sm select-none" style="letter-spacing:-1px">B</span>
              </div>
              <img v-else :src="identityAvatar(n) || '/icons/badges/NN.jpg'"
                class="w-11 h-11 rounded-full object-cover ring-1 ring-white/15 shadow-[0_5px_18px_rgba(0,0,0,0.3)]"
                @error="onAvatarError" />
              <div class="absolute -bottom-1 -right-1 w-[21px] h-[21px] rounded-full ring-2 ring-[#171b2b] flex items-center justify-center text-white shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
                :class="notifBadgeColor(n.type)">
                <BIcon :name="notifBadgeIcon(n.type)" class="w-3 h-3" />
              </div>
            </div>

            <div class="min-w-0 flex-1 pt-0.5">
              <div class="flex items-start justify-between gap-3">
                <p v-if="isAutomodNotif(n)" class="text-sm text-white leading-snug font-semibold pr-2">{{ automodMessage(n) }}</p>
                <p v-else class="text-sm leading-snug pr-2" :class="n.is_read ? 'text-white/75' : 'text-white'">
                  <span class="font-bold text-white">{{ identityName(n) }}</span>
                  {{ ' ' }}{{ notifTypeLabel(n.type) }}
                </p>
                <span class="text-[10px] text-white/35 tabular-nums whitespace-nowrap mt-0.5">{{ formatDate(n.created_at) }}</span>
              </div>

              <div v-if="n.type === 'RELATIONSHIP_REQUEST' && !n._relDone" class="flex gap-2 mt-2 max-w-xs">
                <button @click.stop.prevent="acceptRelationship(n)" :disabled="relActionLoading[n.id]"
                  class="flex-1 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 text-white text-xs font-bold shadow-[0_8px_16px_rgba(236,72,153,0.2)] transition-all">
                  Принять
                </button>
                <button @click.stop.prevent="declineRelationship(n)" :disabled="relActionLoading[n.id]"
                  class="flex-1 py-1.5 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50 text-white/70 hover:text-white text-xs font-semibold transition-all">
                  Отклонить
                </button>
              </div>
              <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'accepted'" class="text-xs text-pink-400 mt-2 font-semibold">❤️ Принято</p>
              <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'declined'" class="text-xs text-white/40 mt-2">Отклонено</p>
            </div>
          </component>
        </div>
      </main>
    </div>
  </div>
</template>
