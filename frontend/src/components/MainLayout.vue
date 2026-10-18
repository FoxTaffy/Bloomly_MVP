<script setup lang="ts">
import { invalidateFriendsCache } from '@/stores/friends'
import { ref, computed, onMounted, watch, onUnmounted, onActivated, onDeactivated, reactive, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useMobileHubStore } from '@/stores/mobileHub'
import api from '@/api'
import { useTagSuggestions } from '@/composables/useTagSuggestions'
import BIcon from './BIcon.vue'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import AdSlot from './ads/AdSlot.vue'
import MediaUpload from './MediaUpload.vue'
import SkeletonPost from './SkeletonPost.vue'
import PostLightbox from './PostLightbox.vue'
import PostComments from './PostComments.vue'
import PostCard from './PostCard.vue'
import MentionTextarea from './MentionTextarea.vue'
import PostScheduleMenu from './PostScheduleMenu.vue'
import StoriesBar from './StoriesBar.vue'
import StoryViewer from './StoryViewer.vue'
import StoryMobileOnlyModal from './StoryMobileOnlyModal.vue'
import { useAnalytics } from '@/composables/useAnalytics'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { formatCount } from '@/lib/utils'
import { extractHashtags, extractCommittedHashtags } from '@/lib/hashtags'
import { onAvatarError } from '@/composables/useAvatarFallback'

// MediaUpload component ref
const mediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)
// Drag state for post form drop zone
const formDragging = ref(false)
let dragCounter = 0
const onFormDragEnter = (e: DragEvent) => {
  if (e.dataTransfer?.types.includes('Files')) { dragCounter++; formDragging.value = true }
}
const onFormDragLeave = () => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; formDragging.value = false } }
const onFormDrop = (e: DragEvent) => {
  dragCounter = 0; formDragging.value = false
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files?.length) mediaUploadRef.value?.processFiles(files)
}

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const langStore = useLangStore()
const groupsStore = useGroupsStore()
const { observePost } = useAnalytics()
const activeNav = ref('home')
const isPosting = ref(false)

const posts = ref<any[]>([])
const isLoadingPosts = ref(true)

// Feed controls
// nsfwMode=false (default): NSFW content is hidden. nsfwMode=true: NSFW is shown.
// nsfwMode ('hide' | 'blur' | 'show') is sent to every feed endpoint; nsfwEnabled ('show' only) drives UI bits.
const { nsfwMode, nsfwEnabled } = useNsfwMode()
const feedMode = ref<'for-you' | 'subscriptions' | 'trending' | 'news' | 'photos' | 'nsfw'>('for-you')
const searchQuery = ref('')
const selectedCategory = ref('')
const sortBy = ref<'new' | 'hot'>('new')

const showPostForm = ref(false)
const showStoryMobileNotice = ref(false)
const createTab = ref<'post' | 'story'>('post')
const mediaUrls = ref<string[]>([])
const mediaOriginalUrls = ref<string[]>([])
const mediaHasVideo = ref(false)
const handleMediaUploaded = (urls: string[], originalUrls: string[], hasVideo: boolean) => { mediaUrls.value = urls; mediaOriginalUrls.value = originalUrls; mediaHasVideo.value = hasVideo }
const showScheduleMenu = ref(false)
const isScheduling = ref(false)

// ── "Post as" entity selector ────────────────────────────────────────────────
type PostEntity = { type: 'user' } | { type: 'group'; id: string; slug: string; name: string; avatar_url: string | null }
const postAsEntity = ref<PostEntity>({ type: 'user' })
const showEntityPicker = ref(false)
// maps post id → group info for locally created group posts
const groupContextMap = reactive<Record<string, { id: string; slug: string; name: string; avatar_url: string | null }>>({}) 

// Admin/owner groups filtered for post-as selector
const adminGroups = computed(() =>
  groupsStore.managedGroups
)

const closeCreateModal = () => {
  showPostForm.value = false
  showStoryMobileNotice.value = false
  showAdvanced.value = false
  showEntityPicker.value = false
  showVisibilityMenu.value = false
  showScheduleMenu.value = false
  newPost.value = { content: '', tags: [], isNsfw: false, isAiGenerated: false, visibility: 'public', price: '', videoTitle: '', videoDescription: '' }
  mediaUrls.value = []
  mediaOriginalUrls.value = []
  mediaHasVideo.value = false
  mediaUploadRef.value?.clearAll()
}

// ── Mobile navigation ────────────────────────────────────────────────────────
const mobileHub = useMobileHubStore()
// Handle post/story triggers from MobileBottomNav (visible on all pages)
watch(() => mobileHub.openPostForm, (v) => { if (v) { showPostForm.value = true; mobileHub.consumePost() } })
watch(() => mobileHub.openStory,    (v) => { if (v) { showStoryMobileNotice.value = true; mobileHub.consumeStory() } })

// Search handled by AppHeader component

// ── Three-dot post menu ────────────────────────────────────────────────────
const openMenuId = ref<string | null>(null)
const openPostMenu = (postId: string, event: MouseEvent) => {
  event.stopPropagation()
  openMenuId.value = openMenuId.value === postId ? null : postId
}
const closeMenu = () => { openMenuId.value = null }

// ── Post edit ──────────────────────────────────────────────────────────────
const editingPostId = ref<string | null>(null)
const editContent = ref('')
const startEditPost = (post: any) => {
  editingPostId.value = post.id
  editContent.value = post.content
  openMenuId.value = null
}
const cancelEdit = () => { editingPostId.value = null; editContent.value = '' }
const saveEditPost = async (postId: string) => {
  try {
    const res = await api.patch(`/posts/${postId}`, { content: editContent.value })
    if (res.data.success) {
      const idx = posts.value.findIndex(p => p.id === postId)
      if (idx !== -1) posts.value[idx].content = editContent.value
      cancelEdit()
    }
  } catch (e) { console.error('Failed to edit post', e) }
}
const deletePostAction = async (postId: string) => {
  openMenuId.value = null
  try {
    await api.delete(`/posts/${postId}`)
    posts.value = posts.value.filter(p => p.id !== postId)
  } catch (e) { console.error('Failed to delete post', e) }
}
const reportPost = (postId: string) => {
  openMenuId.value = null
  shareToast.value = langStore.t.reportSent ?? 'Report sent'
  setTimeout(() => { shareToast.value = '' }, 2000)
}

// ── Comments toggle ────────────────────────────────────────────────────────
const expandedComments = ref<Set<string>>(new Set())
const toggleComments = (postId: string) => {
  if (expandedComments.value.has(postId)) expandedComments.value.delete(postId)
  else expandedComments.value.add(postId)
}

// ── Bookmarks ──────────────────────────────────────────────────────────────
const bookmarkedPosts = ref<any[]>([])
const isLoadingBookmarks = ref(false)
const fetchBookmarks = async () => {
  if (!auth.user?.id) return
  isLoadingBookmarks.value = true
  try {
    // Use the dedicated favourites endpoint — do not fetch all posts
    const res = await api.get(`/posts/user/${auth.user.id}/likes`)
    bookmarkedPosts.value = res.data.success ? (res.data.data.posts ?? []) : []
  } catch {} finally { isLoadingBookmarks.value = false }
}
watch(activeNav, (v) => { if (v === 'bookmarks') fetchBookmarks() })

const postObservers = new Map<string, () => void>()
const setPostRef = (el: any, postId: string) => {
  if (el && !postObservers.has(postId)) {
    const unobserve = observePost(el as HTMLElement, postId)
    postObservers.set(postId, unobserve)
  }
}
const cleanupObservers = () => { postObservers.forEach(u => u()); postObservers.clear() }

onUnmounted(() => { stopNewPostsWatch(); cleanupObservers(); disconnectWebSocket(); closeStory(); if (onlineFetchTimer) clearTimeout(onlineFetchTimer) })

const newPost = ref({ content: '', tags: [] as string[], isNsfw: false, isAiGenerated: false, visibility: 'public' as 'public' | 'subscriber_only' | 'paid', price: '' as string, videoTitle: '', videoDescription: '' })
const tagInput = ref('')
const { suggestions: tagSuggestions, showSuggestions: showTagSuggestions, fetchSuggestions: fetchTagSuggestions, clearSuggestions: clearTagSuggestions } = useTagSuggestions()

// Auto-pick up "#hashtag"s the user writes directly in the post text (only once
// they've finished typing the word, not on every keystroke of a partial one)
watch(() => newPost.value.content, (content) => {
  for (const tag of extractCommittedHashtags(content)) {
    if (!newPost.value.tags.includes(tag)) newPost.value.tags.push(tag)
  }
})

const showAdvanced = ref(false)
const showVisibilityMenu = ref(false)

// ── @mention helpers ─────────────────────────────────────────────────────────
type MentionSegment = { type: 'text' | 'mention'; key: number; text: string; username?: string }
const parseMentions = (content: string): MentionSegment[] => {
  const parts = content.split(/(@\w+(?:-\w+)*)/g)
  return parts.map((part, i) => {
    if (/^@\w+(?:-\w+)*$/.test(part)) return { type: 'mention', key: i, text: part, username: part.slice(1) }
    return { type: 'text', key: i, text: part }
  })
}
const goToMention = async (username: string) => {
  try {
    const res = await api.get(`/users/search?q=${encodeURIComponent(username)}`)
    const users: any[] = res.data.data?.users ?? []
    const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase())
    if (found) router.push(`/profile/${found.username}`)
  } catch {}
}

const categories = [
  { id: 'digital_art', label: 'digitalArt' },
  { id: 'photography', label: 'photography' },
  { id: '3d', label: 'threeD' },
  { id: 'animation', label: 'animation' },
  { id: 'writing', label: 'writing' },
  { id: 'other', label: 'other' }
]

let searchDebounce: ReturnType<typeof setTimeout>
const onHeaderSearch = () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(() => fetchPosts(), 300) }

// Ждём очистки сессии: иначе guard видит ещё живой токен и редиректит с /login обратно на главную
const handleLogout = async () => { await auth.logout(); router.push({ name: 'login' }) }

// ── Post status (repawed / favourited / userVote) ────────────────────────────
const postStatus = reactive<Record<string, { repawed: boolean; favourited: boolean; repawCount: number; userVote: 1 | -1 | 0 }>>({})
const votePendingIds = new Set<string>()

const initPostStatus = (loadedPosts: any[]) => {
  loadedPosts.forEach(p => {
    if (!postStatus[p.id]) {
      postStatus[p.id] = {
        repawed: false,
        favourited: false,
        repawCount: p._count?.repaws ?? 0,
        userVote: 0,
      }
    }
    // populate groupContextMap from API-returned groupPosts relation
    if (p.groupPosts?.[0]?.group && !groupContextMap[p.id]) {
      const g = p.groupPosts[0].group
      groupContextMap[p.id] = { id: g.id, slug: g.slug, name: g.name, avatar_url: g.avatar_url }
    }
  })
  // fetch server status in background
  const ids = loadedPosts.map(p => p.id).join(',')
  if (!ids) return
  api.get(`/posts/status?ids=${ids}`).then(res => {
    if (res.data.success) {
      res.data.data.forEach((s: any) => {
        if (postStatus[s.id]) {
          postStatus[s.id].repawed = s.repawed
          postStatus[s.id].favourited = s.favourited
          postStatus[s.id].userVote = s.userVote ?? 0
        }
      })
    }
  }).catch(() => {})
}

const currentPage = ref(1)
const isFetchingMore = ref(false)
const hasMorePosts = ref(true)

// URL запроса ленты для текущей вкладки; общий для загрузки страниц и проверки новых постов.
const feedRequestUrl = (page: number): string => {
  const params = new URLSearchParams()
  params.append('page', page.toString())
  params.append('nsfw', nsfwMode.value)
  switch (feedMode.value) {
    case 'for-you': return `/posts/personalized?${params}`
    case 'subscriptions': return `/follows/feed?${params}`
    case 'trending':
      params.append('sort', 'hot')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      return `/posts?${params}`
    case 'news':
      params.append('sort', 'new')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      return `/posts?${params}`
    case 'photos':
      params.append('hasMedia', 'true')
      return `/posts?${params}`
    case 'nsfw':
      return `/posts?nsfw=show&page=${page}`
    default:
      if (searchQuery.value) params.append('search', searchQuery.value)
      if (selectedCategory.value) params.append('category', selectedCategory.value)
      if (selectedTag.value) params.append('tag', selectedTag.value)
      params.append('sort', sortBy.value)
      return `/posts?${params}`
  }
}

const fetchPosts = async (loadMore = false) => {
  if (loadMore) {
    if (isFetchingMore.value || !hasMorePosts.value) return;
    isFetchingMore.value = true;
    currentPage.value++;
  } else {
    isLoadingPosts.value = true;
    currentPage.value = 1;
    hasMorePosts.value = true;
  }
  
  try {
    const res = await api.get(feedRequestUrl(currentPage.value))
    let loadedPosts: any[] = []
    if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    if (!loadMore) { newPostsCount.value = 0; lastFeedCheck = Date.now() }

    // Отфильтровываем посты с удалёнными/null авторами — но не групповые (у них author
    // намеренно скрыт бэкендом через maskGroupAuthor, это не значит "автор удалён")
    // «Есть ли ещё страницы» решаем по ответу сервера, а не по результату клиентской фильтрации:
    // иначе страница, где все посты отсеялись, обрывает бесконечную прокрутку.
    const serverPageWasEmpty = loadedPosts.length === 0
    loadedPosts = loadedPosts.filter((p: any) => p && (p.author || (p.groupPosts && p.groupPosts.length > 0)))

    if (serverPageWasEmpty) {
      hasMorePosts.value = false;
    } else {
      if (loadMore) {
        // Лента сдвигается, пока пользователь читает (появляются новые посты) — отсекаем повторы на стыке страниц
        const known = new Set(posts.value.map((p: any) => p.id))
        const fresh = loadedPosts.filter((p: any) => !known.has(p.id))
        posts.value = [...posts.value, ...fresh];
      } else {
        posts.value = loadedPosts;
      }
      initPostStatus(loadedPosts)
      fetchFollowStatusForPosts(loadedPosts)
    }
  } catch (e) {
    console.error('Failed to fetch posts', e)
  } finally {
    isLoadingPosts.value = false
    isFetchingMore.value = false
  }
}


// ── Свежесть ленты (как в большинстве соцсетей) ──────────────────────────────
// Раз в минуту и при возврате на вкладку тихо проверяем первую страницу; если есть посты новее
// самого свежего из показанных — не двигаем ленту под пальцем, а показываем плашку «Новые посты».
const NEW_POSTS_POLL_MS = 60_000
const newPostsCount = ref(0)
let lastFeedCheck = Date.now()
let newPostsTimer: ReturnType<typeof setInterval> | null = null

const checkNewPosts = async () => {
  if (isLoadingPosts.value || isFetchingMore.value || activeNav.value !== 'home') return
  const newest = posts.value.reduce((m: number, p: any) => Math.max(m, new Date(p.created_at).getTime() || 0), 0)
  if (!newest) return
  lastFeedCheck = Date.now()
  const mode = feedMode.value
  try {
    const res = await api.get(feedRequestUrl(1))
    if (mode !== feedMode.value || !res.data.success) return
    const fresh = (res.data.data.posts as any[]).filter((p) => p && new Date(p.created_at).getTime() > newest)
    newPostsCount.value = fresh.length
  } catch {}
}

const showNewPosts = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  fetchPosts()
}

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible' && Date.now() - lastFeedCheck > NEW_POSTS_POLL_MS) checkNewPosts()
}

const startNewPostsWatch = () => {
  stopNewPostsWatch()
  newPostsTimer = setInterval(() => { if (document.visibilityState === 'visible') checkNewPosts() }, NEW_POSTS_POLL_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
}
const stopNewPostsWatch = () => {
  if (newPostsTimer) clearInterval(newPostsTimer)
  newPostsTimer = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

// Global infinite scroll listener
const handleScroll = () => {
  const bottomOfWindow = document.documentElement.scrollTop + window.innerHeight >= document.documentElement.offsetHeight - 200;
  if (bottomOfWindow && !isLoadingPosts.value && !isFetchingMore.value && hasMorePosts.value) {
    fetchPosts(true);
  }
}

// Listener + WS are (re)attached in onActivated/onDeactivated below, not here —
// this view is kept alive (see App.vue) so its feed/scroll survives navigating
// away and back; onMounted only runs once, so resource setup lives where it
// actually needs to run on every re-entry.

const selectedTag = ref('')
watch([selectedCategory, sortBy, nsfwMode, feedMode, selectedTag], () => { fetchPosts() })
// The NSFW tab only exists in 'show' mode — leaving that mode must not strand the user on it.
watch(nsfwEnabled, (on) => { if (!on && feedMode.value === 'nsfw') feedMode.value = 'for-you' })

// Notifications handled by AppHeader component

// ── Follow status on post authors ────────────────────────────────────────────
const followStatus = reactive<Record<string, boolean>>({})

const fetchFollowStatusForPosts = async (loadedPosts: any[]) => {
  if (!auth.user) return
  const authorIds = [...new Set(loadedPosts.map((p: any) => p.author?.id).filter((id: string | undefined): id is string => !!id && id !== auth.user?.id))]
  if (!authorIds.length) return
  try {
    const res = await api.get(`/follows/check-bulk?ids=${authorIds.join(',')}`)
    if (res.data.success) {
      Object.entries(res.data.data).forEach(([id, val]) => { followStatus[id] = val as boolean })
    }
  } catch {}
}

const toggleFollow = async (userId: string) => {
  try {
    const res = await api.post(`/follows/${userId}/toggle`)
    if (res.data.success) { followStatus[userId] = res.data.data.following; invalidateFriendsCache() }
  } catch {}
}

// Optimistic follow for the recommended list: flip immediately, roll back on failure.
const followRecommended = async (userId: string) => {
  const prev = !!followStatus[userId]
  followStatus[userId] = !prev
  try {
    const res = await api.post(`/follows/${userId}/toggle`)
    if (!res.data.success) throw new Error('follow failed')
    followStatus[userId] = res.data.data.following
    invalidateFriendsCache()
  } catch {
    followStatus[userId] = prev
  }
}

// ── Active Ads ───────────────────────────────────────────────────────────────
// Реклама доступна только на Free (монетизация) и Business (предложение разместить
// свою рекламу вместо чужой). На Lite/Pro реклама скрыта — это преимущество подписки.
const activeAds = ref<any[]>([])
const adSlotMode = computed<'ads' | 'offer' | 'hidden'>(() => {
  const tier = auth.user?.subscription_tier ?? 'free'
  if (tier === 'lite' || tier === 'pro') return 'hidden'
  if (tier === 'business') return 'offer'
  return 'ads'
})
const fetchActiveAds = async () => {
  if (adSlotMode.value !== 'ads') return
  try {
    const res = await api.get('/admin/ads/active')
    if (res.data.success) activeAds.value = res.data.data.ads
  } catch {}
}

// ── Recommended users (from DB) ──────────────────────────────────────────────
const recommendedUsers = ref<any[]>([])
const isLoadingRecommended = ref(true)
// Скрываем AD-профили если NSFW выключен
const visibleRecommendedUsers = computed(() =>
  nsfwEnabled.value
    ? recommendedUsers.value
    : recommendedUsers.value.filter((u: any) => u.role !== 'ad')
)
const fetchRecommendedUsers = async () => {
  isLoadingRecommended.value = true
  try {
    const res = await api.get('/users/recommended')
    if (res.data.success) {
      recommendedUsers.value = res.data.data.users
      // Fetch follow status for these users
      const ids = recommendedUsers.value.map((u: any) => u.id)
      if (ids.length) {
        const r = await api.get(`/follows/check-bulk?ids=${ids.join(',')}`)
        if (r.data.success) {
          Object.entries(r.data.data).forEach(([id, val]) => { followStatus[id] = val as boolean })
        }
        // Fetch online status
        fetchOnlineStatus(ids)
      }
    }
  } catch {
    recommendedUsers.value = []
  } finally {
    isLoadingRecommended.value = false
  }
}

// ── Upcoming events (real from groups/events API) ──────────────────────────
const upcomingEvents = ref<any[]>([])
const isLoadingEvents = ref(false)
const fetchTrendingEvents = async () => {
  isLoadingEvents.value = true
  try {
    const userCountry = auth.user?.country || ''
    const res = await api.get('/groups/events', {
      params: { upcoming: true, sort: 'popular', limit: 6, location: userCountry || undefined }
    })
    let events = res.data?.data?.events ?? []
    // If user has country/location, try to boost local events to top
    if (userCountry) {
      const loc = userCountry.toLowerCase()
      events.sort((a: any, b: any) => {
        const aLocal = (a.location_name || '').toLowerCase().includes(loc) ? 1 : 0
        const bLocal = (b.location_name || '').toLowerCase().includes(loc) ? 1 : 0
        if (bLocal !== aLocal) return bLocal - aLocal
        // Then by attendee count desc
        if (b.attendee_count !== a.attendee_count) return b.attendee_count - a.attendee_count
        // Then by nearest date
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      })
    }
    // If country filter returned nothing, reload without it
    if (!events.length && userCountry) {
      const res2 = await api.get('/groups/events', {
        params: { upcoming: true, sort: 'popular', limit: 6 }
      })
      events = res2.data?.data?.events ?? []
    }
    upcomingEvents.value = events
  } catch {}
  isLoadingEvents.value = false
}

// Format event date range nicely
function formatEventDate(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  const day = (d: Date) => d.getDate()
  const mon = (d: Date) => months[d.getMonth()]
  const time = (d: Date) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  // Same day
  if (s.toDateString() === e.toDateString()) {
    return `${day(s)} ${mon(s)} ${time(s)} – ${time(e)}`
  }
  // Same month
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${day(s)} – ${day(e)} ${mon(s)} ${s.getFullYear()}`
  }
  return `${day(s)} ${mon(s)} – ${day(e)} ${mon(e)} ${e.getFullYear()}`
}

// ── Trending hashtags (with stats + trend direction) ─────────────────────────
const trendingTags = ref<Array<{
  name: string
  totalCount: number
  monthCount: number
  prevMonthCount: number
  isNsfw: boolean
  trend: 'up' | 'down' | 'stable'
}>>([]
)
const isFetchingTags = ref(false)
const fetchTrendingTags = async () => {
  isFetchingTags.value = true
  try {
    const res = await api.get('/posts/trending-tags', {
      params: { includeNsfw: nsfwEnabled.value ? 'true' : 'false' },
    })
    if (res.data.success) trendingTags.value = res.data.data.tags
  } catch {} finally { isFetchingTags.value = false }
}

const addTag = () => {
  const tag = tagInput.value.trim().toLowerCase().replace(/^#/, '')
  if (tag && !newPost.value.tags.includes(tag)) newPost.value.tags.push(tag)
  tagInput.value = ''
  clearTagSuggestions()
}
const addTagFromSuggestion = (name: string) => {
  const tag = name.trim().toLowerCase()
  if (tag && !newPost.value.tags.includes(tag)) newPost.value.tags.push(tag)
  tagInput.value = ''
  clearTagSuggestions()
}
const removeTag = (t: string) => { newPost.value.tags = newPost.value.tags.filter(x => x !== t) }

const createPost = async () => {
  const content = newPost.value.content.trim()
  if (!content && mediaUrls.value.length === 0) return
  // Catch a trailing "#hashtag" that was never followed by a space/newline before hitting send
  for (const tag of extractHashtags(content)) {
    if (!newPost.value.tags.includes(tag)) newPost.value.tags.push(tag)
  }
  isPosting.value = true
  try {
    let createdPost: any = null
    if (postAsEntity.value.type === 'group') {
      const res = await groupsStore.createGroupPost(postAsEntity.value.id, {
        content,
        isNsfw: newPost.value.isNsfw,
        isAiGenerated: newPost.value.isAiGenerated,
        mediaUrls: mediaUrls.value,
        mediaOriginalUrls: mediaOriginalUrls.value,
        tags: newPost.value.tags,
      })
      createdPost = res
    } else {
      const res = await api.post('/posts', {
        content,
        tags: newPost.value.tags,
        isNsfw: newPost.value.isNsfw,
        isAiGenerated: newPost.value.isAiGenerated,
        subscriberOnly: newPost.value.visibility === 'subscriber_only',
        isPaid: newPost.value.visibility === 'paid',
        price: newPost.value.visibility === 'paid' && newPost.value.price ? parseFloat(newPost.value.price) : undefined,
        videoTitle: newPost.value.videoTitle.trim() || undefined,
        videoDescription: newPost.value.videoDescription.trim() || undefined,
        mediaUrls: mediaUrls.value,
        mediaOriginalUrls: mediaOriginalUrls.value,
      })
      if (res.data.success) createdPost = res.data.data?.post
    }
    if (createdPost) {
      posts.value = [createdPost, ...posts.value]
      initPostStatus([createdPost])
      if (postAsEntity.value.type === 'group') {
        const ent = postAsEntity.value as { type: 'group'; id: string; slug: string; name: string; avatar_url: string | null }
        groupContextMap[createdPost.id] = { id: ent.id, slug: ent.slug, name: ent.name, avatar_url: ent.avatar_url }
      }
    }
    newPost.value = { content: '', tags: [], isNsfw: false, isAiGenerated: false, visibility: 'public', price: '', videoTitle: '', videoDescription: '' }
    mediaUrls.value = []
    mediaOriginalUrls.value = []
    mediaHasVideo.value = false
    mediaUploadRef.value?.clearAll()
    showPostForm.value = false
    showVisibilityMenu.value = false
    shareToast.value = postAsEntity.value.type === 'group'
      ? `Пост опубликован от имени «${postAsEntity.value.name}»`
      : 'Пост опубликован'
    setTimeout(() => { shareToast.value = '' }, 1800)
    await fetchTrendingTags()
  } catch (e) { console.error('Failed to create post', e) }
  finally { isPosting.value = false }
}

// ── Scheduled posts / drafts ─────────────────────────────────────────────────
const saveScheduledPost = async (payload: { scheduledAt?: string; timezone?: string }) => {
  const content = newPost.value.content.trim()
  if (!content && mediaUrls.value.length === 0) return
  for (const tag of extractHashtags(content)) {
    if (!newPost.value.tags.includes(tag)) newPost.value.tags.push(tag)
  }
  isScheduling.value = true
  try {
    const res = await api.post('/posts/scheduled', {
      content,
      groupId: postAsEntity.value.type === 'group' ? postAsEntity.value.id : undefined,
      tags: newPost.value.tags,
      isNsfw: newPost.value.isNsfw,
      isAiGenerated: newPost.value.isAiGenerated,
      mediaUrls: mediaUrls.value,
      mediaOriginalUrls: mediaOriginalUrls.value,
      ...payload,
    })
    if (res.data.success) {
      closeCreateModal()
      shareToast.value = payload.scheduledAt ? 'Публикация запланирована' : 'Сохранено в черновики'
      setTimeout(() => { shareToast.value = '' }, 1800)
    }
  } catch (e) { console.error('Failed to schedule post', e) }
  finally { isScheduling.value = false }
}

// Closing the composer with unsent text/media shouldn't just throw it away — auto-save it as
// a draft (same as an explicit "Сохранить в черновики"), the way most social apps preserve an
// unsent post. Only fires on genuinely unsaved content, never after a successful publish/schedule
// (those paths already clear newPost themselves before reaching this).
const abandonCompose = async () => {
  const content = newPost.value.content.trim()
  if (!content && mediaUrls.value.length === 0) {
    closeCreateModal()
    return
  }
  try {
    await api.post('/posts/scheduled', {
      content,
      groupId: postAsEntity.value.type === 'group' ? postAsEntity.value.id : undefined,
      tags: newPost.value.tags,
      isNsfw: newPost.value.isNsfw,
      isAiGenerated: newPost.value.isAiGenerated,
      mediaUrls: mediaUrls.value,
      mediaOriginalUrls: mediaOriginalUrls.value,
    })
    shareToast.value = 'Незаконченный пост сохранён в черновики'
    setTimeout(() => { shareToast.value = '' }, 1800)
  } catch (e) { console.error('Failed to auto-save draft', e) }
  finally { closeCreateModal() }
}

const votePost = async (postId: string, value: 1 | -1) => {
  if (votePendingIds.has(postId)) return
  votePendingIds.add(postId)
  // Optimistic update
  const prev = postStatus[postId]?.userVote ?? 0
  const next: 1 | -1 | 0 = prev === value ? 0 : value
  if (postStatus[postId]) postStatus[postId].userVote = next
  try {
    const res = await api.post(`/posts/${postId}/vote`, { value })
    if (res.data.success) {
      const idx = posts.value.findIndex(p => p.id === postId)
      if (idx !== -1) posts.value[idx].rating = res.data.data.rating
    }
  } catch (e) {
    // rollback on error
    if (postStatus[postId]) postStatus[postId].userVote = prev
    console.error('Failed to vote', e)
  } finally {
    votePendingIds.delete(postId)
  }
}

const toggleRepaw = async (postId: string) => {
  try {
    const res = await api.post(`/posts/${postId}/repaw`)
    if (res.data.success && postStatus[postId]) {
      postStatus[postId].repawed = res.data.data.repawed
      postStatus[postId].repawCount = res.data.data.repaw_count
    }
  } catch (e) { console.error('Failed to repaw', e) }
}

const toggleFavourite = async (postId: string) => {
  try {
    const res = await api.post(`/posts/${postId}/favourite`)
    if (res.data.success && postStatus[postId]) {
      postStatus[postId].favourited = res.data.data.favourited
    }
  } catch (e) { console.error('Failed to favourite', e) }
}

const shareToast = ref('')
const sharePost = async (postId: string) => {
  const url = `${window.location.origin}/post/${postId}`
  try {
    if (navigator.share) {
      await navigator.share({ url })
    } else {
      await navigator.clipboard.writeText(url)
      shareToast.value = langStore.t.copied ?? 'Copied!'
      setTimeout(() => { shareToast.value = '' }, 2000)
    }
  } catch {}
}

const formatDate = (dateString: string) => new Intl.DateTimeFormat(langStore.currentLang === 'RU' ? 'ru-RU' : 'en-US', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(dateString))

// ── Stories ───────────────────────────────────────────────────────────────
interface StoryItem {
  id: string
  image_url: string | null
  created_at: string
  expires_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}
const storiesBarRef = ref<InstanceType<typeof StoriesBar> | null>(null)
// Grouped stories for viewer: [[userA stories], [userB stories], …]
const storyGroups = ref<StoryItem[][]>([])
const storyViewerOpen = ref(false)
const storyViewerGroupIdx = ref(0)
const storyViewerStoryIdx = ref(0)

const openStoryViewer = (story: StoryItem, group: StoryItem[]) => {
  // Build full groups list from the storiesBar data, keeping the same order
  // as the bar renders them.
  const userGroups = storiesBarRef.value?.userStories as StoryItem[][] | undefined
  const allGroups: StoryItem[][] = []
  if (userGroups && userGroups.length) allGroups.push(...userGroups)

  if (allGroups.length) {
    storyGroups.value = allGroups
    const gIdx = allGroups.findIndex(g => g[0].user.id === story.user.id)
    storyViewerGroupIdx.value = gIdx >= 0 ? gIdx : 0
  } else {
    storyGroups.value = [group]
    storyViewerGroupIdx.value = 0
  }
  storyViewerStoryIdx.value = group.findIndex(s => s.id === story.id) ?? 0
  storyViewerOpen.value = true
}

const closeStory = () => {
  storyViewerOpen.value = false
}

// ── Lightbox ──────────────────────────────────────────────────────────────
const lightboxImages = ref<string[]>([])
const lightboxStart = ref(0)
const lightboxOpen = ref(false)

const openLightbox = (urls: string[], idx: number) => {
  lightboxImages.value = urls
  lightboxStart.value = idx
  lightboxOpen.value = true
}

// ── WebSocket ─────────────────────────────────────────────────────────────
const isOnline = ref(false)
// Online status for other users: userId -> boolean
const onlineStatus = reactive<Record<string, boolean>>({})
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsPingTimer: ReturnType<typeof setInterval> | null = null
let wsDestroyed = false

// Fetch online status for a list of user IDs (de-bounced batch)
let onlineFetchTimer: ReturnType<typeof setTimeout> | null = null
const pendingOnlineIds = new Set<string>()
const fetchOnlineStatus = (ids: string[]) => {
  ids.forEach(id => pendingOnlineIds.add(id))
  if (onlineFetchTimer) return
  onlineFetchTimer = setTimeout(async () => {
    onlineFetchTimer = null
    const batchIds = Array.from(pendingOnlineIds)
    pendingOnlineIds.clear()
    if (!batchIds.length) return
    try {
      const res = await api.get(`/users/online?ids=${batchIds.join(',')}`)
      if (res.data.success) {
        Object.entries(res.data.data).forEach(([id, val]) => { onlineStatus[id] = val as boolean })
      }
    } catch {}
  }, 500)
}

const disconnectWebSocket = () => {
  wsDestroyed = true
  if (wsReconnectTimer !== null) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  if (wsPingTimer !== null) { clearInterval(wsPingTimer); wsPingTimer = null }
  if (ws) {
    ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    ws = null
  }
}

const scheduleReconnect = () => {
  if (wsDestroyed || wsReconnectTimer !== null) return
  wsReconnectTimer = setTimeout(() => { wsReconnectTimer = null; connectWebSocket() }, 5000)
}

const connectWebSocket = () => {
  if (wsDestroyed) return
  if (ws) {
    ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    ws = null
  }
  if (wsPingTimer !== null) { clearInterval(wsPingTimer); wsPingTimer = null }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${window.location.host}/api/`)
  ws.onopen = () => {
    isOnline.value = true
    // Authenticate so the server can track this user as online
    if (auth.token && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'auth', token: auth.token }))
    }
    wsPingTimer = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })) }, 30_000)
  }
  ws.onclose = () => { isOnline.value = false; if (wsPingTimer !== null) { clearInterval(wsPingTimer); wsPingTimer = null }; scheduleReconnect() }
  ws.onerror = () => {}
  ws.onmessage = (event) => { try { const d = JSON.parse(event.data); if (d?.type === 'pong' || d?.type === 'auth_ok' || d?.type === 'auth_err') return } catch {} }
}

// reset drag state when modal closes
watch(showPostForm, (v) => { if (!v) { dragCounter = 0; formDragging.value = false; showEntityPicker.value = false } })
watch(nsfwMode, () => { fetchTrendingTags() })

onMounted(() => {
  fetchPosts(); fetchRecommendedUsers(); fetchTrendingEvents(); fetchTrendingTags(); fetchActiveAds()
  if (auth.user && !groupsStore.myGroups.length) groupsStore.loadMyGroups().catch(() => {})
  if (auth.user && !groupsStore.mySubscriptions.length) groupsStore.loadMySubscriptions().catch(() => {})
})

// ── Keep-alive re-entry ──────────────────────────────────────────────────────
// MainLayout is cached by <KeepAlive> (see App.vue) so the feed + scroll position
// survive navigating away and back. onMounted only fires once (first entry), so
// resources that must be live only while this view is actually on screen —
// the WebSocket connection and the infinite-scroll listener — are (re)opened
// here and torn down in onDeactivated instead of onUnmounted.
let savedScrollY: number | null = null
// Guards against showing a stale, cached feed if the user logs out and a
// different account logs back in without this view ever being truly destroyed.
let fetchedForUserId: string | null | undefined = auth.user?.id ?? null
onActivated(() => {
  if (auth.user?.id !== fetchedForUserId) {
    fetchedForUserId = auth.user?.id ?? null
    savedScrollY = null
    fetchPosts()
  }
  wsDestroyed = false
  connectWebSocket()
  window.addEventListener('scroll', handleScroll)
  startNewPostsWatch()
  if (Date.now() - lastFeedCheck > NEW_POSTS_POLL_MS) checkNewPosts()
  if (savedScrollY !== null) {
    const y = savedScrollY
    savedScrollY = null
    // Run after Vue Router's own scrollBehavior (which resets to top on a
    // regular push navigation) has had its chance to run first.
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
  }
})
onDeactivated(() => {
  savedScrollY = window.scrollY
  disconnectWebSocket()
  stopNewPostsWatch()
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito selection:bg-brand-accent/30" @click="closeMenu">

    <!-- Share toast -->
    <div v-if="shareToast" class="fixed top-20 left-1/2 -translate-x-1/2 z-500 px-5 py-2.5 bg-brand-success text-white text-sm font-bold rounded-full shadow-xl pointer-events-none">
      {{ shareToast }}
    </div>

    <!-- Header -->
    <AppHeader :nsfw-mode="nsfwEnabled" />

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8">
      <!-- Left Sidebar -->
      <AppSidebar v-model:activeNav="activeNav">
        <template #bottom>
          <div v-if="adSlotMode !== 'hidden'" class="stack-y-3">
            <template v-if="adSlotMode === 'ads'">
              <AdSlot v-for="ad in activeAds" :key="ad.id" :ad="ad" />
            </template>
            <AdSlot v-else-if="adSlotMode === 'offer'" :ad="null" />
          </div>
        </template>
      </AppSidebar>

      <!-- Main Content -->
      <main class="flex-1 min-w-0 stack-y-4 md:stack-y-5 pb-28 md:pb-20 max-w-2xl w-full">

        <!-- ── BOOKMARKS VIEW ────────────────────────────────────────────── -->
        <div v-if="activeNav === 'bookmarks'">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 shadow-xl mb-5 flex items-center gap-3">
            <BIcon name="Bookmark" class="w-6 h-6 text-brand-yellow" />
            <h2 class="text-xl font-bold text-white">{{ langStore.t.bookmarks }}</h2>
          </div>
          <div v-if="isLoadingBookmarks" class="stack-y-4">
            <SkeletonPost v-for="n in 3" :key="n" />
          </div>
          <div v-else-if="bookmarkedPosts.length === 0" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
            <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon name="Bookmark" class="w-10 h-10 text-white/55" />
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noBookmarks }}</h3>
            <p class="text-white/55">{{ langStore.t.saveToBookmarks }}</p>
          </div>
          <div v-else class="stack-y-4">
            <PostCard
              v-for="post in bookmarkedPosts"
              :key="post.id"
              :post="post"
              @deleted="(id: string) => { bookmarkedPosts = bookmarkedPosts.filter((p: any) => p.id !== id) }"
              @updated="(p: any) => { const idx = bookmarkedPosts.findIndex((x: any) => x.id === p.id); if (idx !== -1) bookmarkedPosts[idx] = p }"
            />
          </div>
        </div>

        <!-- ── MAIN FEED ─────────────────────────────────────────────────── -->
        <template v-else>

        <!-- Stories -->
        <StoriesBar
          ref="storiesBarRef"
          @open="openStoryViewer"
          @create="showStoryMobileNotice = true"
        />

        <!-- Create Post Window -->
        <div
          class="bg-brand-card border rounded-3xl shadow-xl transition-colors"
          :class="showPostForm ? 'border-brand-accent/30' : 'border-brand-border'"
          @dragenter.prevent="showPostForm = true; onFormDragEnter($event)"
          @dragleave.prevent="onFormDragLeave"
          @dragover.prevent
          @drop="onFormDrop"
        >
          <!-- Collapsed trigger -->
          <button
            v-if="!showPostForm"
            @click="showPostForm = true"
            class="w-full flex items-center gap-3 px-5 py-4 max-md:px-4 max-md:py-3 text-left group"
          >
            <!-- Entity avatar -->
            <template v-if="postAsEntity.type === 'group'">
              <img v-if="postAsEntity.avatar_url" :src="postAsEntity.avatar_url"
                class="w-10 h-10 rounded-xl border-2 border-brand-border object-cover shrink-0 group-hover:border-brand-accent/50 transition-colors"
                @error="onAvatarError" />
              <div v-else class="w-10 h-10 rounded-xl border-2 border-brand-border shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">
                {{ (postAsEntity.name || '?')[0].toUpperCase() }}
              </div>
            </template>
            <template v-else>
              <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover shrink-0 group-hover:border-brand-accent/50 transition-colors" @error="onAvatarError" />
              <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
            </template>
            <span class="flex-1 flex items-center justify-between gap-2 min-w-0 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">
              <span class="truncate">{{ postAsEntity.type === 'group' ? `${postAsEntity.name}…` : langStore.t.whatsNew }}</span>
              <span class="flex items-center gap-2 text-white/35 group-hover:text-white/60 transition-colors shrink-0">
                <BIcon name="ImagePlus" class="w-4 h-4" />
                <BIcon name="Hash" class="w-4 h-4" />
              </span>
            </span>
          </button>

          <!-- Expanded composer -->
          <div v-else class="p-5 max-md:p-4 stack-y-4">
            <!-- Author + textarea + send (mobile: avatar & buttons on top, full-width textarea below) -->
            <div class="flex items-start gap-3 max-md:flex-wrap max-md:items-center max-md:gap-2">
              <!-- Entity avatar — кликабельна если есть группы -->
              <div class="relative shrink-0 mt-0.5">
                <!-- Clickable avatar -->
                <button
                  v-if="adminGroups.length"
                  @click.stop="showEntityPicker = !showEntityPicker"
                  class="flex items-center gap-1 focus:outline-hidden group/av"
                >
                  <template v-if="postAsEntity.type === 'group'">
                    <img v-if="postAsEntity.avatar_url" :src="postAsEntity.avatar_url"
                      class="w-10 h-10 rounded-xl border-2 object-cover transition-colors"
                      :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'"
                      @error="onAvatarError" />
                    <div v-else class="w-10 h-10 rounded-xl border-2 border-brand-border flex items-center justify-center text-brand-accent font-bold bg-brand-accent/20 transition-colors"
                      :class="showEntityPicker ? 'border-brand-accent' : 'group-hover/av:border-brand-accent/60'">
                      {{ (postAsEntity.name || '?')[0].toUpperCase() }}
                    </div>
                  </template>
                  <template v-else>
                    <img v-if="auth.avatarUrl" :src="auth.avatarUrl"
                      class="w-10 h-10 rounded-full border-2 object-cover transition-colors"
                      :class="showEntityPicker ? 'border-brand-accent' : 'border-brand-border group-hover/av:border-brand-accent/60'"
                      @error="onAvatarError" />
                    <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex items-center justify-center text-brand-accent font-bold bg-brand-accent/20 transition-colors"
                      :class="showEntityPicker ? 'border-brand-accent' : 'group-hover/av:border-brand-accent/60'">
                      {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
                    </div>
                  </template>
                  <!-- Chevron next to avatar -->
                  <BIcon name="ChevronDown" class="w-3.5 h-3.5 text-white/50 group-hover/av:text-white/80 transition-all"
                    :class="showEntityPicker ? 'rotate-180 text-brand-accent' : ''" />
                </button>

                <!-- Non-clickable avatar (no groups) -->
                <template v-else>
                  <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover" @error="onAvatarError" />
                  <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex items-center justify-center text-brand-accent font-bold bg-brand-accent/20">
                    {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
                  </div>
                </template>

                <!-- Dropdown -->
                <Transition name="slide">
                  <div v-if="showEntityPicker" v-click-outside="() => showEntityPicker = false"
                    class="absolute top-full left-0 mt-2 z-30 min-w-[220px] bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1.5">
                    <!-- User option -->
                    <button class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg/60 transition-colors text-sm"
                      :class="postAsEntity.type === 'user' ? 'text-brand-accent' : 'text-white'"
                      @click="postAsEntity = { type: 'user' }; showEntityPicker = false">
                      <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-7 h-7 rounded-full object-cover shrink-0" @error="onAvatarError" />
                      <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold shrink-0">
                        {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
                      </div>
                      <span class="font-semibold truncate flex-1 text-left">{{ auth.user?.display_name || auth.user?.username }}</span>
                      <BIcon v-if="postAsEntity.type === 'user'" name="Check" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
                    </button>
                    <div class="h-px bg-brand-border mx-3 my-1" />
                    <!-- Admin groups -->
                    <button v-for="grp in adminGroups" :key="grp.id"
                      class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-brand-bg/60 transition-colors text-sm"
                      :class="postAsEntity.type === 'group' && postAsEntity.id === grp.id ? 'text-brand-accent' : 'text-white'"
                      @click="postAsEntity = { type: 'group', id: grp.id, slug: grp.slug, name: grp.name, avatar_url: grp.avatar_url }; showEntityPicker = false">
                      <img v-if="grp.avatar_url" :src="grp.avatar_url" class="w-7 h-7 rounded-xl object-cover shrink-0" @error="onAvatarError" />
                      <div v-else class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center text-brand-accent text-sm font-bold shrink-0">
                        {{ (grp.name || '?')[0].toUpperCase() }}
                      </div>
                      <span class="font-semibold truncate flex-1 text-left">{{ grp.name }}</span>
                      <span class="text-[9px] text-brand-accent/70 bg-brand-accent/10 border border-brand-accent/25 px-1.5 py-0.5 rounded-sm font-bold uppercase shrink-0">{{ langStore.t.groups }}</span>
                      <BIcon v-if="postAsEntity.type === 'group' && postAsEntity.id === grp.id" name="Check" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
                    </button>
                  </div>
                </Transition>
              </div>
              <div class="flex-1 min-w-0 max-md:order-last max-md:basis-full">
                <MentionTextarea
                  v-model="newPost.content"
                  placeholder="Что у вас нового? Используйте @ для упоминаний"
                  minHeight="90px"
                />
              </div>
              <!-- Schedule button -->
              <div class="relative shrink-0 mt-0.5 max-md:mt-0 max-md:ml-auto">
                <button
                  @click.stop="showScheduleMenu = !showScheduleMenu"
                  :disabled="(!newPost.content.trim() && mediaUrls.length === 0) || isScheduling"
                  class="w-10 h-10 rounded-full flex items-center justify-center border border-brand-border text-white/60 hover:bg-brand-bg hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Отложить публикацию"
                >
                  <BIcon v-if="isScheduling" name="Loader2" class="w-4.5 h-4.5 animate-spin" />
                  <BIcon v-else name="CalendarClock" class="w-4.5 h-4.5" />
                </button>
                <PostScheduleMenu
                  v-if="showScheduleMenu"
                  @close="showScheduleMenu = false"
                  @draft="saveScheduledPost({})"
                  @schedule="(p) => saveScheduledPost(p)"
                />
              </div>

              <!-- Send button (top-right) -->
              <button
                @click="createPost"
                :disabled="(!newPost.content.trim() && mediaUrls.length === 0) || isPosting"
                class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 shrink-0 mt-0.5 max-md:mt-0"
                title="Опубликовать"
              >
                <BIcon v-if="isPosting" name="Loader2" class="w-5 h-5 animate-spin" />
                <BIcon v-else name="SendHorizontal" class="w-5 h-5" />
              </button>
            </div>

            <!-- Media previews -->
            <MediaUpload
              ref="mediaUploadRef"
              type="posts"
              :multiple="true"
              :max-files="20"
              @uploaded="handleMediaUploaded"
            />

            <!-- Drag hint -->
            <div v-if="formDragging" class="flex items-center gap-2 rounded-2xl border border-dashed border-brand-accent/60 bg-brand-accent/8 px-4 py-3 text-xs text-brand-accent font-semibold">
              <BIcon name="UploadCloud" class="w-4 h-4" />
              Отпустите файл, чтобы прикрепить к посту
            </div>

            <!-- Tags row -->
            <div v-if="newPost.tags.length" class="flex flex-wrap gap-1.5">
              <button
                v-for="tag in newPost.tags"
                :key="tag"
                type="button"
                @click="removeTag(tag)"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold hover:bg-brand-accent/25 transition-colors"
              >
                #{{ tag }}
                <BIcon name="X" class="w-3 h-3 text-brand-accent/60" />
              </button>
            </div>

            <!-- Divider -->
            <div class="border-t border-brand-border" />

            <!-- Toolbar + publish -->
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Media -->
              <button
                @click="mediaUploadRef?.openPicker()"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all"
                title="Прикрепить медиа"
              >
                <BIcon name="ImagePlus" class="w-4 h-4" />
                Медиа
              </button>

              <!-- Tag input -->
              <div class="relative inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-bg transition-all">
                <BIcon name="Hash" class="w-4 h-4 text-white/55 shrink-0" />
                <input
                  type="text"
                  v-model="tagInput"
                  @input="fetchTagSuggestions(tagInput)"
                  @keydown.enter.prevent="addTag"
                  @keydown.escape="clearTagSuggestions"
                  placeholder="тег + Enter"
                  class="bg-transparent text-xs text-white placeholder-brand-muted outline-hidden w-24"
                />

                <!-- Tag suggestions, ranked by usage -->
                <div v-if="showTagSuggestions" v-click-outside="clearTagSuggestions"
                  class="absolute top-full left-0 mt-1.5 z-30 w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                  <button v-for="s in tagSuggestions" :key="s.name"
                    @click="addTagFromSuggestion(s.name)"
                    class="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-white hover:bg-white/5">
                    <span class="truncate">#{{ s.name }}</span>
                    <span class="text-xs text-white/35 shrink-0">{{ s.count }}</span>
                  </button>
                </div>
              </div>

              <!-- NSFW toggle -->
              <button
                @click="newPost.isNsfw = !newPost.isNsfw"
                class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                :class="newPost.isNsfw
                  ? 'border-brand-error/60 text-brand-error bg-brand-error/10'
                  : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'"
              >
                NSFW
              </button>

              <!-- AI-generated toggle -->
              <button
                @click="newPost.isAiGenerated = !newPost.isAiGenerated"
                :title="langStore.t.aiGenToggleTitle"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                :class="newPost.isAiGenerated
                  ? 'border-brand-purple/60 text-brand-purple bg-brand-purple/10'
                  : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'"
              >
                <BIcon name="Bot" class="w-3.5 h-3.5" /> {{ langStore.t.aiGenBadge }}
              </button>
            </div>

            <!-- Visibility + Cancel — own row so Cancel never wraps onto its own orphan line -->
            <div class="flex items-center justify-between gap-2 mt-2">
              <div class="relative">
                <button
                  @click.stop="showVisibilityMenu = !showVisibilityMenu"
                  class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                  :class="newPost.visibility !== 'public'
                    ? 'border-brand-accent/50 text-brand-accent bg-brand-accent/10'
                    : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'"
                >
                  <BIcon :name="newPost.visibility === 'subscriber_only' ? 'Users' : newPost.visibility === 'paid' ? 'DollarSign' : 'Globe2'" class="w-3.5 h-3.5" />
                  {{ newPost.visibility === 'subscriber_only' ? 'Только Подписчикам' : newPost.visibility === 'paid' ? 'Платный пост' : 'Видно всем' }}
                  <BIcon name="ChevronDown" class="w-3 h-3 opacity-60" />
                </button>
                <Transition name="slide">
                  <div
                    v-if="showVisibilityMenu"
                    v-click-outside="() => showVisibilityMenu = false"
                    class="absolute bottom-full left-0 mb-1.5 z-30 w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
                  >
                    <button
                      @click="newPost.visibility = 'public'; showVisibilityMenu = false"
                      class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                      :class="newPost.visibility === 'public' ? 'text-brand-accent' : 'text-white'"
                    >
                      <BIcon name="Globe2" class="w-4 h-4 shrink-0" />
                      Видно всем
                      <BIcon v-if="newPost.visibility === 'public'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                    </button>
                    <button
                      @click="newPost.visibility = 'subscriber_only'; showVisibilityMenu = false"
                      class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                      :class="newPost.visibility === 'subscriber_only' ? 'text-brand-accent' : 'text-white'"
                    >
                      <BIcon name="Users" class="w-4 h-4 shrink-0" />
                      Только Подписчикам
                      <BIcon v-if="newPost.visibility === 'subscriber_only'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                    </button>
                    <button
                      disabled
                      title="Скоро будет доступно"
                      class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/30 cursor-not-allowed"
                    >
                      <BIcon name="DollarSign" class="w-4 h-4 shrink-0" />
                      Платный пост
                      <span class="ml-auto text-[10px] uppercase tracking-wide">скоро</span>
                    </button>
                  </div>
                </Transition>
              </div>

              <!-- Cancel — auto-saves unsent text/media as a draft instead of discarding it -->
              <button
                @click="abandonCompose"
                class="text-xs font-semibold text-white/55 hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>

            <!-- Paid post extra fields -->
            <div v-if="newPost.visibility === 'paid'" class="flex flex-wrap gap-3 pt-1">
              <input
                v-model="newPost.price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Цена (₽)"
                class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 outline-hidden focus:border-brand-accent transition-colors w-32"
              />
              <template v-if="mediaHasVideo">
                <input
                  v-model="newPost.videoTitle"
                  type="text"
                  placeholder="Заголовок видео"
                  class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 outline-hidden focus:border-brand-accent transition-colors flex-1 min-w-[160px]"
                />
                <input
                  v-model="newPost.videoDescription"
                  type="text"
                  placeholder="Описание видео"
                  class="bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 outline-hidden focus:border-brand-accent transition-colors flex-1 min-w-[160px]"
                />
              </template>
            </div>
          </div>
        </div>

        <!-- Плашка «Новые посты» -->
        <button v-if="newPostsCount > 0 && activeNav === 'home'" @click="showNewPosts"
            class="fixed top-20 md:top-24 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand-accent text-white text-sm font-bold shadow-xl hover:brightness-110 transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
            {{ langStore.t.feedNewPosts }}
        </button>

        <!-- Feed Filters -->
        <div class="flex flex-wrap gap-2 px-2 m-scroll-row max-md:-mx-1 max-md:gap-1.5">
          <button @click="feedMode = 'for-you'; selectedTag = ''"
            :class="feedMode === 'for-you' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold max-md:whitespace-nowrap transition-all duration-200">
            {{ langStore.t.forYou }}
          </button>
          <button @click="feedMode = 'subscriptions'; selectedTag = ''"
            :class="feedMode === 'subscriptions' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold max-md:whitespace-nowrap transition-all duration-200">
            {{ langStore.t.feedFollowing }}
          </button>
          <button @click="feedMode = 'news'; selectedTag = ''"
            :class="feedMode === 'news' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold max-md:whitespace-nowrap transition-all duration-200">
            {{ langStore.t.feedGeneral }}
          </button>
          <button @click="feedMode = 'photos'; selectedTag = ''"
            :class="feedMode === 'photos' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold max-md:whitespace-nowrap transition-all duration-200">
            {{ langStore.t.feedPhoto }}
          </button>
          <button v-if="nsfwEnabled" @click="feedMode = 'nsfw'; selectedTag = ''"
            :class="feedMode === 'nsfw' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold max-md:whitespace-nowrap transition-all duration-200">
            NSFW
          </button>
        </div>

        <!-- Events Section — Ближайшие крупные мероприятия -->
        <div v-if="upcomingEvents.length || isLoadingEvents" class="bg-brand-card border border-brand-border rounded-3xl p-5 max-md:p-4 shadow-xl">
          <div class="flex items-center justify-between gap-3 mb-4">
            <h3 class="font-bold text-white flex items-center gap-2 max-md:min-w-0 max-md:text-[15px] max-md:leading-snug">
              <svg class="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              {{ langStore.t.upcomingEvents }}
            </h3>
            <button class="text-xs text-brand-accent font-semibold hover:text-brand-accent-plus transition-colors max-md:whitespace-nowrap max-md:shrink-0 max-md:px-2.5 max-md:py-1.5 max-md:rounded-xl max-md:bg-brand-accent/10"
              @click="router.push('/groups?type=event')">{{ langStore.t.seeAllBtn }}</button>
          </div>
          <!-- Loading skeleton -->
          <div v-if="isLoadingEvents" class="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            <div v-for="n in 3" :key="n" class="min-w-[260px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border animate-pulse">
              <div class="h-28 bg-white/5"></div>
              <div class="p-3 stack-y-2"><div class="h-3 bg-white/5 rounded-sm w-2/3"></div><div class="h-3 bg-white/5 rounded-sm w-1/2"></div></div>
            </div>
          </div>
          <!-- Actual event cards -->
          <div v-else class="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            <router-link v-for="ev in upcomingEvents" :key="ev.id"
              :to="'/events/' + ev.id"
              class="min-w-[260px] max-w-[280px] max-md:min-w-[230px] max-md:max-w-[250px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border hover:border-brand-accent/40 transition-all group/ev shrink-0">
              <div class="h-28 relative overflow-hidden">
                <img v-if="ev.banner_url || ev.group?.banner_url" :src="ev.banner_url || ev.group?.banner_url" class="w-full h-full object-cover group-hover/ev:scale-105 transition-transform duration-300" />
                <div v-else class="h-full w-full" :style="`background:linear-gradient(135deg,${ev.group?.accent_color || '#4C67CF'}44,${ev.group?.accent_color || '#4C67CF'}11)`"></div>
                <div class="absolute inset-0 bg-linear-to-t/srgb from-black/60 to-transparent"></div>
                <div class="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                  <div class="bg-black/50 backdrop-blur-xs px-2 py-1 rounded-lg text-[11px] font-bold text-white truncate max-w-[75%]">{{ ev.title }}</div>
                  <div v-if="ev.attendee_count > 0" class="bg-brand-accent/80 backdrop-blur-xs px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white flex items-center gap-1 shrink-0">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
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
                  <img v-if="ev.group.avatar_url" :src="ev.group.avatar_url" class="w-4 h-4 rounded-[3px] object-cover" @error="onAvatarError" />
                  <div v-else class="w-4 h-4 rounded-[3px] flex items-center justify-center text-[8px] font-bold" :style="`background:${ev.group.accent_color || '#4C67CF'}33;color:${ev.group.accent_color || '#4C67CF'}`">{{ (ev.group.name || '?')[0] }}</div>
                  <span class="text-[10px] text-white/40 truncate">{{ ev.group.name }}</span>
                </div>
              </div>
            </router-link>
          </div>
        </div>

        <!-- Active hashtag filter pill -->
        <Transition name="filter-expand">
          <div v-if="selectedTag" class="flex items-center gap-2 bg-brand-card border border-brand-accent/30 rounded-2xl px-4 py-2.5 shadow-xl">
            <BIcon name="Hash" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
            <span class="text-sm font-bold text-brand-accent flex-1">#{{ selectedTag }}</span>
            <span class="text-[10px] text-white/55">{{ langStore.t.tagFilter }}</span>
            <button @click="selectedTag = ''" class="ml-1 p-1 text-white/55 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>
        </Transition>

        <!-- Ad placement -->
        <AdSlot v-if="adSlotMode === 'offer'" :ad="null" variant="hero" />
        <AdSlot v-else-if="adSlotMode === 'ads' && activeAds[0]" :ad="activeAds[0]" variant="hero" />

        <!-- Feed -->
        <div v-if="isLoadingPosts" class="stack-y-4">
          <SkeletonPost v-for="n in 4" :key="n" />
        </div>

        <div v-else-if="posts.length === 0" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="MessageSquare" class="w-10 h-10 text-white/55" />
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noPosts }}</h3>
          <p class="text-white/55">{{ langStore.t.beFirst }}</p>
        </div>

        <div v-else class="stack-y-4">
          <PostCard
            v-for="post in posts"
            :key="post.id"
            :ref="(el: any) => setPostRef(el?.$el ?? el, post.id)"
            :post="post"
            :group-context="groupContextMap[post.id] ?? null"
            :show-follow-button="!groupContextMap[post.id]"
            :initial-following="followStatus[post.author?.id ?? ''] ?? null"
            :initial-vote="postStatus[post.id]?.userVote ?? 0"
            :initial-repawed="postStatus[post.id]?.repawed ?? false"
            :initial-favourited="postStatus[post.id]?.favourited ?? false"
            @deleted="(id: string) => { posts = posts.filter(p => p.id !== id) }"
            @updated="(p: any) => { const idx = posts.findIndex((x: any) => x.id === p.id); if (idx !== -1) posts[idx] = p }"
          />
          <div v-if="isFetchingMore" class="flex justify-center p-4">
            <BIcon name="Loader2" class="animate-spin text-brand-accent w-6 h-6" />
          </div>
          <div v-if="!hasMorePosts && posts.length > 0" class="text-center text-white/55 text-sm p-4">
            {{ langStore.t.noPosts }}
          </div>
        </div>

        </template><!-- /v-else main feed -->
      </main>

      <!-- Right Sidebar -->
      <aside class="w-80 hidden xl:block sticky top-24 self-start stack-y-6">

        <!-- Ad placement -->
        <AdSlot v-if="adSlotMode === 'offer'" :ad="null" />
        <AdSlot v-else-if="adSlotMode === 'ads' && (activeAds[1] ?? activeAds[0])" :ad="activeAds[1] ?? activeAds[0]" />

        <!-- Trending Hashtags -->
        <div>
          <h3 class="font-bold text-white mb-4">{{ langStore.t.popularTags }}</h3>
          <div v-if="isFetchingTags" class="stack-y-3">
            <div v-for="n in 5" :key="n" class="flex items-center justify-between animate-pulse">
              <div class="h-4 bg-white/5 rounded-sm w-24"></div>
              <div class="h-4 bg-white/5 rounded-sm w-12"></div>
            </div>
          </div>
          <div v-else-if="trendingTags.length === 0" class="text-center py-6">
            <p class="text-xs text-white/55">{{ langStore.t.noHashtagsYet }}</p>
          </div>
          <div v-else class="stack-y-3">
            <router-link v-for="tag in trendingTags.slice(0, 10)" :key="tag.name"
              :to="{ path: '/search', query: { q: tag.name } }"
              class="flex items-center justify-between cursor-pointer group">
              <span class="text-sm text-white/55 group-hover:text-white transition-colors">{{ tag.name }}</span>
              <div class="flex items-center gap-1.5 text-xs font-bold" :class="tag.trend === 'up' ? 'text-brand-success' : tag.trend === 'down' ? 'text-brand-error' : 'text-white/55'">
                <BIcon :name="tag.trend === 'up' ? 'TrendingUp' : tag.trend === 'down' ? 'TrendingDown' : 'Minus'" class="w-3 h-3" />
                {{ formatCount(tag.totalCount) }}
              </div>
            </router-link>
          </div>
        </div>

        <!-- Recommended friends -->
        <div v-if="isLoadingRecommended || visibleRecommendedUsers.length > 0">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-white text-sm">{{ langStore.t.recommendedFriends }}</h3>
          </div>

          <!-- Skeletons -->
          <div v-if="isLoadingRecommended" class="stack-y-2">
            <div v-for="n in 3" :key="n" class="flex items-center gap-3 px-1 animate-pulse">
              <div class="w-10 h-10 rounded-full bg-white/8 shrink-0"></div>
              <div class="flex-1 stack-y-1.5">
                <div class="h-3 bg-white/8 rounded-full w-28"></div>
                <div class="h-2.5 bg-white/5 rounded-full w-20"></div>
              </div>
              <div class="w-16 h-7 rounded-full bg-white/5"></div>
            </div>
          </div>

          <!-- User list -->
          <div v-else class="stack-y-1">
            <router-link
              v-for="user in visibleRecommendedUsers.slice(0, 5)"
              :key="user.id"
              :to="`/profile/${user.username}`"
              class="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-card/60 transition-colors group cursor-pointer"
            >
              <!-- Avatar -->
              <div class="relative shrink-0">
                <img
                  v-if="user.avatar_url"
                  :src="user.avatar_url"
                  class="w-10 h-10 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent/40 transition-colors"
                />
                <div v-else
                  class="w-10 h-10 rounded-full border-2 border-brand-border group-hover:border-brand-accent/40 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm transition-colors">
                  {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                </div>
                <!-- Online indicator -->
                <span v-if="onlineStatus[user.id]"
                  class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-brand-success border-2 border-brand-card shadow-xs"
                  title="Онлайн"
                ></span>
              </div>

              <!-- Name + username -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate leading-tight">{{ user.display_name || user.username }}</p>
                <p class="text-xs text-white/55 truncate">@{{ user.username }}</p>
              </div>

              <!-- Follow button -->
              <button
                @click.stop.prevent="followRecommended(user.id)"
                class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                :class="followStatus[user.id]
                  ? 'border-brand-border text-white/55 hover:border-rose-500/40 hover:text-rose-400'
                  : 'border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-white hover:border-brand-accent'"
              >
                {{ followStatus[user.id] ? 'Вы подписаны' : 'Читать' }}
              </button>
            </router-link>
          </div>
        </div>

      </aside>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         STORY CREATION — web publishing disabled, mobile app only
    ═══════════════════════════════════════════════════════════════════ -->
    <StoryMobileOnlyModal v-if="showStoryMobileNotice" @close="showStoryMobileNotice = false" />

    <PostLightbox
      v-if="lightboxOpen"
      :images="lightboxImages"
      :start-index="lightboxStart"
      @close="lightboxOpen = false"
    />

    <!-- Story viewer -->
    <StoryViewer
      v-if="storyViewerOpen && storyGroups.length"
      :groups="storyGroups"
      :group-index="storyViewerGroupIdx"
      :story-index="storyViewerStoryIdx"
      @close="closeStory"
    />
  </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Post form expand / collapse */
.post-form-enter-active {
  animation: post-spring 0.38s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.post-form-leave-active {
  animation: post-fade-out 0.18s ease forwards;
}
@keyframes post-spring {
  from { opacity: 0; transform: scale(0.97) translateY(-6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}
@keyframes post-fade-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.98); }
}

/* Drag overlay fade */
.drag-overlay-enter-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.drag-overlay-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.drag-overlay-enter-from, .drag-overlay-leave-to { opacity: 0; transform: scale(0.98); }

/* Fade + scale (story modal) */
.fade-scale-enter-active { transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fade-scale-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.fade-scale-enter-from, .fade-scale-leave-to { opacity: 0; transform: scale(0.94); }

/* Filter expand */
.filter-expand-enter-active { transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
.filter-expand-leave-active { transition: all 0.18s ease; }
.filter-expand-enter-from, .filter-expand-leave-to { opacity: 0; transform: translateY(-6px); }

/* Search modal */
.modal-fade-enter-active { transition: all 0.22s ease; }
.modal-fade-leave-active { transition: all 0.16s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-from .relative, .modal-fade-leave-to .relative { transform: translateY(-12px) scale(0.97); }



/* Create post/story modal */
.create-modal-enter-active { transition: opacity 0.22s ease; }
.create-modal-leave-active { transition: opacity 0.18s ease; }
.create-modal-enter-from, .create-modal-leave-to { opacity: 0; }
.create-modal-enter-active .relative { animation: modal-spring 0.34s cubic-bezier(0.175, 0.885, 0.32, 1.1); }
@keyframes modal-spring {
  from { opacity: 0; transform: scale(0.96) translateY(16px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Tab switch inside form */
.tab-switch-enter-active { transition: all 0.18s ease; }
.tab-switch-leave-active { transition: all 0.12s ease; }
.tab-switch-enter-from { opacity: 0; transform: translateX(12px); }
.tab-switch-leave-to   { opacity: 0; transform: translateX(-12px); }

/* Post card hover lift */
.post-card {
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.post-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(76,103,207,0.08);
}

/* Fade transition */
.fade-enter-active { transition: opacity 0.2s ease; }
.fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Feed scroll area thin scrollbar */
.feed-area {
  scrollbar-width: thin;
  scrollbar-color: rgba(76,103,207,0.25) transparent;
}
.feed-area::-webkit-scrollbar { width: 3px; }
.feed-area::-webkit-scrollbar-thumb {
  background: rgba(76,103,207,0.25);
  border-radius: 2px;
}
.feed-area::-webkit-scrollbar-thumb:hover {
  background: rgba(76,103,207,0.5);
}
</style>
