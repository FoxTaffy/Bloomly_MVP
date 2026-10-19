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

const rawNotifications = ref<any[]>([])
const isLoading = ref(false)
const unreadCount = computed(() => rawNotifications.value.filter((n: any) => !n.is_read).length)

// Likes from the same person collapse into one row: a single post shows its preview,
// several posts show just "liked N of your posts" (no post list).
const notifications = computed(() => {
  const out: any[] = []
  const likeRows = new Map<string, any>()
  for (const n of rawNotifications.value) {
    const who = n.type === 'LIKE' ? (n.sender_group_id ?? n.sender_id) : null
    if (!who) { out.push(n); continue }
    const row = likeRows.get(who)
    if (!row) {
      const g = { ...n, _ids: [n.id], _postIds: new Set([n.post_id]), _members: [n] }
      likeRows.set(who, g)
      out.push(g)
    } else {
      row._ids.push(n.id)
      row._postIds.add(n.post_id)
      row._members.push(n)
      row.is_read = row.is_read && n.is_read
    }
  }
  for (const g of likeRows.values()) g._likeCount = g._postIds.size
  return out
})

const normalizeNotif = (n: any) => ({ ...n, is_read: n.is_read ?? n.read ?? false })

const fetchAll = async () => {
  isLoading.value = true
  try {
    const res = await api.get('/notifications')
    if (res.data.success) rawNotifications.value = res.data.data.notifications.map(normalizeNotif)
  } catch {} finally { isLoading.value = false }
}

const markAllRead = async () => {
  try {
    await api.post('/notifications/read', {})
    rawNotifications.value.forEach((n: any) => { n.is_read = true })
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
    LIKE: 'лайкнул(а) вашу публикацию', COMMENT: 'прокомментировал(а) вашу публикацию',
    REPAW: 'поставил(а) RePaw вашей публикации', FOLLOW: 'подписался(ась) на вас',
    MENTION: 'упомянул(а) вас', FOLLOW_POST: 'опубликовал(а) новый пост', GROUP_POST: 'новый пост в сообществе',
    RELATIONSHIP_REQUEST: 'хочет быть вашим партнёром 💕', RELATIONSHIP_ACCEPTED: 'принял(а) ваш запрос в отношения ❤️',
    STICKER_ACCESS_REQUEST: 'хочет получить доступ к вашему стикерпаку', STICKER_ACCESS_APPROVED: 'одобрил(а) ваш доступ к стикерпаку — пак в библиотеке',
  }
  // Unknown type: neutral sentence in the UI language, never the raw type code.
  return map[key] ?? t.notifGeneric
}

const likeLabel = (n: any): string | null => {
  if (n.type !== 'LIKE' || !(n._likeCount > 1)) return null
  const c = n._likeCount
  const mod10 = c % 10, mod100 = c % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'вашу публикацию'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'ваших публикации' : 'ваших публикаций'
  return `лайкнул(а) ${c === 1 ? word : c + ' ' + word}`
}

// ── Relationship request actions ──────────────────────────────────────────────
const relActionLoading = ref<Record<string, boolean>>({})

// ── Заявка на доступ к стикерпаку по приглашению ──────────────────────────────
const decideStickerAccess = async (n: any, action: 'approve' | 'reject') => {
  if (!n.ref_id) return
  relActionLoading.value[n.id] = true
  try {
    await api.post(`/stickers/access-requests/${n.ref_id}/${action}`)
    n._stickerDone = action === 'approve' ? 'approved' : 'rejected'
    n.is_read = true
  } catch (e) {
    alert(apiErrorMessage(e) ?? 'Ошибка')
  } finally { relActionLoading.value[n.id] = false }
}

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
  if (n.type === 'automod_warn' || n.type === 'RELATIONSHIP_REQUEST' || n.type === 'STICKER_ACCESS_REQUEST') return null
  if (n.type === 'STICKER_ACCESS_APPROVED' && n.meta?.packId) return `/stickers/${n.meta.packId}`
  if (identityIsGroup(n)) return identityHref(n)
  if (n.sender?.username && ['FOLLOW', 'RELATIONSHIP_ACCEPTED', 'follow', 'relationship_accepted'].includes(n.type)) {
    return `/profile/${n.sender.username}`
  }
  if (n.type === 'LIKE' && n._likeCount > 1 && n.sender_id) return `/notifications/likes/${n.sender_id}`
  if (n.post_id) return `/post/${n.post_id}`
  if (n.sender?.username) return `/profile/${n.sender.username}`
  return null
}

const onClick = async (n: any) => {
  if (!n.is_read) {
    const members: any[] = n._members ?? [n]
    members.forEach((m: any) => { m.is_read = true })
    try { await api.post('/notifications/read', { ids: members.map((m: any) => m.id) }) } catch {}
  }
  if (n.type === 'automod_warn') warningModal.open(n)
}

// ── Tabs + sections ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'all',      label: 'Все',          types: null as string[] | null },
  { id: 'likes',    label: 'Лайки',        types: ['LIKE', 'REPAW'] },
  { id: 'comments', label: 'Комментарии',  types: ['COMMENT', 'MENTION'] },
  { id: 'follows',  label: 'Подписки',     types: ['FOLLOW', 'FOLLOW_POST', 'GROUP_POST', 'RELATIONSHIP_REQUEST', 'RELATIONSHIP_ACCEPTED', 'FRIEND_REQUEST', 'FRIEND_ACCEPT'] },
]
const tab = ref('all')
const filtered = computed(() => {
  const types = TABS.find(t => t.id === tab.value)?.types
  return types ? notifications.value.filter((n: any) => types.includes(n.type)) : notifications.value
})
const sections = computed(() => [
  { key: 'new', title: 'Новые', items: filtered.value.filter((n: any) => !n.is_read) },
  { key: 'old', title: 'Ранее', items: filtered.value.filter((n: any) => n.is_read) },
].filter(s => s.items.length))

onMounted(fetchAll)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

<main class="flex-1 min-w-0 pb-28 md:pb-20 max-w-2xl">
        <div class="flex items-end justify-between gap-3 mb-4 px-1">
          <div class="min-w-0">
            <h1 class="text-2xl max-md:text-xl font-extrabold text-white tracking-tight">Уведомления</h1>
            <p class="text-xs text-white/40 mt-0.5">{{ unreadCount > 0 ? `${unreadCount} непрочитанных` : 'Всё прочитано' }}</p>
          </div>
          <button @click="markAllRead" :disabled="unreadCount === 0"
            class="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3.5 py-2 transition-all shrink-0"
            :class="unreadCount > 0 ? 'bg-brand-accent/15 text-brand-accent hover:bg-brand-accent hover:text-white' : 'bg-white/4 text-white/25 cursor-not-allowed'">
            <BIcon name="CheckCheck" class="w-3.5 h-3.5" />
            Прочитать все
          </button>
        </div>

        <div class="flex gap-1.5 mb-4 overflow-x-auto scrollbar-hide -mx-1 px-1">
          <button v-for="t in TABS" :key="t.id" @click="tab = t.id"
            class="px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all border"
            :class="tab === t.id ? 'bg-white text-brand-bg border-white' : 'bg-white/3 text-white/55 border-white/8 hover:text-white hover:bg-white/6'">
            {{ t.label }}
          </button>
        </div>

        <div v-if="isLoading" class="rounded-3xl border border-white/8 bg-white/2 divide-y divide-white/6 overflow-hidden">
          <div v-for="n in 6" :key="n" class="h-[72px] animate-pulse bg-white/2" />
        </div>
        <div v-else-if="filtered.length === 0"
          class="rounded-3xl border border-white/8 bg-white/2 flex flex-col items-center gap-3 py-16 text-white/30">
          <div class="w-14 h-14 rounded-full bg-white/4 flex items-center justify-center"><BIcon name="BellOff" class="w-6 h-6" /></div>
          <p class="text-sm font-semibold">Здесь пока ничего нет</p>
        </div>
        <template v-else>
          <section v-for="sec in sections" :key="sec.key" class="mb-5">
            <h2 class="px-2 mb-2 text-[11px] font-bold tracking-[0.18em] uppercase text-white/35">{{ sec.title }}</h2>
            <div class="rounded-3xl border border-white/8 bg-white/2 divide-y divide-white/6 overflow-hidden">
              <component :is="notifHref(n) ? 'router-link' : 'div'" v-for="n in sec.items" :key="n.id"
                :to="notifHref(n) ?? undefined"
                class="group relative flex items-center gap-3.5 px-4 py-3.5 cursor-pointer transition-colors"
                :class="n.type === 'automod_warn' ? 'bg-amber-500/8 hover:bg-amber-500/12' : !n.is_read ? 'bg-brand-accent/6 hover:bg-brand-accent/10' : 'hover:bg-white/4'"
                @click="onClick(n)">
                <div class="relative shrink-0">
                  <div v-if="isAutomodNotif(n)" class="w-12 h-12 rounded-full bg-linear-to-br/srgb from-[#4C67CF] via-[#7c3aed] to-[#ec4899] flex items-center justify-center">
                    <span class="text-white font-black text-base select-none" style="letter-spacing:-1px">B</span>
                  </div>
                  <img v-else :src="identityAvatar(n) || '/icons/badges/NN.jpg'" class="w-12 h-12 rounded-full object-cover" @error="onAvatarError" />
                  <div class="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full ring-[3px] ring-[#12131f] flex items-center justify-center text-white"
                    :class="notifBadgeColor(n.type)">
                    <BIcon :name="notifBadgeIcon(n.type)" class="w-3 h-3" />
                  </div>
                </div>

                <div class="min-w-0 flex-1">
                  <p v-if="isAutomodNotif(n)" class="text-sm text-white leading-snug font-semibold">{{ automodMessage(n) }}</p>
                  <p v-else class="text-[14px] leading-snug" :class="n.is_read ? 'text-white/65' : 'text-white/90'">
                    <span class="font-bold text-white">{{ identityName(n) }}</span>
                    {{ ' ' }}{{ likeLabel(n) ?? notifTypeLabel(n.type) }}
                  </p>
                  <p v-if="n.type === 'LIKE' && n._likeCount === 1 && (n.post?.title || n.post?.text)"
                    class="text-[13px] text-white/40 mt-0.5 truncate">{{ n.post.title || n.post.text }}</p>
                  <p class="text-[11px] text-white/30 mt-0.5 tabular-nums">{{ formatDate(n.created_at) }}</p>

                  <div v-if="n.type === 'RELATIONSHIP_REQUEST' && !n._relDone" class="flex gap-2 mt-2 max-w-xs">
                <button @click.stop.prevent="acceptRelationship(n)" :disabled="relActionLoading[n.id]"
                  class="flex-1 py-1.5 rounded-xl bg-linear-to-r/srgb from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 disabled:opacity-50 text-white text-xs font-bold shadow-[0_8px_16px_rgba(236,72,153,0.2)] transition-all">
                  Принять
                </button>
                <button @click.stop.prevent="declineRelationship(n)" :disabled="relActionLoading[n.id]"
                  class="flex-1 py-1.5 rounded-xl border border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4 disabled:opacity-50 text-white/70 hover:text-white text-xs font-semibold transition-all">
                  Отклонить
                </button>
              </div>
              <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'accepted'" class="text-xs text-pink-400 mt-2 font-semibold">❤️ Принято</p>
              <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'declined'" class="text-xs text-white/40 mt-2">Отклонено</p>
              <div v-if="n.type === 'STICKER_ACCESS_REQUEST' && !n._stickerDone" class="flex gap-2 mt-2 max-w-xs">
                <button @click.stop.prevent="decideStickerAccess(n, 'approve')" :disabled="relActionLoading[n.id]"
                  class="flex-1 py-1.5 rounded-xl bg-brand-accent hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold transition-all">
                  Одобрить
                </button>
                <button @click.stop.prevent="decideStickerAccess(n, 'reject')" :disabled="relActionLoading[n.id]"
                  class="flex-1 py-1.5 rounded-xl border border-white/10 bg-white/2 hover:border-white/20 disabled:opacity-50 text-white/70 hover:text-white text-xs font-semibold transition-all">
                  Отклонить
                </button>
              </div>
              <p v-if="n.type === 'STICKER_ACCESS_REQUEST' && n._stickerDone === 'approved'" class="text-xs text-emerald-400 mt-2 font-semibold">✅ Одобрено</p>
              <p v-if="n.type === 'STICKER_ACCESS_REQUEST' && n._stickerDone === 'rejected'" class="text-xs text-white/40 mt-2">Отклонено</p>
                </div>

                <img v-if="n.type === 'LIKE' && n._likeCount === 1 && n.post?.thumb" :src="n.post.thumb"
                  class="w-14 h-14 rounded-2xl object-cover shrink-0" loading="lazy" />
                <span v-if="!n.is_read" class="w-2.5 h-2.5 rounded-full bg-brand-accent shrink-0 shadow-[0_0_10px_rgba(95,112,255,0.7)]" />
              </component>
            </div>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>
