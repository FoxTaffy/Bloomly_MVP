<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, reactive, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from './BIcon.vue'
import MediaUpload from './MediaUpload.vue'
import SkeletonPost from './SkeletonPost.vue'
import PostLightbox from './PostLightbox.vue'
import PostComments from './PostComments.vue'
import MentionTextarea from './MentionTextarea.vue'
import { useAnalytics } from '@/composables/useAnalytics'

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
const auth = useAuthStore()
const langStore = useLangStore()
const { observePost } = useAnalytics()
const activeNav = ref('home')
const isPosting = ref(false)

const posts = ref<any[]>([])
const isLoadingPosts = ref(true)

// Feed controls
// nsfwMode=false (default): NSFW content is hidden. nsfwMode=true: NSFW is shown.
const nsfwMode = ref(false)
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
const closeMobileSearch = () => { mobileSearchOpen.value = false }
const openMobileSearch = () => { mobileSearchOpen.value = true; mobileActiveTab.value = 'search' }

// ── Search Modal ────────────────────────────────────────────────────────────
const showSearchModal = ref(false)
const searchModalQuery = ref('')
const searchModalTab = ref<'posts' | 'accounts'>('posts')
const searchModalPosts = ref<any[]>([])
const searchModalUsers = ref<any[]>([])
const searchModalLoading = ref(false)

const openSearchModal = () => {
  showSearchModal.value = true
  searchModalQuery.value = ''
  searchModalPosts.value = []
  searchModalUsers.value = []
  nextTick(() => {
    const el = document.getElementById('search-modal-input')
    if (el) el.focus()
  })
}
const closeSearchModal = () => { showSearchModal.value = false }

let searchModalDebounce: ReturnType<typeof setTimeout>
const onSearchModalInput = () => {
  clearTimeout(searchModalDebounce)
  if (!searchModalQuery.value.trim()) {
    searchModalPosts.value = []
    searchModalUsers.value = []
    return
  }
  searchModalDebounce = setTimeout(async () => {
    searchModalLoading.value = true
    try {
      const [postsRes, usersRes] = await Promise.all([
        api.get(`/posts?search=${encodeURIComponent(searchModalQuery.value)}&limit=10`),
        api.get(`/users/search?q=${encodeURIComponent(searchModalQuery.value)}&limit=8`),
      ])
      searchModalPosts.value = postsRes.data.success ? postsRes.data.data.posts ?? [] : []
      searchModalUsers.value = usersRes.data.success ? usersRes.data.data.users ?? [] : []
    } catch {}
    finally { searchModalLoading.value = false }
  }, 320)
}

const searchGoToPost = (postId: string) => {
  closeSearchModal()
  // scroll feed to post (just close for now)
}
const searchGoToUser = (userId: string) => {
  closeSearchModal()
  router.push(`/profile/${userId}`)
}

// ── Three-dot post menu ────────────────────────────────────────────────────
const openMenuId = ref<string | null>(null)
const openPostMenu = (postId: string, event: MouseEvent) => {
  event.stopPropagation()
  openMenuId.value = openMenuId.value === postId ? null : postId
}
const closeMenu = () => { openMenuId.value = null; showNotifications.value = false }

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
  isLoadingBookmarks.value = true
  try {
    // Reuse the getUserFavouritePosts logic: fetch personalized but from bookmarks perspective
    // Bookmarks = favourited posts, fetched via the general posts endpoint filtered to favourited
    const res = await api.get('/posts', { params: { sort: 'new' } })
    if (res.data.success) {
      const allPosts = res.data.data.posts
      // We need status — get favourites from status
      const ids = allPosts.map((p: any) => p.id).join(',')
      if (!ids) { bookmarkedPosts.value = []; return }
      const statusRes = await api.get(`/posts/status?ids=${ids}`)
      if (statusRes.data.success) {
        const favouritedIds = new Set(statusRes.data.data.filter((s: any) => s.favourited).map((s: any) => s.id))
        bookmarkedPosts.value = allPosts.filter((p: any) => favouritedIds.has(p.id))
      }
    }
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

onUnmounted(() => { cleanupObservers(); disconnectWebSocket(); closeStory(); notifEventSource?.close(); window.removeEventListener('keydown', onGlobalKeydown) })

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

const fetchPosts = async () => {
  isLoadingPosts.value = true
  try {
    let loadedPosts: any[] = []
    if (feedMode.value === 'for-you') {
      const params = new URLSearchParams()
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/posts/personalized?${params.toString()}`)
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'subscriptions') {
      const params = new URLSearchParams()
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/follows/feed?${params.toString()}`)
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'trending') {
      const params = new URLSearchParams()
      params.append('sort', 'hot')
      if (!nsfwMode.value) params.append('safeMode', 'true')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'news') {
      const params = new URLSearchParams()
      params.append('sort', 'new')
      if (!nsfwMode.value) params.append('safeMode', 'true')
      if (selectedTag.value) params.append('tag', selectedTag.value)
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'photos') {
      const params = new URLSearchParams()
      params.append('hasMedia', 'true')
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    } else if (feedMode.value === 'nsfw') {
      const res = await api.get('/posts?safeMode=false')
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    } else {
      // fallback: general posts
      const params = new URLSearchParams()
      if (searchQuery.value) params.append('search', searchQuery.value)
      if (selectedCategory.value) params.append('category', selectedCategory.value)
      if (selectedTag.value) params.append('tag', selectedTag.value)
      params.append('sort', sortBy.value)
      if (!nsfwMode.value) params.append('safeMode', 'true')
      const res = await api.get(`/posts?${params.toString()}`)
      if (res.data.success) { cleanupObservers(); loadedPosts = res.data.data.posts }
    }
    posts.value = loadedPosts
    initPostStatus(loadedPosts)
    fetchFollowStatusForPosts(loadedPosts)
  } catch (e) {
    console.error('Failed to fetch posts', e)
  } finally {
    isLoadingPosts.value = false
  }
}

const selectedTag = ref('')
watch([selectedCategory, sortBy, nsfwMode, feedMode, selectedTag], () => { fetchPosts() })

// ── Notifications ───────────────────────────────────────────────────────────
const unreadCount = ref(0)
const showNotifications = ref(false)
const notifications = ref<any[]>([])
let notifEventSource: EventSource | null = null

const fetchUnreadCount = async () => {
  try {
    const res = await api.get('/notifications/count')
    if (res.data.success) unreadCount.value = res.data.data.count
  } catch {}
}

const fetchNotifications = async () => {
  try {
    const res = await api.get('/notifications')
    if (res.data.success) {
      notifications.value = res.data.data.notifications
      unreadCount.value = notifications.value.filter((n: any) => !n.is_read).length
    }
  } catch {}
}

const toggleNotifications = () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) fetchNotifications()
}

const markAllRead = async () => {
  try {
    await api.post('/notifications/read', {})
    notifications.value.forEach((n: any) => { n.is_read = true })
    unreadCount.value = 0
  } catch {}
}

const connectNotifSSE = () => {
  if (!auth.token) return
  try {
    notifEventSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(auth.token as string)}`)
    notifEventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type && data.type !== 'heartbeat') {
          notifications.value.unshift(data)
          unreadCount.value++
        }
      } catch {}
    }
    notifEventSource.onerror = () => { notifEventSource?.close(); notifEventSource = null }
  } catch {}
}

const notifTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    LIKE: 'лайкнул(а) вашу публикацию',
    COMMENT: 'прокомментировал(а) вашу публикацию',
    REPAW: 'репостнул(а) вашу публикацию',
    FOLLOW: 'подписался(ась) на вас',
    MENTION: 'упомянул(а) вас',
  }
  return map[type] ?? type
}

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
const fetchRecommendedUsers = async () => {
  try {
    const res = await api.get('/users/recommended')
    if (res.data.success) recommendedUsers.value = res.data.data.users
  } catch {}
}

// ── Trending events (hot posts used as event cards) ────────────────────────
const trendingEvents = ref<any[]>([])
const fetchTrendingEvents = async () => {
  try {
    const res = await api.get('/posts?sort=hot')
    if (res.data.success) trendingEvents.value = (res.data.data.posts as any[]).slice(0, 3)
  } catch {}
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
let ws: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsPingTimer: ReturnType<typeof setInterval> | null = null
let wsDestroyed = false

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
    wsPingTimer = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })) }, 30_000)
  }
  ws.onclose = () => { isOnline.value = false; if (wsPingTimer !== null) { clearInterval(wsPingTimer); wsPingTimer = null }; scheduleReconnect() }
  ws.onerror = () => {}
  ws.onmessage = (event) => { try { const d = JSON.parse(event.data); if (d?.type === 'pong') return } catch {} }
}

// reset drag state when modal closes
watch(showPostForm, (v) => { if (!v) { dragCounter = 0; formDragging.value = false } })
watch(nsfwMode, () => { fetchTrendingTags() })

const onGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearchModal() }
  if (e.key === 'Escape' && showSearchModal.value) closeSearchModal()
}
onMounted(() => { wsDestroyed = false; fetchPosts(); fetchStories(); connectWebSocket(); fetchRecommendedUsers(); fetchTrendingEvents(); fetchTrendingTags(); fetchUnreadCount(); connectNotifSSE(); fetchActiveAds(); window.addEventListener('keydown', onGlobalKeydown) })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito selection:bg-brand-accent/30" @click="closeMenu">

    <!-- Share toast -->
    <div v-if="shareToast" class="fixed top-20 left-1/2 -translate-x-1/2 z-[500] px-5 py-2.5 bg-brand-success text-white text-sm font-bold rounded-full shadow-xl pointer-events-none">
      {{ shareToast }}
    </div>

    <!-- Header -->
    <header class="fixed top-0 inset-x-0 h-14 md:h-16 bg-brand-bg/95 backdrop-blur-md border-b border-brand-border flex items-center justify-between px-4 md:px-6 z-40">
      <div class="flex items-center gap-2.5 cursor-pointer" @click="router.push({ name: 'home' })">
        <div class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 2C16 2 18 6 22 6C26 6 28 10 28 14C28 18 24 20 24 20C24 20 28 22 28 26C28 30 24 30 20 30C16 30 16 26 16 26C16 26 16 30 12 30C8 30 4 30 4 26C4 22 8 20 8 20C8 20 4 18 4 14C4 10 6 6 10 6C14 6 16 2 16 2Z" fill="#D5DDFF" stroke="#4C67CF" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="16" cy="16" r="4" fill="#D5DDFF" stroke="#4C67CF" stroke-width="2"/>
          </svg>
        </div>
        <span class="text-xl md:text-2xl font-extrabold tracking-tight text-white">Bloomly</span>
      </div>

      <!-- Desktop search trigger -->
      <button @click="openSearchModal"
        class="flex-1 max-w-xl mx-8 hidden md:flex items-center gap-3 bg-brand-card border border-brand-border rounded-full py-2.5 pl-4 pr-5 text-sm text-brand-muted hover:border-brand-accent/50 hover:text-white transition-colors cursor-text">
        <BIcon name="Search" class="h-4 w-4 flex-shrink-0" />
        <span class="truncate">{{ langStore.t.search }}</span>
        <span class="ml-auto flex items-center gap-1 text-xs text-brand-muted/60 bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border/60 hidden xl:flex">Ctrl K</span>
      </button>

      <div class="flex items-center gap-1.5 md:gap-3">
        <!-- Language selector (desktop only) -->
        <select v-model="langStore.currentLang" @change="langStore.setLang(langStore.currentLang)"
          class="hidden md:block bg-brand-card border border-brand-border rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-brand-accent">
          <option value="RU">RU</option>
          <option value="EN">EN</option>
          <option value="JP">JP</option>
          <option value="CN">CN</option>
        </select>
        <!-- Notifications -->
        <div class="relative">
          <button @click.stop="toggleNotifications" class="p-2 md:p-2.5 text-brand-muted hover:text-white hover:bg-white/5 rounded-full relative">
            <BIcon name="Bell" class="h-5 w-5" />
            <span v-if="unreadCount > 0" class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-brand-error rounded-full text-[10px] font-bold text-white border-2 border-brand-bg">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
          </button>
          <!-- Notification panel -->
          <Transition name="filter-expand">
            <div v-if="showNotifications" @click.stop
              class="absolute right-0 top-12 z-50 w-80 bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
              <div class="flex items-center justify-between px-4 py-3 border-b border-brand-border">
                <span class="font-bold text-sm">Уведомления</span>
                <button v-if="unreadCount > 0" @click="markAllRead" class="text-xs text-brand-accent hover:text-white font-semibold">Всё прочитано</button>
              </div>
              <div class="max-h-80 overflow-y-auto">
                <div v-if="notifications.length === 0" class="py-8 text-center text-brand-muted text-sm">Нет уведомлений</div>
                <div v-for="n in notifications" :key="n.id"
                  class="flex items-start gap-3 px-4 py-3 border-b border-brand-border/50 transition hover:bg-brand-border/30"
                  :class="!n.is_read ? 'bg-brand-accent/5' : ''">
                  <img :src="n.sender?.avatar_url || `https://ui-avatars.com/api/?name=${n.sender?.username ?? 'U'}&background=random`"
                    class="w-8 h-8 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5" />
                  <div class="min-w-0">
                    <p class="text-sm text-white leading-snug">
                      <span class="font-bold">{{ n.sender?.display_name || n.sender?.username }}</span>
                      {{ ' ' }}{{ notifTypeLabel(n.type) }}
                    </p>
                    <p class="text-xs text-brand-muted mt-0.5">{{ formatDate(n.created_at) }}</p>
                  </div>
                  <div v-if="!n.is_read" class="w-2 h-2 bg-brand-accent rounded-full flex-shrink-0 mt-1.5"></div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
        <!-- NSFW toggle -->
        <button @click="nsfwMode = !nsfwMode"
          class="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-full border transition-all duration-200"
          :class="nsfwMode ? 'bg-brand-error/15 border-brand-error/40 text-brand-error shadow-sm shadow-brand-error/20' : 'bg-brand-card border-brand-border text-brand-muted hover:text-white'">
          <BIcon :name="nsfwMode ? 'Eye' : 'EyeOff'" class="h-4 w-4" />
          <span class="text-xs font-bold hidden sm:block">NSFW</span>
          <div class="relative w-7 h-3.5 flex-shrink-0 hidden sm:block">
            <div class="w-7 h-3.5 rounded-full transition-colors" :class="nsfwMode ? 'bg-rose-500' : 'bg-white/20'"></div>
            <div class="absolute top-0.5 h-2.5 w-2.5 bg-white rounded-full shadow transition-all" :class="nsfwMode ? 'left-[calc(100%-11px)]' : 'left-0.5'"></div>
          </div>
        </button>
        <!-- Logout (desktop) -->
        <button @click="handleLogout" class="hidden md:flex p-2.5 text-brand-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-full">
          <BIcon name="LogOut" class="h-5 w-5" />
        </button>
      </div>
    </header>

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <!-- Left Sidebar -->
      <aside class="w-64 hidden lg:block sticky top-24 self-start space-y-6">
        <!-- User Profile Block -->
        <div class="flex items-center gap-3 cursor-pointer group" @click="router.push(`/profile/${auth.user?.id}`)">
          <img :src="auth.avatarUrl" class="w-12 h-12 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent transition-colors" />
          <div>
            <h3 class="font-bold text-white text-sm group-hover:text-brand-accent transition-colors">{{ auth.displayName }}</h3>
            <p class="text-xs text-brand-muted">Перейти в профиль</p>
          </div>
        </div>

        <nav class="space-y-1">
          <button @click="activeNav = 'home'; router.push({ name: 'home' })"
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
            :class="activeNav === 'home' ? 'bg-brand-card text-white' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
            <BIcon name="Home" class="w-5 h-5" /><span>Главная</span>
          </button>
          <button @click="activeNav = 'explore'"
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
            :class="activeNav === 'explore' ? 'bg-brand-card text-white' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
            <BIcon name="Compass" class="w-5 h-5" /><span>Исследовать</span>
          </button>
          <button @click="activeNav = 'messages'"
            class="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
            :class="activeNav === 'messages' ? 'bg-brand-card text-white' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
            <div class="flex items-center gap-3">
              <BIcon name="MessageCircle" class="w-5 h-5" /><span>Сообщения</span>
            </div>
            <span class="text-[10px] font-bold bg-brand-bg px-2 py-0.5 rounded-full text-white">1192</span>
          </button>
          <button @click="activeNav = 'friends'"
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
            :class="activeNav === 'friends' ? 'bg-brand-card text-white' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
            <BIcon name="Users" class="w-5 h-5" /><span>Друзья</span>
          </button>
          <button @click="activeNav = 'groups'"
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
            :class="activeNav === 'groups' ? 'bg-brand-card text-white' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
            <BIcon name="Grid" class="w-5 h-5" /><span>Группы</span>
          </button>
          <button @click="activeNav = 'bookmarks'"
            class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
            :class="activeNav === 'bookmarks' ? 'bg-brand-card text-white' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
            <BIcon name="Bookmark" class="w-5 h-5" /><span>Закладки</span>
          </button>
        </nav>

        <!-- Categories -->
        <div>
          <h4 class="px-4 text-xs font-bold text-brand-muted mb-2 uppercase tracking-wider">Категории</h4>
          <nav class="space-y-1">
            <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white">
              <BIcon name="Sticker" class="w-5 h-5" /><span>Стикеры</span>
            </button>
            <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white">
              <BIcon name="Gift" class="w-5 h-5" /><span>Подарки</span>
            </button>
            <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white">
              <BIcon name="ShoppingBag" class="w-5 h-5" /><span>Dealers' Den</span>
            </button>
            <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white">
              <BIcon name="HelpCircle" class="w-5 h-5" /><span>Помощь</span>
            </button>
          </nav>
        </div>

        <!-- Active Ad Banners (left sidebar) -->
        <template v-if="activeAds.length">
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
              <p v-if="ad.description" class="text-[11px] text-brand-muted mt-0.5 line-clamp-2">{{ ad.description }}</p>
            </div>
          </a>
        </template>
      </aside>

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
              <BIcon name="Bookmark" class="w-10 h-10 text-brand-muted" />
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noBookmarks }}</h3>
            <p class="text-brand-muted">{{ langStore.t.saveToBookmarks }}</p>
          </div>
          <div v-else class="space-y-4">
            <div v-for="post in bookmarkedPosts" :key="post.id"
              class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/30 transition-all">
              <div class="p-6">
                <div class="flex items-center gap-3 cursor-pointer mb-4" @click="router.push(`/profile/${post.author.id}`)">
                  <img :src="post.author.avatar_url || `https://ui-avatars.com/api/?name=${post.author.username}&background=random`" class="w-11 h-11 rounded-full object-cover border border-brand-border" />
                  <div>
                    <h4 class="font-bold text-white hover:text-brand-accent">{{ post.author.display_name || post.author.username }}</h4>
                    <p class="text-xs text-brand-muted">@{{ post.author.username }} · {{ formatDate(post.created_at) }}</p>
                  </div>
                </div>
                <p class="text-white/90 text-[16px] leading-relaxed mb-4 whitespace-pre-wrap">
                  <template v-for="seg in parseMentions(post.content)" :key="seg.key">
                    <span v-if="seg.type === 'text'">{{ seg.text }}</span>
                    <span v-else
                      class="inline-flex items-center gap-0.5 px-2 py-0.5 bg-brand-accent/15 border border-brand-accent/30 rounded-full text-brand-accent text-sm font-semibold cursor-pointer hover:bg-brand-accent/25 transition-all group relative align-baseline"
                      @click.stop="goToMention(seg.username!)">
                      @{{ seg.username }}
                      <span class="absolute bottom-full left-0 mb-2 z-50 w-40 bg-brand-card border border-brand-border rounded-xl p-2.5 shadow-2xl opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-150 pointer-events-none whitespace-normal">
                        <span class="font-bold text-white text-xs block">@{{ seg.username }}</span>
                        <span class="text-[10px] text-brand-muted mt-0.5 block">Нажми, чтобы открыть</span>
                      </span>
                    </span>
                  </template>
                </p>
                <div v-if="post.media_urls && post.media_urls.length" class="grid gap-2 mb-4"
                  :class="post.media_urls.length === 1 ? 'grid-cols-1' : post.media_urls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'">
                  <img v-for="(url, i) in post.media_urls" :key="i" :src="url"
                    class="w-full rounded-2xl object-cover max-h-[400px] border border-brand-border cursor-pointer hover:opacity-90"
                    @click="openLightbox(post.media_urls, i)" />
                </div>
                <!-- Tags below images in bookmarks -->
                <div v-if="post.category || (post.tags && post.tags.length)" class="flex flex-wrap gap-1.5 mt-3">
                  <span v-if="post.category" class="px-3 py-1 bg-brand-accent/20 text-brand-accent text-xs font-bold rounded-full border border-brand-accent/30">
                    {{ langStore.t[post.category as keyof typeof langStore.t] || post.category }}
                  </span>
                  <span v-for="tag in post.tags" :key="tag.tag?.id ?? tag"
                    class="px-3 py-1 bg-brand-bg text-brand-muted text-xs font-medium rounded-full border border-brand-border">
                    #{{ tag.tag?.name ?? tag }}
                  </span>
                </div>
              </div>
            </div>
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
                  <BIcon name="Plus" class="w-6 h-6 text-brand-muted" />
                </div>
              </div>
              <span class="text-[10px] font-semibold text-brand-muted">История</span>
            </div>
            <div v-for="story in stories" :key="story.id" class="flex flex-col items-center gap-1.5 cursor-pointer" @click="openStory(story)">
              <div class="relative">
                <div class="w-16 h-16 rounded-2xl p-[2px] bg-gradient-to-tr from-brand-accent to-brand-purple">
                  <img :src="story.user.avatar_url || `https://ui-avatars.com/api/?name=${story.user.username}&background=random`" class="w-full h-full rounded-xl border-2 border-brand-card object-cover" />
                </div>
              </div>
              <span class="text-[10px] font-semibold text-brand-muted max-w-[64px] truncate">{{ story.user.username }}</span>
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
            <img :src="auth.avatarUrl" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" />
            <span class="flex-1 text-sm text-brand-muted bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">Что нового?</span>
            <div class="flex items-center gap-2 text-brand-muted group-hover:text-white transition-colors ml-1">
              <BIcon name="ImagePlus" class="w-4.5 h-4.5" />
              <BIcon name="Hash" class="w-4.5 h-4.5" />
            </div>
          </button>

          <!-- Expanded composer -->
          <div v-else class="p-5 space-y-4">
            <!-- Author + textarea + send -->
            <div class="flex items-start gap-3">
              <img :src="auth.avatarUrl" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 mt-0.5" />
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
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-brand-muted hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all"
                title="Прикрепить медиа"
              >
                <BIcon name="ImagePlus" class="w-4 h-4" />
                Медиа
              </button>

              <!-- Tag input -->
              <div class="relative inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-bg transition-all">
                <BIcon name="Hash" class="w-4 h-4 text-brand-muted flex-shrink-0" />
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
                class="px-3 py-2 rounded-xl text-xs text-brand-muted bg-transparent border border-transparent hover:border-brand-border hover:bg-brand-bg outline-none transition-all cursor-pointer"
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
                  : 'border-transparent text-brand-muted hover:border-brand-border hover:bg-brand-bg hover:text-white'"
              >
                NSFW
              </button>

              <!-- Spacer -->
              <div class="flex-1" />

              <!-- Cancel -->
              <button
                @click="closeCreateModal"
                class="text-xs font-semibold text-brand-muted hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>

        <!-- Feed Filters -->
        <div class="flex flex-wrap gap-2 px-2">
          <button @click="feedMode = 'for-you'; selectedTag = ''"
            :class="feedMode === 'for-you' ? 'bg-brand-card text-white' : 'text-brand-muted hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Для Вас
          </button>
          <button @click="feedMode = 'subscriptions'; selectedTag = ''"
            :class="feedMode === 'subscriptions' ? 'bg-brand-card text-white' : 'text-brand-muted hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Подписки
          </button>
          <button @click="feedMode = 'news'; selectedTag = ''"
            :class="feedMode === 'news' ? 'bg-brand-card text-white' : 'text-brand-muted hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Общие новости
          </button>
          <button @click="feedMode = 'photos'; selectedTag = ''"
            :class="feedMode === 'photos' ? 'bg-brand-card text-white' : 'text-brand-muted hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            Фото
          </button>
          <button v-if="nsfwMode" @click="feedMode = 'nsfw'; selectedTag = ''"
            :class="feedMode === 'nsfw' ? 'bg-brand-card text-white' : 'text-brand-muted hover:text-white'"
            class="px-4 py-2 rounded-2xl text-sm font-bold transition-all duration-200">
            NSFW
          </button>
        </div>

        <!-- Events Section -->
        <div class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
          <h3 class="font-bold text-white mb-4">Мероприятие в твоём городе:</h3>
          <div class="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
            <!-- Event Card 1 -->
            <div class="min-w-[240px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border">
              <div class="h-24 bg-gradient-to-r from-purple-900 to-indigo-900 relative">
                <div class="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white">FoxWood: back to 2000</div>
              </div>
              <div class="p-3">
                <div class="flex items-center gap-1.5 text-[10px] text-brand-muted mb-1">
                  <BIcon name="Calendar" class="w-3 h-3" /> 15 мая - 18 мая 2025
                </div>
                <div class="flex items-center gap-1.5 text-[10px] text-brand-muted">
                  <BIcon name="MapPin" class="w-3 h-3" /> Москва
                </div>
              </div>
            </div>
            <!-- Event Card 2 -->
            <div class="min-w-[240px] bg-brand-bg rounded-2xl overflow-hidden border border-brand-border">
              <div class="h-24 bg-gradient-to-r from-orange-900 to-red-900 relative">
                <div class="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-white">AnyFurry Fest V</div>
              </div>
              <div class="p-3">
                <div class="flex items-center gap-1.5 text-[10px] text-brand-muted mb-1">
                  <BIcon name="Calendar" class="w-3 h-3" /> 19 октября 12:00 - 21:00
                </div>
                <div class="flex items-center gap-1.5 text-[10px] text-brand-muted">
                  <BIcon name="MapPin" class="w-3 h-3" /> Москва, Новосущёвский переулок
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Active hashtag filter pill -->
        <Transition name="filter-expand">
          <div v-if="selectedTag" class="flex items-center gap-2 bg-brand-card border border-brand-accent/30 rounded-2xl px-4 py-2.5 shadow-xl">
            <BIcon name="Hash" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
            <span class="text-sm font-bold text-brand-accent flex-1">#{{ selectedTag }}</span>
            <span class="text-[10px] text-brand-muted">фильтр по тегу</span>
            <button @click="selectedTag = ''" class="ml-1 p-1 text-brand-muted hover:text-white hover:bg-white/8 rounded-lg transition-colors">
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
            <BIcon name="MessageSquare" class="w-10 h-10 text-brand-muted" />
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noPosts }}</h3>
          <p class="text-brand-muted">{{ langStore.t.beFirst }}</p>
        </div>

        <div v-else class="space-y-4">
          <div v-for="post in posts" :key="post.id"
            :ref="(el) => setPostRef(el, post.id)"
            class="post-card bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/30 transition-all">

            <div class="p-5 md:p-6">
              <!-- Header -->
              <div class="flex items-start justify-between gap-3 mb-4">
                <div class="flex items-center gap-3 min-w-0 cursor-pointer" @click="router.push(`/profile/${post.author.id}`)">
                  <div class="relative flex-shrink-0">
                    <img
                      :src="post.author.avatar_url || `https://ui-avatars.com/api/?name=${post.author.username}&background=random`"
                      class="w-11 h-11 rounded-full object-cover border border-brand-border"
                    />
                    <button
                      v-if="auth.user && post.author.id !== auth.user?.id && followStatus[post.author.id] === false"
                      @click.stop="toggleFollow(post.author.id)"
                      class="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-accent rounded-full flex items-center justify-center border-2 border-brand-card hover:bg-brand-accent-plus transition-colors"
                      title="Подписаться"
                    >
                      <BIcon name="Plus" class="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <div class="min-w-0">
                    <h4 class="font-bold text-white truncate hover:text-brand-accent">{{ post.author.display_name || post.author.username }}</h4>
                    <p class="text-xs text-brand-muted truncate">@{{ post.author.username }} · {{ formatDate(post.created_at) }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-2 flex-shrink-0">
                  <span
                    v-if="post.is_nsfw"
                    class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-brand-error/15 text-brand-error border border-brand-error/30"
                  >
                    NSFW
                  </span>
                  <div class="relative">
                    <button @click="openPostMenu(post.id, $event)" class="text-brand-muted hover:text-white p-2 rounded-full hover:bg-white/5">
                      <BIcon name="MoreHorizontal" class="w-5 h-5" />
                    </button>
                    <div v-if="openMenuId === post.id"
                      class="absolute right-0 top-10 z-30 w-48 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                      <button v-if="post.author.id === auth.user?.id" @click="startEditPost(post)"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                        <BIcon name="Pencil" class="w-4 h-4 text-brand-accent" />{{ langStore.t.editPost }}
                      </button>
                      <button v-if="post.author.id === auth.user?.id" @click="deletePostAction(post.id)"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10">
                        <BIcon name="Trash2" class="w-4 h-4" />{{ langStore.t.deletePost }}
                      </button>
                      <button @click="reportPost(post.id)"
                        class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-muted hover:bg-white/5 hover:text-white">
                        <BIcon name="Flag" class="w-4 h-4" />{{ langStore.t.report }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Content -->
              <div class="space-y-3">
                <div :class="{'blur-md hover:blur-none cursor-pointer': post.is_nsfw}">
                  <div v-if="editingPostId === post.id" class="mb-1">
                    <textarea v-model="editContent" autofocus
                      class="w-full bg-brand-bg border border-brand-accent/50 rounded-2xl px-4 py-3 text-white text-[15px] leading-relaxed resize-none outline-none min-h-[90px] focus:border-brand-accent"></textarea>
                    <div class="flex gap-2 mt-2 justify-end">
                      <button @click="cancelEdit" class="px-4 py-1.5 text-sm text-brand-muted hover:text-white hover:bg-white/5 rounded-xl">{{ langStore.t.cancel }}</button>
                      <button @click="saveEditPost(post.id)" class="px-4 py-1.5 text-sm bg-brand-accent text-white font-bold rounded-xl hover:bg-brand-accent-plus">Сохранить</button>
                    </div>
                  </div>

                  <p v-else class="text-white/95 text-sm md:text-[15px] leading-relaxed whitespace-pre-wrap">
                    <template v-for="seg in parseMentions(post.content)" :key="seg.key">
                      <span v-if="seg.type === 'text'">{{ seg.text }}</span>
                      <span v-else
                        class="inline-flex items-center gap-0.5 px-2 py-0.5 bg-brand-accent/15 border border-brand-accent/30 rounded-full text-brand-accent text-sm font-semibold cursor-pointer hover:bg-brand-accent/25 transition-all group relative align-baseline"
                        @click.stop="goToMention(seg.username!)">
                        @{{ seg.username }}
                        <span class="absolute bottom-full left-0 mb-2 z-50 w-40 bg-brand-card border border-brand-border rounded-xl p-2.5 shadow-2xl opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-150 pointer-events-none whitespace-normal">
                          <span class="font-bold text-white text-xs block">@{{ seg.username }}</span>
                          <span class="text-[10px] text-brand-muted mt-0.5 block">Нажми, чтобы открыть</span>
                        </span>
                      </span>
                    </template>
                  </p>
                </div>

                <div v-if="post.media_urls && post.media_urls.length" class="grid gap-2"
                  :class="post.media_urls.length === 1 ? 'grid-cols-1' : post.media_urls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'">
                  <img
                    v-for="(url, i) in post.media_urls"
                    :key="i"
                    :src="url"
                    class="w-full rounded-2xl object-cover max-h-[520px] border border-brand-border cursor-pointer hover:opacity-90"
                    @click="openLightbox(post.media_urls, i)"
                  />
                </div>
              </div>

              <!-- Meta -->
              <div class="flex flex-wrap items-center gap-1.5 mt-4 mb-3">
                <span v-if="post.category" class="px-3 py-1 bg-brand-accent/20 text-brand-accent text-xs font-bold rounded-full border border-brand-accent/30">
                  {{ langStore.t[post.category as keyof typeof langStore.t] || post.category }}
                </span>
                <span v-for="tag in post.tags" :key="tag.tag.id"
                  class="px-3 py-1 bg-brand-bg text-brand-muted text-xs font-medium rounded-full border border-brand-border hover:bg-brand-border hover:text-white cursor-pointer">
                  #{{ tag.tag.name }}
                </span>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between pt-4 border-t border-brand-border">
                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1 bg-brand-bg rounded-full p-1 border border-brand-border">
                    <button @click="votePost(post.id, 1)"
                      class="p-1 rounded-full transition-all duration-150"
                      :class="postStatus[post.id]?.userVote === 1
                        ? 'bg-brand-success/25 text-brand-success shadow-[0_0_8px_0px] shadow-brand-success/40'
                        : 'text-brand-muted hover:bg-brand-success/20 hover:text-brand-success'">
                      <BIcon name="ArrowUp" class="w-4 h-4" />
                    </button>
                    <span class="font-bold text-sm min-w-[28px] text-center"
                      :class="postStatus[post.id]?.userVote === 1 ? 'text-emerald-400' : postStatus[post.id]?.userVote === -1 ? 'text-rose-400' : post.rating > 0 ? 'text-emerald-400' : post.rating < 0 ? 'text-rose-400' : 'text-white'">
                      {{ post.rating }}
                    </span>
                    <button @click="votePost(post.id, -1)"
                      class="p-1 rounded-full transition-all duration-150"
                      :class="postStatus[post.id]?.userVote === -1
                        ? 'bg-rose-500/25 text-rose-400 shadow-[0_0_8px_0px] shadow-rose-500/40'
                        : 'text-brand-muted hover:bg-rose-500/20 hover:text-rose-400'">
                      <BIcon name="ArrowDown" class="w-4 h-4" />
                    </button>
                  </div>

                  <button @click="toggleRepaw(post.id)"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border"
                    :class="postStatus[post.id]?.repawed
                      ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                      : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent/30'"
                    :title="langStore.t.repaw">
                    <BIcon name="Repeat2" class="w-4 h-4" />
                    <span class="text-sm">{{ postStatus[post.id]?.repawCount ?? post._count?.repaws ?? 0 }}</span>
                  </button>

                  <button @click="toggleComments(post.id)"
                    class="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs"
                    :class="expandedComments.has(post.id)
                      ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                      : 'bg-brand-bg border-brand-border text-brand-muted hover:text-white'">
                    <BIcon name="MessageSquare" class="w-4 h-4" />
                    <span>{{ post._count?.comments ?? 0 }}</span>
                  </button>
                </div>

                <div class="flex items-center gap-1">
                  <button @click="toggleFavourite(post.id)"
                    class="p-2 rounded-full border"
                    :class="postStatus[post.id]?.favourited
                      ? 'bg-brand-yellow/15 border-brand-yellow/40 text-brand-yellow'
                      : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-yellow hover:border-brand-yellow/30'"
                    :title="langStore.t.favourite">
                    <BIcon :name="postStatus[post.id]?.favourited ? 'BookmarkCheck' : 'Bookmark'" class="w-4.5 h-4.5" />
                  </button>
                  <button @click="sharePost(post.id)"
                    class="p-2 rounded-full bg-brand-bg border border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent/30"
                    :title="langStore.t.share">
                    <BIcon name="Share2" class="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              <div v-if="expandedComments.has(post.id)" class="mt-4 pt-4 border-t border-brand-border px-0">
                <PostComments :post-id="post.id" />
              </div>
            </div>
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
            <p class="text-xs text-brand-muted">Хештеги появятся после публикации постов</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="tag in trendingTags.slice(0, 10)" :key="tag.name"
              class="flex items-center justify-between cursor-pointer group"
              @click="activeNav = 'home'; feedMode = 'trending'; selectedCategory = ''; sortBy = 'hot'; selectedTag = tag.name">
              <span class="text-sm text-brand-muted group-hover:text-white transition-colors">{{ tag.name }}</span>
              <div class="flex items-center gap-1.5 text-xs font-bold" :class="tag.trend === 'up' ? 'text-brand-success' : tag.trend === 'down' ? 'text-brand-error' : 'text-brand-muted'">
                <BIcon :name="tag.trend === 'up' ? 'TrendingUp' : tag.trend === 'down' ? 'TrendingDown' : 'Minus'" class="w-3 h-3" />
                {{ (tag.totalCount / 1000).toFixed(1) }}k
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
          <div v-if="recommendedUsers.length === 0" class="space-y-2">
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
              v-for="user in recommendedUsers.slice(0, 5)"
              :key="user.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-card/60 transition-colors group cursor-pointer"
              @click="router.push(`/profile/${user.id}`)"
            >
              <!-- Avatar -->
              <div class="relative flex-shrink-0">
                <img
                  :src="user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`"
                  class="w-10 h-10 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent/40 transition-colors"
                />
              </div>

              <!-- Name + username -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate leading-tight">{{ user.display_name || user.username }}</p>
                <p class="text-xs text-brand-muted truncate">@{{ user.username }}</p>
              </div>

              <!-- Follow button -->
              <button
                @click.stop="toggleFollow(user.id)"
                class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                :class="followStatus[user.id]
                  ? 'border-brand-border text-brand-muted hover:border-rose-500/40 hover:text-rose-400'
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
                <p class="text-[11px] text-brand-muted">Исчезнет через 24 часа</p>
              </div>
              <button @click="showStoryModal = false; storyMediaUrl = ''; storyMediaUploadRef?.clearAll()"
                class="p-1.5 text-brand-muted hover:text-white hover:bg-white/8 rounded-full transition-colors">
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
                <p class="text-xs text-brand-muted">Нажми или перетащи сюда</p>
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
              <div class="flex items-center gap-1.5 text-[11px] text-brand-muted">
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
         SEARCH MODAL
    ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showSearchModal" class="fixed inset-0 z-[500] flex items-start justify-center pt-[10vh] px-4" @click.self="closeSearchModal">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="closeSearchModal"></div>

          <!-- Panel -->
          <div class="relative w-full max-w-2xl bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 78vh">
            <!-- Search input row -->
            <div class="flex items-center gap-3 px-5 py-4 border-b border-brand-border flex-shrink-0">
              <BIcon name="Search" class="h-5 w-5 text-brand-muted flex-shrink-0" />
              <input
                id="search-modal-input"
                type="text"
                v-model="searchModalQuery"
                @input="onSearchModalInput"
                @keydown.esc="closeSearchModal"
                :placeholder="langStore.t.search"
                class="flex-1 bg-transparent text-white placeholder-brand-muted text-base outline-none"
              />
              <button @click="closeSearchModal" class="p-1 text-brand-muted hover:text-white transition-colors">
                <BIcon name="X" class="h-5 w-5" />
              </button>
            </div>

            <!-- Tabs -->
            <div class="flex items-center gap-1 px-5 pt-3 pb-2 border-b border-brand-border flex-shrink-0">
              <button
                v-for="tab in ([{ id: 'posts', icon: 'FileText', label: 'Посты' }, { id: 'accounts', icon: 'Users', label: 'Аккаунты' }] as const)"
                :key="tab.id"
                @click="searchModalTab = tab.id"
                :class="[
                  'flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-all',
                  searchModalTab === tab.id ? 'bg-brand-accent text-white shadow-sm' : 'text-brand-muted hover:text-white hover:bg-white/5'
                ]"
              >
                <BIcon :name="tab.icon" class="h-4 w-4" />
                {{ tab.label }}
              </button>
            </div>

            <!-- Results -->
            <div class="flex-1 overflow-y-auto">
              <!-- Empty state -->
              <div v-if="!searchModalQuery.trim()" class="flex flex-col items-center justify-center py-16 text-brand-muted">
                <BIcon name="Search" class="h-10 w-10 mb-3 opacity-30" />
                <p class="text-sm">Начните вводить запрос...</p>
              </div>

              <!-- Loading -->
              <div v-else-if="searchModalLoading" class="flex items-center justify-center py-12">
                <BIcon name="Loader2" class="h-6 w-6 text-brand-accent animate-spin" />
              </div>

              <!-- Posts tab -->
              <template v-else-if="searchModalTab === 'posts'">
                <div v-if="searchModalPosts.length === 0" class="flex flex-col items-center justify-center py-14 text-brand-muted">
                  <BIcon name="FileSearch" class="h-8 w-8 mb-2 opacity-30" />
                  <p class="text-sm">Постов не найдено</p>
                </div>
                <div v-else>
                  <button
                    v-for="post in searchModalPosts"
                    :key="post.id"
                    @click="searchGoToPost(post.id)"
                    class="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-brand-border/50 last:border-0"
                  >
                    <img :src="post.author?.avatar_url || `https://ui-avatars.com/api/?name=${post.author?.username ?? 'U'}&background=random`"
                      class="w-9 h-9 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5" />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-sm font-semibold text-white">{{ post.author?.display_name || post.author?.username }}</span>
                        <span class="text-xs text-brand-muted">@{{ post.author?.username }}</span>
                        <span v-if="post.is_nsfw" class="text-[10px] font-bold bg-brand-error/20 text-brand-error px-1.5 py-0.5 rounded-full">NSFW</span>
                      </div>
                      <p class="text-sm text-brand-muted line-clamp-2 leading-snug">{{ post.content }}</p>
                      <div v-if="post.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
                        <span v-for="tag in post.tags.slice(0,4)" :key="tag" class="text-[11px] text-brand-accent">#{{ tag }}</span>
                      </div>
                    </div>
                    <div v-if="post.media_urls?.length" class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-brand-border">
                      <img :src="post.media_urls[0]" class="w-full h-full object-cover" />
                    </div>
                  </button>
                </div>
              </template>

              <!-- Accounts tab -->
              <template v-else-if="searchModalTab === 'accounts'">
                <div v-if="searchModalUsers.length === 0" class="flex flex-col items-center justify-center py-14 text-brand-muted">
                  <BIcon name="UserSearch" class="h-8 w-8 mb-2 opacity-30" />
                  <p class="text-sm">Аккаунты не найдены</p>
                </div>
                <div v-else>
                  <button
                    v-for="user in searchModalUsers"
                    :key="user.id"
                    @click="searchGoToUser(user.id)"
                    class="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-brand-border/50 last:border-0"
                  >
                    <img :src="user.avatar_url || `https://ui-avatars.com/api/?name=${user.username ?? 'U'}&background=random`"
                      class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" />
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                      <p class="text-xs text-brand-muted">@{{ user.username }}</p>
                      <p v-if="user.bio" class="text-xs text-brand-muted/70 mt-0.5 line-clamp-1">{{ user.bio }}</p>
                    </div>
                    <div class="flex-shrink-0 text-xs text-brand-muted">
                      <span class="font-bold text-white">{{ user._count?.followers ?? 0 }}</span> подписчиков
                    </div>
                  </button>
                </div>
              </template>
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
                <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
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
                  :class="feedMode === 'for-you' ? 'bg-brand-accent text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-brand-muted'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Sparkles" class="w-4 h-4" />Для вас
                </button>
                <button @click="feedMode = 'subscriptions'"
                  :class="feedMode === 'subscriptions' ? 'bg-brand-accent text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-brand-muted'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Users" class="w-4 h-4" />Подписки
                </button>
                <button @click="feedMode = 'trending'"
                  :class="feedMode === 'trending' ? 'bg-brand-yellow text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-brand-muted'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="TrendingUp" class="w-4 h-4" />В тренде
                </button>
                <button @click="feedMode = 'news'"
                  :class="feedMode === 'news' ? 'bg-brand-success text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-brand-muted'"
                  class="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all">
                  <BIcon name="Newspaper" class="w-4 h-4" />Новости
                </button>
                <button @click="feedMode = 'photos'"
                  :class="feedMode === 'photos' ? 'bg-brand-pink text-white shadow-sm' : 'bg-brand-bg border border-brand-border text-brand-muted'"
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
              <div v-if="recommendedUsers.length">
                <h3 class="text-xs font-bold text-brand-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <BIcon name="UserPlus" class="w-3.5 h-3.5" />Рекомендуемые
                </h3>
                <div class="space-y-2">
                  <div v-for="user in recommendedUsers" :key="user.id"
                    class="flex items-center gap-3 p-3 rounded-2xl bg-brand-bg border border-brand-border hover:bg-brand-border cursor-pointer"
                    @click="closeMobileSearch(); router.push(`/profile/${user.id}`)">
                    <img :src="user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`"
                      class="w-9 h-9 rounded-full object-cover border border-brand-border flex-shrink-0" />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                      <p class="text-xs text-brand-muted">@{{ user.username }}</p>
                    </div>
                    <button class="px-3 py-1.5 text-xs font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30 rounded-xl hover:bg-brand-accent/30 flex-shrink-0">
                      + Follow
                    </button>
                  </div>
                </div>
              </div>

              <!-- Language selector (mobile) -->
              <div>
                <h3 class="text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">Язык</h3>
                <div class="flex gap-2 flex-wrap">
                  <button v-for="lang in ['RU','EN','JP','CN']" :key="lang"
                    @click="langStore.setLang(lang)"
                    :class="langStore.currentLang === lang ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' : 'bg-brand-bg border-brand-border text-brand-muted'"
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
          :class="mobileActiveTab === 'home' ? 'text-white' : 'text-brand-muted'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'home'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-accent/30 blur-sm"></div>
            <BIcon name="Home" class="w-6 h-6 relative transition-transform duration-200"
              :class="mobileActiveTab === 'home' ? 'scale-110 text-white' : ''" />
          </div>
          <span class="text-[10px] font-semibold">Главная</span>
          <div v-if="mobileActiveTab === 'home'" class="w-1 h-1 rounded-full bg-brand-accent mt-0.5"></div>
        </button>

        <!-- Friends -->
        <button
          @click="mobileActiveTab = 'friends'; activeNav = 'bookmarks'"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'friends' ? 'text-white' : 'text-brand-muted'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'friends'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-purple/30 blur-sm"></div>
            <BIcon name="Users" class="w-6 h-6 relative transition-transform duration-200"
              :class="mobileActiveTab === 'friends' ? 'scale-110 text-brand-purple' : ''" />
          </div>
          <span class="text-[10px] font-semibold">Друзья</span>
          <div v-if="mobileActiveTab === 'friends'" class="w-1 h-1 rounded-full bg-brand-purple mt-0.5"></div>
        </button>

        <!-- Create post button (center FAB) -->
        <button
          @click="activeNav = 'home'; mobileActiveTab = 'home'"
          class="flex-shrink-0 w-14 h-14 rounded-2xl bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/40 hover:bg-brand-accent-plus hover:shadow-brand-accent/60 active:scale-95 transition-all duration-150 -mt-2">
          <BIcon name="Plus" class="w-7 h-7 text-white" />
        </button>

        <!-- Search / Menu -->
        <button
          @click="openMobileSearch"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'search' ? 'text-white' : 'text-brand-muted'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'search'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-success/30 blur-sm"></div>
            <BIcon name="Search" class="w-6 h-6 relative transition-transform duration-200"
              :class="mobileActiveTab === 'search' ? 'scale-110 text-brand-success' : ''" />
          </div>
          <span class="text-[10px] font-semibold">Поиск</span>
          <div v-if="mobileActiveTab === 'search'" class="w-1 h-1 rounded-full bg-brand-success mt-0.5"></div>
        </button>

        <!-- Profile -->
        <button
          @click="mobileActiveTab = 'profile'; activeNav = 'profile'; router.push(`/profile/${auth.user?.id}`)"
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl transition-all duration-200 min-w-[64px]"
          :class="mobileActiveTab === 'profile' ? 'text-white' : 'text-brand-muted'">
          <div class="relative">
            <div v-if="mobileActiveTab === 'profile'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-yellow/30 blur-sm"></div>
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl"
              class="w-6 h-6 rounded-full object-cover border-2 transition-all duration-200 relative"
              :class="mobileActiveTab === 'profile' ? 'border-brand-yellow scale-110' : 'border-white/20'" />
            <BIcon v-else name="User" class="w-6 h-6 relative" :class="mobileActiveTab === 'profile' ? 'scale-110 text-brand-yellow' : ''" />
          </div>
          <span class="text-[10px] font-semibold">Профиль</span>
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
            <img :src="activeStory.user?.avatar_url || `https://ui-avatars.com/api/?name=${activeStory.user?.username}&background=random`" class="w-10 h-10 rounded-full border-2 border-purple-500 object-cover" />
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
