<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted, reactive, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import api from '@/api'
import BIcon from './BIcon.vue'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import MediaUpload from './MediaUpload.vue'
import SkeletonPost from './SkeletonPost.vue'
import PostLightbox from './PostLightbox.vue'
import PostComments from './PostComments.vue'
import PostCard from './PostCard.vue'
import MentionTextarea from './MentionTextarea.vue'
import { useAnalytics } from '@/composables/useAnalytics'
import { formatCount } from '@/lib/utils'

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
const nsfwMode = ref(localStorage.getItem('bloomly_nsfw') === 'true')
watch(nsfwMode, (val) => { localStorage.setItem('bloomly_nsfw', String(val)) })
const feedMode = ref<'for-you' | 'subscriptions' | 'trending' | 'news' | 'photos' | 'nsfw'>('for-you')
const searchQuery = ref('')
const selectedCategory = ref('')
const sortBy = ref<'new' | 'hot'>('new')

const showPostForm = ref(false)
const showStoryModal = ref(false)
const createTab = ref<'post' | 'story'>('post')
const mediaUrls = ref<string[]>([])
const handleMediaUploaded = (urls: string[]) => { mediaUrls.value = urls }

// ── Story creation ────────────────────────────────────────────────────────
const storyMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)
const storyMediaUrl = ref('')
const storyCaption = ref('')
const handleStoryUploaded = (urls: string[]) => { if (urls.length) storyMediaUrl.value = urls[0] }
const isPostingStory = ref(false)
const createStory = async () => {
  if (!storyMediaUrl.value) return
  isPostingStory.value = true
  try {
    const res = await api.post('/stories', { image_url: storyMediaUrl.value })
    if (res.data.success) {
      storyMediaUrl.value = ''
      storyCaption.value = ''
      storyMediaUploadRef.value?.clearAll()
      showStoryModal.value = false
      await fetchStories()
    }
  } catch (e) { console.error('Failed to create story', e) }
  finally { isPostingStory.value = false }
}

const closeCreateModal = () => {
  showPostForm.value = false
  showStoryModal.value = false
  showAdvanced.value = false
  newPost.value = { content: '', category: '', tags: [], isNsfw: false }
  mediaUrls.value = []
  mediaUploadRef.value?.clearAll()
  storyMediaUrl.value = ''
  storyCaption.value = ''
  storyMediaUploadRef.value?.clearAll()
}

// ── Mobile navigation ────────────────────────────────────────────────────────
const mobileSearchOpen = ref(false)
const mobileActiveTab = ref<'home' | 'friends' | 'search' | 'profile'>('home')
const mobileHubOpen = ref(false)
const closeMobileSearch = () => { mobileSearchOpen.value = false }
const openMobileSearch = () => { mobileSearchOpen.value = true; mobileActiveTab.value = 'search' }

// Sync mobile tab with current route
watch(() => route.name, (name) => {
  if (name === 'home') mobileActiveTab.value = 'home'
  else if (name === 'friends') mobileActiveTab.value = 'friends'
  else if (name === 'messages') mobileActiveTab.value = 'search'
  else if (name === 'profile') mobileActiveTab.value = 'profile'
}, { immediate: true })

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

onUnmounted(() => { cleanupObservers(); disconnectWebSocket(); closeStory(); if (onlineFetchTimer) clearTimeout(onlineFetchTimer) })

const newPost = ref({ content: '', category: '', tags: [] as string[], isNsfw: false })
const tagInput = ref('')
const showAdvanced = ref(false)

// ── @mention helpers ─────────────────────────────────────────────────────────
type MentionSegment = { type: 'text' | 'mention'; key: number; text: string; username?: string }
const parseMentions = (content: string): MentionSegment[] => {
  const parts = content.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) return { type: 'mention', key: i, text: part, username: part.slice(1) }
    return { type: 'text', key: i, text: part }
  })
}
const goToMention = async (username: string) => {
  try {
    const res = await api.get(`/users/search?q=${encodeURIComponent(username)}`)
    const users: any[] = res.data.data?.users ?? []
    const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase())
    if (found) router.push(`/profile/${found.id}`)
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

const allCategories = [
  { id: '', name: 'All' },
  { id: 'digital_art', name: 'Digital Art' },
  { id: 'photography', name: 'Photography' },
  { id: '3d', name: '3D' },
  { id: 'animation', name: 'Animation' },
  { id: 'writing', name: 'Writing' },
  { id: 'other', name: 'Other' },
]

let searchDebounce: ReturnType<typeof setTimeout>
const onHeaderSearch = () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(() => fetchPosts(), 300) }

const handleLogout = () => { auth.logout(); router.push({ name: 'login' }) }

// ── Post status (repawed / favourited / userVote) ────────────────────────────
const postStatus = reactive<Record<string, { repawed: boolean; favourited: boolean; repawCount: number; userVote: 1 | -1 | 0 }>>({})

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
    let loadedPosts: any[] = []
    if (feedMode.value === 'for-you') {
      const params = new URLSearchParams()
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/posts/personalized?${params.toString()}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'subscriptions') {
      const params = new URLSearchParams()
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/follows/feed?${params.toString()}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'trending') {
      const params = new URLSearchParams()
      params.append('sort', 'hot')
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'news') {
      const params = new URLSearchParams()
      params.append('sort', 'new')
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'photos') {
      const params = new URLSearchParams()
      params.append('hasMedia', 'true')
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'nsfw') {
      const res = await api.get(`/posts?safeMode=false&page=${currentPage.value}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    } else {
      // fallback: general posts
      const params = new URLSearchParams()
      if (searchQuery.value) params.append('search', searchQuery.value)
      if (selectedCategory.value) params.append('category', selectedCategory.value)
      if (selectedTag.value) params.append('tag', selectedTag.value)
      params.append('sort', sortBy.value)
      params.append('page', currentPage.value.toString())
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { if (!loadMore) cleanupObservers(); loadedPosts = res.data.data.posts }
    }
    
    if (loadedPosts.length === 0) {
      hasMorePosts.value = false;
    } else {
      if (loadMore) {
        posts.value = [...posts.value, ...loadedPosts];
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

// Global infinite scroll listener
const handleScroll = () => {
  const bottomOfWindow = document.documentElement.scrollTop + window.innerHeight >= document.documentElement.offsetHeight - 200;
  if (bottomOfWindow && !isLoadingPosts.value && !isFetchingMore.value && hasMorePosts.value) {
    fetchPosts(true);
  }
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
});
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});

const selectedTag = ref('')
watch([selectedCategory, sortBy, nsfwMode, feedMode, selectedTag], () => { fetchPosts() })

// Notifications handled by AppHeader component

// ── Follow status on post authors ────────────────────────────────────────────
const followStatus = reactive<Record<string, boolean>>({})

const fetchFollowStatusForPosts = async (loadedPosts: any[]) => {
  if (!auth.user) return
  const authorIds = [...new Set(loadedPosts.map((p: any) => p.author.id).filter((id: string) => id !== auth.user?.id))]
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
    if (res.data.success) followStatus[userId] = res.data.data.following
  } catch {}
}

// ── Active Ads ───────────────────────────────────────────────────────────────
const activeAds = ref<any[]>([])
const fetchActiveAds = async () => {
  try {
    const res = await api.get('/admin/ads/active')
    if (res.data.success) activeAds.value = res.data.data.ads
  } catch {}
}
const trackAdClick = async (adId: string) => {
  try { await api.post(`/admin/ads/${adId}/click`) } catch {}
}

// ── Recommended users (from DB) ──────────────────────────────────────────────
const recommendedUsers = ref<any[]>([])
// Скрываем AD-профили если NSFW выключен
const visibleRecommendedUsers = computed(() =>
  nsfwMode.value
    ? recommendedUsers.value
    : recommendedUsers.value.filter((u: any) => u.role !== 'ad')
)
const fetchRecommendedUsers = async () => {
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
  } catch {}
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
      params: { includeNsfw: nsfwMode.value ? 'true' : 'false' },
    })
    if (res.data.success) trendingTags.value = res.data.data.tags
  } catch {} finally { isFetchingTags.value = false }
}

const addTag = () => {
  const tag = tagInput.value.trim().toLowerCase()
  if (tag && !newPost.value.tags.includes(tag)) newPost.value.tags.push(tag)
  tagInput.value = ''
}
const removeTag = (t: string) => { newPost.value.tags = newPost.value.tags.filter(x => x !== t) }

const createPost = async () => {
  const content = newPost.value.content.trim()
  if (!content) return
  isPosting.value = true
  try {
    const res = await api.post('/posts', {
      content,
      category: newPost.value.category || undefined,
      tags: newPost.value.tags,
      isNsfw: newPost.value.isNsfw,
      mediaUrls: mediaUrls.value,
    })
    if (res.data.success) {
      const createdPost = res.data.data?.post
      if (createdPost) {
        posts.value = [createdPost, ...posts.value]
        initPostStatus([createdPost])
      }
      newPost.value = { content: '', category: '', tags: [], isNsfw: false }
      mediaUrls.value = []
      mediaUploadRef.value?.clearAll()
      showPostForm.value = false
      shareToast.value = 'Пост опубликован'
      setTimeout(() => { shareToast.value = '' }, 1800)
      await fetchTrendingTags()
    }
  } catch (e) { console.error('Failed to create post', e) }
  finally { isPosting.value = false }
}

const votePost = async (postId: string, value: 1 | -1) => {
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

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat(langStore.currentLang === 'RU' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(date)
}

// ── Stories ───────────────────────────────────────────────────────────────
const stories = ref<any[]>([])
const activeStory = ref<any>(null)
const storyProgress = ref(0)
let storyTimerInterval: ReturnType<typeof setInterval> | null = null

const openStory = (story: any) => {
  activeStory.value = story
  storyProgress.value = 0
  if (storyTimerInterval) clearInterval(storyTimerInterval)
  const start = Date.now()
  storyTimerInterval = setInterval(() => {
    storyProgress.value = Math.min(100, ((Date.now() - start) / 5000) * 100)
    if (storyProgress.value >= 100) closeStory()
  }, 50)
}

const closeStory = () => {
  activeStory.value = null
  storyProgress.value = 0
  if (storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null }
}

const fetchStories = async () => {
  try {
    const res = await api.get('/stories')
    if (res.data.success) stories.value = res.data.data.stories
  } catch {}
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
watch(showPostForm, (v) => { if (!v) { dragCounter = 0; formDragging.value = false } })
watch(nsfwMode, () => { fetchTrendingTags() })

onMounted(() => { wsDestroyed = false; fetchPosts(); fetchStories(); connectWebSocket(); fetchRecommendedUsers(); fetchTrendingEvents(); fetchTrendingTags(); fetchActiveAds() })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito selection:bg-brand-accent/30" @click="closeMenu">

    <!-- Share toast -->
    <div v-if="shareToast" class="fixed top-20 left-1/2 -translate-x-1/2 z-[500] px-5 py-2.5 bg-brand-success text-white text-sm font-bold rounded-full shadow-xl pointer-events-none">
      {{ shareToast }}
    </div>

    <!-- Header -->
    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8">
      <!-- Left Sidebar -->
      <AppSidebar v-model:activeNav="activeNav">
        <template #bottom>
          <template v-if="activeAds.length && nsfwMode">
            <a v-for="ad in activeAds" :key="ad.id"
              :href="ad.link_url" target="_blank" rel="noopener noreferrer"
              @click="trackAdClick(ad.id)"
              class="block bg-brand-card border border-brand-accent/25 rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/50 transition-all group">
              <img v-if="ad.image_url" :src="ad.image_url" class="w-full object-cover max-h-28" />
              <div class="px-3 py-2.5">
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-[9px] font-bold uppercase tracking-wider text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">Реклама</span>
                </div>
                <p class="text-xs font-bold text-white group-hover:text-brand-accent transition-colors leading-snug">{{ ad.title }}</p>
                <p v-if="ad.description" class="text-[11px] text-white/55 mt-0.5 line-clamp-2">{{ ad.description }}</p>
              </div>
            </a>
          </template>
        </template>
      </AppSidebar>

      <!-- Main Content -->
      <main class="flex-1 min-w-0 space-y-4 md:space-y-5 pb-28 md:pb-20 max-w-2xl w-full">

        <!-- ── BOOKMARKS VIEW ────────────────────────────────────────────── -->
        <div v-if="activeNav === 'bookmarks'">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 shadow-xl mb-5 flex items-center gap-3">
            <BIcon name="Bookmark" class="w-6 h-6 text-brand-yellow" />
            <h2 class="text-xl font-bold text-white">{{ langStore.t.bookmarks }}</h2>
          </div>
          <div v-if="isLoadingBookmarks" class="space-y-4">
            <SkeletonPost v-for="n in 3" :key="n" />
          </div>
          <div v-else-if="bookmarkedPosts.length === 0" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
            <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon name="Bookmark" class="w-10 h-10 text-white/55" />
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noBookmarks }}</h3>
            <p class="text-white/55">{{ langStore.t.saveToBookmarks }}</p>
          </div>
          <div v-else class="space-y-4">
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
        <div class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl overflow-x-auto hide-scrollbar">
          <div class="flex gap-4 min-w-max">
            <!-- Own story create button -->
            <div class="flex flex-col items-center gap-1.5 cursor-pointer" @click="showStoryModal = true">
              <div class="relative">
                <div class="w-16 h-16 rounded-2xl p-[2px] bg-brand-card border border-brand-border flex items-center justify-center">
                  <BIcon name="Plus" class="w-6 h-6 text-white/55" />
                </div>
              </div>
              <span class="text-[10px] font-semibold text-white/55">История</span>
            </div>
            <div v-for="story in stories" :key="story.id" class="flex flex-col items-center gap-1.5 cursor-pointer" @click="openStory(story)">
              <div class="relative">
                <div class="w-16 h-16 rounded-2xl p-[2px] bg-gradient-to-tr from-brand-accent to-brand-purple">
                  <img v-if="story.user.avatar_url" :src="story.user.avatar_url" class="w-full h-full rounded-xl border-2 border-brand-card object-cover" />
                  <div v-else class="w-full h-full rounded-xl border-2 border-brand-card bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-lg">{{ (story.user.username ?? '?')[0].toUpperCase() }}</div>
                </div>
              </div>
              <span class="text-[10px] font-semibold text-white/55 max-w-[64px] truncate">{{ story.user.username }}</span>
            </div>
          </div>
        </div>

        <!-- Create Post Window -->
        <div
          class="bg-brand-card border rounded-3xl shadow-xl transition-colors"
          :class="showPostForm ? 'border-brand-accent/30' : 'border-brand-border'"
          @dragenter.prevent="showPostForm = true; onFormDragEnter()"
          @dragleave.prevent="onFormDragLeave"
          @dragover.prevent
          @drop="onFormDrop"
        >
          <!-- Collapsed trigger -->
          <button
            v-if="!showPostForm"
            @click="showPostForm = true"
            class="w-full flex items-center gap-3 px-5 py-4 text-left group"
          >
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" />
            <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex-shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
            <span class="flex-1 text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">Что нового?</span>
            <div class="flex items-center gap-2 text-white/55 group-hover:text-white transition-colors ml-1">
              <BIcon name="ImagePlus" class="w-4.5 h-4.5" />
              <BIcon name="Hash" class="w-4.5 h-4.5" />
            </div>
          </button>

          <!-- Expanded composer -->
          <div v-else class="p-5 space-y-4">
            <!-- Author + textarea + send -->
            <div class="flex items-start gap-3">
              <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 mt-0.5" />
              <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold">{{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}</div>
              <div class="flex-1 min-w-0">
                <MentionTextarea
                  v-model="newPost.content"
                  placeholder="Что у вас нового? Используйте @ для упоминаний"
                  minHeight="90px"
                />
              </div>
              <!-- Send button (top-right) -->
              <button
                @click="createPost"
                :disabled="!newPost.content.trim() || isPosting"
                class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 flex-shrink-0 mt-0.5"
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
              @uploaded="handleMediaUploaded"
            />

            <!-- Drag hint -->
            <div v-if="formDragging" class="flex items-center gap-2 rounded-2xl border border-dashed border-brand-accent/60 bg-brand-accent/8 px-4 py-3 text-xs text-brand-accent font-semibold">
              <BIcon name="UploadCloud" class="w-4 h-4" />
              Отпустите файл, чтобы прикрепить к посту
            </div>

            <!-- Tags row -->
            <div v-if="newPost.tags.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in newPost.tags"
                :key="tag"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold"
              >
                #{{ tag }}
                <button @click="removeTag(tag)" class="text-brand-accent/60 hover:text-brand-accent">
                  <BIcon name="X" class="w-3 h-3" />
                </button>
              </span>
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
                <BIcon name="Hash" class="w-4 h-4 text-white/55 flex-shrink-0" />
                <input
                  type="text"
                  v-model="tagInput"
                  @keydown.enter.prevent="addTag"
                  placeholder="тег + Enter"
                  class="bg-transparent text-xs text-white placeholder-brand-muted outline-none w-24"
                />
              </div>

              <!-- Category -->
              <select
                v-model="newPost.category"
                class="px-3 py-2 rounded-xl text-xs text-white/55 bg-transparent border border-transparent hover:border-brand-border hover:bg-brand-bg outline-none transition-all cursor-pointer"
              >
                <option value="" class="bg-brand-card">Категория</option>
                <template v-for="c in allCategories" :key="c.id || 'empty-cat'">
                  <option v-if="c.id" :value="c.id" class="bg-brand-card">{{ c.name }}</option>
                </template>
              </select>

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

              <!-- Spacer -->
              <div class="flex-1" />

              <!-- Cancel -->
              <button
                @click="closeCreateModal"
                class="text-xs font-semibold text-white/55 hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>

        <!-- Feed Filters -->
        <div class="flex flex-wrap gap-2 px-2">
          <button @click="feedMode = 'for-you'; selectedTag = ''"
            :class="feedMode === 'for-you' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Для Вас
          </button>
          <button @click="feedMode = 'subscriptions'; selectedTag = ''"
            :class="feedMode === 'subscriptions' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Подписки
          </button>
          <button @click="feedMode = 'news'; selectedTag = ''"
            :class="feedMode === 'news' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Общие новости
          </button>
          <button @click="feedMode = 'photos'; selectedTag = ''"
            :class="feedMode === 'photos' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Фото
          </button>
          <button v-if="nsfwMode" @click="feedMode = 'nsfw'; selectedTag = ''"
            :class="feedMode === 'nsfw' ? 'bg-brand-card text-white' : 'text-white/55 hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            NSFW
          </button>
        </div>

        <!-- Events Section — Ближайшие крупные мероприятия -->
        <div v-if="upcomingEvents.length || isLoadingEvents" class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-white flex items-center gap-2">
              <svg class="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Ближайшие крупные мероприятия
            </h3>
            <button class="text-xs text-brand-accent font-semibold hover:text-brand-accent-plus transition-colors"
              @click="router.push('/groups?type=event')">Все →</button>
          </div>
          <!-- Loading skeleton -->
          <div v-if="isLoadingEvents" class="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            <div v-for="n in 3" :key="n" class="min-w-[260px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border animate-pulse">
              <div class="h-28 bg-white/5"></div>
              <div class="p-3 space-y-2"><div class="h-3 bg-white/5 rounded w-2/3"></div><div class="h-3 bg-white/5 rounded w-1/2"></div></div>
            </div>
          </div>
          <!-- Actual event cards -->
          <div v-else class="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            <router-link v-for="ev in upcomingEvents" :key="ev.id"
              :to="ev.group ? `/groups/${ev.group.slug}` : '#'"
              class="min-w-[260px] max-w-[280px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border hover:border-brand-accent/40 transition-all group/ev flex-shrink-0">
              <div class="h-28 relative overflow-hidden">
                <img v-if="ev.banner_url" :src="ev.banner_url" class="w-full h-full object-cover group-hover/ev:scale-105 transition-transform duration-300" />
                <div v-else class="h-full w-full" :style="`background:linear-gradient(135deg,${ev.group?.accent_color || '#4C67CF'}44,${ev.group?.accent_color || '#4C67CF'}11)`"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div class="absolute bottom-2 left-2 right-2 flex items-end justify-between">
                  <div class="bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-[11px] font-bold text-white truncate max-w-[75%]">{{ ev.title }}</div>
                  <div v-if="ev.attendee_count > 0" class="bg-brand-accent/80 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white flex items-center gap-1 shrink-0">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    {{ ev.attendee_count }}
                  </div>
                </div>
              </div>
              <div class="p-3 space-y-1.5">
                <div class="flex items-center gap-1.5 text-[11px] text-white/55">
                  <BIcon name="Calendar" class="w-3 h-3 shrink-0" />
                  <span>{{ formatEventDate(ev.starts_at, ev.ends_at) }}</span>
                </div>
                <div v-if="ev.location_name" class="flex items-center gap-1.5 text-[11px] text-white/55">
                  <BIcon name="MapPin" class="w-3 h-3 shrink-0" />
                  <span class="truncate">{{ ev.location_name }}</span>
                </div>
                <div v-if="ev.group" class="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-brand-border/40">
                  <img v-if="ev.group.avatar_url" :src="ev.group.avatar_url" class="w-4 h-4 rounded-full object-cover" />
                  <div v-else class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold" :style="`background:${ev.group.accent_color || '#4C67CF'}33;color:${ev.group.accent_color || '#4C67CF'}`">{{ (ev.group.name || '?')[0] }}</div>
                  <span class="text-[10px] text-white/40 truncate">{{ ev.group.name }}</span>
                </div>
              </div>
            </router-link>
          </div>
        </div>

        <!-- Active hashtag filter pill -->
        <Transition name="filter-expand">
          <div v-if="selectedTag" class="flex items-center gap-2 bg-brand-card border border-brand-accent/30 rounded-2xl px-4 py-2.5 shadow-xl">
            <BIcon name="Hash" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
            <span class="text-sm font-bold text-brand-accent flex-1">#{{ selectedTag }}</span>
            <span class="text-[10px] text-white/55">фильтр по тегу</span>
            <button @click="selectedTag = ''" class="ml-1 p-1 text-white/55 hover:text-white hover:bg-white/8 rounded-lg transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>
        </Transition>

        <!-- Feed -->
        <div v-if="isLoadingPosts" class="space-y-4">
          <SkeletonPost v-for="n in 4" :key="n" />
        </div>

        <div v-else-if="posts.length === 0" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="MessageSquare" class="w-10 h-10 text-white/55" />
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noPosts }}</h3>
          <p class="text-white/55">{{ langStore.t.beFirst }}</p>
        </div>

        <div v-else class="space-y-4">
          <PostCard
            v-for="post in posts"
            :key="post.id"
            :ref="(el: any) => setPostRef(el?.$el ?? el, post.id)"
            :post="post"
            :show-follow-button="true"
            :initial-following="followStatus[post.author.id] ?? null"
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
            Это все посты.
          </div>
        </div>

        </template><!-- /v-else main feed -->
      </main>

      <!-- Right Sidebar -->
      <aside class="w-80 hidden xl:block sticky top-24 self-start space-y-6">

        <!-- Trending Hashtags -->
        <div>
          <h3 class="font-bold text-white mb-4">Популярные Теги</h3>
          <div v-if="isFetchingTags" class="space-y-3">
            <div v-for="n in 5" :key="n" class="flex items-center justify-between animate-pulse">
              <div class="h-4 bg-white/5 rounded w-24"></div>
              <div class="h-4 bg-white/5 rounded w-12"></div>
            </div>
          </div>
          <div v-else-if="trendingTags.length === 0" class="text-center py-6">
            <p class="text-xs text-white/55">Хештеги появятся после публикации постов</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="tag in trendingTags.slice(0, 10)" :key="tag.name"
              class="flex items-center justify-between cursor-pointer group"
              @click="activeNav = 'home'; feedMode = 'trending'; selectedCategory = ''; sortBy = 'hot'; selectedTag = tag.name">
              <span class="text-sm text-white/55 group-hover:text-white transition-colors">{{ tag.name }}</span>
              <div class="flex items-center gap-1.5 text-xs font-bold" :class="tag.trend === 'up' ? 'text-brand-success' : tag.trend === 'down' ? 'text-brand-error' : 'text-white/55'">
                <BIcon :name="tag.trend === 'up' ? 'TrendingUp' : tag.trend === 'down' ? 'TrendingDown' : 'Minus'" class="w-3 h-3" />
                {{ formatCount(tag.totalCount) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Recommended friends -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-white text-sm">Возможно знакомы</h3>
          </div>

          <!-- Skeletons -->
          <div v-if="visibleRecommendedUsers.length === 0" class="space-y-2">
            <div v-for="n in 3" :key="n" class="flex items-center gap-3 px-1 animate-pulse">
              <div class="w-10 h-10 rounded-full bg-white/8 flex-shrink-0"></div>
              <div class="flex-1 space-y-1.5">
                <div class="h-3 bg-white/8 rounded-full w-28"></div>
                <div class="h-2.5 bg-white/5 rounded-full w-20"></div>
              </div>
              <div class="w-16 h-7 rounded-full bg-white/5"></div>
            </div>
          </div>

          <!-- User list -->
          <div v-else class="space-y-1">
            <div
              v-for="user in visibleRecommendedUsers.slice(0, 5)"
              :key="user.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-card/60 transition-colors group cursor-pointer"
              @click="router.push(`/profile/${user.id}`)"
            >
              <!-- Avatar -->
              <div class="relative flex-shrink-0">
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
                  class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-brand-success border-2 border-brand-card shadow-sm"
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
                @click.stop="toggleFollow(user.id)"
                class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                :class="followStatus[user.id]
                  ? 'border-brand-border text-white/55 hover:border-rose-500/40 hover:text-rose-400'
                  : 'border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-white hover:border-brand-accent'"
              >
                {{ followStatus[user.id] ? 'Читаю' : 'Читать' }}
              </button>
            </div>
          </div>
        </div>

      </aside>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════
         STORY CREATION MODAL
    ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="fade-scale">
        <div v-if="showStoryModal" class="fixed inset-0 z-[250] flex items-center justify-center px-4" @click.self="showStoryModal = false; storyMediaUrl = ''; storyMediaUploadRef?.clearAll()">
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
          <div class="relative bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <!-- Header -->
            <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-brand-border">
              <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                <BIcon name="Sparkles" class="w-4 h-4 text-purple-400" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-bold text-white">Новая история</p>
                <p class="text-[11px] text-white/55">Исчезнет через 24 часа</p>
              </div>
              <button @click="showStoryModal = false; storyMediaUrl = ''; storyMediaUploadRef?.clearAll()"
                class="p-1.5 text-white/55 hover:text-white hover:bg-white/8 rounded-full transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <!-- Body -->
            <div class="p-5">
              <div v-if="!storyMediaUrl"
                class="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-border bg-brand-bg cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 transition-all py-10"
                @click="storyMediaUploadRef?.openPicker()">
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                  <BIcon name="ImagePlus" class="w-7 h-7 text-purple-400" />
                </div>
                <p class="font-bold text-white">Добавь фото или видео</p>
                <p class="text-xs text-white/55">Нажми или перетащи сюда</p>
                <MediaUpload ref="storyMediaUploadRef" type="posts" :multiple="false" @uploaded="handleStoryUploaded" />
              </div>
              <div v-else class="relative rounded-2xl overflow-hidden border border-brand-border shadow-xl">
                <img :src="storyMediaUrl" class="w-full max-h-72 object-cover" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none"></div>
                <button @click="storyMediaUrl = ''; storyMediaUploadRef?.clearAll()"
                  class="absolute top-2 right-2 w-7 h-7 bg-black/60 border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors">
                  <BIcon name="X" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <!-- Footer -->
            <div class="flex items-center justify-between px-5 pb-5">
              <div class="flex items-center gap-1.5 text-[11px] text-white/55">
                <BIcon name="Clock" class="w-3.5 h-3.5" />
                <span>24 часа — автоудаление</span>
              </div>
              <button @click="createStory" :disabled="!storyMediaUrl || isPostingStory"
                class="flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md shadow-purple-500/30 hover:shadow-purple-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95">
                <BIcon v-if="isPostingStory" name="Loader2" class="w-4 h-4 animate-spin" />
                <BIcon v-else name="Sparkles" class="w-4 h-4" />
                Опубликовать
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════════════════
         MOBILE SEARCH / MENU PANEL (slide-up)
    ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="mobile-panel">
        <div v-if="mobileSearchOpen" class="fixed inset-0 z-[300] flex flex-col justify-end" @click.self="closeMobileSearch">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeMobileSearch"></div>

          <!-- Panel -->
          <div class="mobile-search-panel relative bg-brand-card rounded-t-3xl border-t border-brand-border shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <!-- Handle + header -->
            <div class="flex-shrink-0 px-5 pt-4 pb-3">
              <div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"></div>
              <h2 class="text-base font-bold text-white mb-3 flex items-center gap-2">
                <BIcon name="Search" class="w-4 h-4 text-brand-accent" />
                Поиск и фильтры
              </h2>
              <!-- Search input -->
              <div class="relative">
                <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/55" />
                <input
                  type="text"
                  v-model="searchQuery"
                  @input="onHeaderSearch"
                  :placeholder="langStore.t.search"
                  autofocus
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl py-3 pl-10 pr-4 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30"
                />
              </div>
            </div>

            <!-- Scrollable filter content -->
            <div class="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
              <!-- Feed mode -->
              <div class="flex flex-wrap gap-2">
                <button @click="feedMode = 'for-you'"
                  :class="feedMode === 'for-you' ? 'bg-brand-accent text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-white/55'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Sparkles" class="w-4 h-4" />Для вас
                </button>
                <button @click="feedMode = 'subscriptions'"
                  :class="feedMode === 'subscriptions' ? 'bg-brand-accent text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-white/55'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Users" class="w-4 h-4" />Подписки
                </button>
                <button @click="feedMode = 'trending'"
                  :class="feedMode === 'trending' ? 'bg-brand-yellow text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-white/55'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="TrendingUp" class="w-4 h-4" />В тренде
                </button>
                <button @click="feedMode = 'news'"
                  :class="feedMode === 'news' ? 'bg-brand-success text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-white/55'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Newspaper" class="w-4 h-4" />Новости
                </button>
                <button @click="feedMode = 'photos'"
                  :class="feedMode === 'photos' ? 'bg-brand-pink text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-white/55'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Image" class="w-4 h-4" />Фото
                </button>
                <button v-if="nsfwMode" @click="feedMode = 'nsfw'"
                  :class="feedMode === 'nsfw' ? 'bg-brand-error text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-brand-error'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Eye" class="w-4 h-4" />NSFW
                </button>
              </div>

              <!-- Recommended users in search panel -->
              <div v-if="visibleRecommendedUsers.length">
                <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <BIcon name="UserPlus" class="w-3.5 h-3.5" />Рекомендуемые
                </h3>
                <div class="space-y-2">
                  <div v-for="user in visibleRecommendedUsers" :key="user.id"
                    class="flex items-center gap-3 p-3 rounded-2xl bg-brand-bg border border-brand-border hover:bg-brand-border cursor-pointer"
                    @click="closeMobileSearch(); router.push(`/profile/${user.id}`)">
                    <img v-if="user.avatar_url" :src="user.avatar_url"
                      class="w-9 h-9 rounded-full object-cover border border-brand-border flex-shrink-0" />
                    <div v-else class="w-9 h-9 rounded-full border border-brand-border flex-shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">{{ (user.display_name || user.username || '?')[0].toUpperCase() }}</div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                      <p class="text-xs text-white/55">@{{ user.username }}</p>
                    </div>
                    <button class="px-3 py-1.5 text-xs font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30 rounded-xl hover:bg-brand-accent/30 flex-shrink-0">
                      + Follow
                    </button>
                  </div>
                </div>
              </div>

              <!-- Language selector (mobile) -->
              <div>
                <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Язык</h3>
                <div class="flex gap-2 flex-wrap">
                  <button v-for="lang in ['RU','EN','JP','CN']" :key="lang"
                    @click="langStore.setLang(lang)"
                    :class="langStore.currentLang === lang ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' : 'bg-brand-bg border-brand-border text-white/55'"
                    class="px-4 py-2 rounded-xl text-sm font-bold border transition-all">{{ lang }}</button>
                </div>
              </div>

              <!-- Logout (mobile) -->
              <button @click="handleLogout"
                class="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 font-bold text-sm hover:bg-rose-500/20 transition-colors">
                <BIcon name="LogOut" class="w-4 h-4" />Выйти
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════════════════
         MOBILE BOTTOM NAV HUB (md:hidden)
    ═══════════════════════════════════════════════════════════════════ -->
    <nav class="fixed bottom-0 inset-x-0 z-[200] md:hidden">
      <!-- Blur backdrop -->
      <div class="absolute inset-0 bg-brand-bg/90 backdrop-blur-xl border-t border-brand-border"></div>

      <div class="relative flex items-center justify-around px-2 py-2 safe-area-bottom">
        <!-- Home -->
        <button
          @click="activeNav = 'home'; mobileActiveTab = 'home'; router.push({ name: 'home' })"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'home' ? 'text-white' : 'text-white/55'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'home'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-accent/30 blur-sm"></div>
            <BIcon name="Home" class="w-6 h-6 relative transition-transform duration-200"
              :class="mobileActiveTab === 'home' ? 'scale-110 text-white' : ''" />
          </div>
          <span class="text-[10px] font-semibold">{{ langStore.t.home }}</span>
          <div v-if="mobileActiveTab === 'home'" class="w-1 h-1 rounded-full bg-brand-accent mt-0.5"></div>
        </button>

        <!-- Friends -->
        <button
          @click="mobileActiveTab = 'friends'; activeNav = 'friends'; router.push({ name: 'friends' })"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'friends' ? 'text-white' : 'text-white/55'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'friends'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-purple/30 blur-sm"></div>
            <BIcon name="Users" class="w-6 h-6 relative transition-transform duration-200"
              :class="mobileActiveTab === 'friends' ? 'scale-110 text-brand-purple' : ''" />
          </div>
          <span class="text-[10px] font-semibold">{{ langStore.t.friends }}</span>
          <div v-if="mobileActiveTab === 'friends'" class="w-1 h-1 rounded-full bg-brand-purple mt-0.5"></div>
        </button>

        <!-- Mobile Hub (center FAB) -->
        <div class="relative flex-shrink-0 -mt-2">
          <!-- Hub backdrop -->
          <Transition name="fade">
            <div v-if="mobileHubOpen" class="fixed inset-0 z-[199] bg-black/50 backdrop-blur-sm" @click="mobileHubOpen = false"></div>
          </Transition>

          <!-- Hub menu -->
          <Transition name="hub-pop">
            <div v-if="mobileHubOpen" class="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-[201] flex flex-col items-center gap-2 w-44">
              <button @click="mobileHubOpen = false; showPostForm = true; createTab = 'post'"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-accent/20 transition-all">
                <BIcon name="Edit3" class="w-5 h-5 text-brand-accent" /> {{ langStore.t.newPost }}
              </button>
              <button @click="mobileHubOpen = false; showStoryModal = true"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-purple/20 transition-all">
                <BIcon name="Camera" class="w-5 h-5 text-brand-purple" /> {{ langStore.t.story }}
              </button>
              <button @click="mobileHubOpen = false; router.push({ name: 'groups' })"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-success/20 transition-all">
                <BIcon name="Grid" class="w-5 h-5 text-brand-success" /> {{ langStore.t.groups }}
              </button>
              <button @click="mobileHubOpen = false; router.push({ name: 'bookmarks' })"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-yellow/20 transition-all">
                <BIcon name="Bookmark" class="w-5 h-5 text-brand-yellow" /> {{ langStore.t.bookmarks }}
              </button>
            </div>
          </Transition>

          <!-- Hub trigger button -->
          <button
            @click="mobileHubOpen = !mobileHubOpen"
            class="w-14 h-14 rounded-2xl bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/40 hover:bg-brand-accent-plus hover:shadow-brand-accent/60 active:scale-95 transition-all duration-150"
            :class="mobileHubOpen ? 'rotate-45 bg-brand-error shadow-brand-error/40' : ''">
            <BIcon name="Plus" class="w-7 h-7 text-white transition-transform duration-200" />
          </button>
        </div>

        <!-- Messages -->
        <button
          @click="mobileActiveTab = 'search'; router.push({ name: 'messages' })"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'search' ? 'text-white' : 'text-white/55'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'search'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-success/30 blur-sm"></div>
            <BIcon name="MessageCircle" class="w-6 h-6 relative transition-transform duration-200"
              :class="mobileActiveTab === 'search' ? 'scale-110 text-brand-success' : ''" />
          </div>
          <span class="text-[10px] font-semibold">{{ langStore.t.chats }}</span>
          <div v-if="mobileActiveTab === 'search'" class="w-1 h-1 rounded-full bg-brand-success mt-0.5"></div>
        </button>

        <!-- Profile -->
        <button
          @click="mobileActiveTab = 'profile'; activeNav = 'profile'; router.push(`/profile/${auth.user?.id}`)"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'profile' ? 'text-white' : 'text-white/55'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'profile'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-yellow/30 blur-sm"></div>
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl"
              class="w-6 h-6 rounded-full object-cover border-2 transition-all duration-200 relative"
              :class="mobileActiveTab === 'profile' ? 'border-brand-yellow scale-110' : 'border-white/20'" />
            <BIcon v-else name="User" class="w-6 h-6 relative" :class="mobileActiveTab === 'profile' ? 'scale-110 text-brand-yellow' : ''" />
          </div>
          <span class="text-[10px] font-semibold">{{ langStore.t.profile }}</span>
          <div v-if="mobileActiveTab === 'profile'" class="w-1 h-1 rounded-full bg-brand-yellow mt-0.5"></div>
        </button>
      </div>
    </nav>
    <PostLightbox
      v-if="lightboxOpen"
      :images="lightboxImages"
      :start-index="lightboxStart"
      @close="lightboxOpen = false"
    />

    <!-- Story modal -->
    <Teleport to="body">
      <div v-if="activeStory" class="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4" @click.self="closeStory">
        <div class="relative w-full max-w-sm">
          <div class="w-full h-1 bg-white/20 rounded-full mb-5 overflow-hidden">
            <div class="h-1 bg-brand-accent rounded-full" :style="{ width: storyProgress + '%' }"></div>
          </div>
          <div class="flex items-center gap-3 mb-4 px-1">
            <img v-if="activeStory.user?.avatar_url" :src="activeStory.user.avatar_url" class="w-10 h-10 rounded-full border-2 border-purple-500 object-cover" />
            <div v-else class="w-10 h-10 rounded-full border-2 border-purple-500 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">{{ (activeStory.user?.username ?? '?')[0].toUpperCase() }}</div>
            <span class="font-bold text-white text-sm">{{ activeStory.user?.username }}</span>
            <span class="text-xs text-white/50 ml-auto">{{ formatDate(activeStory.created_at) }}</span>
          </div>
          <div class="rounded-3xl overflow-hidden bg-brand-bg border border-brand-border shadow-2xl">
            <img v-if="activeStory.image_url" :src="activeStory.image_url" class="w-full object-contain max-h-[70vh]" />
            <div v-else class="h-64 flex items-center justify-center text-white/30">
              <BIcon name="Image" class="w-16 h-16" />
            </div>
          </div>
          <button @click="closeStory" class="absolute -top-2 -right-2 w-9 h-9 bg-brand-card border border-brand-border rounded-full flex items-center justify-center text-white/60 hover:text-white shadow-lg">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </Teleport>
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

/* Mobile slide-up panel */
.mobile-panel-enter-active,
.mobile-panel-leave-active { transition: opacity 0.25s ease; }
.mobile-panel-enter-from, .mobile-panel-leave-to { opacity: 0; }
.mobile-panel-enter-active .mobile-search-panel { transition: transform 0.38s cubic-bezier(0.32, 0.72, 0, 1); }
.mobile-panel-leave-active .mobile-search-panel { transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1); }
.mobile-panel-enter-from .mobile-search-panel { transform: translateY(100%); }
.mobile-panel-leave-to   .mobile-search-panel { transform: translateY(100%); }

/* iOS safe area */
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 8px); }

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

/* Hub pop animation */
.hub-pop-enter-active { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.hub-pop-leave-active { transition: all 0.15s ease-in; }
.hub-pop-enter-from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.85); }
.hub-pop-leave-to   { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.85); }

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
