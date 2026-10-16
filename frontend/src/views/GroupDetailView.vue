<script setup lang="ts">
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import { safeHref } from '@/utils/safeHref'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
const langStore = useLangStore()
import { ref, reactive, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import PostCard from '@/components/PostCard.vue'
import MentionTextarea from '@/components/MentionTextarea.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import AlbumsPanel from '@/components/AlbumsPanel.vue'
import AppBadge from '@/components/shared/AppBadge.vue'
import ReportModal from '@/components/ReportModal.vue'
import { useTagSuggestions } from '@/composables/useTagSuggestions'
import { extractHashtags, extractCommittedHashtags } from '@/lib/hashtags'
const EventCard = defineAsyncComponent(() => import('@/components/groups/EventCard.vue'))
const TicketCard = defineAsyncComponent(() => import('@/components/groups/TicketCard.vue'))
const TodoQueue = defineAsyncComponent(() => import('@/components/groups/TodoQueue.vue'))
const GroupKanban = defineAsyncComponent(() => import('@/components/groups/GroupKanban.vue'))
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useMessagesStore } from '@/stores/messages'
import api from '@/api'
const DonateModal = defineAsyncComponent(() => import('@/components/groups/DonateModal.vue'))

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

const nsfwMode = useNsfwMode().nsfwEnabled
const showDonateModal = ref(false)

// Преобразует \n в HTML-параграфы (в защищённом виде)
function parseAboutText(text: string): string {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  return groupsStore.managesGroup(group.value?.id)
})

// ── Event lifecycle (event_date gates SOON + participation) ────────────────
const isEventExpired = computed(() => {
  const g = group.value as any
  return !!g && g.type === 'event' && !!g.event_date && new Date(g.event_date) < new Date()
})
const isSubscribed = computed(() => !!group.value && groupsStore.mySubscriptions.includes(group.value.id))
const isTogglingSubscribe = ref(false)

async function toggleGroupSubscribe() {
  if (!group.value || isTogglingSubscribe.value) return
  isTogglingSubscribe.value = true
  try {
    if (isSubscribed.value) await groupsStore.unsubscribeGroup(group.value.id)
    else await groupsStore.subscribeGroup(group.value.id)
  } catch (e) { console.error('group subscribe toggle failed', e) }
  finally { isTogglingSubscribe.value = false }
}

// ── SEO ──────────────────────────────────────────────────────────────────────
const BASE = 'https://bloomly.fun'
useHead({
  title: () => group.value ? `${group.value.name} — Bloomly` : 'Community — Bloomly',
  meta: [
    { name: 'robots', content: 'index, follow' },
    { name: 'description', content: () => {
        if (!group.value) return 'Bloomly — Creative Social Network.'
        const members = group.value._count?.members
        const suffix = members ? ` · ${members} members` : ''
        return group.value.description
          ? group.value.description.slice(0, 160)
          : `${group.value.name} — a community on Bloomly${suffix}.`
      }
    },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Bloomly' },
    { property: 'og:title', content: () => group.value?.name || 'Community — Bloomly' },
    { property: 'og:description', content: () => {
        if (!group.value) return ''
        return group.value.description?.slice(0, 200) || `${group.value.name} — a community on Bloomly.`
      }
    },
    { property: 'og:image', content: () => group.value?.avatar_url || `${BASE}/og-default.png` },
    { property: 'og:url', content: () => `${BASE}/groups/${group.value?.slug || group.value?.id || ''}` },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: () => group.value?.name || 'Bloomly' },
    { name: 'twitter:image', content: () => group.value?.avatar_url || `${BASE}/og-default.png` },
  ],
  link: [
    { rel: 'canonical', href: () => `${BASE}/groups/${group.value?.slug || group.value?.id || ''}` },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => {
        if (!group.value) return ''
        const seg = group.value.slug || group.value.id
        const members = group.value._count?.members
        return JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: group.value.name,
          url: `${BASE}/groups/${seg}`,
          description: group.value.description || '',
          ...(group.value.avatar_url ? {
            logo: { '@type': 'ImageObject', url: group.value.avatar_url },
          } : {}),
          ...(members ? { numberOfEmployees: members } : {}),
        })
      },
    },
  ],
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
const newPostTitle = ref('')
const newPostIsNsfw = ref(false)
const newPostIsAiGenerated = ref(false)
const newPostIsAnnouncement = ref(false)
const newPostMediaUrls = ref<string[]>([])
const newPostMediaOriginalUrls = ref<string[]>([])
const newPostTags = ref<string[]>([])
const newPostTagInput = ref('')
const { suggestions: tagSuggestions, showSuggestions: showTagSuggestions, fetchSuggestions: fetchTagSuggestions, clearSuggestions: clearTagSuggestions } = useTagSuggestions()

// Auto-pick up "#hashtag"s the user writes directly in the post text (only once
// they've finished typing the word, not on every keystroke of a partial one)
watch(newPostContent, (content) => {
  for (const tag of extractCommittedHashtags(content)) {
    if (!newPostTags.value.includes(tag)) newPostTags.value.push(tag)
  }
})

const newPostVisibility = ref('public')
const showGroupVisibilityMenu = ref(false)
const isCreatingPost = ref(false)
const groupMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

// Archetype-aware composer config
const archetypeComposer = computed(() => {
  const t: string | undefined = group.value?.type
  if (t === 'news') return { postType: 'article', showTitle: true, placeholder: langStore.t.groupDetailArticlePlaceholder, label: langStore.t.groupDetailNewArticleLabel, icon: 'Newspaper' }
  if (t === 'artist') return { postType: 'artwork', showTitle: false, placeholder: langStore.t.groupDetailArtworkPlaceholder, label: langStore.t.groupDetailNewArtworkLabel, icon: 'Palette' }
  if (t === 'creative') return { postType: 'commission_update', showTitle: false, placeholder: langStore.t.groupDetailCommissionUpdatePlaceholder, label: langStore.t.groupDetailUpdateLabel, icon: 'Scissors' }
  if (t === 'event') return { postType: 'announcement', showTitle: false, placeholder: langStore.t.groupDetailAnnouncementPlaceholder, label: langStore.t.groupDetailAnnouncementLabel, icon: 'Megaphone' }
  return { postType: 'general', showTitle: false, placeholder: langStore.t.groupDetailGeneralPostPlaceholder, label: langStore.t.groupDetailPostLabel, icon: 'PenLine' }
})

// Stage `value` stays fixed (matches GroupKanban.vue's Russian-keyed columns regardless of
// UI language); only the displayed `label` is translated.
const creativePostStatuses = computed(() => [
  { value: 'Скетч', label: langStore.t.groupDetailStageSketch },
  { value: 'Линии', label: langStore.t.groupDetailStageLines },
  { value: 'Цвет', label: langStore.t.groupDetailStageColor },
  { value: 'Готово', label: langStore.t.groupDetailStageDone },
])
const selectedCreativeStatus = ref('')

function addGroupTag() {
  const t = newPostTagInput.value.trim().replace(/^#/, '')
  if (t && !newPostTags.value.includes(t)) newPostTags.value.push(t)
  newPostTagInput.value = ''
  clearTagSuggestions()
}
function addGroupTagFromSuggestion(name: string) {
  const t = name.trim().toLowerCase()
  if (t && !newPostTags.value.includes(t)) newPostTags.value.push(t)
  newPostTagInput.value = ''
  clearTagSuggestions()
}
function removeGroupTag(tag: string) { newPostTags.value = newPostTags.value.filter(t => t !== tag) }

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
  if (!group.value || (!newPostContent.value.trim() && newPostMediaUrls.value.length === 0) || isCreatingPost.value) return
  // Catch a trailing "#hashtag" that was never followed by a space/newline before hitting send
  for (const tag of extractHashtags(newPostContent.value)) {
    if (!newPostTags.value.includes(tag)) newPostTags.value.push(tag)
  }
  isCreatingPost.value = true
  try {
    const cfg = archetypeComposer.value
    const isAnnouncement = cfg.postType === 'announcement' ? true : newPostIsAnnouncement.value
    // For creative groups: stage chip goes into category for kanban grouping
    const category = selectedCreativeStatus.value
      ? selectedCreativeStatus.value.toLowerCase()
      : undefined
    const post = await groupsStore.createGroupPost(group.value.id, {
      content: newPostContent.value.trim(),
      title: newPostTitle.value.trim() || undefined,
      postType: cfg.postType,
      isNsfw: newPostIsNsfw.value,
      isAiGenerated: newPostIsAiGenerated.value,
      isAnnouncement,
      mediaUrls: newPostMediaUrls.value,
      mediaOriginalUrls: newPostMediaOriginalUrls.value,
      tags: newPostTags.value,
      category,
      visibility: newPostVisibility.value,
    })
    if (post) groupPosts.value.unshift(post)
    newPostContent.value = ''
    newPostTitle.value = ''
    newPostMediaUrls.value = []
    newPostMediaOriginalUrls.value = []
    newPostIsNsfw.value = false
    newPostIsAiGenerated.value = false
    newPostIsAnnouncement.value = false
    newPostTags.value = []
    newPostTagInput.value = ''
    newPostVisibility.value = 'public'
    selectedCreativeStatus.value = ''
    groupMediaUploadRef.value?.clearAll()
    showPostForm.value = false
    if (group.value._count) group.value._count.posts++
  } catch (e) { console.error('Create group post failed', e) }
  finally { isCreatingPost.value = false }
}

function onGroupMediaUploaded(urls: string[], originalUrls: string[]) {
  newPostMediaUrls.value = urls
  newPostMediaOriginalUrls.value = originalUrls
}

function onPostDeleted(postId: string) {
  groupPosts.value = groupPosts.value.filter(p => p.id !== postId)
  if (group.value?._count) group.value._count.posts = Math.max(0, group.value._count.posts - 1)
}

function onPostUpdated(post: any) {
  const idx = groupPosts.value.findIndex(p => p.id === post.id)
  if (idx !== -1) groupPosts.value[idx] = { ...groupPosts.value[idx], ...post }
}

// ── Group Media ──────────────────────────────────────────────────────────
const groupMediaFilter = ref<'all' | 'photo' | 'video'>('all')
const groupMediaAlbumView = ref(false)
const groupOpenAlbum = ref<{ label: string; urls: { url: string; postId?: string }[] } | null>(null)
const expandedGroupMediaPost = ref<any | null>(null)
const archivedGroupPosts = ref<any[]>([])
const isLoadingArchive = ref(false)

async function loadArchivedGroupPosts() {
  if (!group.value?.id) return
  isLoadingArchive.value = true
  try {
    const posts = await groupsStore.loadGroupPosts(group.value.id, 1, 100, false, true)
    archivedGroupPosts.value = (posts || []).map((gp: any) => gp.post || gp)
  } catch (e) { console.error('Failed to load archived group posts', e) }
  finally { isLoadingArchive.value = false }
}

function onArchivedPostRemoved(postId: string) {
  archivedGroupPosts.value = archivedGroupPosts.value.filter(p => p.id !== postId)
  // Разархивированный пост должен вернуться в ленту
  loadGroupPosts()
}

const groupMediaPostsList = ref<any[]>([])
const isLoadingMedia = ref(false)
const groupMediaLoaded = ref(false)

async function loadGroupMediaPosts() {
  if (!group.value?.id) return
  isLoadingMedia.value = true
  try {
    const posts = await groupsStore.loadGroupPosts(group.value.id, 1, 100, true)
    groupMediaPostsList.value = (posts || []).map((gp: any) => gp.post || gp)
    groupMediaLoaded.value = true
  } catch (e) { console.error('Failed to load group media', e) }
  finally { isLoadingMedia.value = false }
}

function isGroupImage(url: string) {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}

const filteredGroupMediaPosts = computed(() => {
  if (groupMediaFilter.value === 'photo') return groupMediaPostsList.value.filter((p: any) => isGroupImage(p.media_urls?.[0] ?? ''))
  if (groupMediaFilter.value === 'video') return groupMediaPostsList.value.filter((p: any) => !isGroupImage(p.media_urls?.[0] ?? ''))
  return groupMediaPostsList.value
})

const groupMediaAlbums = computed(() => {
  const map = new Map<string, { url: string; postId?: string }[]>()
  for (const post of filteredGroupMediaPosts.value as any[]) {
    const dt = new Date(post.created_at)
    const label = dt.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'long', year: 'numeric' })
    if (!map.has(label)) map.set(label, [])
    for (const url of (post.media_urls ?? [])) {
      map.get(label)!.push({ url, postId: post.id })
    }
  }
  return Array.from(map.entries()).map(([label, urls]) => ({ label, urls }))
})

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
    // FIXME: reviewRating is 1..5 stars but the API only accepts 1 | -1 (backend throws otherwise)
    await groupsStore.rateGroup(group.value.id, reviewRating.value as 1 | -1)
    showReviewModal.value = false
    reviewDismissed.value = true
  } catch (e) { console.error('Review failed', e) }
  finally { reviewSubmitting.value = false }
}

// ── About tab (inside the About tabs card) ──────────────────────────────
const aboutTab = ref<'about' | 'rules' | 'faq' | 'nearest' | 'orders' | 'schedule' | 'prices' | 'queue' | 'reviews' | 'digest' | 'categories' | 'team' | 'dealers-den' | 'sponsors' | 'contacts'>('about')

const aboutNavs = computed(() => {
  const navs: { key: string; label: string; icon: string }[] = []
  const t: string | undefined = group.value?.type

  if (t === 'event') {
    navs.push({ key: 'about', label: langStore.t.groupDetailAboutEvent, icon: 'Info' })
    const sched = (activeEvent.value?.schedule || group.value?.schedule) as any[]
    if (sched?.length) navs.push({ key: 'schedule', label: langStore.t.groupDetailScheduleNav, icon: 'Clock' })
    navs.push({ key: 'sponsors', label: langStore.t.groupDetailSponsorsNav, icon: 'Star' })
    navs.push({ key: 'contacts', label: langStore.t.groupDetailContactsNav, icon: 'MapPin' })
    if ((group.value?.events?.length ?? 0) > 1) navs.push({ key: 'nearest', label: langStore.t.groupDetailNearestNav, icon: 'CalendarCheck' })
  } else if (t === 'artist') {
    navs.push({ key: 'about', label: langStore.t.groupDetailAboutArtist, icon: 'Info' })
    navs.push({ key: 'prices', label: langStore.t.groupDetailPricesNavShort, icon: 'Tag' })
    navs.push({ key: 'queue', label: langStore.t.groupDetailQueueNav, icon: 'ClipboardList' })
    navs.push({ key: 'reviews', label: langStore.t.groupDetailReviewsNav, icon: 'Star' })
  } else if (t === 'news') {
    navs.push({ key: 'about', label: langStore.t.groupDetailAboutNews, icon: 'Info' })
    navs.push({ key: 'digest', label: langStore.t.groupDetailDigestNav, icon: 'Newspaper' })
    navs.push({ key: 'categories', label: langStore.t.groupDetailCategoriesNav, icon: 'FolderOpen' })
    navs.push({ key: 'team', label: langStore.t.groupDetailTeamNav, icon: 'Users' })
  } else if (t === 'creative') {
    navs.push({ key: 'about', label: langStore.t.groupDetailAboutCreative, icon: 'Info' })
    if (group.value?.commissionInfo)
      navs.push({ key: 'orders', label: langStore.t.groupDetailOrdersNav, icon: 'ClipboardList' })
    navs.push({ key: 'prices', label: langStore.t.groupDetailPricesNav, icon: 'Tag' })
    navs.push({ key: 'dealers-den', label: langStore.t.groupDetailDealersDenNav, icon: 'ShoppingBag' })
  } else {
    navs.push({ key: 'about', label: langStore.t.groupDetailAboutGeneric, icon: 'Info' })
  }

  if (group.value?.rules_text) navs.push({ key: 'rules', label: langStore.t.groupDetailRulesNav, icon: 'Shield' })
  if ((group.value?.faq as any[])?.length) navs.push({ key: 'faq', label: 'FAQ', icon: 'HelpCircle' })
  return navs
})

// Old tab key kept working: ?tab=market opens the Dealers' Den tab
const ABOUT_TAB_ALIASES: Record<string, string> = { market: 'dealers-den' }
watch(
  () => [route.query.tab, aboutNavs.value.map(n => n.key).join(',')] as const,
  ([tab]) => {
    if (typeof tab !== 'string') return
    const key = ABOUT_TAB_ALIASES[tab] ?? tab
    if (aboutNavs.value.some(n => n.key === key)) aboutTab.value = key as typeof aboutTab.value
  },
  { immediate: true }
)

// ── Content tabs (floating pills like profile) ─────────────────────────
const activeContentTab = ref<'posts' | 'media' | 'archive' | 'posts_archive' | 'members' | 'events'>('posts')

watch(activeContentTab, (val) => {
  if (val === 'media' && !groupMediaLoaded.value) loadGroupMediaPosts()
  if (val === 'posts_archive') loadArchivedGroupPosts()
  if (val === 'members') openMembersTab()
  if (val === 'events') loadGroupEvents()
})

const contentTabs = computed(() => {
  const tabs: { key: string; label: string; icon: string }[] = [
    { key: 'posts',  label: langStore.t.tabPosts,      icon: 'Newspaper' },
    { key: 'media',  label: langStore.t.tabMedia,      icon: 'Image' },
  ]
  if (group.value?.type !== 'event') {
    tabs.push({ key: 'events', label: langStore.t.events, icon: 'CalendarDays' })
  }
  if (group.value?.type === 'event' && pastEvents.value.length) {
    tabs.push({ key: 'archive', label: `${langStore.t.archiveBtn} (${pastEvents.value.length})`, icon: 'Archive' })
  }
  if (myRoleWeight.value >= 1) {
    tabs.push({ key: 'posts_archive', label: langStore.t.archiveBtn, icon: 'Archive' })
  }
  tabs.push({ key: 'members', label: langStore.t.createStep2Title, icon: 'Users' })
  return tabs
})

// ── Members tab (inline, not modal) ────────────────────────────────────
const membersTabLoaded = ref(false)
function openMembersTab() {
  if (membersTabLoaded.value) return
  membersTabLoaded.value = true
  allMembers.value = []
  membersPage.value = 1
  membersHasMore.value = true
  loadMoreMembers()
}

// ── Group events (for non-event groups) ────────────────────────────────
const groupEvents = ref<any[]>([])
const isGroupEventsLoading = ref(false)
const groupEventsLoaded = ref(false)
async function loadGroupEvents() {
  if (!group.value || groupEventsLoaded.value) return
  isGroupEventsLoading.value = true
  groupEventsLoaded.value = true
  try {
    const { data } = await api.get(`/groups/${group.value.id}/events`)
    groupEvents.value = data.data?.events ?? []
  } catch {} finally { isGroupEventsLoading.value = false }
}

// ── Notification toggle ─────────────────────────────────────────────────
const isTogglingNotify = ref(false)
const notifyPosts = computed(() => {
  const m = groupsStore.myGroups.find(m => m.group_id === group.value?.id)
  return m?.notify_posts ?? false
})

async function toggleNotify() {
  if (!group.value || isTogglingNotify.value || !isMember.value) return
  isTogglingNotify.value = true
  try { await groupsStore.toggleGroupNotification(group.value.id) }
  catch {} finally { isTogglingNotify.value = false }
}

const socialIconMap: Record<string, string> = {
  telegram: 'Send', discord: 'MessageCircle', twitter: 'Twitter', vk: 'Globe', website: 'Globe',
}

const typeLabels = computed<Record<string, string>>(() => ({
  event: langStore.t.catEvent, creative: langStore.t.groupDetailTypeCreative, artist: langStore.t.verTypeArtist, static: langStore.t.groupDetailTypeStatic,
  news: langStore.t.groupDetailTypeNews, shop: langStore.t.shop, community: langStore.t.groupDetailTypeCommunity, brand: langStore.t.groupDetailTypeBrand,
}))
const typeColors: Record<string, string> = {
  event: 'bg-brand-success/15 text-brand-success border-brand-success/25',
  creative: 'bg-brand-purple/15 text-brand-purple border-brand-purple/25',
  artist: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
  static: 'bg-brand-accent/15 text-brand-accent border-brand-accent/25',
  news: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  shop: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  community: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  brand: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25',
}

const ratingStars = computed(() => {
  // kept for other usages; not used for main rating anymore
  return Array.from({ length: 5 }, (_, i) => i + 1 <= Math.round(group.value?.rating || 0) ? 'full' : 'empty')
})

// Internal status code drives both the displayed label and its color — kept separate from
// the (translated) display text so language switching can't break the comparison logic.
const ticketStatusCode = computed<'sold_out' | 'limited' | 'on_sale' | ''>(() => {
  if (!activeEvent.value?.tickets?.length) return ''
  const total = activeEvent.value.tickets.reduce((s: number, t: any) => s + t.total_count, 0)
  const sold = activeEvent.value.tickets.reduce((s: number, t: any) => s + t.sold_count, 0)
  if (sold >= total && total > 0) return 'sold_out'
  if (total > 0 && sold / total > 0.8) return 'limited'
  return total > 0 ? 'on_sale' : ''
})
const ticketStatusLabel = computed(() => {
  const c = ticketStatusCode.value
  if (c === 'sold_out') return 'sold out'
  if (c === 'limited') return langStore.t.groupDetailTicketsLimited
  if (c === 'on_sale') return langStore.t.groupDetailTicketsOnSale
  return ''
})
const ticketStatusColor = computed(() => {
  const c = ticketStatusCode.value
  if (c === 'sold_out') return 'bg-brand-error/15 text-brand-error'
  if (c === 'limited') return 'bg-brand-yellow/15 text-brand-yellow'
  return 'bg-brand-success/15 text-brand-success'
})

// ── Group bookmark ────────────────────────────────────────────────────────────
const isGroupBookmarked   = ref(false)
const isTogglingGrpBm     = ref(false)

async function checkGroupBookmark() {
  if (!group.value || isOwner.value || !authStore.user) return
  try {
    const res = await api.get(`/bookmarks/groups/${group.value.id}`)
    if (res.data.success) isGroupBookmarked.value = res.data.data.bookmarked
  } catch { /* ignore */ }
}

async function toggleGroupBookmark() {
  if (!group.value || isTogglingGrpBm.value) return
  isTogglingGrpBm.value = true
  try {
    const res = await api.post(`/bookmarks/groups/${group.value.id}`)
    if (res.data.success) isGroupBookmarked.value = res.data.data.bookmarked
  } catch (e) { console.error('group bookmark toggle failed', e) }
  finally { isTogglingGrpBm.value = false }
}

async function load() {
  groupMediaLoaded.value = false
  groupMediaPostsList.value = []
  activeContentTab.value = 'posts'
  await groupsStore.loadGroup(route.params.slugOrId as string)
  loadMyRating()
  loadGroupPosts()
  loadMemberPreview()
  if (authStore.user && !isOwner.value) checkGroupBookmark()
  if (group.value?.type === 'event' && activeEvent.value) {
    loadMyRsvp()
  }
  if (isAdmin.value && group.value) messagesStore.fetchGroupInboxCount(group.value.id)
}
const inboxCount = computed(() => (group.value ? messagesStore.groupInboxCounts[group.value.id] ?? 0 : 0))
const showScrollTop = ref(false)
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }
function handleScroll() { showScrollTop.value = window.scrollY > 500 }

onMounted(() => {
  load()
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onUnmounted(() => { window.removeEventListener('scroll', handleScroll) })
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
  try {
    await groupsStore.joinGroup(group.value.id)
    // Membership is now updated in the store directly — just bump local count
    if (group.value._count) group.value._count.members++
  } catch (e) {
    console.error('join failed', e)
  }
}
async function handleLeave() {
  if (group.value) {
    await groupsStore.leaveGroup(group.value.id)
    if (group.value._count) group.value._count.members = Math.max(0, group.value._count.members - 1)
  }
}

// ── Group More Menu & Report ─────────────────────────────────────────────
const showGroupMenu = ref(false)
const showGroupReport = ref(false)

function toggleGroupMenu() { showGroupMenu.value = !showGroupMenu.value }
function closeGroupMenu() { showGroupMenu.value = false }

async function copyGroupLink() {
  const slug = group.value?.slug || group.value?.id
  await navigator.clipboard.writeText(`${location.origin}/groups/${slug}`).catch(() => {})
  showGroupMenu.value = false
}

async function shareGroup() {
  closeGroupMenu()
  if (navigator.share) {
    await navigator.share({ title: group.value?.name, url: location.href }).catch(() => {})
  }
}

// ── Group chat ────────────────────────────────────────────────────────
// Regular members message the group directly (personal thread, any admin can reply as
// the group). Admins/owner instead go to their shared inbox of everyone's threads.
const dmLoading = ref(false)

const dmToast = reactive({ show: false, message: '' })
let dmToastTimer = 0
function showDmError(message: string) {
  clearTimeout(dmToastTimer)
  Object.assign(dmToast, { show: true, message })
  dmToastTimer = window.setTimeout(() => { dmToast.show = false }, 4000)
}

async function openGroupChatOrInbox() {
  if (!group.value) return
  if (isAdmin.value) {
    router.push({ name: 'group-admin-tools', params: { slugOrId: group.value.slug || group.value.id }, query: { tab: 'inbox' } })
    return
  }
  if (dmLoading.value) return
  dmLoading.value = true
  try {
    const convId = await messagesStore.startGroupDm(group.value.id)
    if (!convId) throw new Error(langStore.t.groupSettingsErrorGeneric)
    router.push({ name: 'messages' })
  } catch (e) {
    showDmError(apiErrorMessage(e) || errorMessage(e) || langStore.t.groupSettingsErrorGeneric)
  } finally {
    dmLoading.value = false
  }
}

function fmt(iso: string) { return new Date(iso).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long', year: 'numeric' }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString(LANG_TO_LOCALE[langStore.currentLang], { hour: '2-digit', minute: '2-digit' }) }
function fmtShort(iso: string) { return new Date(iso).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'short' }) }
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

// Список участников грузится один раз: при смене своего ника обновляем его здесь же
watch(() => authStore.user?.username, (username) => {
  if (!authStore.user || !username) return
  const uid = authStore.user.id
  for (const m of [...memberPreview.value, ...allMembers.value]) {
    if (m.user && (m.user.id ?? m.user_id) === uid) m.user.username = username
  }
})

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

// ── Role hierarchy: owner > admin > moderator > everyone else ───────────────
const GROUP_ROLE_WEIGHT: Record<string, number> = { owner: 3, admin: 2, moderator: 1 }
const myRoleWeight = computed(() => GROUP_ROLE_WEIGHT[membership.value?.role ?? ''] ?? 0)
// Can I kick someone with this role? Only if I outrank them (moderators can only kick
// plain members, admins can kick moderators/members but not other admins, etc).
function canKickRole(role: string): boolean {
  return myRoleWeight.value >= 1 && (GROUP_ROLE_WEIGHT[role] ?? 0) < myRoleWeight.value
}
const kickingMember = ref<Record<string, boolean>>({})
async function kickMember(userId: string) {
  if (!group.value?.id) return
  kickingMember.value[userId] = true
  try {
    await groupsStore.removeMember(group.value.id, userId)
    allMembers.value = allMembers.value.filter((m: any) => (m.user_id ?? m.user?.id) !== userId)
  } catch (e) {
    console.error('Kick member failed', e)
  } finally {
    delete kickingMember.value[userId]
  }
}

const vClickOutside = {
  mounted(el: HTMLElement, binding: { value: () => void }) {
    ;(el as any)._clickOutside = (e: Event) => { if (!el.contains(e.target as Node)) binding.value() }
    document.addEventListener('click', (el as any)._clickOutside)
  },
  unmounted(el: HTMLElement) { document.removeEventListener('click', (el as any)._clickOutside) },
}
</script>

<template>
  <div class="min-h-screen text-white font-nunito relative bg-brand-bg">
    <!-- Shop bg wallpaper -->
    <template v-if="group?.group_bg_url">
      <div class="fixed inset-0 z-0 pointer-events-none"
        :style="`background-image: url('${group.group_bg_url}'); background-size: cover; background-position: center; background-attachment: fixed;`" />
      <div class="fixed inset-0 z-0 pointer-events-none" style="background: rgba(22,25,47,0.72)" />
    </template>
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8 relative z-10">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20 min-h-screen">

        <!-- Loading -->
        <div v-if="groupsStore.isLoading && !group" class="flex flex-col items-center justify-center gap-4 py-32">
          <div class="w-12 h-12 border-[3px] border-brand-accent border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-white/55 font-semibold">{{ langStore.t.groupDetailLoadingGroup }}</p>
        </div>

        <!-- Not found -->
        <div v-else-if="!group && !groupsStore.isLoading" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="AlertCircle" class="w-8 h-8 text-brand-error" />
          </div>
          <p class="text-white font-bold text-lg mb-2">{{ langStore.t.groupDetailNotFoundTitle }}</p>
          <p class="text-white/55 text-sm mb-6">{{ langStore.t.groupDetailNotFoundDesc }}</p>
          <button @click="router.push({ name: 'groups' })" class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border hover:border-brand-accent text-sm font-bold rounded-xl transition-all">
            <BIcon name="ArrowLeft" class="w-4 h-4" /> {{ langStore.t.groupDetailBackToGroupsList }}
          </button>
        </div>

        <template v-else-if="group">

          <!-- ════════════════════════════════════════════════════════════
               BANNER (identical to ProfileView)
          ════════════════════════════════════════════════════════════ -->
          <div class="relative w-full h-52 md:h-64 rounded-3xl overflow-hidden cursor-pointer"
            @click="group.banner_url && (showBannerViewer = true)">
            <img v-if="group.banner_url" :src="group.banner_url" :alt="group.name" class="w-full h-full object-cover" />
            <img v-else-if="group.group_bg_url" :src="group.group_bg_url" :alt="group.name" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full" :style="{ background: `linear-gradient(135deg, ${group.accent_color || '#4C67CF'}55, ${group.accent_color || '#CD83F5'}22, #16192F)` }" />
            <!-- group_bg_url indicator when banner overrides it -->
            <div v-if="group.banner_url && group.group_bg_url" class="absolute top-2 left-2 z-10 text-[10px] text-white/50 bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full hidden" />
            <!-- Gradient overlays -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>

            <!-- Upload banner for owner -->
            <div v-if="isOwner" class="absolute top-3 right-3 z-10">
              <button @click.stop="router.push({ name: 'group-settings', params: { slugOrId: group!.slug } })"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/15 rounded-full text-xs font-semibold text-white/90 backdrop-blur-sm transition-all">
                <BIcon name="Image" class="w-3 h-3" /> {{ langStore.t.bannerBtnLabel }}
              </button>
            </div>

            <!-- Type badge bottom-right on banner -->
            <div class="absolute bottom-8 right-4 z-10 flex gap-2">
              <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm border"
                :class="typeColors[group.type] || 'bg-brand-accent/15 text-brand-accent border-brand-accent/25'">
                <BIcon :name="{ event: 'CalendarDays', creative: 'Scissors', artist: 'Palette', static: 'Rss', news: 'Newspaper', shop: 'ShoppingBag', community: 'Users', brand: 'Building2' }[group.type] || 'Image'" class="w-3 h-3" />
                {{ typeLabels[group.type] || langStore.t.groupDetailGenericTypeFallback }}
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
                      <img v-if="group.avatar_url" :src="group.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                      <div v-else class="w-full h-full flex items-center justify-center">
                        <BIcon :name="{ event: 'CalendarDays', creative: 'Scissors', artist: 'Palette', static: 'Rss', news: 'Newspaper', shop: 'ShoppingBag', community: 'Users', brand: 'Building2' }[group.type] || 'Image'"
                          class="w-10 h-10" :style="{ color: group.accent_color || '#4C67CF' }" />
                      </div>
                    </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex items-center gap-2 pt-3 md:pt-4 pr-1 flex-wrap">
                    <!-- Donate button — visible when donations enabled, or to owner (with hint) -->
                    <button v-if="group.donations_enabled"
                      @click="showDonateModal = true"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all border"
                      :style="`background: ${group.accent_color || '#4C67CF'}15; color: ${group.accent_color || '#4C67CF'}; border-color: ${group.accent_color || '#4C67CF'}30; box-shadow: 0 2px 12px ${group.accent_color || '#4C67CF'}15`"
                      :title="langStore.t.groupDetailSupportBtn">
                      <BIcon name="Heart" class="w-4 h-4" /> {{ langStore.t.groupDetailSupportBtn }}
                    </button>
                    <button v-else-if="isOwner"
                      @click="router.push({ name: 'group-settings', params: { slugOrId: group!.slug } })"
                      class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg rounded-xl text-white/25 hover:text-white/55 transition-all"
                      :title="langStore.t.groupDetailDonationsDisabledTitle">
                      <BIcon name="DollarSign" class="w-4 h-4" />
                    </button>
                    <button v-if="isMember"
                      @click="toggleNotify"
                      :disabled="isTogglingNotify"
                      :title="notifyPosts ? langStore.t.disableNotifyTitle : langStore.t.enableNotifyTitle"
                      class="w-9 h-9 flex items-center justify-center border rounded-xl transition-all disabled:opacity-50"
                      :class="notifyPosts
                        ? 'border-brand-yellow/50 bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/20'
                        : 'border-brand-border bg-brand-bg text-white/55 hover:border-brand-accent/60 hover:text-brand-accent'">
                      <BIcon :name="notifyPosts ? 'BellRing' : 'Bell'" class="w-4 h-4" />
                    </button>
                    <button v-if="group.type === 'news' && isMember"
                      @click="router.push({ name: 'messages', query: { userId: group.owner.id } })"
                      class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border border-sky-500/30 text-sky-400 bg-sky-500/10 hover:bg-sky-500/20">
                      <BIcon name="Send" class="w-4 h-4" /> {{ langStore.t.groupDetailSuggestNewsBtn }}
                    </button>
                    <button v-if="group.type === 'event' && !isMember && !isOwner && !isEventExpired"
                      class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all shadow-lg"
                      :style="`background: ${group.accent_color || '#22c55e'}; box-shadow: 0 4px 14px ${group.accent_color || '#22c55e'}40`"
                      @click="handleJoin">
                      <BIcon name="CalendarCheck" class="w-4 h-4" /> {{ langStore.t.groupDetailImGoingBtn }}
                    </button>
                    <button v-else-if="group.type === 'event' && !isMember && !isOwner && isEventExpired"
                      @click="toggleGroupSubscribe" :disabled="isTogglingSubscribe"
                      :title="isSubscribed ? langStore.t.groupDetailUnsubNotifyTitle : langStore.t.groupDetailFollowUpdatesTitle"
                      class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                      :class="isSubscribed
                        ? 'border border-brand-yellow/50 bg-brand-yellow/10 text-brand-yellow'
                        : 'bg-brand-accent text-white hover:bg-brand-accent-plus shadow-lg shadow-brand-accent/25'">
                      <BIcon :name="isSubscribed ? 'BellRing' : 'Bell'" class="w-4 h-4" />
                      {{ isSubscribed ? langStore.t.groupDetailSubscribedLabel : langStore.t.groupDetailFollowUpdatesBtn }}
                    </button>
                    <button v-else-if="group.type !== 'event' && !isMember && !isOwner" @click="handleJoin"
                      class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-all shadow-lg shadow-brand-accent/25">
                      <BIcon name="UserPlus" class="w-4 h-4" /> {{ langStore.t.subscribe }}
                    </button>
                    <button v-else-if="isMember && !isOwner" @click="handleLeave"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:bg-brand-border/50 transition-all">
                      <BIcon name="UserMinus" class="w-4 h-4" /> {{ langStore.t.unsubscribe }}
                    </button>
                    <!-- Group chat: admins/owner → shared inbox; everyone else → their own thread with the group -->
                    <button v-if="isAdmin"
                      @click="openGroupChatOrInbox()"
                      :class="['relative inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-all',
                        inboxCount > 0
                          ? 'border-brand-accent/50 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/15'
                          : 'border-brand-border bg-brand-bg text-white/55 hover:border-brand-accent/60 hover:text-brand-accent']">
                      <BIcon name="Inbox" class="w-4 h-4" /> {{ langStore.t.groupDetailInboxBtn }}
                      <span v-if="inboxCount > 0"
                        class="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-brand-error text-white text-[11px] font-extrabold leading-none">
                        {{ inboxCount > 99 ? '99+' : inboxCount }}
                      </span>
                    </button>
                    <button v-else
                      @click="openGroupChatOrInbox()"
                      :disabled="dmLoading"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:border-brand-accent/60 hover:text-brand-accent transition-all disabled:opacity-50">
                      <BIcon name="MessageCircle" class="w-4 h-4" />
                      {{ dmLoading ? langStore.t.groupDetailOpeningEllipsis : langStore.t.groupDetailMessageGroupBtn }}
                    </button>
                    <button v-if="isOwner"
                      @click="router.push({ name: 'group-settings', params: { slugOrId: group!.slug } })"
                      class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-border bg-brand-bg text-white/55 text-sm font-bold hover:border-brand-accent/60 hover:text-brand-accent transition-all">
                      <BIcon name="Settings" class="w-4 h-4" /> {{ langStore.t.settings }}
                    </button>
                    <!-- Bookmark group button (non-owners only) -->
                    <button
                      v-if="authStore.user && !isOwner"
                      @click="toggleGroupBookmark"
                      :disabled="isTogglingGrpBm"
                      :title="isGroupBookmarked ? langStore.t.unbookmarkGroup : langStore.t.bookmarkGroup"
                      class="w-9 h-9 flex items-center justify-center border rounded-xl transition-all disabled:opacity-50"
                      :class="isGroupBookmarked ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20' : 'border-brand-border bg-brand-bg hover:border-yellow-500/40 text-white/55 hover:text-yellow-400'">
                      <span v-if="isTogglingGrpBm" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <BIcon v-else :name="isGroupBookmarked ? 'BookmarkCheck' : 'Bookmark'" class="w-4 h-4" />
                    </button>
                    <!-- More options menu -->
                    <div class="relative" v-click-outside="closeGroupMenu">
                      <button
                        @click.stop="toggleGroupMenu"
                        class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-border/80 rounded-xl text-white/55 hover:text-white transition-all"
                        :class="showGroupMenu ? 'border-brand-accent/40 text-brand-accent bg-brand-accent/5' : ''"
                      >
                        <BIcon name="MoreHorizontal" class="w-4 h-4" />
                      </button>

                      <Transition name="group-menu">
                        <div
                          v-if="showGroupMenu"
                          class="absolute right-0 top-full mt-2 z-50 w-52 bg-[#13131f] border border-white/8 rounded-2xl shadow-2xl overflow-hidden py-1.5"
                          @click.stop
                        >
                          <!-- Copy link -->
                          <button
                            @click="copyGroupLink"
                            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/65 hover:text-white hover:bg-white/5 transition-all"
                          >
                            <BIcon name="Link2" class="w-4 h-4 text-white/40" />
                            {{ langStore.t.exportCopyLink }}
                          </button>

                          <!-- Share -->
                          <button
                            @click="shareGroup"
                            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/65 hover:text-white hover:bg-white/5 transition-all"
                          >
                            <BIcon name="Share2" class="w-4 h-4 text-white/40" />
                            {{ langStore.t.share }}
                          </button>

                          <!-- Divider -->
                          <div v-if="authStore.user && !isOwner" class="my-1.5 border-t border-white/6" />

                          <!-- Report group -->
                          <button
                            v-if="authStore.user && !isOwner"
                            @click="showGroupReport = true; closeGroupMenu()"
                            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/8 transition-all"
                          >
                            <BIcon name="Flag" class="w-4 h-4" />
                            {{ langStore.t.report }}
                          </button>
                        </div>
                      </Transition>
                    </div>
                  </div>
                </div>

                <!-- Name row -->
                <div class="mt-4">
                  <div class="flex items-center flex-wrap gap-2 mb-2">
                    <h1 class="text-2xl md:text-3xl font-extrabold leading-none text-white tracking-tight min-w-0 max-w-full break-words [overflow-wrap:anywhere]">{{ group.name }}</h1>
                    <!-- Badges -->
                    <span v-if="ticketStatusLabel"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border"
                      :class="ticketStatusColor">
                      {{ ticketStatusLabel }}
                    </span>
                    <span v-if="group.type === 'creative' && group.commissionInfo"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border"
                      :class="group.commissionInfo.status === 'open' ? 'bg-brand-success/15 text-brand-success border-brand-success/25' : group.commissionInfo.status === 'waitlist' ? 'bg-brand-yellow/15 text-brand-yellow border-brand-yellow/25' : 'bg-brand-error/15 text-brand-error border-brand-error/25'">
                      {{ group.commissionInfo.status === 'open' ? langStore.t.groupDetailOrdersOpenBadge : group.commissionInfo.status === 'waitlist' ? langStore.t.groupDetailWaitlistBadge : langStore.t.groupDetailClosedBadge }}
                    </span>
                    <span v-if="group.is_nsfw" class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-brand-error/15 text-brand-error border border-brand-error/25">18+</span>
                    <!-- Group tier badge -->
                    <AppBadge
                      v-if="group.badge_level && group.badge_level !== 'none'"
                      type="group"
                      :level="group.badge_level"
                      size="sm"
                    />
                    <!-- Verified badge -->
                    <span v-if="group.is_verified"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-sky-500/15 text-sky-400 border border-sky-500/25">
                      <BIcon name="BadgeCheck" class="w-3 h-3" /> {{ langStore.t.verBadgeGenericLabel }}
                    </span>
                  </div>

                  <!-- Sub-info chips row -->
                  <div class="flex items-center gap-1.5 flex-wrap mt-1">
                    <!-- Slug -->
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide"
                      :style="`background:${group.accent_color || '#4C67CF'}15;color:${group.accent_color || '#4C67CF'};border:1px solid ${group.accent_color || '#4C67CF'}25`">
                      <BIcon name="AtSign" class="w-3 h-3" />{{ group.slug }}
                    </span>
                    <!-- Rating chip -->
                    <span class="inline-flex items-center gap-0.5 px-1.5 py-1 bg-brand-bg border border-brand-border rounded-lg">
                      <template v-if="authStore.user && !isOwner">
                        <button @click="submitVote(1)" :disabled="ratingSubmitting"
                          class="px-1 py-0.5 rounded text-xs font-bold transition-all"
                          :class="myVote === 1 ? 'text-brand-accent' : 'text-white/40 hover:text-brand-accent'">▲</button>
                      </template>
                      <span class="text-white/70 text-xs font-bold px-1 tabular-nums">{{ group.rating >= 0 ? '+' : '' }}{{ Math.round(group.rating) }}</span>
                      <template v-if="authStore.user && !isOwner">
                        <button @click="submitVote(-1)" :disabled="ratingSubmitting"
                          class="px-1 py-0.5 rounded text-xs font-bold transition-all"
                          :class="myVote === -1 ? 'text-brand-error' : 'text-white/40 hover:text-brand-error'">▼</button>
                      </template>
                    </span>
                    <!-- Event date -->
                    <span v-if="group.type === 'event' && activeEvent" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-medium text-white/65">
                      <BIcon name="Calendar" class="w-3 h-3 text-white/40" />{{ fmt(activeEvent.starts_at) }}
                    </span>
                    <!-- Location -->
                    <span v-if="group.type === 'event' && activeEvent?.location_name" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-medium text-white/65">
                      <BIcon name="MapPin" class="w-3 h-3 text-white/40" />{{ activeEvent.location_name }}
                    </span>
                    <!-- Created date -->
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-medium text-white/50">
                      <BIcon name="Calendar" class="w-3 h-3 text-white/35" />{{ fmt(group.created_at) }}
                    </span>
                    <!-- Social links inline as icon chips -->
                    <a v-for="(url, p) in (group.social_links as Record<string,string>)" :key="p" :href="safeHref(url)" target="_blank" rel="noopener noreferrer"
                      class="inline-flex items-center justify-center w-7 h-7 bg-brand-bg border border-brand-border rounded-lg hover:border-brand-accent/50 transition-colors">
                      <BIcon :name="socialIconMap[p as string] ?? 'Link'" class="w-3.5 h-3.5 text-white/50" />
                    </a>
                  </div>
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

              <!-- ── Баннер: цикл мероприятия истёк → участие сброшено, ждём новую дату ──── -->
              <div v-if="isEventExpired"
                class="rounded-3xl overflow-hidden border border-brand-error/25 shadow-xl">
                <div class="flex items-center gap-4 px-5 py-4" style="background: linear-gradient(135deg,rgba(239,68,68,0.10) 0%,rgba(239,68,68,0.04) 100%)">
                  <div class="w-10 h-10 rounded-2xl bg-brand-error/15 border border-brand-error/25 flex items-center justify-center flex-shrink-0">
                    <BIcon name="CalendarX" class="w-5 h-5 text-brand-error" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm">{{ langStore.t.groupDetailEventEndedTitle }}</p>
                    <p class="text-white/55 text-xs mt-0.5">
                      {{ langStore.t.groupDetailEventEndedResetNotice }} {{ isAdmin ? langStore.t.groupDetailEventEndedAdminHint : langStore.t.groupDetailEventEndedMemberHint }}
                    </p>
                  </div>
                  <button v-if="isAdmin" @click="router.push({ name: 'group-settings', params: { slugOrId: group!.slug } })"
                    class="px-4 py-2 rounded-xl bg-brand-error/15 border border-brand-error/30 text-brand-error text-sm font-bold hover:bg-brand-error/25 transition-all flex-shrink-0">
                    {{ langStore.t.groupDetailSetDateBtn }}
                  </button>
                </div>
              </div>

              <!-- ── Баннер: событие завершилось → предложить отзыв ──── -->
              <div v-if="group.type === 'event' && isEventPast && (isMember || isOwner) && !reviewDismissed"
                class="rounded-3xl overflow-hidden border border-brand-yellow/25 shadow-xl">
                <div class="flex items-center gap-4 px-5 py-4" style="background: linear-gradient(135deg,rgba(255,192,31,0.12) 0%,rgba(255,133,50,0.08) 100%)">
                  <div class="w-10 h-10 rounded-2xl bg-brand-yellow/20 border border-brand-yellow/30 flex items-center justify-center flex-shrink-0">
                    <BIcon name="Star" class="w-5 h-5 text-brand-yellow" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm">{{ langStore.t.groupDetailEventEndedExclaim }}</p>
                    <p class="text-white/55 text-xs mt-0.5">{{ langStore.t.groupDetailShareImpressionsHint }}</p>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <button @click="showReviewModal = true"
                      class="px-4 py-2 rounded-xl bg-brand-yellow text-black text-sm font-bold hover:bg-brand-yellow/90 transition-all shadow-sm">
                      {{ langStore.t.groupDetailWriteReviewBtn }}
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
                    :class="aboutTab === nav.key ? 'border-current' : 'border-transparent text-white/55 hover:text-white'"
                    :style="aboutTab === nav.key
                      ? `color: ${group.accent_color || '#4C67CF'}; border-color: ${group.accent_color || '#4C67CF'}`
                      : ''">
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
                    <div v-else-if="!group.description" class="py-6 text-center text-white/35 text-sm">{{ langStore.t.groupDetailNoDescriptionYet }}</div>

                    <!-- Event-specific info -->
                    <template v-if="group.type === 'event' && activeEvent">
                      <div class="flex items-center gap-3 px-4 py-3.5 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/30 transition-colors">
                        <div class="w-9 h-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="Calendar" class="w-4 h-4 text-brand-accent" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold mb-0.5">{{ langStore.t.groupDetailDateLabel }}</p>
                          <p class="text-sm text-white font-bold">{{ fmt(activeEvent.starts_at) }} · {{ fmtTime(activeEvent.starts_at) }}–{{ fmtTime(activeEvent.ends_at) }}</p>
                        </div>
                      </div>
                      <div v-if="activeEvent.location_name" class="flex items-center gap-3 px-4 py-3.5 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-success/30 transition-colors">
                        <div class="w-9 h-9 rounded-xl bg-brand-success/10 border border-brand-success/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="MapPin" class="w-4 h-4 text-brand-success" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold mb-0.5">{{ langStore.t.placeLabel }}</p>
                          <p class="text-sm text-white font-bold">{{ activeEvent.location_name }}</p>
                        </div>
                      </div>
                    </template>

                    <!-- What to bring -->
                    <div v-if="((activeEvent?.what_to_bring || group.what_to_bring) as any[])?.length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Backpack" class="w-3.5 h-3.5 text-brand-success" /> {{ langStore.t.groupDetailWhatToBring }}
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
                        <p class="text-sm font-bold text-emerald-400">{{ langStore.t.groupDetailLookingForVolunteers }}</p>
                      </div>
                      <div class="px-4 py-3">
                        <p v-if="group.volunteers_info" class="text-sm text-white/60 leading-relaxed mb-3">{{ group.volunteers_info }}</p>
                        <p v-else class="text-sm text-white/40 leading-relaxed mb-3">{{ langStore.t.groupDetailVolunteersDefaultText }}</p>
                        <a :href="`mailto:${group.contact_email || ''}`"
                          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-sm font-bold border border-emerald-500/20 transition-all">
                          <BIcon name="Send" class="w-3.5 h-3.5" />
                          {{ langStore.t.groupDetailBecomeVolunteerBtn }}
                        </a>
                      </div>
                    </div>
                    <!-- Owner info -->
                    <router-link :to="`/profile/${group.owner.username}`"
                      class="flex items-center gap-3 px-4 py-3.5 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/30 transition-colors group">
                      <div class="w-9 h-9 rounded-xl bg-brand-accent/20 overflow-hidden shrink-0 border border-brand-border/60">
                        <img v-if="group.owner.avatar_url" :src="group.owner.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                        <div v-else class="w-full h-full flex items-center justify-center"><BIcon name="User" class="w-5 h-5 text-brand-accent" /></div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold mb-0.5">{{ group.type === 'event' ? langStore.t.verTypeOrganizer : langStore.t.groupDetailCreatorLabel }}</p>
                        <p class="text-sm text-white font-bold truncate group-hover:text-brand-accent transition-colors">{{ group.owner.display_name || group.owner.username }}</p>
                      </div>
                      <BIcon name="ChevronRight" class="w-4 h-4 text-white/25 group-hover:text-brand-accent transition-colors flex-shrink-0" />
                    </router-link>
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

                  <!-- Статус заказов -->
                  <div v-else-if="aboutTab === 'orders'" class="space-y-4">
                    <!-- Commission status -->
                    <div v-if="group.commissionInfo" class="space-y-3">
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between">
                          <span class="text-white/60 text-sm">{{ langStore.t.groupDetailCommissionsLabel }}</span>
                          <span class="font-bold text-sm" :class="group.commissionInfo.status === 'open' ? 'text-brand-success' : group.commissionInfo.status === 'waitlist' ? 'text-brand-yellow' : 'text-brand-error'">
                            {{ group.commissionInfo.status === 'open' ? langStore.t.groupDetailStatusOpen : group.commissionInfo.status === 'waitlist' ? langStore.t.groupDetailStatusWaitlist : langStore.t.groupDetailStatusClosed }}
                          </span>
                        </div>
                        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between">
                          <span class="text-white/60 text-sm">{{ langStore.t.groupDetailRushLabel }}</span>
                          <span class="font-bold text-sm" :class="group.commissionInfo.rush_slots > 0 ? 'text-brand-success' : 'text-brand-error'">{{ group.commissionInfo.rush_slots || 0 }} {{ langStore.t.groupDetailSlotsUnit }}</span>
                        </div>
                        <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between">
                          <span class="text-white/60 text-sm">{{ langStore.t.groupDetailTurnaroundLabel }}</span>
                          <span class="text-white font-bold text-sm">{{ group.commissionInfo.turnaround_days || '—' }}</span>
                        </div>
                      </div>
                      <div>
                        <div class="flex justify-between text-xs text-white/50 mb-1"><span>{{ langStore.t.groupDetailQueueLabel }}</span><span>{{ group.commissionInfo.queue_count }} / {{ group.commissionInfo.max_queue }}</span></div>
                        <div class="h-2 bg-brand-border rounded-full overflow-hidden">
                          <div class="h-full rounded-full transition-all duration-500"
                            :class="group.commissionInfo.queue_count >= group.commissionInfo.max_queue ? 'bg-brand-error' : 'bg-brand-accent'"
                            :style="{ width: `${Math.min(100, (group.commissionInfo.queue_count / group.commissionInfo.max_queue) * 100)}%` }" />
                        </div>
                      </div>
                    </div>

                    <!-- Прайс-лист -->
                    <div v-if="group.commissionInfo && Object.keys(group.commissionInfo.base_prices || {}).length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Wallet" class="w-3.5 h-3.5 text-brand-accent" /> {{ langStore.t.groupDetailPriceListLabel }}
                      </p>
                      <div class="space-y-2">
                        <div v-for="(price, key) in (group.commissionInfo.base_prices as Record<string,number>)" :key="key"
                          class="flex items-center justify-between bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                          <span class="text-white text-sm font-semibold capitalize">{{ String(key).replace(/_/g, ' ') }}</span>
                          <span class="text-brand-accent font-extrabold">{{ langStore.t.groupDetailFromPricePrefix }} {{ price }} {{ group.commissionInfo!.currency }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Детали -->
                    <div v-if="group.delivery_info || group.production_time || group.guarantee_text || group.completed_works" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <BIcon name="Package" class="w-3.5 h-3.5 text-brand-accent" /> {{ langStore.t.groupDetailDetailsLabel }}
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
                          <span class="text-sm text-white/60">{{ langStore.t.groupDetailTurnaroundLabel }}: {{ group.production_time }}</span>
                        </div>
                        <div v-if="group.completed_works" class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                          <BIcon name="Check" class="w-4 h-4 text-brand-success shrink-0" />
                          <span class="text-sm text-white/60">{{ group.completed_works }} {{ langStore.t.groupDetailWorksCountSuffix }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Последние работы -->
                    <div v-if="(group.recent_works as any[])?.length" class="space-y-2">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider px-1">{{ langStore.t.groupDetailRecentWorksLabel }}</p>
                      <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        <div v-for="(w, idx) in (group.recent_works as any[])" :key="idx"
                          class="w-32 h-32 rounded-2xl overflow-hidden shrink-0 relative group/work cursor-pointer border border-brand-border/60 hover:border-brand-accent/60 transition-all">
                          <img :src="w.url" class="w-full h-full object-cover group-hover/work:scale-105 transition-transform duration-300" />
                          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover/work:opacity-100 transition-opacity flex items-end p-2">
                            <div>
                              <p v-if="w.title" class="text-white text-xs font-bold leading-tight">{{ w.title }}</p>
                              <p v-if="w.count" class="text-white/60 text-[10px]">{{ w.count }} {{ langStore.t.groupDetailPhotosUnit }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Очередь работ -->
                    <TodoQueue :groupId="group.id" :isAdmin="isOwner" />
                  </div>
                  <div v-else-if="aboutTab === 'nearest'" class="space-y-3">
                    <template v-if="group.events?.length">
                      <div v-for="ev in group.events?.filter((e: any) => new Date(e.starts_at) > new Date()).slice(0, 5)" :key="ev.id"
                        class="flex gap-3 bg-brand-bg border border-brand-border rounded-2xl p-4 hover:border-brand-accent/30 transition-all cursor-pointer group/ev"
                        @click="router.push({ name: 'group-detail', params: { slugOrId: group.slug } })">
                        <!-- Date box -->
                        <div class="w-12 h-12 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex flex-col items-center justify-center flex-shrink-0">
                          <span class="text-[10px] font-bold text-brand-accent/70 uppercase leading-none">{{ new Date(ev.starts_at).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'short' }) }}</span>
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
                        class="text-center text-white/35 text-sm py-6">{{ langStore.t.groupDetailNoUpcomingEvents }}</p>
                    </template>
                  </div>

                  <!-- Artist / Creative: Прайс -->
                  <div v-else-if="aboutTab === 'prices'" class="space-y-4">
                    <template v-if="(group as any).pricelist?.length">
                      <div v-for="item in (group as any).pricelist" :key="item.id"
                        class="flex items-center gap-4 px-4 py-3.5 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/30 transition-all">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white">{{ item.name }}</p>
                          <p v-if="item.description" class="text-xs text-white/40 mt-0.5">{{ item.description }}</p>
                        </div>
                        <div class="text-right flex-shrink-0">
                          <p class="text-sm font-extrabold" :style="`color: ${group.accent_color || '#4C67CF'}`">{{ langStore.t.groupDetailFromPricePrefix }} {{ item.price_from }}₽</p>
                          <p v-if="item.days" class="text-[10px] text-white/35">{{ item.days }}</p>
                        </div>
                      </div>
                    </template>
                    <template v-else-if="group.type === 'creative'">
                      <div v-for="item in [
                        [langStore.t.groupDetailFursuitHeadName, langStore.t.groupDetailFursuitHeadDesc, '25 000', langStore.t.groupDetailDuration1to2mo],
                        [langStore.t.groupDetailFursuitPartialName, langStore.t.groupDetailFursuitPartialDesc, '45 000', langStore.t.groupDetailDuration2to3mo],
                        [langStore.t.groupDetailFursuitMiniFullName, langStore.t.groupDetailFursuitMiniFullDesc, '60 000', langStore.t.groupDetailDuration3to4mo],
                        [langStore.t.groupDetailFursuitFullsuitName, langStore.t.groupDetailFursuitFullsuitDesc, '90 000', langStore.t.groupDetailDuration4to6mo],
                      ]" :key="item[0]"
                        class="flex items-center gap-4 px-4 py-3.5 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-purple/30 transition-all">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white">{{ item[0] }}</p>
                          <p class="text-xs text-white/40 mt-0.5">{{ item[1] }}</p>
                        </div>
                        <div class="text-right flex-shrink-0">
                          <p class="text-sm font-extrabold text-brand-purple">{{ langStore.t.groupDetailFromPricePrefix }} {{ item[2] }}₽</p>
                          <p class="text-[10px] text-white/35">~{{ item[3] }}</p>
                        </div>
                      </div>
                    </template>
                    <template v-else-if="(group.type as string) === 'artist'">
                      <div class="space-y-3">
                        <div class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl px-4 py-3">
                          <p class="text-[10px] text-white/30 uppercase tracking-wide mb-2 font-bold">{{ langStore.t.groupDetailBasicPricesHeader }}</p>
                          <div class="grid grid-cols-2 gap-2">
                            <div v-for="item in [[langStore.t.groupDetailStageSketch,'500₽'],[langStore.t.groupDetailArtistLine,'1 200₽'],[langStore.t.groupDetailArtistFlat,'2 000₽'],[langStore.t.groupDetailArtistFlatShaded,'3 000₽']]" :key="item[0]"
                              class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5">
                              <p class="text-xs text-white/45">{{ item[0] }}</p>
                              <p class="text-sm font-extrabold text-white mt-0.5">{{ langStore.t.groupDetailFromPricePrefix }} {{ item[1] }}</p>
                            </div>
                          </div>
                        </div>
                        <div class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl px-4 py-3">
                          <p class="text-[10px] text-white/30 uppercase tracking-wide mb-2 font-bold">{{ langStore.t.groupDetailArtistRender }}</p>
                          <div class="grid grid-cols-2 gap-2">
                            <div v-for="item in [[langStore.t.groupDetailArtistRender,'5 000₽'],[langStore.t.groupDetailArtistFullRender,'8 000₽'],[langStore.t.groupDetailArtistGifAnim,'12 000₽'],[langStore.t.groupDetailArtistAnimation, langStore.t.groupDetailAnimationFromPrice]]" :key="item[0]"
                              class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5">
                              <p class="text-xs text-white/45">{{ item[0] }}</p>
                              <p class="text-sm font-extrabold text-white mt-0.5">{{ item[1].startsWith(langStore.t.groupDetailFromPricePrefix) ? item[1] : `${langStore.t.groupDetailFromPricePrefix} ${item[1]}` }}</p>
                            </div>
                          </div>
                        </div>
                        <div class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl px-4 py-3">
                          <p class="text-[10px] text-white/30 uppercase tracking-wide mb-2 font-bold">{{ langStore.t.groupDetailSurchargesHeader }}</p>
                          <div class="space-y-1">
                            <div v-for="item in [[langStore.t.groupDetailSurchargeComplexDesign,'+30%'],[langStore.t.groupDetailSurchargeRushOrder,'+50%'],[langStore.t.groupDetailSurchargeExtraChar,'+70%'],[langStore.t.groupDetailSurchargeSceneBg,'+800₽']]" :key="item[0]"
                              class="flex items-center justify-between px-2 py-1.5">
                              <p class="text-xs text-white/55">{{ item[0] }}</p>
                              <p class="text-xs font-bold text-brand-yellow">{{ item[1] }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p class="text-[10px] text-white/25 text-center">* {{ langStore.t.groupDetailFinalPriceNote }}</p>
                    </template>
                  </div>

                  <!-- Artist: Очередь заказов -->
                  <div v-else-if="aboutTab === 'queue'">
                    <GroupKanban
                      :group-id="group.id"
                      :accent-color="group.accent_color"
                      :is-admin="isAdmin"
                    />
                  </div>

                  <!-- Artist: Отзывы -->
                  <div v-else-if="aboutTab === 'reviews'" class="space-y-3">
                    <template v-if="(group as any).reviews?.length">
                      <div v-for="review in (group as any).reviews" :key="review.id"
                        class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                        <div class="flex items-center gap-2 mb-2">
                          <div class="w-7 h-7 rounded-full overflow-hidden bg-brand-accent/20 flex-shrink-0">
                            <img v-if="review.author?.avatar_url" :src="review.author.avatar_url" class="w-full h-full object-cover" />
                            <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-[10px] font-bold">{{ (review.author?.display_name || '?')[0] }}</div>
                          </div>
                          <p class="text-xs font-bold text-white">{{ review.author?.display_name || review.author?.username }}</p>
                          <div class="flex items-center gap-0.5 ml-auto">
                            <BIcon v-for="i in 5" :key="i" name="Star" class="w-3 h-3"
                              :class="i <= review.rating ? 'text-brand-yellow fill-brand-yellow' : 'text-white/15'" />
                          </div>
                        </div>
                        <p class="text-xs text-white/60 leading-relaxed">{{ review.text }}</p>
                      </div>
                    </template>
                    <div v-else class="py-8 text-center">
                      <BIcon name="Star" class="w-8 h-8 mx-auto mb-2 text-white/20" />
                      <p class="text-white/40 text-sm">{{ langStore.t.dealerListingNoReviewsYet }}</p>
                      <p class="text-white/25 text-xs mt-1">{{ langStore.t.groupDetailReviewsEmptyHint }}</p>
                    </div>
                  </div>

                  <!-- News: Дайджест -->
                  <div v-else-if="aboutTab === 'digest'" class="space-y-3">
                    <template v-if="(group as any).digest?.length">
                      <div v-for="item in (group as any).digest" :key="item.id"
                        class="flex gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-sky-500/30 transition-all cursor-pointer">
                        <div class="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-brand-border/40">
                          <img v-if="item.image" :src="item.image" class="w-full h-full object-cover" />
                          <div v-else class="w-full h-full flex items-center justify-center"><BIcon name="Newspaper" class="w-6 h-6 text-white/20" /></div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <span v-if="item.category" class="text-[10px] font-bold uppercase tracking-wider text-sky-400">{{ item.category }}</span>
                          <p class="text-sm font-bold text-white leading-snug mt-0.5 line-clamp-2">{{ item.title }}</p>
                          <p class="text-[10px] text-white/35 mt-1">{{ item.date }}</p>
                        </div>
                      </div>
                    </template>
                    <div v-else class="py-8 text-center">
                      <BIcon name="Newspaper" class="w-8 h-8 mx-auto mb-2 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">{{ langStore.t.groupDetailDigestEmptyTitle }}</p>
                      <p class="text-white/25 text-xs mt-1">{{ langStore.t.groupDetailDigestEmptyHint }}</p>
                    </div>
                  </div>

                  <!-- News: Рубрики -->
                  <div v-else-if="aboutTab === 'categories'" class="space-y-2">
                    <template v-if="(group as any).categories?.length">
                      <button v-for="cat in (group as any).categories" :key="cat.id"
                        class="w-full flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-sky-500/30 transition-all text-left">
                        <span class="text-xl flex-shrink-0">{{ cat.emoji }}</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white">{{ cat.name }}</p>
                          <p v-if="cat.description" class="text-xs text-white/40">{{ cat.description }}</p>
                        </div>
                        <span class="text-[10px] font-bold text-white/30 flex-shrink-0">{{ cat.post_count }}</span>
                      </button>
                    </template>
                    <template v-else>
                      <div v-for="cat in [
                        ['🎪', langStore.t.groupDetailCatConventions, langStore.t.groupDetailCatConventionsDesc],
                        ['😂', langStore.t.groupDetailCatMemes, langStore.t.groupDetailCatMemesDesc],
                        ['🎤', langStore.t.groupDetailCatInterviews, langStore.t.groupDetailCatInterviewsDesc],
                        ['🎨', langStore.t.groupDetailCatArtSelections, langStore.t.groupDetailCatArtSelectionsDesc],
                        ['📢', langStore.t.groupDetailCatOfficial, langStore.t.groupDetailCatOfficialDesc],
                      ]" :key="cat[0]"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-sky-500/30 transition-all cursor-pointer">
                        <span class="text-xl flex-shrink-0">{{ cat[0] }}</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white">{{ cat[1] }}</p>
                          <p class="text-xs text-white/40">{{ cat[2] }}</p>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- News: Команда редакции -->
                  <div v-else-if="aboutTab === 'team'" class="space-y-2">
                    <template v-if="(group as any).editorialTeam?.length">
                      <router-link v-for="member in (group as any).editorialTeam" :key="member.user_id"
                        :to="`/profile/${member.user?.username}`"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-sky-500/30 transition-all">
                        <div class="w-9 h-9 rounded-xl overflow-hidden bg-brand-accent/20 flex-shrink-0">
                          <img v-if="member.user?.avatar_url" :src="member.user.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                          <div v-else class="w-full h-full flex items-center justify-center text-brand-accent font-bold text-sm">{{ (member.user?.display_name || '?')[0] }}</div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ member.user?.display_name || member.user?.username }}</p>
                          <p class="text-xs text-white/40">{{ member.role || langStore.t.groupDetailEditorRoleFallback }}</p>
                        </div>
                        <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 flex-shrink-0" />
                      </router-link>
                    </template>
                    <template v-else>
                      <router-link :to="`/profile/${group.owner.username}`"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-sky-500/30 transition-all">
                        <div class="w-9 h-9 rounded-xl overflow-hidden bg-sky-500/20 flex-shrink-0">
                          <img v-if="group.owner.avatar_url" :src="group.owner.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                          <div v-else class="w-full h-full flex items-center justify-center text-sky-400 font-bold">{{ (group.owner.display_name || '?')[0] }}</div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ group.owner.display_name || group.owner.username }}</p>
                          <p class="text-xs text-sky-400">{{ langStore.t.groupDetailChiefEditor }}</p>
                        </div>
                        <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 flex-shrink-0" />
                      </router-link>
                    </template>
                  </div>

                  <!-- Creative: Dealers' Den (no group↔listing link in schema yet → empty state) -->
                  <div v-else-if="aboutTab === 'dealers-den'" class="py-10 text-center">
                    <BIcon name="ShoppingBag" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                    <p class="text-white/40 text-sm font-semibold">{{ langStore.t.groupDetailMarketEmptyTitle }}</p>
                    <p class="text-white/25 text-xs mt-1">{{ langStore.t.groupDetailMarketEmptyHint }}</p>
                  </div>

                  <!-- Event: Спонсоры -->
                  <div v-else-if="aboutTab === 'sponsors'" class="space-y-3">
                    <template v-if="(group.sponsors as any[])?.length">
                      <div v-for="sp in (group.sponsors as any[])" :key="sp.name"
                        class="flex items-center gap-4 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-success/30 transition-all">
                        <div class="w-12 h-12 rounded-xl overflow-hidden bg-brand-border/40 flex items-center justify-center flex-shrink-0">
                          <img v-if="sp.logo_url" :src="sp.logo_url" class="w-full h-full object-contain p-1.5" />
                          <BIcon v-else name="Building2" class="w-6 h-6 text-white/25" />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <p class="text-sm font-bold text-white">{{ sp.name }}</p>
                            <span v-if="sp.tier" class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                              :class="sp.tier === 'gold' ? 'bg-brand-yellow/20 text-brand-yellow' : sp.tier === 'silver' ? 'bg-white/10 text-white/55' : 'bg-brand-success/15 text-brand-success'">
                              {{ sp.tier === 'gold' ? '🥇 Gold' : sp.tier === 'silver' ? '🥈 Silver' : '🥉 Bronze' }}
                            </span>
                          </div>
                          <p v-if="sp.description" class="text-xs text-white/40 mt-0.5">{{ sp.description }}</p>
                        </div>
                        <a v-if="sp.url" :href="safeHref(sp.url)" target="_blank" rel="noopener noreferrer"
                          class="text-brand-success text-xs font-bold hover:underline flex-shrink-0 flex items-center gap-1">
                          {{ langStore.t.groupDetailWebsiteLinkLabel }} <BIcon name="ExternalLink" class="w-3 h-3" />
                        </a>
                      </div>
                    </template>
                    <div v-else class="py-8 text-center">
                      <BIcon name="Star" class="w-8 h-8 mx-auto mb-2 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">{{ langStore.t.groupDetailSponsorsEmptyTitle }}</p>
                      <p class="text-white/25 text-xs mt-1">{{ langStore.t.groupDetailSponsorsEmptyHint }}</p>
                    </div>
                  </div>

                  <!-- Event: Контакты + карта проезда -->
                  <div v-else-if="aboutTab === 'contacts'" class="space-y-4">
                    <div v-if="group.contact_email || group.contact_phone" class="space-y-2">
                      <p class="text-[11px] font-bold text-white/40 uppercase tracking-wider px-1">{{ langStore.t.groupDetailOrganizerContactsLabel }}</p>
                      <a v-if="group.contact_phone" :href="`tel:${group.contact_phone}`"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-success/30 transition-all group/link">
                        <div class="w-9 h-9 rounded-xl bg-brand-success/10 border border-brand-success/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="Phone" class="w-4 h-4 text-brand-success" />
                        </div>
                        <span class="text-sm font-bold text-white font-mono group-hover/link:text-brand-success transition-colors">{{ group.contact_phone }}</span>
                      </a>
                      <a v-if="group.contact_email" :href="`mailto:${group.contact_email}`"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/30 transition-all group/link">
                        <div class="w-9 h-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center flex-shrink-0">
                          <BIcon name="Mail" class="w-4 h-4 text-brand-accent" />
                        </div>
                        <span class="text-sm font-bold text-white group-hover/link:text-brand-accent transition-colors">{{ group.contact_email }}</span>
                      </a>
                    </div>
                    <div v-if="activeEvent?.location_name" class="space-y-2">
                      <p class="text-[11px] font-bold text-white/40 uppercase tracking-wider px-1">{{ langStore.t.groupDetailVenueLabel }}</p>
                      <div class="px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                        <div class="flex items-start gap-3">
                          <BIcon name="MapPin" class="w-4 h-4 text-brand-success mt-0.5 flex-shrink-0" />
                          <div>
                            <p class="text-sm font-bold text-white">{{ activeEvent.location_name }}</p>
                            <p v-if="activeEvent.location_address" class="text-xs text-white/45 mt-0.5">{{ activeEvent.location_address }}</p>
                          </div>
                        </div>
                      </div>
                      <div v-if="activeEvent?.map_embed_url" class="rounded-2xl overflow-hidden border border-brand-border">
                        <iframe :src="activeEvent.map_embed_url" class="w-full h-52 border-0" loading="lazy" allowfullscreen />
                      </div>
                    </div>
                    <div v-if="group.social_links && Object.keys(group.social_links).length" class="space-y-2">
                      <p class="text-[11px] font-bold text-white/40 uppercase tracking-wider px-1">{{ langStore.t.groupDetailSocialLinksLabel }}</p>
                      <div class="grid grid-cols-2 gap-2">
                        <a v-for="(url, platform) in group.social_links" :key="platform"
                          :href="safeHref(url)" target="_blank" rel="noopener noreferrer"
                          class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-xl hover:border-brand-success/30 transition-all">
                          <BIcon :name="socialIconMap[platform as string] || 'Globe'" class="w-4 h-4 text-white/55 flex-shrink-0" />
                          <span class="text-xs font-semibold text-white/70 capitalize truncate">{{ platform }}</span>
                        </a>
                      </div>
                    </div>
                    <div v-if="!group.contact_email && !group.contact_phone && !activeEvent?.location_name" class="py-8 text-center">
                      <BIcon name="MapPin" class="w-8 h-8 mx-auto mb-2 text-white/20" />
                      <p class="text-white/40 text-sm">{{ langStore.t.groupDetailNoContactInfo }}</p>
                    </div>
                  </div>

                  <!-- Schedule tab -->
                  <div v-else-if="aboutTab === 'schedule'" class="space-y-1">
                    <div v-if="!((activeEvent?.schedule || group.schedule) as any[])?.length" class="py-10 text-center text-white/30 text-sm">
                      {{ langStore.t.groupDetailScheduleEmptyText }}
                    </div>
                    <template v-else>
                      <!-- Day header if present -->
                      <div class="flex items-center gap-2 pb-3 px-1">
                        <BIcon name="CalendarDays" class="w-4 h-4 shrink-0" :style="`color: ${group.accent_color || '#4C67CF'}`" />
                        <p class="text-sm font-extrabold text-white">{{ activeEvent?.title || group.name }}</p>
                        <div class="flex-1 h-px bg-brand-border/40 rounded ml-2" />
                        <span class="text-[11px] text-white/30 tabular-nums">{{ ((activeEvent?.schedule || group.schedule) as any[]).length }} {{ langStore.t.groupDetailEventsCountSuffix }}</span>
                      </div>
                      <!-- Timeline -->
                      <div class="relative pl-5">
                        <!-- Vertical accent line -->
                        <div class="absolute left-[1.45rem] top-4 bottom-4 w-0.5 rounded-full"
                          :style="`background: linear-gradient(to bottom, ${group.accent_color || '#4C67CF'}90, ${group.accent_color || '#4C67CF'}10)`" />

                        <div v-for="(item, idx) in ((activeEvent?.schedule || group.schedule) as any[])" :key="idx"
                          class="relative flex gap-4 pb-3 last:pb-0">
                          <!-- Timeline dot -->
                          <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-1.5 z-10 border-2 border-brand-card"
                            :style="`background: ${group.accent_color || '#4C67CF'}`">
                            <span class="w-1.5 h-1.5 rounded-full bg-white/90 block" />
                          </div>
                          <!-- Content card -->
                          <div class="flex-1 min-w-0 bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 transition-all group/sched"
                            :style="idx === 0 ? `border-left: 2px solid ${group.accent_color || '#4C67CF'}` : ''">
                            <div class="flex items-start justify-between gap-3">
                              <div class="min-w-0">
                                <p class="font-extrabold font-mono text-sm tabular-nums"
                                  :style="`color: ${group.accent_color || '#4C67CF'}`">{{ item.time }}</p>
                                <p class="text-sm text-white font-semibold leading-snug mt-0.5">{{ item.label }}</p>
                                <p v-if="item.description" class="text-xs text-white/50 leading-relaxed mt-1">{{ item.description }}</p>
                              </div>
                              <span v-if="item.badge" class="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-lg border mt-0.5"
                                :style="`background: ${group.accent_color || '#4C67CF'}15; color: ${group.accent_color || '#4C67CF'}; border-color: ${group.accent_color || '#4C67CF'}30`">
                                {{ item.badge }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>

                </div>
              </div>

              <!-- ── Content tabs (floating pills) ───────────────────── -->
              <div class="flex flex-wrap gap-2">
                <button v-for="tab in contentTabs" :key="tab.key"
                  @click="activeContentTab = tab.key as any"
                  class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 whitespace-nowrap"
                  :class="activeContentTab === tab.key ? 'text-white' : 'bg-brand-card text-white/55 border-brand-border hover:text-white'"
                  :style="activeContentTab === tab.key
                    ? `background: ${group.accent_color || '#4C67CF'}; border-color: ${group.accent_color || '#4C67CF'}; box-shadow: 0 4px 14px ${group.accent_color || '#4C67CF'}40`
                    : `--accent: ${group.accent_color || '#4C67CF'}`">
                  <BIcon :name="tab.icon" class="w-4 h-4" />{{ tab.label }}
                </button>
              </div>

              <!-- ── Post Creator (for owners/admins/moderators) ────────────────── -->
              <div v-if="(isAdmin || myRoleWeight >= 1) && activeContentTab === 'posts'"
                class="bg-brand-card border rounded-3xl shadow-xl transition-colors"
                :class="showPostForm ? 'border-brand-accent/30' : 'border-brand-border'">
                <button v-if="!showPostForm" @click="showPostForm = true"
                  class="w-full flex items-center gap-3 px-5 py-4 text-left group">
                  <img v-if="group.avatar_url" :src="group.avatar_url" class="w-10 h-10 rounded-xl border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" @error="onAvatarError" />
                  <div v-else class="w-10 h-10 rounded-xl border-2 border-brand-border flex-shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (group.name || '?')[0].toUpperCase() }}</div>
                  <span class="flex-1 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">
                    {{ archetypeComposer.label }} · {{ archetypeComposer.placeholder.split('…')[0] }}…
                  </span>
                  <div class="flex items-center gap-2 text-white/55 group-hover:text-white transition-colors ml-1">
                    <BIcon name="ImagePlus" class="w-5 h-5" />
                  </div>
                </button>
                <div v-else class="p-5 space-y-4">
                  <!-- Archetype header chip -->
                  <div class="flex items-center gap-2 px-1 pb-1">
                    <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                      :style="`background: ${group.accent_color || '#4C67CF'}15; border-color: ${group.accent_color || '#4C67CF'}35; color: ${group.accent_color || '#4C67CF'}`">
                      <BIcon :name="archetypeComposer.icon" class="w-3 h-3" />
                      {{ archetypeComposer.label }}
                    </div>
                  </div>

                  <!-- Title field (news articles only) -->
                  <div v-if="archetypeComposer.showTitle" class="px-0.5">
                    <input v-model="newPostTitle" type="text" :placeholder="langStore.t.groupDetailArticleTitlePlaceholder"
                      class="w-full bg-transparent border-b border-brand-border focus:border-brand-accent/50 outline-none text-white text-lg font-bold placeholder-white/25 pb-2 mb-1 transition-colors" />
                  </div>

                  <div class="flex items-start gap-3">
                    <div class="relative flex-shrink-0 mt-0.5">
                      <img v-if="group.avatar_url" :src="group.avatar_url" class="w-10 h-10 rounded-xl border-2 border-brand-border object-cover" @error="onAvatarError" />
                      <div v-else class="w-10 h-10 rounded-xl border-2 border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold">{{ (group.name || '?')[0].toUpperCase() }}</div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <MentionTextarea v-model="newPostContent" :placeholder="archetypeComposer.placeholder + ' ' + langStore.t.groupDetailMentionHint" minHeight="90px" />
                    </div>
                    <button @click="createGroupPost" :disabled="(!newPostContent.trim() && newPostMediaUrls.length === 0) || isCreatingPost"
                      class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 flex-shrink-0 mt-0.5">
                      <BIcon v-if="isCreatingPost" name="Loader2" class="w-5 h-5 animate-spin" />
                      <BIcon v-else name="SendHorizontal" class="w-5 h-5" />
                    </button>
                  </div>

                  <!-- Creative status chips -->
                  <div v-if="group.type === 'creative'" class="flex gap-2 flex-wrap px-1">
                    <p class="text-[10px] text-white/30 w-full font-bold uppercase tracking-wide">{{ langStore.t.groupDetailStageOfWork }}</p>
                    <button v-for="s in creativePostStatuses" :key="s.value"
                      @click="selectedCreativeStatus = selectedCreativeStatus === s.value ? '' : s.value"
                      class="px-3 py-1 rounded-full text-xs font-bold border transition-all"
                      :style="selectedCreativeStatus === s.value
                        ? `background: ${group.accent_color || '#4C67CF'}20; border-color: ${group.accent_color || '#4C67CF'}60; color: ${group.accent_color || '#4C67CF'}`
                        : 'border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4)'">
                      {{ s.label }}
                    </button>
                  </div>

                  <MediaUpload ref="groupMediaUploadRef" type="posts" :multiple="true" :max-files="20" @uploaded="onGroupMediaUploaded" />

                  <!-- Tags row -->
                  <div v-if="newPostTags.length" class="flex flex-wrap gap-1.5">
                    <span v-for="tag in newPostTags" :key="tag"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold">
                      #{{ tag }}
                      <button @click="removeGroupTag(tag)" class="text-brand-accent/60 hover:text-brand-accent"><BIcon name="X" class="w-3 h-3" /></button>
                    </span>
                  </div>

                  <div class="border-t border-brand-border" />
                  <div class="flex items-center gap-2 flex-wrap">
                    <button @click="groupMediaUploadRef?.openPicker()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all">
                      <BIcon name="ImagePlus" class="w-4 h-4" /> {{ langStore.t.tabMedia }}
                    </button>
                    <!-- Tag input -->
                    <div class="relative inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-bg transition-all">
                      <BIcon name="Hash" class="w-4 h-4 text-white/55 flex-shrink-0" />
                      <input type="text" v-model="newPostTagInput"
                        @input="fetchTagSuggestions(newPostTagInput)"
                        @keydown.enter.prevent="addGroupTag"
                        @keydown.escape="clearTagSuggestions"
                        :placeholder="langStore.t.profileTagPlusEnterPlaceholder"
                        class="bg-transparent text-xs text-white placeholder-brand-muted outline-none w-24" />

                      <!-- Tag suggestions, ranked by usage -->
                      <div v-if="showTagSuggestions" v-click-outside="clearTagSuggestions"
                        class="absolute top-full left-0 mt-1.5 z-30 w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                        <button v-for="s in tagSuggestions" :key="s.name"
                          @click="addGroupTagFromSuggestion(s.name)"
                          class="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-white hover:bg-white/5">
                          <span class="truncate">#{{ s.name }}</span>
                          <span class="text-xs text-white/35 flex-shrink-0">{{ s.count }}</span>
                        </button>
                      </div>
                    </div>
                    <button @click="newPostIsNsfw = !newPostIsNsfw"
                      class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="newPostIsNsfw ? 'border-brand-error/60 text-brand-error bg-brand-error/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      NSFW
                    </button>
                    <button @click="newPostIsAnnouncement = !newPostIsAnnouncement"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="newPostIsAnnouncement ? 'border-brand-yellow/60 text-brand-yellow bg-brand-yellow/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      <BIcon name="Megaphone" class="w-3.5 h-3.5" />
                      {{ langStore.t.groupDetailAnnounceToggleLabel }}
                    </button>
                    <!-- AI-generated toggle -->
                    <button @click="newPostIsAiGenerated = !newPostIsAiGenerated"
                      :title="langStore.t.aiGenToggleTitle"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="newPostIsAiGenerated ? 'border-brand-purple/60 text-brand-purple bg-brand-purple/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      <BIcon name="Bot" class="w-3.5 h-3.5" /> {{ langStore.t.aiGenBadge }}
                    </button>
                  </div>

                  <!-- Visibility + Cancel — own row so Cancel never wraps onto its own orphan line -->
                  <div class="flex items-center justify-between gap-2 mt-2">
                    <div class="relative">
                      <button @click.stop="showGroupVisibilityMenu = !showGroupVisibilityMenu"
                        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                        :class="newPostVisibility !== 'public' ? 'border-brand-accent/50 text-brand-accent bg-brand-accent/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                        <BIcon :name="newPostVisibility === 'subscriber_only' ? 'Users' : newPostVisibility === 'paid' ? 'DollarSign' : 'Globe2'" class="w-3.5 h-3.5" />
                        {{ newPostVisibility === 'subscriber_only' ? langStore.t.profileVisibilitySubscriberOnly : newPostVisibility === 'paid' ? langStore.t.profileVisibilityPaid : langStore.t.profileVisibilityPublic }}
                        <BIcon name="ChevronDown" class="w-3 h-3 opacity-60" />
                      </button>
                      <Transition name="slide">
                        <div v-if="showGroupVisibilityMenu" v-click-outside="() => showGroupVisibilityMenu = false"
                          class="absolute bottom-full left-0 mb-1.5 z-30 w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                          <button @click="newPostVisibility = 'public'; showGroupVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'public' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="Globe2" class="w-4 h-4 flex-shrink-0" /> {{ langStore.t.profileVisibilityPublic }}
                            <BIcon v-if="newPostVisibility === 'public'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                          <button @click="newPostVisibility = 'subscriber_only'; showGroupVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'subscriber_only' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="Users" class="w-4 h-4 flex-shrink-0" /> {{ langStore.t.profileVisibilitySubscriberOnly }}
                            <BIcon v-if="newPostVisibility === 'subscriber_only'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                          <button disabled :title="langStore.t.payModalAltComingSoon"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/30 cursor-not-allowed">
                            <BIcon name="DollarSign" class="w-4 h-4 flex-shrink-0" /> {{ langStore.t.profileVisibilityPaid }}
                            <span class="ml-auto text-[10px] uppercase tracking-wide">{{ langStore.t.groupDetailComingSoonBadge }}</span>
                          </button>
                        </div>
                      </Transition>
                    </div>
                    <button @click="showPostForm = false; newPostContent = ''; newPostMediaUrls = []; newPostMediaOriginalUrls = []; newPostTags = []; newPostTagInput = ''; newPostVisibility = 'public'; newPostIsAnnouncement = false; newPostIsAiGenerated = false; groupMediaUploadRef?.clearAll()"
                      class="text-xs font-semibold text-white/55 hover:text-white transition-all">{{ langStore.t.cancel }}</button>
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
                        :can-moderate="myRoleWeight >= 1"
                        @deleted="onPostDeleted"
                        @updated="onPostUpdated"
                      />
                    </template>

                    <!-- Empty -->
                    <div v-else class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center">
                      <BIcon name="Newspaper" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">{{ (isAdmin || myRoleWeight >= 1) ? langStore.t.groupDetailWriteFirstPostHint : langStore.t.groupDetailNoPublicationsYet }}</p>
                    </div>
                  </template>

                  <!-- POSTS ARCHIVE (moderators) -->
                  <template v-else-if="activeContentTab === 'posts_archive'">
                    <div v-if="isLoadingArchive" class="flex justify-center py-10">
                      <div class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                    <template v-else-if="archivedGroupPosts.length">
                      <PostCard
                        v-for="post in archivedGroupPosts"
                        :key="post.id"
                        :post="post"
                        :group-context="group"
                        :can-moderate="myRoleWeight >= 1"
                        @deleted="onArchivedPostRemoved"
                        @updated="onPostUpdated"
                      />
                    </template>
                    <div v-else class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center text-white/55 text-sm">
                      {{ langStore.t.profileArchiveEmptyLabel }}
                    </div>
                  </template>

                  <!-- MEDIA -->
                  <template v-else-if="activeContentTab === 'media'">
                    <AlbumsPanel :group-id="group.id" :can-create="myRoleWeight >= 1" />
                    <!-- Filter tabs -->
                    <div class="flex gap-2 mb-4 flex-wrap">
                      <button v-for="f in (['all','photo','video'] as const)" :key="f" @click="groupMediaFilter = f"
                        class="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="groupMediaFilter === f ? 'bg-brand-accent border-brand-accent text-white' : 'border-brand-border text-white/55 hover:text-white'">
                        {{ f === 'all' ? `${langStore.t.groupDetailAllFilterLabel} · ${groupMediaPostsList.length}` : f === 'photo' ? `${langStore.t.feedPhoto} · ${groupMediaPostsList.filter((p: any) => isGroupImage(p.media_urls[0])).length}` : `${langStore.t.profileMediaFilterVideoLabel} · ${groupMediaPostsList.filter((p: any) => !isGroupImage(p.media_urls[0])).length}` }}
                      </button>
                      <div class="flex-1" />
                      <button @click.stop="groupMediaAlbumView = !groupMediaAlbumView"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="groupMediaAlbumView ? 'bg-brand-accent/15 border-brand-accent/60 text-brand-accent' : 'border-brand-border text-white/55 hover:text-white'">
                        <BIcon name="FolderOpen" class="w-3.5 h-3.5" />
                        {{ langStore.t.profileAlbumsLabel }}
                      </button>
                    </div>

                    <div v-if="isLoadingMedia" class="grid grid-cols-3 gap-1.5">
                      <div v-for="n in 9" :key="n" class="aspect-square bg-brand-bg border border-brand-border rounded-xl animate-pulse"/>
                    </div>
                    <div v-else-if="!filteredGroupMediaPosts.length" class="py-14 text-center">
                      <BIcon name="Image" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">{{ langStore.t.noMediaYet }}</p>
                    </div>
                    <template v-else>
                      <!-- Album view -->
                      <template v-if="groupMediaAlbumView">
                        <div class="grid grid-cols-2 gap-3">
                          <div v-for="album in groupMediaAlbums" :key="album.label"
                            @click.stop="groupOpenAlbum = album"
                            class="relative rounded-2xl overflow-hidden cursor-pointer group aspect-[4/3] border border-brand-border hover:border-brand-accent/60 transition-all shadow-md">
                            <div v-if="album.urls.length >= 4" class="grid grid-cols-2 gap-0.5 w-full h-full">
                              <div v-for="(item, i) in album.urls.slice(0, 4)" :key="i" class="overflow-hidden">
                                <img v-if="isGroupImage(item.url)" :src="item.url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                <div v-else class="w-full h-full bg-brand-bg/60 flex items-center justify-center"><BIcon name="Play" class="w-5 h-5 text-white/40" /></div>
                              </div>
                            </div>
                            <div v-else-if="album.urls[0]" class="w-full h-full">
                              <img v-if="isGroupImage(album.urls[0].url)" :src="album.urls[0].url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                              <div v-else class="w-full h-full bg-brand-bg flex items-center justify-center"><BIcon name="Image" class="w-10 h-10 text-white/20" /></div>
                            </div>
                            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"/>
                            <div class="absolute bottom-0 left-0 right-0 p-3">
                              <div class="flex items-center gap-1.5 mb-0.5">
                                <BIcon name="CalendarDays" class="w-3 h-3 text-brand-accent/80" />
                                <p class="text-xs font-bold text-white">{{ album.label }}</p>
                              </div>
                              <p class="text-[10px] text-white/55 font-semibold">{{ album.urls.length }} {{ langStore.t.profilePhotosCountUnit }}</p>
                            </div>
                            <div class="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                              <BIcon name="FolderOpen" class="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- Grid view -->
                      <template v-else>
                    <div class="grid grid-cols-3 gap-1.5">
                      <div v-for="post in filteredGroupMediaPosts" :key="post.id"
                        @click="expandedGroupMediaPost = expandedGroupMediaPost?.id === post.id ? null : post"
                        class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
                        <img v-if="isGroupImage(post.media_urls[0])" :src="post.media_urls[0]"
                          :class="['w-full h-full object-cover group-hover:scale-105 transition-transform duration-300', !nsfwMode && post.is_nsfw ? 'blur-lg' : '']" />
                        <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg">
                          <BIcon name="Play" class="w-8 h-8 text-white/55" />
                        </div>
                        <!-- NSFW badge overlay -->
                        <div v-if="!nsfwMode && post.is_nsfw" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span class="bg-brand-error/90 text-white text-[11px] font-extrabold uppercase px-2 py-1 rounded-lg shadow-lg">18+</span>
                        </div>
                        <div v-if="post.media_urls.length > 1" class="absolute top-1.5 right-1.5 bg-black/70 rounded-lg px-1.5 py-0.5 text-[10px] text-white font-bold">+{{ post.media_urls.length - 1 }}</div>
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end p-2 opacity-0 group-hover:opacity-100">
                          <span class="flex items-center gap-1 text-white text-xs font-bold">
                            <BIcon name="ChevronUp" class="w-3.5 h-3.5" />{{ post._count?.votes ?? 0 }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Expanded post preview -->
                    <Transition name="slide-up">
                      <div v-if="expandedGroupMediaPost" class="mt-3 bg-brand-bg border border-brand-border rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-sm font-bold text-white/70">{{ new Date(expandedGroupMediaPost.created_at).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
                          <button @click="expandedGroupMediaPost = null" class="w-7 h-7 flex items-center justify-center rounded-lg text-white/55 hover:text-white hover:bg-brand-border/50 transition">
                            <BIcon name="X" class="w-4 h-4" />
                          </button>
                        </div>
                        <p v-if="expandedGroupMediaPost.content" class="text-sm text-white/80 mb-3 whitespace-pre-wrap">{{ expandedGroupMediaPost.content }}</p>
                        <div class="grid gap-2" :class="expandedGroupMediaPost.media_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
                          <template v-for="(url, i) in expandedGroupMediaPost.media_urls" :key="i">
                            <div class="relative">
                              <img v-if="isGroupImage(url)" :src="url"
                                :class="['w-full rounded-xl object-cover max-h-72', !nsfwMode && expandedGroupMediaPost.is_nsfw ? 'blur-lg' : '']" />
                              <video v-else :src="url" controls class="w-full rounded-xl max-h-72" />
                              <div v-if="!nsfwMode && expandedGroupMediaPost.is_nsfw && isGroupImage(url)"
                                class="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                                <span class="bg-brand-error/90 text-white text-xs font-extrabold uppercase px-3 py-1.5 rounded-xl shadow-lg">18+</span>
                                <span class="text-white/70 text-[11px]">{{ langStore.t.groupDetailEnableNsfwToView }}</span>
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </Transition>
                      </template>
                    </template>
                  </template>

                  <!-- ARCHIVE OF PAST EVENTS -->
                  <template v-else-if="activeContentTab === 'archive'">
                    <div class="flex items-center gap-4 border-b border-brand-border pb-3 mb-4">
                      <BIcon name="Archive" class="w-4 h-4 text-white/30" />
                      <span class="text-sm font-bold text-white/55">{{ langStore.t.groupDetailPastConventionsLabel }}</span>
                      <div class="flex-1" />
                      <span class="text-white/30 text-xs">{{ pastEvents.length }} {{ langStore.t.groupDetailRecordsCountSuffix }}</span>
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
                              <BIcon name="Users" class="w-2.5 h-2.5" />{{ fmtNum(ev.attendee_count) }} {{ langStore.t.groupDetailPeopleAbbr }}
                            </span>
                          </div>
                        </div>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/5 text-white/30 border border-white/10 self-start flex-shrink-0">#{{ ev.short_code }}</span>
                      </div>
                    </div>
                    <div v-else class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center">
                      <BIcon name="Archive" class="w-10 h-10 mx-auto mb-3 text-white/20" />
                      <p class="text-white/40 text-sm font-semibold">{{ langStore.t.groupDetailNoPastEvents }}</p>
                    </div>
                  </template>

                  <!-- ── MEMBERS TAB ──────────────────────────────────── -->
                  <template v-else-if="activeContentTab === 'members'">
                    <div class="flex items-center gap-3 border-b border-brand-border pb-3 mb-4">
                      <BIcon name="Users" class="w-4 h-4 text-white/30" />
                      <span class="text-sm font-bold text-white/55">{{ langStore.t.createStep2Title }}</span>
                      <span class="text-xs text-white/30 ml-auto">{{ fmtNum(group._count.members) }}</span>
                    </div>
                    <div v-if="membersLoading && !allMembers.length" class="grid grid-cols-2 gap-2">
                      <div v-for="i in 6" :key="i" class="h-16 bg-brand-bg/60 rounded-xl animate-pulse" />
                    </div>
                    <div v-else-if="allMembers.length" class="space-y-2">
                      <router-link v-for="m in allMembers" :key="m.user_id ?? m.user?.id"
                        :to="{ name: 'profile', params: { username: m.user?.username } }"
                        class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-brand-bg/40 border border-brand-border/60 hover:border-brand-accent/30 transition-all cursor-pointer">
                        <div class="w-9 h-9 rounded-xl overflow-hidden border border-brand-border flex-shrink-0">
                          <img v-if="m.user?.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" />
                          <div v-else class="w-full h-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold">
                            {{ (m.user?.display_name || m.user?.username || '?')[0].toUpperCase() }}
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ m.user?.display_name || m.user?.username }}</p>
                          <p class="text-xs text-white/35 truncate">@{{ m.user?.username }}</p>
                        </div>
                        <span v-if="m.role !== 'member'" class="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          :class="{
                            'bg-amber-400/15 text-amber-400 border-amber-400/30': m.role === 'owner',
                            'bg-brand-accent/15 text-brand-accent border-brand-accent/30': m.role === 'admin',
                            'bg-sky-500/15 text-sky-400 border-sky-500/30': m.role === 'moderator',
                          }">
                          {{ m.role === 'owner' ? langStore.t.roleOwner : m.role === 'admin' ? langStore.t.groupDetailRoleAdminAbbr : langStore.t.groupDetailRoleModAbbr }}
                        </span>
                      </router-link>
                      <button v-if="membersHasMore" @click="loadMoreMembers" :disabled="membersLoading"
                        class="w-full py-2.5 mt-2 rounded-xl border border-brand-border text-white/55 text-sm font-semibold hover:text-white hover:border-brand-accent/40 transition-all disabled:opacity-40">
                        {{ membersLoading ? '…' : langStore.t.bookmarksLoadMore }}
                      </button>
                    </div>
                    <div v-else class="text-center py-10 text-white/30 text-sm">{{ langStore.t.groupDetailNoMembersYet }}</div>
                  </template>

                  <!-- ── EVENTS TAB ─────────────────────────────────────── -->
                  <template v-else-if="activeContentTab === 'events'">
                    <div class="flex items-center gap-3 border-b border-brand-border pb-3 mb-4">
                      <BIcon name="CalendarDays" class="w-4 h-4 text-white/30" />
                      <span class="text-sm font-bold text-white/55">{{ langStore.t.groupDetailGroupEventsLabel }}</span>
                    </div>
                    <div v-if="isGroupEventsLoading" class="space-y-3">
                      <div v-for="i in 3" :key="i" class="h-20 bg-brand-bg/60 rounded-xl animate-pulse" />
                    </div>
                    <div v-else-if="groupEvents.length" class="space-y-3">
                      <div v-for="ev in groupEvents" :key="ev.id"
                        class="flex gap-3 bg-brand-bg border border-brand-border rounded-2xl p-4 hover:border-brand-accent/30 transition-all cursor-pointer"
                        @click="router.push({ name: 'event-detail', params: { eventId: ev.id } })">
                        <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-brand-border/60">
                          <img v-if="ev.banner_url" :src="ev.banner_url" class="w-full h-full object-cover" />
                          <div v-else class="w-full h-full bg-brand-accent/10 flex items-center justify-center">
                            <BIcon name="CalendarDays" class="w-6 h-6 text-brand-accent/40" />
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ ev.title }}</p>
                          <p class="text-[11px] text-white/40 mt-0.5">{{ fmt(ev.starts_at) }} — {{ fmt(ev.ends_at) }}</p>
                          <p v-if="ev.location_name" class="text-[10px] text-white/30 flex items-center gap-1 mt-1">
                            <BIcon name="MapPin" class="w-2.5 h-2.5" />{{ ev.location_name }}
                          </p>
                        </div>
                        <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-lg bg-white/5 text-white/30 border border-white/10 self-start">#{{ ev.short_code }}</span>
                      </div>
                    </div>
                    <div v-else class="text-center py-10 text-white/30 text-sm">{{ langStore.t.groupDetailNoEventsYet }}</div>
                  </template>

                </div>
              </div>

            </div>
            <!-- / CENTER COLUMN -->

            <!-- ── RIGHT SIDEBAR (same structure as ProfileView) ────── -->
            <div class="hidden xl:flex flex-col gap-3 w-60 flex-shrink-0 sticky top-24 self-start">

              <!-- Stats -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="grid grid-cols-3 divide-x divide-brand-border/60">
                  <div class="flex flex-col items-center gap-1 py-4 px-2">
                    <span class="text-lg font-extrabold leading-none" :style="`color: ${group.accent_color || '#4C67CF'}`">{{ fmtNum(group._count.members) }}</span>
                    <span class="text-[10px] text-white/45 font-medium text-center leading-tight mt-0.5">{{ langStore.t.groupDetailMembersStatAbbr }}</span>
                  </div>
                  <div class="flex flex-col items-center gap-1 py-4 px-2">
                    <span class="text-lg font-extrabold text-white leading-none">{{ fmtNum(group._count.posts) }}</span>
                    <span class="text-[10px] text-white/45 font-medium text-center leading-tight mt-0.5">{{ langStore.t.posts }}</span>
                  </div>
                  <div class="flex flex-col items-center gap-1 py-4 px-2">
                    <span class="text-lg font-extrabold text-white leading-none">{{ fmtNum(group._count.events) }}</span>
                    <span class="text-[10px] text-white/45 font-medium text-center leading-tight mt-0.5">{{ langStore.t.groupDetailEventsStatAbbr }}</span>
                  </div>
                </div>
              </div>

              <!-- Rating -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="TrendingUp" class="w-3.5 h-3.5" :style="`color: ${group.accent_color || '#4C67CF'}`" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupDetailRatingLabel }}</p>
                  </div>
                  <p class="text-[10px] text-white/35">{{ group.rating_count }} {{ langStore.t.groupDetailVotesCountSuffix }}</p>
                </div>
                <div class="px-4 pb-4">
                  <div class="flex items-center gap-3 mb-3">
                    <span class="text-3xl font-extrabold leading-none"
                      :style="group.rating > 0 ? `color: ${group.accent_color || '#4C67CF'}` : ''"
                      :class="group.rating < 0 ? 'text-brand-error' : group.rating === 0 ? 'text-white/60' : ''">{{ group.rating >= 0 ? '+' : '' }}{{ Math.round(group.rating) }}</span>
                    <!-- Mini bar -->
                    <div class="flex-1 h-1.5 bg-brand-bg rounded-full overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-500"
                        :style="group.rating > 0
                          ? `width: ${Math.min(100, (group.rating / Math.max(1, group.rating_count)) * 100)}%; background: ${group.accent_color || '#4C67CF'}`
                          : group.rating < 0 ? `width: ${Math.min(100, Math.abs(group.rating / Math.max(1, group.rating_count)) * 100)}%; background: var(--color-brand-error)`
                          : 'width: 0%'" />
                    </div>
                  </div>
                  <div v-if="authStore.user && !isOwner" class="flex gap-2">
                    <button @click="submitVote(1)" :disabled="ratingSubmitting"
                      class="flex-1 py-2 rounded-xl text-sm font-bold border transition-all"
                      :class="myVote === 1 ? 'text-white' : 'border-brand-border text-white/55 hover:text-white'"
                      :style="myVote === 1
                        ? `background: ${group.accent_color || '#4C67CF'}25; color: ${group.accent_color || '#4C67CF'}; border-color: ${group.accent_color || '#4C67CF'}50`
                        : ''">▲ {{ langStore.t.groupDetailVoteForBtn }}</button>
                    <button @click="submitVote(-1)" :disabled="ratingSubmitting"
                      class="flex-1 py-2 rounded-xl text-sm font-bold border transition-all"
                      :class="myVote === -1 ? 'border-brand-error/60 text-brand-error bg-brand-error/15' : 'border-brand-border text-white/55 hover:border-brand-error/50 hover:text-brand-error hover:bg-brand-error/10'">▼ {{ langStore.t.groupDetailVoteAgainstBtn }}</button>
                  </div>
                </div>
              </div>

              <!-- Event: RSVP -->
              <template v-if="group.type === 'event' && activeEvent && authStore.user">
                <div class="rounded-3xl shadow-xl overflow-hidden border"
                  :style="`border-color: ${group.accent_color || '#4C67CF'}30; background: linear-gradient(160deg, ${group.accent_color || '#4C67CF'}0D 0%, transparent 60%)`">
                  <!-- Header -->
                  <div class="px-4 pt-4 pb-2 flex items-center gap-2">
                    <div class="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                      :style="`background: ${group.accent_color || '#4C67CF'}20`">
                      <BIcon name="CalendarCheck" class="w-4 h-4" :style="`color: ${group.accent_color || '#4C67CF'}`" />
                    </div>
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/65">{{ langStore.t.groupDetailParticipationLabel }}</p>
                    <span v-if="activeEvent.attendee_count" class="ml-auto text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full"
                      :style="`background: ${group.accent_color || '#4C67CF'}20; color: ${group.accent_color || '#4C67CF'}`">
                      {{ fmtNum(activeEvent.attendee_count) }} {{ langStore.t.groupDetailPeopleAbbr }}
                    </span>
                  </div>

                  <div class="px-3 pb-4 space-y-2.5">
                    <!-- Big "Пойду" button -->
                    <button @click="setRsvp('going')" :disabled="rsvpLoading"
                      class="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold transition-all duration-200 disabled:opacity-60"
                      :style="myRsvpStatus === 'going'
                        ? `background: transparent; color: ${group.accent_color || '#4C67CF'}; border: 2px solid ${group.accent_color || '#4C67CF'}60; box-shadow: inset 0 0 24px ${group.accent_color || '#4C67CF'}15`
                        : `background: ${group.accent_color || '#4C67CF'}; color: white; border: 2px solid transparent; box-shadow: 0 4px 18px ${group.accent_color || '#4C67CF'}40`">
                      <BIcon :name="myRsvpStatus === 'going' ? 'CheckCircle2' : 'CalendarCheck'" class="w-4 h-4" />
                      {{ myRsvpStatus === 'going' ? langStore.t.groupDetailGoingConfirmedLabel : langStore.t.groupDetailGoBtn }}
                    </button>

                    <!-- Secondary row -->
                    <div class="grid grid-cols-2 gap-2">
                      <button @click="setRsvp('maybe')" :disabled="rsvpLoading"
                        class="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all border"
                        :class="myRsvpStatus === 'maybe'
                          ? 'bg-brand-yellow/20 text-brand-yellow border-brand-yellow/40'
                          : 'bg-brand-bg border-brand-border text-white/55 hover:border-brand-yellow/40 hover:text-brand-yellow hover:bg-brand-yellow/5'">
                        <BIcon name="HelpCircle" class="w-3.5 h-3.5" /> {{ langStore.t.groupDetailMaybeBtn }}
                      </button>
                      <button @click="setRsvp('not_going')" :disabled="rsvpLoading"
                        class="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all border"
                        :class="myRsvpStatus === 'not_going'
                          ? 'bg-brand-error/20 text-brand-error border-brand-error/40'
                          : 'bg-brand-bg border-brand-border text-white/55 hover:border-brand-error/40 hover:text-brand-error hover:bg-brand-error/5'">
                        <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.groupDetailNotGoingBtn }}
                      </button>
                    </div>

                    <!-- Status hint -->
                    <p v-if="myRsvpStatus" class="text-center text-[10px] text-white/30">
                      <span v-if="myRsvpStatus === 'going'">{{ langStore.t.groupDetailRsvpGoingHint }}</span>
                      <span v-else-if="myRsvpStatus === 'maybe'">{{ langStore.t.groupDetailRsvpMaybeHint }}</span>
                      <span v-else>{{ langStore.t.groupDetailRsvpNotGoingHint }}</span>
                    </p>
                  </div>
                </div>
              </template>

              <!-- Event: Tickets -->
              <template v-if="group.type === 'event' && activeEvent?.tickets?.length">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="Ticket" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupSettingsSecTickets }}</p>
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
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupDetailOrdersNav }}</p>
                  </div>
                  <div class="px-2 pb-2 space-y-0.5">
                    <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                      <BIcon name="Clock" class="w-4 h-4 flex-shrink-0" :class="group.commissionInfo.status === 'open' ? 'text-brand-success' : 'text-brand-error'" />
                      <div class="min-w-0">
                        <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.groupDetailCommissionsLabel }}</p>
                        <p class="text-xs font-bold" :class="group.commissionInfo.status === 'open' ? 'text-brand-success' : 'text-brand-error'">
                          {{ group.commissionInfo.status === 'open' ? langStore.t.groupDetailStatusOpen : langStore.t.groupDetailStatusClosed }}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                      <BIcon name="Zap" class="w-4 h-4 text-brand-yellow flex-shrink-0" />
                      <div class="min-w-0">
                        <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.groupDetailRushLabel }}</p>
                        <p class="text-xs font-bold text-white">{{ group.commissionInfo.rush_slots || 0 }} {{ langStore.t.groupDetailSlotsUnit }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Support tiers (configured by owner in settings) -->
              <template v-if="group.support_tiers?.length">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="Crown" class="w-3.5 h-3.5 text-brand-yellow" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">
                      {{ (group.type as string) === 'artist' ? langStore.t.groupDetailSubscriptionsLabel : langStore.t.groupDetailSupportStudioLabel }}
                    </p>
                  </div>
                  <div class="px-3 pb-3 space-y-2">
                    <div v-for="tier in group.support_tiers" :key="tier.name"
                      class="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-brand-bg border border-brand-border hover:border-brand-yellow/30 transition-all cursor-pointer">
                      <span class="text-lg leading-none flex-shrink-0">{{ tier.emoji || '⭐' }}</span>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold text-white leading-tight">{{ tier.name }}</p>
                        <p class="text-[10px] text-white/40 mt-0.5">{{ tier.price }}<span v-if="tier.desc"> · {{ tier.desc }}</span></p>
                      </div>
                      <button class="px-2.5 py-1 rounded-xl text-[10px] font-bold flex-shrink-0"
                        :style="`background: ${group.accent_color || '#4C67CF'}15; color: ${group.accent_color || '#4C67CF'}; border: 1px solid ${group.accent_color || '#4C67CF'}30`">
                        {{ langStore.t.groupDetailSupportBtn }}
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Creative: Гарантии студии -->
              <template v-if="group.type === 'creative'">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="ShieldCheck" class="w-3.5 h-3.5 text-brand-success" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupDetailGuaranteesLabel }}</p>
                  </div>
                  <div class="px-3 pb-3 space-y-0.5">
                    <div v-for="item in [
                      langStore.t.groupDetailGuaranteeEscrow,
                      langStore.t.groupDetailGuaranteeProgressPhotos,
                      langStore.t.groupDetailGuaranteeContract,
                      langStore.t.groupDetailGuaranteeRefund,
                      langStore.t.groupDetailGuaranteeFittingVideo,
                    ]" :key="item"
                      class="flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs text-white/60">
                      <BIcon name="Check" class="w-3 h-3 text-brand-success flex-shrink-0" /> {{ item }}
                    </div>
                  </div>
                </div>
              </template>

              <!-- News: Каналы и ссылки -->
              <template v-if="group.type === 'news' && group.social_links && Object.keys(group.social_links).length">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="Send" class="w-3.5 h-3.5 text-sky-400" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.catNews }}</p>
                  </div>
                  <div class="px-2 pb-2 space-y-0.5">
                    <a v-for="(url, platform) in group.social_links" :key="platform" :href="safeHref(url)" target="_blank" rel="noopener noreferrer"
                      class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group/chan">
                      <BIcon :name="socialIconMap[platform as string] || 'Globe'" class="w-4 h-4 text-sky-400 flex-shrink-0" />
                      <p class="text-xs font-bold text-white/70 capitalize flex-1 group-hover/chan:text-white transition-colors">{{ platform }}</p>
                      <BIcon name="ExternalLink" class="w-3 h-3 text-white/25 flex-shrink-0" />
                    </a>
                  </div>
                </div>
              </template>

              <!-- News: Тренды (хэштеги) -->
              <template v-if="group.type === 'news' && (group as any).trending_tags?.length">
                <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                  <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                    <BIcon name="TrendingUp" class="w-3.5 h-3.5 text-sky-400" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupDetailTrendingLabel }}</p>
                  </div>
                  <div class="px-3 pb-3 flex flex-wrap gap-1.5">
                    <span v-for="tag in (group as any).trending_tags" :key="tag"
                      @click="router.push({ path: '/search', query: { q: tag } })"
                      class="px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold cursor-pointer hover:bg-sky-500/20 transition-all">
                      #{{ tag }}
                    </span>
                  </div>
                </div>
              </template>

              <!-- Info -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="Info" class="w-3.5 h-3.5 text-brand-accent" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.informationLabel }}</p>
                </div>
                <div class="px-2 pb-2 space-y-0.5">
                  <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Calendar" class="w-4 h-4 text-white/55 flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.groupDetailCreatedLabel }}</p>
                      <p class="text-xs text-white/80">{{ fmt(group.created_at) }}</p>
                    </div>
                  </div>
                  <div v-if="group.type === 'event' && activeEvent" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Users" class="w-4 h-4 text-brand-success flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.groupDetailGoingCountLabel }}</p>
                      <p class="text-xs text-white font-bold">{{ fmtNum(activeEvent.attendee_count || 0) }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Owner / Organizer (redesigned to match screenshot) -->
              <div v-if="!group.hide_admins && !JSON.parse(group.hidden_member_ids || '[]').includes(group.owner.id)" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center gap-2">
                  <BIcon name="Users" class="w-3.5 h-3.5 text-brand-purple" />
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupSettingsSecOrganizers }}</p>
                </div>
                <!-- Organizer card -->
                <div class="px-3 pb-2">
                  <router-link :to="`/profile/${group.owner.username}`"
                    class="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-brand-bg transition-all group cursor-pointer">
                    <div class="w-10 h-10 rounded-xl bg-brand-accent/20 overflow-hidden shrink-0 border border-brand-border/60">
                      <img v-if="group.owner.avatar_url" :src="group.owner.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                      <div v-else class="w-full h-full flex items-center justify-center"><BIcon name="User" class="w-5 h-5 text-brand-accent" /></div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-bold text-white leading-tight truncate group-hover:text-brand-accent transition-colors">{{ group.owner.display_name || group.owner.username }}</p>
                      <p class="text-[10px] text-white/40 leading-tight mt-0.5">{{ group.type === 'event' ? langStore.t.verTypeOrganizer : langStore.t.roleOwner }}</p>
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
                  <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.groupDetailSponsorsNav }}</p>
                </div>
                <div class="px-3 pb-3 grid grid-cols-2 gap-2">
                  <a v-for="sp in (group.sponsors as any[])" :key="sp.name"
                    :href="safeHref(sp.url)" target="_blank" rel="noopener noreferrer"
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
                    <BIcon name="Users" class="w-3.5 h-3.5" :style="`color: ${group.accent_color || '#4C67CF'}`" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ group.type === 'event' ? langStore.t.groupDetailGoingCountLabel : langStore.t.createStep2Title }}</p>
                  </div>
                  <span class="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    :style="`background: ${group.accent_color || '#4C67CF'}20; color: ${group.accent_color || '#4C67CF'}`">{{ group._count.members }}</span>
                </div>
                <div class="px-3 pb-3">
                  <div class="flex -space-x-2">
                    <div v-for="m in memberPreview" :key="m.user.id"
                      class="w-8 h-8 rounded-full bg-brand-bg border-2 border-brand-card overflow-hidden flex-shrink-0 hover:z-10 hover:scale-110 transition-transform"
                      :title="m.user.display_name || m.user.username">
                      <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                      <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-[10px] font-bold bg-brand-accent/20">
                        {{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}
                      </div>
                    </div>
                  </div>
                  <p v-if="group._count.members > 8" class="text-[10px] text-brand-accent mt-2 text-center font-semibold hover:underline">{{ langStore.t.groupDetailShowAllPrefix }} {{ group._count.members }}</p>
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
                <h3 class="font-extrabold text-white text-lg leading-tight">{{ langStore.t.groupDetailReviewModalTitle }}</h3>
                <p class="text-white/50 text-xs mt-0.5">{{ group?.name }}</p>
              </div>
            </div>
            <button @click="showReviewModal = false" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-black/50 rounded-xl text-white/70 hover:text-white transition-colors">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <!-- Stars -->
          <div class="px-6 pt-5 pb-2">
            <p class="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">{{ langStore.t.groupDetailYourRatingLabel }}</p>
            <div class="flex items-center gap-2">
              <button v-for="i in 5" :key="i"
                @mouseenter="reviewHover = i" @mouseleave="reviewHover = 0" @click="reviewRating = i"
                class="transition-all hover:scale-125">
                <BIcon name="Star" class="w-8 h-8 transition-colors"
                  :class="i <= (reviewHover || reviewRating)
                    ? 'text-brand-yellow fill-brand-yellow' : 'text-white/15'" />
              </button>
              <span v-if="reviewHover || reviewRating" class="ml-2 text-sm font-semibold text-white/55">
                {{ ['', langStore.t.groupDetailRatingBad, langStore.t.groupDetailRatingBelowAverage, langStore.t.groupDetailRatingNormal, langStore.t.groupDetailRatingGood, langStore.t.groupDetailRatingExcellent][reviewHover || reviewRating] }}
              </span>
            </div>
          </div>
          <!-- Text area -->
          <div class="px-6 pt-3 pb-5">
            <p class="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">{{ langStore.t.groupDetailReviewLabel }}</p>
            <textarea v-model="reviewText"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none outline-none focus:border-brand-accent/50 transition-colors"
              rows="4"
              :placeholder="langStore.t.groupDetailReviewPlaceholder" />
          </div>
          <!-- Actions -->
          <div class="px-6 py-4 border-t border-brand-border flex items-center justify-between gap-3">
            <button @click="showReviewModal = false; reviewDismissed = true"
              class="text-sm text-white/40 hover:text-white/60 transition-colors">
              {{ langStore.t.onboardingSkipBtn }}
            </button>
            <button @click="submitReview"
              :disabled="!reviewText.trim() || reviewRating < 1 || reviewSubmitting"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <BIcon v-if="reviewSubmitting" name="Loader2" class="w-4 h-4 animate-spin" />
              <BIcon v-else name="Send" class="w-4 h-4" />
              {{ reviewSubmitting ? langStore.t.sendingBtn : langStore.t.groupDetailSubmitReviewBtn }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="fade">
      <div v-if="showAvatarViewer && group?.avatar_url" class="fixed inset-0 z-[600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" @click="showAvatarViewer = false">
        <button @click="showAvatarViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="group.avatar_url" class="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
      </div>
    </Transition>

    <!-- ── Banner Viewer ─────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBannerViewer && group?.banner_url" class="fixed inset-0 z-[600] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" @click="showBannerViewer = false">
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
              <h3 class="text-lg font-bold text-white">{{ langStore.t.createStep2Title }}</h3>
              <span class="text-sm font-bold bg-brand-accent/15 text-brand-accent px-2.5 py-0.5 rounded-full">{{ group?._count?.members ?? 0 }}</span>
            </div>
            <button @click="showMembersModal = false" class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/55 hover:text-white transition-colors">
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>
          <!-- Member cards grid -->
          <div class="flex-1 overflow-y-auto p-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <router-link v-for="m in allMembers.filter(m => m.role !== 'owner')" :key="m.user.id"
                :to="'/profile/' + m.user.username"
                class="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/40 transition-all group/card cursor-pointer">
                <!-- Mini banner -->
                <div class="h-16 relative bg-cover bg-center"
                  :class="!m.user.banner_url ? 'bg-gradient-to-br from-brand-accent/20 to-brand-purple/20' : ''"
                  :style="m.user.banner_url ? `background-image: url('${m.user.banner_url}')` : ''">
                  <span v-if="m.role === 'owner' || m.role === 'admin'"
                    class="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    :class="m.role === 'owner' ? 'bg-brand-yellow/20 text-brand-yellow border border-brand-yellow/30' : 'bg-brand-accent/20 text-brand-accent border border-brand-accent/30'">
                    {{ m.role === 'owner' ? langStore.t.roleOwner : langStore.t.groupDetailRoleAdminLabel }}
                  </span>
                </div>
                <!-- Body -->
                <div class="px-3 pb-3 -mt-6 relative z-10">
                  <div class="flex items-end gap-3 mb-2">
                    <img v-if="m.user.avatar_url" :src="m.user.avatar_url"
                      class="w-12 h-12 rounded-full border-[3px] border-brand-bg object-cover flex-shrink-0"
                      @error="onAvatarError" />
                    <div v-else class="w-12 h-12 rounded-full border-[3px] border-brand-bg bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold text-lg flex-shrink-0">
                      {{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                  <p class="text-sm font-semibold text-white truncate group-hover/card:text-brand-accent transition-colors">{{ m.user.display_name || m.user.username }}</p>
                  <p class="text-xs text-white/50 truncate">@{{ m.user.username }}</p>
                  <div class="flex gap-2 mt-2">
                    <button @click.stop="router.push({ name: 'messages', query: { userId: m.user.id } })"
                      class="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/30 text-brand-accent text-xs font-semibold transition-colors">
                      <BIcon name="MessageCircle" class="w-3.5 h-3.5" /> {{ langStore.t.msgBtnTitle }}
                    </button>
                    <button @click.stop="router.push('/profile/' + m.user.username)"
                      class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/55 hover:text-white text-xs font-semibold transition-colors">
                      <BIcon name="User" class="w-3.5 h-3.5" />
                    </button>
                    <button v-if="canKickRole(m.role)" @click.stop="kickMember(m.user.id)"
                      :disabled="kickingMember[m.user.id]"
                      :title="langStore.t.groupDetailKickFromGroupTitle"
                      class="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors disabled:opacity-40">
                      <BIcon name="UserX" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </router-link>
            </div>
            <!-- Load more -->
            <div v-if="membersLoading" class="flex items-center justify-center py-6">
              <BIcon name="Loader2" class="w-6 h-6 text-brand-accent animate-spin" />
            </div>
            <div v-else-if="membersHasMore" class="flex justify-center py-4">
              <button @click="loadMoreMembers" class="px-5 py-2 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/25 text-brand-accent text-sm font-semibold transition-colors">
                {{ langStore.t.bookmarksLoadMore }}
              </button>
            </div>
            <p v-else-if="allMembers.length === 0" class="text-center text-white/40 text-sm py-8">{{ langStore.t.groupDetailNoMembersLabel }}</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Album Modal ─────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="groupOpenAlbum" class="fixed inset-0 z-[615] bg-black/95 flex flex-col" @click.self="groupOpenAlbum = null">
        <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border/60 bg-brand-card/80 backdrop-blur-md flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <BIcon name="CalendarDays" class="w-5 h-5 text-brand-accent" />
            <h3 class="text-white font-bold text-lg">{{ groupOpenAlbum.label }}</h3>
            <span class="text-xs text-white/40 font-semibold">· {{ groupOpenAlbum.urls.length }}</span>
          </div>
          <button @click="groupOpenAlbum = null"
            class="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-bg hover:bg-brand-border text-white/70 hover:text-white transition-all">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-3">
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <div v-for="(item, idx) in groupOpenAlbum.urls" :key="idx"
              class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
              <img v-if="isGroupImage(item.url)" :src="item.url" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
              <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg/60">
                <BIcon name="Play" class="w-8 h-8 text-white/55" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Scroll to top button -->
    <Teleport to="body">
      <Transition name="slide-up">
        <button v-if="showScrollTop" @click="scrollToTop"
          class="fixed bottom-20 md:bottom-6 right-6 z-[210] w-11 h-11 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110"
          style="background: linear-gradient(135deg,#CD83F5,#7C3AED)">
          <BIcon name="ArrowUp" class="w-5 h-5 text-white" />
        </button>
      </Transition>
    </Teleport>

    <!-- Report group modal -->
    <ReportModal
      v-if="group"
      v-model="showGroupReport"
      :target-id="group.id"
      target-type="group"
    />

    <!-- Donate modal -->
    <DonateModal
      v-if="showDonateModal && group"
      :group="group as any"
      @close="showDonateModal = false"
    />

    <!-- Toast: errors from "Написать в группу" -->
    <Transition name="dm-toast">
      <div v-if="dmToast.show"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border backdrop-blur-lg pointer-events-none bg-brand-error/10 border-brand-error/30 text-brand-error">
        {{ dmToast.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dm-toast-enter-active, .dm-toast-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.dm-toast-enter-from, .dm-toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.88); }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.25s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(16px); }
.group-menu-enter-active { transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
.group-menu-leave-active { transition: all 0.12s ease; }
.group-menu-enter-from, .group-menu-leave-to { opacity: 0; transform: translateY(-8px) scale(0.95); }
</style>
