<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import PostCard from '@/components/PostCard.vue'
import MentionTextarea from '@/components/MentionTextarea.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import EventCard from '@/components/groups/EventCard.vue'
import TicketCard from '@/components/groups/TicketCard.vue'
import AchievementBadge from '@/components/groups/AchievementBadge.vue'
import AppBadge from '@/components/shared/AppBadge.vue'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useMessagesStore } from '@/stores/messages'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

const nsfwMode = useNsfwMode().nsfwEnabled

// Преобразует \n в HTML-параграфы (в защищённом виде)
function parseAboutText(text: string): string {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const paras = safe.split(/\n{2,}/)
  return paras
    .map(p => `<p class="mb-3 last:mb-0">${p.replace(/\n/g, '<br />')}</p>`)
    .join('')
}

const group = computed(() => groupsStore.currentGroup)
const membership = computed(() => groupsStore.myGroups.find(m => m.group_id === group.value?.id) ?? null)
const isMember = computed(() => !!membership.value)
const isOwner = computed(() => group.value?.owner_id === authStore.user?.id)
const isAdmin = computed(() => {
  if (isOwner.value) return true
  return groupsStore.myGroups.some(m => m.group_id === group.value?.id && ['admin', 'owner'].includes(m.role))
})

// ── Rating (Reddit-style) ────────────────────────────────────────────────────

const myVote = ref<1 | -1 | 0>(0)
const ratingSubmitting = ref(false)

async function loadMyRating() {
  if (!group.value || !authStore.user) return
  try {
    myVote.value = (await groupsStore.getMyRating(group.value.id)) as 1 | -1 | 0
  } catch {}
}

async function submitVote(value: 1 | -1) {
  if (!group.value || ratingSubmitting.value) return
  ratingSubmitting.value = true
  try {
    const result = await groupsStore.rateGroup(group.value.id, value)
    myVote.value = result.myVote as 1 | -1 | 0
  } catch (e) { console.error('Vote failed', e) }
  finally { ratingSubmitting.value = false }
}

// ── Group Posts ─────────────────────────────────────────────────────────
const groupPosts = ref<any[]>([])
const isLoadingPosts = ref(false)
const showPostForm = ref(false)
const newPostContent = ref('')
const newPostIsNsfw = ref(false)
const newPostMediaUrls = ref<string[]>([])
const isCreatingPost = ref(false)
const groupMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

async function loadGroupPosts() {
  if (!group.value) return
  isLoadingPosts.value = true
  try {
    const posts = await groupsStore.loadGroupPosts(group.value.id)
    groupPosts.value = (posts || []).map((gp: any) => gp.post || gp)
  } catch (e) { console.error('Failed to load group posts', e) }
  finally { isLoadingPosts.value = false }
}

async function createGroupPost() {
  if (!group.value || !newPostContent.value.trim() || isCreatingPost.value) return
  isCreatingPost.value = true
  try {
    const post = await groupsStore.createGroupPost(group.value.id, {
      content: newPostContent.value.trim(),
      isNsfw: newPostIsNsfw.value,
      mediaUrls: newPostMediaUrls.value,
    })
    if (post) groupPosts.value.unshift(post)
    newPostContent.value = ''
    newPostMediaUrls.value = []
    newPostIsNsfw.value = false
    groupMediaUploadRef.value?.clearAll()
    showPostForm.value = false
    if (group.value._count) group.value._count.posts++
  } catch (e) { console.error('Create group post failed', e) }
  finally { isCreatingPost.value = false }
}

function onGroupMediaUploaded(urls: string[]) {
  newPostMediaUrls.value = urls
}

function onPostDeleted(postId: string) {
  groupPosts.value = groupPosts.value.filter(p => p.id !== postId)
  if (group.value?._count) group.value._count.posts = Math.max(0, group.value._count.posts - 1)
}

function onPostUpdated(post: any) {
  const idx = groupPosts.value.findIndex(p => p.id === post.id)
  if (idx !== -1) groupPosts.value[idx] = { ...groupPosts.value[idx], ...post }
}

const activeEvent = computed(() =>
  group.value?.events?.find((e: any) => new Date(e.starts_at) > new Date()) || group.value?.events?.[0]
)

/** Прошедшие ивенты (для архива) */
const pastEvents = computed(() =>
  (group.value?.events ?? []).filter((e: any) => new Date(e.ends_at) < new Date())
    .sort((a: any, b: any) => new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime())
)

/** Событие уже завершилось */
const isEventPast = computed(() => {
  if (!activeEvent.value?.ends_at) return false
  return new Date(activeEvent.value.ends_at) < new Date()
})

// Review prompt
const showReviewModal = ref(false)
const reviewText = ref('')
const reviewRating = ref(0)
const reviewHover = ref(0)
const reviewSubmitting = ref(false)
const reviewDismissed = ref(false)

async function submitReview() {
  if (!group.value || !reviewText.value.trim() || reviewRating.value < 1 || reviewSubmitting.value) return
  reviewSubmitting.value = true
  try {
    await groupsStore.rateGroup(group.value.id, reviewRating.value)
    showReviewModal.value = false
    reviewDismissed.value = true
  } catch (e) { console.error('Review failed', e) }
  finally { reviewSubmitting.value = false }
}

// ── About tab (inside the About tabs card) ──────────────────────────────
const aboutTab = ref<'about' | 'rules' | 'faq' | 'nearest'>('about')

const aboutNavs = computed(() => {
  const navs: { key: string; label: string; icon: string }[] = []
  if (group.value?.type === 'event') {
    navs.push({ key: 'about', label: 'О Мероприятии', icon: 'Info' })
    if (group.value?.events?.length > 1) navs.push({ key: 'nearest', label: 'Ближайшее', icon: 'CalendarCheck' })
  } else {
    navs.push({ key: 'about', label: 'О группе', icon: 'Info' })
  }
  if (group.value?.rules_text) navs.push({ key: 'rules', label: 'Правила', icon: 'Shield' })
  if ((group.value?.faq as any[])?.length) navs.push({ key: 'faq', label: 'FAQ', icon: 'HelpCircle' })
  return navs
})

// ── Content tabs (floating pills like profile) ─────────────────────────
const activeContentTab = ref<'posts' | 'media' | 'archive'>('posts')

const contentTabs = computed(() => {
  const tabs: { key: string; label: string; icon: string }[] = [
    { key: 'posts', label: 'Посты', icon: 'Newspaper' },
    { key: 'media', label: 'Медиа', icon: 'Image' },
  ]
  if (group.value?.type === 'event' && pastEvents.value.length) {
    tabs.push({ key: 'archive', label: `Архив (${pastEvents.value.length})`, icon: 'Archive' })
  }
  return tabs
})

const socialIconMap: Record<string, string> = {
  telegram: 'Send', discord: 'MessageCircle', twitter: 'Twitter', vk: 'Globe', website: 'Globe',
}

const typeLabels: Record<string, string> = {
  event: 'Ивент', creative: 'Фурсьют-мастерская', static: 'Паблик',
  news: 'Канал', shop: 'Магазин', community: 'Сообщество', brand: 'Бренд',
}
const typeColors: Record<string, string> = {
  event: 'bg-brand-success/15 text-brand-success border-brand-success/25',
  creative: 'bg-brand-purple/15 text-brand-purple border-brand-purple/25',
  static: 'bg-brand-accent/15 text-brand-accent border-brand-accent/25',
  news: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  shop: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  community: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  brand: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
}

const ratingStars = computed(() => {
  // kept for other usages; not used for main rating anymore
  return Array.from({ length: 5 }, (_, i) => i + 1 <= Math.round(group.value?.rating || 0) ? 'full' : 'empty')
})

const ticketStatusLabel = computed(() => {
  if (!activeEvent.value?.tickets?.length) return ''
  const total = activeEvent.value.tickets.reduce((s: number, t: any) => s + t.total_count, 0)
  const sold = activeEvent.value.tickets.reduce((s: number, t: any) => s + t.sold_count, 0)
  if (sold >= total && total > 0) return 'sold out'
  if (total > 0 && sold / total > 0.8) return 'билеты ограничены'
  return total > 0 ? 'билеты в продаже' : ''
})
const ticketStatusColor = computed(() => {
  const l = ticketStatusLabel.value
  if (l === 'sold out') return 'bg-brand-error/15 text-brand-error'
  if (l.includes('ограничены')) return 'bg-brand-yellow/15 text-brand-yellow'
  return 'bg-brand-success/15 text-brand-success'
})

async function load() {
  await groupsStore.loadGroup(route.params.slugOrId as string)
  loadMyRating()
  loadGroupPosts()
  loadMemberPreview()
  if (group.value?.type === 'event' && activeEvent.value) {
    loadMyRsvp()
  }
}
onMounted(load)
watch(() => route.params.slugOrId, load)

// ── RSVP ─────────────────────────────────────────────────────────────────
const myRsvpStatus = ref<'going' | 'maybe' | 'not_going' | null>(null)
const rsvpLoading = ref(false)

async function loadMyRsvp() {
  if (!authStore.user || !activeEvent.value) return
  try {
    const rsvp = await groupsStore.getMyRsvp(activeEvent.value.id)
    myRsvpStatus.value = rsvp?.status ?? null
  } catch {}
}

async function setRsvp(status: 'going' | 'maybe' | 'not_going') {
  if (!activeEvent.value || rsvpLoading.value) return
  rsvpLoading.value = true
  try {
    if (myRsvpStatus.value === status) {
      await groupsStore.cancelRsvp(activeEvent.value.id)
      myRsvpStatus.value = null
      if (activeEvent.value) activeEvent.value.attendee_count = Math.max(0, (activeEvent.value.attendee_count || 1) - 1)
    } else {
      await groupsStore.rsvpEvent(activeEvent.value.id, status)
      if (!myRsvpStatus.value && (status === 'going' || status === 'maybe')) {
        if (activeEvent.value) activeEvent.value.attendee_count = (activeEvent.value.attendee_count || 0) + 1
      }
      myRsvpStatus.value = status
    }
  } catch (e) { console.error('RSVP error', e) }
  finally { rsvpLoading.value = false }
}

async function handleJoin() {
  if (!group.value) return
  await groupsStore.joinGroup(group.value.id)
  // Membership is now updated in the store directly — just bump local count
  if (group.value._count) group.value._count.members++
}
async function handleLeave() {
  if (group.value) {
    await groupsStore.leaveGroup(group.value.id)
    if (group.value._count) group.value._count.members = Math.max(0, group.value._count.members - 1)
  }
}

// ── Community chat ──────────────────────────────────────────────────
const initChatLoading = ref(false)

async function openGroupChat() {
  if (!group.value) return
  const convId = await messagesStore.openGroupConversation(group.value.id)
  if (convId) router.push({ name: 'messages' })
}

async function initCommunityChat() {
  if (!group.value || initChatLoading.value) return
  initChatLoading.value = true
  try {
    await messagesStore.initGroupChat(group.value.id)
    // reload to refresh communityChat relation
    await groupsStore.loadGroup(group.value.slug || group.value.id)
    await openGroupChat()
  } catch (e) { console.error('Init community chat failed', e) }
  finally { initChatLoading.value = false }
}

function fmt(iso: string) { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }
function fmtShort(iso: string) { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }
function fmtNum(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n) }

// Banner viewer
const showBannerViewer = ref(false)
const showAvatarViewer = ref(false)

// ── Member preview (top-8 with avatars) ─────────────────────────────────
const memberPreview = ref<{ user: { id: string; username: string; display_name: string | null; avatar_url: string | null } }[]>([])

async function loadMemberPreview() {
  if (!group.value) return
  try {
    const { data } = await api.get(`/groups/${group.value.id}/members?limit=8`)
    if (data.success) memberPreview.value = data.data.members ?? []
  } catch {}
}

// ── Full member list modal ──────────────────────────────────────────────
const showMembersModal = ref(false)
const allMembers = ref<any[]>([])
const membersLoading = ref(false)
const membersPage = ref(1)
const membersHasMore = ref(true)

async function openMembersModal() {
  showMembersModal.value = true
  allMembers.value = []
  membersPage.value = 1
  membersHasMore.value = true
  await loadMoreMembers()
}

async function loadMoreMembers() {
  if (!group.value || membersLoading.value || !membersHasMore.value) return
  membersLoading.value = true
  try {
    const { data } = await api.get(`/groups/${group.value.id}/members?page=${membersPage.value}&limit=30`)
    const items = data.data?.members ?? []
    allMembers.value.push(...items)
    if (items.length < 30) membersHasMore.value = false
    else membersPage.value++
  } catch {}
  finally { membersLoading.value = false }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20 min-h-screen">

        <!-- Loading -->
        <div v-if="groupsStore.isLoading && !group" class="flex flex-col items-center justify-center gap-4 py-32">
          <div class="w-12 h-12 border-[3px] border-brand-accent border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-white/55 font-semibold">Загрузка группы…</p>
        </div>

        <!-- Not found -->
        <div v-else-if="!group && !groupsStore.isLoading" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="AlertCircle" class="w-8 h-8 text-brand-error" />
          </div>
          <p class="text-white font-bold text-lg mb-2">Группа не найдена</p>
          <p class="text-white/55 text-sm mb-6">Возможно, группа была удалена или ссылка неверна</p>
          <button @click="router.push({ name: 'groups' })" class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border hover:border-brand-accent text-sm font-bold rounded-xl transition-all">
            <BIcon name="ArrowLeft" class="w-4 h-4" /> К списку групп
          </button>
        </div>

        <template v-else-if="group">

          <!-- ════════════════════════════════════════════════════════════
               BANNER (identical to ProfileView)
          ════════════════════════════════════════════════════════════ -->
          <div class="relative w-full h-52 md:h-64 rounded-3xl overflow-hidden cursor-pointer"
            @click="group.banner_url && (showBannerViewer = true)">
            <img v-if="group.banner_url" :src="group.banner_url" :alt="group.name" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full" :style="{ background: `linear-gradient(135deg, ${group.accent_color || '#4C67CF'}55, ${group.accent_color || '#CD83F5'}22, #16192F)` }" />
            <!-- Gradient overlays -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>

            <!-- Upload banner for owner -->
            <div v-if="isOwner" class="absolute top-3 right-3 z-10">
              <button @click.stop="router.push({ name: 'group-settings', params: { slugOrId: group!.slug } })"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/15 rounded-full text-xs font-semibold text-white/90 backdrop-blur-sm transition-all">
                <BIcon name="Image" class="w-3 h-3" /> Баннер
              </button>
            </div>

            <!-- Type badge bottom-right on banner -->
            <div class="absolute bottom-8 right-4 z-10 flex gap-2">
              <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm border"
                :class="typeColors[group.type] || 'bg-brand-accent/15 text-brand-accent border-brand-accent/25'">
                <BIcon :name="{ event: 'CalendarDays', creative: 'Palette', static: 'Rss', news: 'Newspaper', shop: 'ShoppingBag', community: 'Users', brand: 'Building2' }[group.type] || 'Image'" class="w-3 h-3" />
                {{ typeLabels[group.type] || 'Группа' }}
              </span>
            </div>

            <!-- Event date badge -->
            <div v-if="group.type === 'event' && activeEvent"
              class="absolute top-4 left-4 z-10">
              <div class="bg-brand-error text-white text-[10px] font-extrabold uppercase px-2.5 py-1.5 rounded-xl shadow-lg text-center leading-tight backdrop-blur-sm">
                {{ fmtShort(activeEvent.starts_at).toUpperCase() }}
                <div v-if="activeEvent.location_name" class="text-[8px] font-normal text-white/80 mt-0.5">{{ activeEvent.location_name.split(',')[0] }}</div>
              </div>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════
               IDENTITY STRIP (same card style as ProfileView)
          ════════════════════════════════════════════════════════════ -->
          <div class="relative z-10 -mt-6 mx-0">
            <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl">
              <!-- Accent line top -->
              <div class="h-px rounded-t-3xl" :style="`background:linear-gradient(90deg,transparent,${group.accent_color || '#4C67CF'}60,transparent)`"></div>

              <div class="px-6 pt-0 pb-5">
                <div class="flex items-start justify-between gap-4">

                  <!-- Avatar (overlap banner like profile) -->
                  <div class="relative flex-shrink-0 -mt-12 md:-mt-16 w-24 h-24 md:w-32 md:h-32 overflow-visible">
                    <div class="w-24 h-24 md:w-32 md:h-32 rounded-2xl border-4 border-brand-card overflow-hidden shadow-xl cursor-pointer transition-transform hover:scale-[1.02]"
                      :style="group.avatar_url ? {} : { backgroundColor: (group.accent_color || '#4C67CF') + '22' }"
                      @click="group.avatar_url && (showAvatarViewer = true)">
                      <img v-if="group.avatar_url" :src="group.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center">
                        <BIcon :name="{ event: 'CalendarDays', creative: 'Palette', static: 'Rss', news: 'Newspaper', shop: 'ShoppingBag', community: 'Users', brand: 'Building2' }[group.type] || 'Image'"
                          class="w-10 h-10" :style="{ color: group.accent_color || '#4C67CF' }" />
                      </div>
                    </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex items-center gap-2 pt-3 md:pt-4 pr-1">
                    <button class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-accent/60 rounded-xl text-white/55 hover:text-brand-accent transition-all"
                      title="Донат">
                      <BIcon name="DollarSign" class="w-4 h-4" />
                    </button>
                    <button class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-accent/60 rounded-xl text-white/55 hover:text-brand-accent transition-all"
                      title="Уведомления">
                      <BIcon name="Bell" class="w-4 h-4" />
                    </button>
                    <button v-if="group.type === 'event' && !isMember && !isOwner" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-success text-white text-sm font-bold hover:bg-brand-success/80 transition-all shadow-sm" @click="handleJoin">
                      <BIcon name="CalendarCheck" class="w-4 h-4" /> Я пойду!
                    </button>
                    <button v-if="!isMember && !isOwner" @click="handleJoin"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-all shadow-sm shadow-brand-accent/25">
                      <BIcon name="UserPlus" class="w-4 h-4" /> Подписаться
                    </button>
                    <button v-else-if="isMember && !isOwner" @click="handleLeave"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:bg-brand-border/50 transition-all">
                      <BIcon name="UserMinus" class="w-4 h-4" /> Отписаться
                    </button>
                    <!-- Community chat button -->
                    <button v-if="(group as any).communityChat?.id"
                      @click="openGroupChat()"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:border-brand-accent/60 hover:text-brand-accent transition-all">
                      <BIcon name="MessageCircle" class="w-4 h-4" /> Чат
                    </button>
                    <button v-else-if="isOwner && !(group as any).communityChat?.id"
                      @click="initCommunityChat()"
                      :disabled="initChatLoading"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:border-brand-success/60 hover:text-brand-success transition-all disabled:opacity-50">
                      <BIcon name="MessageSquarePlus" class="w-4 h-4" />
                      {{ initChatLoading ? 'Создаю…' : 'Включить чат' }}
                    </button>
                    <button v-if="isOwner"
                      @click="router.push({ name: 'group-settings', params: { slugOrId: group!.slug } })"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:border-brand-accent/60 hover:text-brand-accent transition-all">
                      <BIcon name="Settings" class="w-4 h-4" /> Настройки
                    </button>
                    <button class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-border/80 rounded-xl text-white/55 hover:text-white transition-all">
                      <BIcon name="MoreHorizontal" class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Name row -->
                <div class="mt-3">
                  <div class="flex items-center flex-wrap gap-2 mb-1">
                    <h1 class="text-2xl md:text-3xl font-extrabold leading-none text-white">{{ group.name }}</h1>
                    <!-- Badges -->
                    <span v-if="ticketStatusLabel"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border"
                      :class="ticketStatusColor">
                      {{ ticketStatusLabel }}
                    </span>
                    <span v-if="group.type === 'creative' && group.commissionInfo"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border"
                      :class="group.commissionInfo.status === 'open' ? 'bg-brand-success/15 text-brand-success border-brand-success/25' : group.commissionInfo.status === 'waitlist' ? 'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/25' : 'bg-brand-error/15 text-brand-error border-brand-error/25'">
                      {{ group.commissionInfo.status === 'open' ? 'Заказы открыты' : group.commissionInfo.status === 'waitlist' ? 'Лист ожидания' : 'Закрыты' }}
                    </span>
                    <span v-if="group.is_nsfw" class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-brand-error/15 text-brand-error border border-brand-error/25">18+</span>
                    <!-- Group tier badge -->
                    <AppBadge
                      v-if="(group as any).badge_level && (group as any).badge_level !== 'none'"
                      type="group"
                      :level="(group as any).badge_level"
                      size="sm"
                    />
                    <!-- Verified badge -->
                    <span v-if="(group as any).is_verified"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-sky-500/15 text-sky-400 border border-sky-500/25">
                      <BIcon name="BadgeCheck" class="w-3 h-3" /> Верифицировано
                    </span>
                  </div>

                  <!-- Sub-info row -->
                  <div class="flex items-center gap-3 flex-wrap text-sm">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold tracking-wide"
                      :style="`background:${group.accent_color || '#4C67CF'}15;color:${group.accent_color || '#4C67CF'};border:1px solid ${group.accent_color || '#4C67CF'}25`">
                      <BIcon name="AtSign" class="w-3 h-3" />{{ group.slug }}
                    </span>
                    <span class="flex items-center gap-0.5">
                      <!-- Reddit-style vote buttons (inline) -->
                      <template v-if="authStore.user && !isOwner">
                        <button @click="submitVote(1)" :disabled="ratingSubmitting"
                          class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold transition-all"
                          :class="myVote === 1 ? 'text-brand-accent bg-brand-accent/15' : 'text-white/40 hover:text-brand-accent hover:bg-brand-accent/10'">
                          ▲
                        </button>
                      </template>
                      <span class="text-white/70 text-xs font-bold px-1">{{ group.rating >= 0 ? '+' : '' }}{{ Math.round(group.rating) }}</span>
                      <template v-if="authStore.user && !isOwner">
                        <button @click="submitVote(-1)" :disabled="ratingSubmitting"
                          class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold transition-all"
                          :class="myVote === -1 ? 'text-brand-error bg-brand-error/15' : 'text-white/40 hover:text-brand-error hover:bg-brand-error/10'">
                          ▼
                        </button>
                      </template>
                    </span>
                    <span v-if="group.type === 'event' && activeEvent" class="flex items-center gap-1 text-white/55 text-xs">
                      <BIcon name="Calendar" class="w-3.5 h-3.5" />{{ fmt(activeEvent.starts_at) }}
                    </span>
                    <span v-if="group.type === 'event' && activeEvent?.location_name" class="flex items-center gap-1 text-white/55 text-xs">
                      <BIcon name="MapPin" class="w-3.5 h-3.5" />{{ activeEvent.location_name }}
                    </span>
                    <span class="flex items-center gap-1 text-white/55 text-xs">
                      <BIcon name="Calendar" class="w-3.5 h-3.5" />{{ fmt(group.created_at) }}
                    </span>
                  </div>

                  <!-- Social links -->
                  <div v-if="group.social_links && Object.keys(group.social_links as any).length" class="flex items-center gap-1.5 mt-2">
                    <a v-for="(url, p) in (group.social_links as Record<string,string>)" :key="p" :href="url" target="_blank"
                      class="w-7 h-7 rounded-lg bg-brand-bg/80 border border-brand-border flex items-center justify-center hover:border-brand-accent/40 transition-colors">
                      <BIcon :name="socialIconMap[p as string] ?? 'Link'" class="w-3.5 h-3.5 text-white/50" />
                    </a>
                  </div>

                  <!-- Description (short) -->
                  <p v-if="group.description" class="mt-3 text-sm leading-relaxed max-w-2xl text-white/75" v-html="parseAboutText(group.description)" />
                </div>
              </div>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════
               TWO-COLUMN: CENTER + RIGHT (same as ProfileView)
          ════════════════════════════════════════════════════════════ -->
          <div class="flex gap-4 mt-4 items-start">

            <!-- ── CENTER COLUMN ──────────────────────────────────────── -->
            <div class="flex-1 min-w-0 space-y-4">

              <!-- ── Баннер: событие завершилось → предложить отзыв ──── -->
              <div v-if="group.type === 'event' && isEventPast && (isMember || isOwner) && !reviewDismissed"
                class="rounded-3xl overflow-hidden border border-brand-yellow/25 shadow-xl">
                <div class="flex items-center gap-4 px-5 py-4" style="background: linear-gradient(135deg,rgba(255,192,31,0.12) 0%,rgba(255,133,50,0.08) 100%)">
                  <div class="w-10 h-10 rounded-2xl bg-brand-yellow/20 border border-brand-yellow/30 flex items-center justify-center flex-shrink-0">
                    <BIcon name="Star" class="w-5 h-5 text-brand-yellow" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm">Мероприятие завершилось!</p>
                    <p class="text-white/55 text-xs mt-0.5">Поделитесь впечатлениями — ваш отзыв поможет другим</p>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <button @click="showReviewModal = true"
                      class="px-4 py-2 rounded-xl bg-brand-yellow text-black text-sm font-bold hover:bg-brand-yellow/90 transition-all shadow-sm">
                      Написать отзыв
                    </button>
                    <button @click="reviewDismissed = true"
                      class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
                      <BIcon name="X" class="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="flex border-b border-brand-border overflow-x-auto scrollbar-hide bg-brand-bg/40">
                  <button v-for="nav in aboutNavs" :key="nav.key"
                    @click="aboutTab = nav.key as any"
                    class="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px flex-shrink-0"
                    :class="aboutTab === nav.key
                      ? 'border-brand-accent text-brand-accent'
                      : 'border-transparent text-white/55 hover:text-white'">
                    <BIcon :name="nav.icon" class="w-4 h-4" />{{ nav.label }}
                  </button>
                </div>

                <div class="p-5">
                  <!-- About -->
                  <div v-if="aboutTab === 'about'" class="space-y-4">
                    <!-- Extended description -->
                    <div v-if="group.about_text" class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl px-5 pt-5 pb-4">
                      <div class="text-sm text-white/90 leading-relaxed" v-html="parseAboutText(group.about_text)" />
                    </div>
                    <div v-else-if="!group.description" class="py-6 text-center text-white/35 text-sm">Описание пока не добавлено</div>

                    <!-- Event-specific info -->
                    <template v-if="group.type === 'event' && activeEvent">
                      <div class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                        <div class="w-8 h-8 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="Calendar" class="w-4 h-4 text-brand-accent" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-[10px] text-white/40 uppercase tracking-wide mb-0.5">Дата</p>
                          <p class="text-sm text-white font-semibold">{{ fmt(activeEvent.starts_at) }} · {{ fmtTime(activeEvent.starts_at) }}–{{ fmtTime(activeEvent.ends_at) }}</p>
                        </div>
                      </div>
                      <div v-if="activeEvent.location_name" class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                        <div class="w-8 h-8 rounded-xl bg-brand-success/10 border border-brand-success/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="MapPin" class="w-4 h-4 text-brand-success" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-[10px] text-white/40 uppercase tracking-wide mb-0.5">Место</p>
                          <p class="text-sm text-white font-semibold">{{ activeEvent.location_name }}</p>
                        </div>
                      </div>
                    </template>

                    <!-- Schedule -->
                    <div v-if="((activeEvent?.schedule || group.schedule) as any[])?.length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Clock" class="w-3.5 h-3.5 text-brand-accent" /> Расписание
                      </p>
                      <div v-for="(item, idx) in ((activeEvent?.schedule || group.schedule) as any[])" :key="idx"
                        class="flex gap-3 text-sm bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                        <span class="text-brand-accent font-mono font-bold shrink-0 w-20">{{ item.time }}</span>
                        <span class="text-white/60">{{ item.label }}</span>
                      </div>
                    </div>

                    <!-- What to bring -->
                    <div v-if="((activeEvent?.what_to_bring || group.what_to_bring) as any[])?.length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Backpack" class="w-3.5 h-3.5 text-brand-success" /> Что взять
                      </p>
                      <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 space-y-1.5">
                        <div v-for="(item, idx) in ((activeEvent?.what_to_bring || group.what_to_bring) as string[])" :key="idx"
                          class="flex items-center gap-2 text-sm text-white/60">
                          <span class="w-1.5 h-1.5 rounded-full bg-brand-success shrink-0" /> {{ item }}
                        </div>
                      </div>
                    </div>

                    <!-- Volunteers -->
                    <div v-if="group.is_looking_for_volunteers" class="rounded-2xl overflow-hidden border border-emerald-500/20"
                      style="background: linear-gradient(135deg,rgba(16,185,129,0.08) 0%,rgba(16,185,129,0.04) 100%)">
                      <div class="px-4 py-3 flex items-center gap-3 border-b border-emerald-500/15">
                        <div class="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                          <BIcon name="Heart" class="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <p class="text-sm font-bold text-emerald-400">Набираем волонтёров</p>
                      </div>
                      <div class="px-4 py-3">
                        <p v-if="group.volunteers_info" class="text-sm text-white/60 leading-relaxed mb-3">{{ group.volunteers_info }}</p>
                        <p v-else class="text-sm text-white/40 leading-relaxed mb-3">Мы ищем людей, которые хотят помочь с организацией мероприятия.</p>
                        <a :href="`mailto:${group.contact_email || ''}`"
                          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-bold border border-emerald-500/20 transition-all">
                          <BIcon name="Send" class="w-3.5 h-3.5" />
                          Стать волонтёром
                        </a>
                      </div>
                    </div>
                    <div v-if="group.type === 'creative' && group.commissionInfo" class="space-y-3">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Clock" class="w-3.5 h-3.5 text-brand-accent" /> Статус заказов
                      </p>
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between">
                          <span class="text-white/60 text-sm">Комишены</span>
                          <span class="font-bold text-sm" :class="group.commissionInfo.status === 'open' ? 'text-brand-success' : group.commissionInfo.status === 'waitlist' ? 'text-brand-yellow' : 'text-brand-error'">
                            {{ group.commissionInfo.status === 'open' ? 'Открыты' : group.commissionInfo.status === 'waitlist' ? 'Ожидание' : 'Закрыты' }}
                          </span>
                        </div>
                        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between">
                          <span class="text-white/60 text-sm">Быстрые</span>
                          <span class="font-bold text-sm" :class="(group.commissionInfo as any).rush_slots > 0 ? 'text-brand-success' : 'text-brand-error'">{{ (group.commissionInfo as any).rush_slots || 0 }} мест</span>
                        </div>
                        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between">
                          <span class="text-white/60 text-sm">Срок</span>
                          <span class="text-white font-bold text-sm">{{ (group.commissionInfo as any).turnaround_days || '—' }}</span>
                        </div>
                      </div>
                      <div>
                        <div class="flex justify-between text-xs text-white/50 mb-1"><span>Очередь</span><span>{{ group.commissionInfo.queue_count }} / {{ group.commissionInfo.max_queue }}</span></div>
                        <div class="h-2 bg-brand-border rounded-full overflow-hidden">
                          <div class="h-full rounded-full transition-all duration-500"
                            :class="group.commissionInfo.queue_count >= group.commissionInfo.max_queue ? 'bg-brand-error' : 'bg-brand-accent'"
                            :style="{ width: `${Math.min(100, (group.commissionInfo.queue_count / group.commissionInfo.max_queue) * 100)}%` }" />
                        </div>
                      </div>
                    </div>

                    <!-- Creative: Prices -->
                    <div v-if="group.type === 'creative' && group.commissionInfo && Object.keys(group.commissionInfo.base_prices || {}).length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Wallet" class="w-3.5 h-3.5 text-brand-accent" /> Прайс-лист
                      </p>
                      <div class="space-y-2">
                        <div v-for="(price, key) in (group.commissionInfo.base_prices as Record<string,number>)" :key="key"
                          class="flex items-center justify-between bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                          <span class="text-white text-sm font-semibold capitalize">{{ String(key).replace(/_/g, ' ') }}</span>
                          <span class="text-brand-accent font-extrabold">от {{ price }} {{ group.commissionInfo!.currency }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Creative/Shop details -->
                    <div v-if="(group.type === 'creative' || group.type === 'shop') && (group.delivery_info || group.production_time || group.guarantee_text || group.completed_works)" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Package" class="w-3.5 h-3.5 text-brand-accent" /> Детали
                      </p>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div v-if="group.delivery_info" class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                          <BIcon name="Truck" class="w-4 h-4 text-brand-success shrink-0" />
                          <span class="text-sm text-white/60">{{ group.delivery_info }}</span>
                        </div>
                        <div v-if="group.guarantee_text" class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                          <BIcon name="Shield" class="w-4 h-4 text-brand-success shrink-0" />
                          <span class="text-sm text-white/60">{{ group.guarantee_text }}</span>
                        </div>
                        <div v-if="group.production_time" class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                          <BIcon name="Clock" class="w-4 h-4 text-brand-accent shrink-0" />
                          <span class="text-sm text-white/60">Срок: {{ group.production_time }}</span>
                        </div>
                        <div v-if="group.completed_works" class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                          <BIcon name="Check" class="w-4 h-4 text-brand-success shrink-0" />
                          <span class="text-sm text-white/60">{{ group.completed_works }} работ</span>
                        </div>
                      </div>
                    </div>

                    <!-- Creative: Recent works gallery -->
                    <div v-if="group.type === 'creative' && (group.recent_works as any[])?.length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider px-1">Последние работы</p>
                      <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        <div v-for="(w, idx) in (group.recent_works as any[])" :key="idx"
                          class="w-32 h-32 rounded-2xl overflow-hidden shrink-0 relative group/work cursor-pointer border border-brand-border/60 hover:border-brand-accent/60 transition-all">
                          <img :src="w.url" class="w-full h-full object-cover group-hover/work:scale-105 transition-transform duration-300" />
                          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover/work:opacity-100 transition-opacity flex items-end p-2">
                            <div>
                              <p v-if="w.title" class="text-white text-xs font-bold leading-tight">{{ w.title }}</p>
                              <p v-if="w.count" class="text-white/60 text-[10px]">{{ w.count }} фото</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Owner info (same style as profile relationship card) -->
                    <div class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                      <div class="w-10 h-10 rounded-xl bg-brand-accent/20 overflow-hidden shrink-0">
                        <img v-if="group.owner.avatar_url" :src="group.owner.avatar_url" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex items-center justify-center"><BIcon name="User" class="w-5 h-5 text-brand-accent" /></div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-[10px] text-white/40 uppercase tracking-wide mb-0.5">{{ group.type === 'event' ? 'Организатор' : 'Создатель' }}</p>
                        <p class="text-sm text-white font-semibold truncate">{{ group.owner.display_name || group.owner.username }}</p>
                      </div>
                      <router-link :to="`/profile/${group.owner.id}`"
                        class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-card border border-transparent hover:border-brand-border transition-all">
                        <BIcon name="ChevronRight" class="w-4 h-4" />
                      </router-link>
                    </div>
                  </div>

                  <!-- Rules -->
                  <div v-else-if="aboutTab === 'rules'" class="space-y-4">
                    <div v-if="group.rules_text" class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl px-5 py-4">
                      <p class="text-sm text-white/80 leading-relaxed whitespace-pre-line">{{ group.rules_text }}</p>
                    </div>
                  </div>

                  <!-- FAQ -->
                  <div v-else-if="aboutTab === 'faq'" class="space-y-3">
                    <details v-for="(item, idx) in (group.faq as any[])" :key="idx"
                      class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl overflow-hidden group/faq">
                      <summary class="px-5 py-3.5 text-white text-sm font-semibold cursor-pointer hover:bg-brand-bg/80 transition-colors flex items-center justify-between">
                        {{ item.q }}
                        <BIcon name="ChevronDown" class="w-4 h-4 text-white/30 transition-transform group-open/faq:rotate-180" />
                      </summary>
                      <div class="px-5 pb-3.5 text-white/50 text-sm leading-relaxed">{{ item.a }}</div>
                    </details>
                  </div>

                  <!-- Ближайшее мероприятие (recurring / multi-event) -->
                  <div v-else-if="aboutTab === 'nearest'" class="space-y-3">
                    <template v-if="group.events?.length">
                      <div v-for="ev in group.events?.filter((e: any) => new Date(e.starts_at) > new Date()).slice(0, 5)" :key="ev.id"
                        class="flex gap-3 bg-brand-bg border border-brand-border rounded-2xl p-4 hover:border-brand-accent/30 transition-all cursor-pointer group/ev"
                        @click="router.push({ name: 'event-detail', params: { eventId: ev.id } })">
                        <!-- Date box -->
                        <div class="w-12 h-12 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex flex-col items-center justify-center flex-shrink-0">
                          <span class="text-[10px] font-bold text-brand-accent/70 uppercase leading-none">{{ new Date(ev.starts_at).toLocaleDateString('ru-RU', { month: 'short' }) }}</span>
                          <span class="text-lg font-extrabold text-white leading-none">{{ new Date(ev.starts_at).getDate() }}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white group-hover/ev:text-brand-accent transition-colors truncate">{{ ev.title }}</p>
                          <div class="flex items-center gap-2 mt-1 flex-wrap">
                            <span v-if="ev.location_name" class="flex items-center gap-1 text-white/40 text-[11px]">
                              <BIcon name="MapPin" class="w-3 h-3" />{{ ev.location_name.split(',')[0] }}
                            </span>
                            <span class="flex items-center gap-1 text-white/40 text-[11px]">
                              <BIcon name="Clock" class="w-3 h-3" />{{ fmtTime(ev.starts_at) }}
                            </span>
                            <span v-if="ev.attendee_count" class="flex items-center gap-1 text-white/40 text-[11px]">
                              <BIcon name="Users" class="w-3 h-3" />{{ fmtNum(ev.attendee_count) }}
                            </span>
                          </div>
                        </div>
                        <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 flex-shrink-0 self-center group-hover/ev:text-brand-accent transition-colors" />
                      </div>
                      <p v-if="!group.events?.filter((e: any) => new Date(e.starts_at) > new Date()).length"
                        class="text-center text-white/35 text-sm py-6">Ближайших мероприятий не запланировано</p>
                    </template>
                  </div>
                </div>
              </div>

              <!-- ── Content tabs (floating pills) ───────────────────── -->
              <div class="flex flex-wrap gap-2">
                <button v-for="tab in contentTabs" :key="tab.key"
                  @click="activeContentTab = tab.key as any"
                  class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 whitespace-nowrap"
                  :class="activeContentTab === tab.key
                    ? 'bg-brand-accent text-white border-brand-accent shadow-md shadow-brand-accent/25'
                    : 'bg-brand-card text-white/55 border-brand-border hover:border-brand-accent/50 hover:text-white'">
                  <BIcon :name="tab.icon" class="w-4 h-4" />{{ tab.label }}
                </button>
              </div>

              <!-- ── Post Creator (for admins/owners) ────────────────── -->
              <div v-if="isAdmin && activeContentTab === 'posts'"
                class="bg-brand-card border rounded-3xl shadow-xl transition-colors"
                :class="showPostForm ? 'border-brand-accent/30' : 'border-brand-border'">
                <button v-if="!showPostForm" @click="showPostForm = true"
                  class="w-full flex items-center gap-3 px-5 py-4 text-left group">
                  <img v-if="group.avatar_url" :src="group.avatar_url" class="w-10 h-10 rounded-xl border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" />
                  <div v-else class="w-10 h-10 rounded-xl border-2 border-brand-border flex-shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (group.name || '?')[0].toUpperCase() }}</div>
                  <span class="flex-1 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">Написать пост от имени группы…</span>
                  <div class="flex items-center gap-2 text-white/55 group-hover:text-white transition-colors ml-1">
                    <BIcon name="ImagePlus" class="w-5 h-5" />
                  </div>
                </button>
                <div v-else class="p-5 space-y-4">
                  <div class="flex items-start gap-3">
                    <img v-if="group.avatar_url" :src="group.avatar_url" class="w-10 h-10 rounded-xl border-2 border-brand-border object-cover flex-shrink-0 mt-0.5" />
                    <div v-else class="w-10 h-10 rounded-xl border-2 border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold">{{ (group.name || '?')[0].toUpperCase() }}</div>
                    <div class="flex-1 min-w-0">
                      <MentionTextarea v-model="newPostContent" placeholder="Что нового в группе? Используйте @ для упоминаний" minHeight="90px" />
                    </div>
                    <button @click="createGroupPost" :disabled="!newPostContent.trim() || isCreatingPost"
                      class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 flex-shrink-0 mt-0.5">
                      <BIcon v-if="isCreatingPost" name="Loader2" class="w-5 h-5 animate-spin" />
                      <BIcon v-else name="SendHorizontal" class="w-5 h-5" />
                    </button>
                  </div>
                  <MediaUpload ref="groupMediaUploadRef" type="posts" :multiple="true" @uploaded="onGroupMediaUploaded" />
                  <div class="border-t border-brand-border" />
                  <div class="flex items-center gap-2 flex-wrap">
                    <button @click="groupMediaUploadRef?.openPicker()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all">
                      <BIcon name="ImagePlus" class="w-4 h-4" /> Медиа
                    </button>
                    <button @click="newPostIsNsfw = !newPostIsNsfw"
                      class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="newPostIsNsfw ? 'border-brand-error/60 text-brand-error bg-brand-error/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      NSFW
                    </button>
                    <div class="flex-1" />
                    <button @click="showPostForm = false; newPostContent = ''; newPostMediaUrls = []; groupMediaUploadRef?.clearAll()"
                      class="text-xs font-semibold text-white/55 hover:text-white transition-all">Отмена</button>
                  </div>
                </div>
              </div>

              <!-- ── Content card ─────────────────────────────────────── -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="p-4 space-y-3">

                  <!-- POSTS -->
                  <template v-if="activeContentTab === 'posts'">

                    <!-- Loading -->
                    <div v-if="isLoadingPosts" class="space-y-3">
                      <div v-for="n in 3" :key="n" class="h-28 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>

                    <!-- Posts list -->
                    <template v-else-if="groupPosts.length">
                      <PostCard
                        v-for="post in groupPosts"
                        :key="post.id"
                        :post="post"
                        :group-context="group"
                        @deleted="onPostDeleted"
                        @updated="onPostUpdated"
                      />
                    </template>

                    <!-- Empty -->
                    <div v-else class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center">
                      <BIcon name="Newspaper" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">{{ isAdmin ? 'Напишите первый пост!' : 'Публикаций пока нет' }}</p>
                    </div>
                  </template>

                  <!-- MEDIA -->
                  <template v-else-if="activeContentTab === 'media'">
                    <div class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center">
                      <BIcon name="Image" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">Медиа пока нет</p>
                    </div>
                  </template>

                  <!-- ARCHIVE OF PAST EVENTS -->
                  <template v-else-if="activeContentTab === 'archive'">
                    <div class="flex items-center gap-4 border-b border-brand-border pb-3 mb-4">
                      <BIcon name="Archive" class="w-4 h-4 text-white/30" />
                      <span class="text-sm font-bold text-white/55">Прошедшие конвенты</span>
                      <div class="flex-1" />
                      <span class="text-white/30 text-xs">{{ pastEvents.length }} записей</span>
                    </div>
                    <div v-if="pastEvents.length" class="space-y-3">
                      <div v-for="ev in pastEvents" :key="ev.id"
                        class="flex gap-3 bg-brand-bg border border-brand-border rounded-2xl p-4 hover:border-brand-accent/30 transition-all cursor-pointer group/ev"
                        @click="router.push({ name: 'event-detail', params: { eventId: ev.id } })">
                        <!-- Banner thumb -->
                        <div class="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-brand-bg border border-brand-border/60">
                          <img v-if="ev.banner_url" :src="ev.banner_url" class="w-full h-full object-cover" />
                          <div v-else class="w-full h-full flex items-center justify-center bg-brand-accent/10">
                            <BIcon name="CalendarDays" class="w-6 h-6 text-brand-accent/40" />
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white/80 group-hover/ev:text-white transition-colors truncate">{{ ev.title }}</p>
                          <p class="text-[11px] text-white/35 mt-0.5">{{ fmt(ev.starts_at) }}</p>
                          <div class="flex items-center gap-3 mt-1.5">
                            <span v-if="ev.location_name" class="flex items-center gap-1 text-white/30 text-[10px]">
                              <BIcon name="MapPin" class="w-2.5 h-2.5" />{{ ev.location_name.split(',')[0] }}
                            </span>
                            <span v-if="ev.attendee_count" class="flex items-center gap-1 text-white/30 text-[10px]">
                              <BIcon name="Users" class="w-2.5 h-2.5" />{{ fmtNum(ev.attendee_count) }} чел.
                            </span>
                          </div>
                        </div>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/5 text-white/30 border border-white/10 self-start flex-shrink-0">#{{ ev.short_code }}</span>
                      </div>
                    </div>
                    <div v-else class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center">
                      <BIcon name="Archive" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">Прошедших событий нет</p>
                    </div>
                  </template>

                </div>
              </div>

            </div>
            <!-- / CENTER COLUMN -->

            <!-- ── RIGHT SIDEBAR (same structure as ProfileView) ────── -->
            <div class="hidden xl:flex flex-col gap-3 w-60 flex-shrink-0 sticky top-24 self-start">

              <!-- Stats -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-3">
                <div class="grid grid-cols-3 gap-1.5">
                  <div class="flex flex-col items-center gap-1 p-3 rounded-2xl bg-brand-bg/50 border border-brand-border/50">
                    <span class="text-base font-extrabold text-white leading-none">{{ fmtNum(group._count.members) }}</span>
                    <span class="text-[10px] text-white/55 font-medium text-center leading-tight">Участ.</span>
                  </div>
                  <div class="flex flex-col items-center gap-1 p-3 rounded-2xl bg-brand-bg/50 border border-brand-border/50">
                    <span class="text-base font-extrabold text-white leading-none">{{ fmtNum(group._count.posts) }}</span>
                    <span class="text-[10px] text-white/55 font-medium text-center leading-tight">Постов</span>
                  </div>
                  <div class="flex flex-col items-center gap-1 p-3 rounded-2xl bg-brand-bg/50 border border-brand-border/50">
                    <span class="text-base font-extrabold text-white leading-none">{{ fmtNum(group._count.events) }}</span>
                    <span class="text-[10px] text-white/55 font-medium text-center leading-tight">Событ.</span>
                  </div>
                </div>
              </div>

              <!-- Rating -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="TrendingUp" class="w-3.5 h-3.5 text-brand-accent" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Рейтинг</p>
                </div>
                <div class="px-4 pb-3">
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-2xl font-extrabold" :class="group.rating > 0 ? 'text-brand-accent' : group.rating < 0 ? 'text-brand-error' : 'text-white'">{{ group.rating >= 0 ? '+' : '' }}{{ Math.round(group.rating) }}</span>
                    <p class="text-[10px] text-white/40">{{ group.rating_count }} голосов</p>
                  </div>
                  <div v-if="authStore.user && !isOwner" class="flex gap-2 mt-2">
                    <button @click="submitVote(1)" :disabled="ratingSubmitting"
                      class="flex-1 py-2 rounded-xl text-sm font-bold border transition-all"
                      :class="myVote === 1 ? 'border-brand-accent/60 text-brand-accent bg-brand-accent/15' : 'border-brand-border text-white/55 hover:border-brand-accent/50 hover:text-brand-accent hover:bg-brand-accent/10'">▲ За</button>
                    <button @click="submitVote(-1)" :disabled="ratingSubmitting"
                      class="flex-1 py-2 rounded-xl text-sm font-bold border transition-all"
                      :class="myVote === -1 ? 'border-brand-error/60 text-brand-error bg-brand-error/15' : 'border-brand-border text-white/55 hover:border-brand-error/50 hover:text-brand-error hover:bg-brand-error/10'">▼ Против</button>
                  </div>
                </div>
              </div>

              <!-- Event: RSVP -->
              <template v-if="group.type === 'event' && activeEvent && authStore.user">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="CalendarCheck" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Участие</p>
                    <span v-if="activeEvent.attendee_count" class="ml-auto text-xs text-white/40">{{ fmtNum(activeEvent.attendee_count) }} чел.</span>
                  </div>
                  <div class="px-3 pb-3 flex gap-2">
                    <button @click="setRsvp('going')" :disabled="rsvpLoading"
                      class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border"
                      :class="myRsvpStatus === 'going' ? 'bg-brand-success/20 text-brand-success border-brand-success/40' : 'bg-brand-bg border-brand-border text-white/55 hover:border-brand-success/40 hover:text-brand-success'">
                      <BIcon name="Check" class="w-3.5 h-3.5" /> Пойду
                    </button>
                    <button @click="setRsvp('maybe')" :disabled="rsvpLoading"
                      class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border"
                      :class="myRsvpStatus === 'maybe' ? 'bg-brand-yellow/20 text-brand-yellow border-brand-yellow/40' : 'bg-brand-bg border-brand-border text-white/55 hover:border-brand-yellow/40 hover:text-brand-yellow'">
                      <BIcon name="HelpCircle" class="w-3.5 h-3.5" /> Возможно
                    </button>
                    <button @click="setRsvp('not_going')" :disabled="rsvpLoading"
                      class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border"
                      :class="myRsvpStatus === 'not_going' ? 'bg-brand-error/20 text-brand-error border-brand-error/40' : 'bg-brand-bg border-brand-border text-white/55 hover:border-brand-error/40 hover:text-brand-error'">
                      <BIcon name="X" class="w-3.5 h-3.5" /> Не пойду
                    </button>
                  </div>
                </div>
              </template>

              <!-- Event: Tickets -->
              <template v-if="group.type === 'event' && activeEvent?.tickets?.length">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="Ticket" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Билеты</p>
                  </div>
                  <div class="px-3 pb-3 space-y-2">
                    <TicketCard v-for="tier in activeEvent.tickets" :key="tier.id" :tier="tier" />
                  </div>
                </div>
              </template>

              <!-- Creative: Commission sidebar -->
              <template v-if="group.type === 'creative' && group.commissionInfo">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="Clock" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Заказы</p>
                  </div>
                  <div class="px-2 pb-2 space-y-0.5">
                    <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                      <BIcon name="Clock" class="w-4 h-4 flex-shrink-0" :class="group.commissionInfo.status === 'open' ? 'text-brand-success' : 'text-brand-error'" />
                      <div class="min-w-0">
                        <p class="text-[10px] text-white/55 uppercase tracking-wide">Комишены</p>
                        <p class="text-xs font-bold" :class="group.commissionInfo.status === 'open' ? 'text-brand-success' : 'text-brand-error'">
                          {{ group.commissionInfo.status === 'open' ? 'Открыты' : 'Закрыты' }}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                      <BIcon name="Zap" class="w-4 h-4 text-brand-yellow flex-shrink-0" />
                      <div class="min-w-0">
                        <p class="text-[10px] text-white/55 uppercase tracking-wide">Быстрые</p>
                        <p class="text-xs font-bold text-white">{{ (group.commissionInfo as any).rush_slots || 0 }} мест</p>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Achievements -->
              <div v-if="group.achievements?.length" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="Award" class="w-3.5 h-3.5 text-yellow-400" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Достижения</p>
                </div>
                <div class="px-3 pb-3 space-y-2">
                  <AchievementBadge v-for="a in group.achievements" :key="a.id" :achievement="a" />
                </div>
              </div>

              <!-- Info -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="Info" class="w-3.5 h-3.5 text-brand-accent" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Информация</p>
                </div>
                <div class="px-2 pb-2 space-y-0.5">
                  <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Calendar" class="w-4 h-4 text-white/55 flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">Создано</p>
                      <p class="text-xs text-white/80">{{ fmt(group.created_at) }}</p>
                    </div>
                  </div>
                  <div v-if="(group as any).type === 'event' && activeEvent" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Users" class="w-4 h-4 text-brand-success flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">Пойдут</p>
                      <p class="text-xs text-white font-bold">{{ fmtNum(activeEvent.attendee_count || 0) }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Owner / Organizer (redesigned to match screenshot) -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="Users" class="w-3.5 h-3.5 text-brand-purple" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Организаторы</p>
                </div>
                <!-- Organizer card -->
                <div class="px-3 pb-2">
                  <router-link :to="`/profile/${group.owner.id}`"
                    class="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-brand-bg transition-all group cursor-pointer">
                    <div class="w-10 h-10 rounded-xl bg-brand-accent/20 overflow-hidden shrink-0 border border-brand-border/60">
                      <img v-if="group.owner.avatar_url" :src="group.owner.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center"><BIcon name="User" class="w-5 h-5 text-brand-accent" /></div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-bold text-white leading-tight truncate group-hover:text-brand-accent transition-colors">{{ group.owner.display_name || group.owner.username }}</p>
                      <p class="text-[10px] text-white/40 leading-tight mt-0.5">{{ group.type === 'event' ? 'Организатор' : 'Владелец' }}</p>
                    </div>
                  </router-link>
                </div>
                <!-- Contact info -->
                <div v-if="group.contact_phone || group.contact_email" class="px-3 pb-3 space-y-1 border-t border-brand-border/30 pt-2">
                  <a v-if="group.contact_phone" :href="`tel:${group.contact_phone}`"
                    class="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-brand-bg transition-all text-brand-accent text-xs">
                    <BIcon name="Phone" class="w-3.5 h-3.5 flex-shrink-0" />
                    <span class="truncate font-mono">{{ group.contact_phone }}</span>
                  </a>
                  <a v-if="group.contact_email" :href="`mailto:${group.contact_email}`"
                    class="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-brand-bg transition-all text-brand-accent text-xs">
                    <BIcon name="Mail" class="w-3.5 h-3.5 flex-shrink-0" />
                    <span class="truncate">{{ group.contact_email }}</span>
                  </a>
                </div>
              </div>

              <!-- Sponsors (when available) -->
              <div v-if="(group.sponsors as any[])?.length"
                class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="Star" class="w-3.5 h-3.5 text-brand-yellow" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">Спонсоры</p>
                </div>
                <div class="px-3 pb-3 grid grid-cols-2 gap-2">
                  <a v-for="sp in (group.sponsors as any[])" :key="sp.name"
                    :href="sp.url || '#'" target="_blank"
                    class="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent/30 transition-all cursor-pointer group/sp">
                    <div class="w-10 h-10 rounded-xl overflow-hidden bg-brand-border/40 flex items-center justify-center flex-shrink-0">
                      <img v-if="sp.logo_url" :src="sp.logo_url" class="w-full h-full object-contain p-1" />
                      <BIcon v-else name="Building2" class="w-5 h-5 text-white/30" />
                    </div>
                    <span class="text-[10px] font-semibold text-white/55 text-center leading-tight group-hover/sp:text-white transition-colors truncate w-full text-center">{{ sp.name }}</span>
                    <span v-if="sp.tier" class="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      :class="sp.tier === 'gold' ? 'bg-brand-yellow/15 text-brand-yellow' : sp.tier === 'silver' ? 'bg-white/10 text-white/50' : 'bg-brand-accent/15 text-brand-accent'">
                      {{ sp.tier }}
                    </span>
                  </a>
                </div>
              </div>

              <!-- Participants preview -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden cursor-pointer" @click="openMembersModal">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="Users" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ group.type === 'event' ? 'Пойдут' : 'Участники' }}</p>
                  </div>
                  <span class="text-[11px] font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ group._count.members }}</span>
                </div>
                <div class="px-3 pb-3">
                  <div class="flex -space-x-2">
                    <div v-for="m in memberPreview" :key="m.user.id"
                      class="w-8 h-8 rounded-full bg-brand-bg border-2 border-brand-card overflow-hidden flex-shrink-0 hover:z-10 hover:scale-110 transition-transform"
                      :title="m.user.display_name || m.user.username">
                      <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-[10px] font-bold bg-brand-accent/20">
                        {{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}
                      </div>
                    </div>
                  </div>
                  <p v-if="group._count.members > 8" class="text-[10px] text-brand-accent mt-2 text-center font-semibold hover:underline">Показать всех {{ group._count.members }}</p>
                </div>
              </div>

            </div>
            <!-- / RIGHT SIDEBAR -->

          </div>
          <!-- / TWO-COLUMN -->

        </template>
      </main>
    </div>

    <!-- ── Review Modal (after event ends) ───────────────────────── -->
    <Transition name="fade">
      <div v-if="showReviewModal" class="fixed inset-0 z-[600] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" @click.self="showReviewModal = false">
        <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          <!-- Header -->
          <div class="relative h-24 overflow-hidden flex-shrink-0">
            <img v-if="(group as any)?.events?.[0]?.banner_url || group?.banner_url" :src="(group as any)?.events?.[0]?.banner_url || group?.banner_url" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full" :style="`background:linear-gradient(135deg,${group?.accent_color||'#4C67CF'}55,#16192F)`" />
            <div class="absolute inset-0 bg-gradient-to-t from-brand-card/95 to-black/20 flex items-end px-6 pb-4">
              <div>
                <h3 class="font-extrabold text-white text-lg leading-tight">Как прошло? ✨</h3>
                <p class="text-white/50 text-xs mt-0.5">{{ group?.name }}</p>
              </div>
            </div>
            <button @click="showReviewModal = false" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-black/50 rounded-xl text-white/70 hover:text-white transition-colors">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <!-- Stars -->
          <div class="px-6 pt-5 pb-2">
            <p class="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Ваша оценка</p>
            <div class="flex items-center gap-2">
              <button v-for="i in 5" :key="i"
                @mouseenter="reviewHover = i" @mouseleave="reviewHover = 0" @click="reviewRating = i"
                class="transition-all hover:scale-125">
                <BIcon name="Star" class="w-8 h-8 transition-colors"
                  :class="i <= (reviewHover || reviewRating)
                    ? 'text-brand-yellow fill-brand-yellow' : 'text-white/15'" />
              </button>
              <span v-if="reviewHover || reviewRating" class="ml-2 text-sm font-semibold text-white/55">
                {{ ['', 'Плохо', 'Ниже среднего', 'Нормально', 'Хорошо', 'Отлично!'][reviewHover || reviewRating] }}
              </span>
            </div>
          </div>
          <!-- Text area -->
          <div class="px-6 pt-3 pb-5">
            <p class="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Отзыв</p>
            <textarea v-model="reviewText"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none outline-none focus:border-brand-accent/50 transition-colors"
              rows="4"
              placeholder="Поделитесь впечатлениями от мероприятия…" />
          </div>
          <!-- Actions -->
          <div class="px-6 py-4 border-t border-brand-border flex items-center justify-between gap-3">
            <button @click="showReviewModal = false; reviewDismissed = true"
              class="text-sm text-white/40 hover:text-white/60 transition-colors">
              Пропустить
            </button>
            <button @click="submitReview"
              :disabled="!reviewText.trim() || reviewRating < 1 || reviewSubmitting"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <BIcon v-if="reviewSubmitting" name="Loader2" class="w-4 h-4 animate-spin" />
              <BIcon v-else name="Send" class="w-4 h-4" />
              {{ reviewSubmitting ? 'Отправляем…' : 'Отправить отзыв' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="showAvatarViewer && group?.avatar_url" class="fixed inset-0 z-[600] bg-black/92 flex items-center justify-center p-4" @click.self="showAvatarViewer = false">
        <button @click="showAvatarViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="group.avatar_url" class="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
      </div>
    </Transition>

    <!-- ── Banner Viewer ─────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBannerViewer && group?.banner_url" class="fixed inset-0 z-[600] bg-black/92 flex items-center justify-center p-4" @click.self="showBannerViewer = false">
        <button @click="showBannerViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="group.banner_url" class="max-w-full max-h-[85vh] rounded-3xl object-contain shadow-2xl" />
      </div>
    </Transition>

    <!-- ── Members Modal ──────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showMembersModal" class="fixed inset-0 z-[600] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-4" @click.self="showMembersModal = false">
        <div class="relative w-full max-w-3xl bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 80vh">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border flex-shrink-0">
            <div class="flex items-center gap-3">
              <BIcon name="Users" class="w-5 h-5 text-brand-accent" />
              <h3 class="text-lg font-bold text-white">Участники</h3>
              <span class="text-sm font-bold bg-brand-accent/15 text-brand-accent px-2.5 py-0.5 rounded-full">{{ group?._count?.members ?? 0 }}</span>
            </div>
            <button @click="showMembersModal = false" class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/55 hover:text-white transition-colors">
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>
          <!-- Member cards grid -->
          <div class="flex-1 overflow-y-auto p-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div v-for="m in allMembers.filter(m => m.role !== 'owner')" :key="m.user.id"
                class="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/40 transition-all group/card cursor-pointer"
                @click="router.push('/profile/' + m.user.id)">
                <!-- Mini banner -->
                <div class="h-16 bg-gradient-to-br from-brand-accent/20 to-brand-purple/20 relative">
                  <span v-if="m.role === 'owner' || m.role === 'admin'"
                    class="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    :class="m.role === 'owner' ? 'bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30' : 'bg-brand-accent/20 text-brand-accent border border-brand-accent/30'">
                    {{ m.role === 'owner' ? 'Владелец' : 'Админ' }}
                  </span>
                </div>
                <!-- Body -->
                <div class="px-3 pb-3 -mt-6 relative z-10">
                  <div class="flex items-end gap-3 mb-2">
                    <img v-if="m.user.avatar_url" :src="m.user.avatar_url"
                      class="w-12 h-12 rounded-full border-[3px] border-brand-bg object-cover flex-shrink-0" />
                    <div v-else class="w-12 h-12 rounded-full border-[3px] border-brand-bg bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold text-lg flex-shrink-0">
                      {{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                  <p class="text-sm font-semibold text-white truncate group-hover/card:text-brand-accent transition-colors">{{ m.user.display_name || m.user.username }}</p>
                  <p class="text-xs text-white/50 truncate">@{{ m.user.username }}</p>
                  <div class="flex gap-2 mt-2">
                    <button @click.stop="router.push('/messages?to=' + m.user.id)"
                      class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/30 text-brand-accent text-xs font-semibold transition-colors">
                      <BIcon name="MessageCircle" class="w-3.5 h-3.5" /> Написать
                    </button>
                    <button @click.stop="router.push('/profile/' + m.user.id)"
                      class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/55 hover:text-white text-xs font-semibold transition-colors">
                      <BIcon name="User" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Load more -->
            <div v-if="membersLoading" class="flex items-center justify-center py-6">
              <BIcon name="Loader2" class="w-6 h-6 text-brand-accent animate-spin" />
            </div>
            <div v-else-if="membersHasMore" class="flex justify-center py-4">
              <button @click="loadMoreMembers" class="px-5 py-2 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/25 text-brand-accent text-sm font-semibold transition-colors">
                Загрузить ещё
              </button>
            </div>
            <p v-else-if="allMembers.length === 0" class="text-center text-white/40 text-sm py-8">Нет участников</p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
