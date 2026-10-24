<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useMobileHubStore } from '@/stores/mobileHub'
import api from '@/api'
import { useFeed } from '@/composables/useFeed'
import { useFollowState } from '@/composables/useFollowState'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { adsForPlacement, adSlotModeFor, type AdPlacementKey } from '@/lib/adSlots'
import { vTrackView } from '@/directives/trackView'
import BIcon from './BIcon.vue'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import AdSlot from './ads/AdSlot.vue'
import SkeletonPost from './SkeletonPost.vue'
import PostCard from './PostCard.vue'
import StoriesBar from './StoriesBar.vue'
import StoryViewer from './StoryViewer.vue'
import StoryMobileOnlyModal from './StoryMobileOnlyModal.vue'
import EmptyState from './ui/EmptyState.vue'
import FeedTabs from './feed/FeedTabs.vue'
import FeedEvents from './feed/FeedEvents.vue'
import FeedTrendingTags from './feed/FeedTrendingTags.vue'
import FeedRecommendedUsers from './feed/FeedRecommendedUsers.vue'
import PostComposer from './feed/PostComposer.vue'

const auth = useAuthStore()
const langStore = useLangStore()
const groupsStore = useGroupsStore()
const mobileHub = useMobileHubStore()
const follows = useFollowState()
// nsfwMode ('hide' | 'blur' | 'show') уходит в каждый запрос ленты; nsfwEnabled ('show') — для интерфейса.
const { nsfwMode, nsfwEnabled } = useNsfwMode()

const activeNav = ref('home')

// ── Лента ────────────────────────────────────────────────────────────────────
const {
  mode, sort, sortable, posts, isLoading, isLoadingMore, hasMore, loadError, newPostsCount,
  followStatus, reload, loadMore, retry, startWatching, stopWatching, prepend, remove, replace, stateOf,
} = useFeed(nsfwMode)

// Вкладка NSFW существует только в режиме 'show' — выключили режим, не оставляем пользователя на ней
watch(nsfwEnabled, (on) => { if (!on && mode.value === 'nsfw') mode.value = 'for-you' })

const sentinel = ref<HTMLElement | null>(null)
useInfiniteScroll({
  target: sentinel,
  canLoad: () => activeNav.value === 'home' && hasMore.value && !isLoading.value && !isLoadingMore.value && !loadError.value,
  load: loadMore,
})

const trendingTags = ref<InstanceType<typeof FeedTrendingTags> | null>(null)
const onPublished = (post: any) => {
  prepend(post)
  trendingTags.value?.refresh()
}

const showNewPosts = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
  reload()
}

// «Новые посты» проверяем, только пока открыта сама лента
watch(activeNav, (nav) => { if (nav === 'home') startWatching(); else stopWatching() })

// ── Закладки ─────────────────────────────────────────────────────────────────
const bookmarkedPosts = ref<any[]>([])
const isLoadingBookmarks = ref(false)
async function fetchBookmarks() {
  if (!auth.user?.id) return
  isLoadingBookmarks.value = true
  try {
    // Отдельный эндпоинт избранного — не тянем все посты
    const res = await api.get(`/posts/user/${auth.user.id}/likes`)
    bookmarkedPosts.value = res.data.success ? (res.data.data.posts ?? []) : []
  } catch { /* останется прежний список */ } finally {
    isLoadingBookmarks.value = false
  }
}
watch(activeNav, (nav) => { if (nav === 'bookmarks') fetchBookmarks() })
const removeBookmark = (id: string) => { bookmarkedPosts.value = bookmarkedPosts.value.filter((p) => p.id !== id) }
const replaceBookmark = (post: any) => {
  const index = bookmarkedPosts.value.findIndex((p) => p.id === post.id)
  if (index !== -1) bookmarkedPosts.value[index] = post
}

// ── Реклама ──────────────────────────────────────────────────────────────────
// Чужая реклама показывается только на Free; на Lite она скрыта совсем, а Pro и Business видят
// вместо неё предложение разместить свою (со скидкой тарифа 15 % / 30 %).
const activeAds = ref<any[]>([])
const adSlotMode = computed<'ads' | 'offer' | 'hidden'>(() => adSlotModeFor(auth.user?.subscription_tier ?? 'free'))
const adFor = (placement: AdPlacementKey) => adsForPlacement(activeAds.value, placement)[0]
async function fetchActiveAds() {
  if (adSlotMode.value !== 'ads') return
  try {
    const res = await api.get('/admin/ads/active')
    if (res.data.success) activeAds.value = res.data.data.ads
  } catch { /* без рекламы лента работает как обычно */ }
}

// ── Истории ──────────────────────────────────────────────────────────────────
interface StoryItem {
  id: string
  image_url: string | null
  created_at: string
  expires_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}
const showStoryMobileNotice = ref(false)
const storiesBarRef = ref<InstanceType<typeof StoriesBar> | null>(null)
// Сгруппированные истории для просмотра: [[истории A], [истории B], …]
const storyGroups = ref<StoryItem[][]>([])
const storyViewerOpen = ref(false)
const storyViewerGroupIdx = ref(0)
const storyViewerStoryIdx = ref(0)

function openStoryViewer(story: StoryItem, group: StoryItem[]) {
  // Полный список групп берём из StoriesBar — в том же порядке, в каком он их рисует
  const allGroups = (storiesBarRef.value?.userStories as StoryItem[][] | undefined) ?? []
  if (allGroups.length) {
    storyGroups.value = allGroups
    storyViewerGroupIdx.value = Math.max(0, allGroups.findIndex((g) => g[0].user.id === story.user.id))
  } else {
    storyGroups.value = [group]
    storyViewerGroupIdx.value = 0
  }
  storyViewerStoryIdx.value = Math.max(0, group.findIndex((s) => s.id === story.id))
  storyViewerOpen.value = true
}
// Кнопка «история» в нижней навигации телефона
watch(() => mobileHub.openStory, (requested) => { if (requested) { showStoryMobileNotice.value = true; mobileHub.consumeStory() } })

// ── Жизненный цикл ───────────────────────────────────────────────────────────
onMounted(() => {
  reload()
  fetchActiveAds()
  if (auth.user && !groupsStore.myGroups.length) groupsStore.loadMyGroups().catch(() => {})
  if (auth.user && !groupsStore.mySubscriptions.length) groupsStore.loadMySubscriptions().catch(() => {})
})

// MainLayout кэшируется <KeepAlive> (см. App.vue): лента и позиция прокрутки переживают переход на
// другую страницу и обратно. onMounted срабатывает один раз, поэтому то, что должно работать только
// пока страница на экране (опрос «Новых постов»), включается здесь и выключается в onDeactivated.
let savedScrollY: number | null = null
// Если вышли и под другим аккаунтом вернулись, не показываем закэшированную чужую ленту
let loadedForUserId: string | null = auth.user?.id ?? null
const userKey = computed(() => auth.user?.id ?? 'guest')

onActivated(() => {
  if ((auth.user?.id ?? null) !== loadedForUserId) {
    loadedForUserId = auth.user?.id ?? null
    savedScrollY = null
    follows.reset()
    reload()
    fetchActiveAds()
  }
  if (activeNav.value === 'home') startWatching()
  if (savedScrollY !== null) {
    const y = savedScrollY
    savedScrollY = null
    // После собственного scrollBehavior роутера, который при обычном переходе сбрасывает прокрутку наверх
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
  }
})
onDeactivated(() => {
  savedScrollY = window.scrollY
  stopWatching()
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito selection:bg-brand-accent/30">
    <AppHeader :nsfw-mode="nsfwEnabled" />

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8">
      <AppSidebar v-model:activeNav="activeNav">
        <template #bottom>
          <div v-if="adSlotMode !== 'hidden'" class="stack-y-3">
            <template v-if="adSlotMode === 'ads'">
              <AdSlot v-for="ad in adsForPlacement(activeAds, 'left_menu')" :key="ad.id" :ad="ad" placement="left_menu" />
            </template>
            <AdSlot v-else :ad="null" placement="left_menu" />
          </div>
        </template>
      </AppSidebar>

      <main class="flex-1 min-w-0 stack-y-4 md:stack-y-5 pb-28 md:pb-20 max-w-2xl w-full">

        <!-- ── Закладки ──────────────────────────────────────────────────── -->
        <div v-if="activeNav === 'bookmarks'" class="stack-y-4">
          <div class="panel-card p-6 flex items-center gap-3">
            <BIcon name="Bookmark" class="w-6 h-6 text-brand-yellow" />
            <h2 class="text-xl font-bold text-white">{{ langStore.t.bookmarks }}</h2>
          </div>
          <template v-if="isLoadingBookmarks">
            <SkeletonPost v-for="n in 3" :key="n" />
          </template>
          <EmptyState v-else-if="!bookmarkedPosts.length" icon="Bookmark" :title="langStore.t.noBookmarks" :text="langStore.t.saveToBookmarks" />
          <template v-else>
            <PostCard v-for="post in bookmarkedPosts" :key="post.id" :post="post" @deleted="removeBookmark" @updated="replaceBookmark" />
          </template>
        </div>

        <!-- ── Лента ─────────────────────────────────────────────────────── -->
        <template v-else>
          <StoriesBar :key="userKey" ref="storiesBarRef" @open="openStoryViewer" @create="showStoryMobileNotice = true" />

          <PostComposer :key="userKey" @published="onPublished" />

          <!-- Плашка «Новые посты» -->
          <Transition name="pill">
            <button
              v-if="newPostsCount > 0"
              type="button"
              class="floating-pill top-20 md:top-24 z-40 bg-brand-accent hover:brightness-110 transition-[filter]"
              @click="showNewPosts"
            >
              <BIcon name="ArrowUp" class="w-4 h-4" />
              {{ langStore.t.feedNewPosts }}
            </button>
          </Transition>

          <FeedTabs v-model:mode="mode" v-model:sort="sort" :sortable="sortable" :nsfw-enabled="nsfwEnabled" />

          <FeedEvents :key="userKey" />

          <AdSlot v-if="adSlotMode === 'offer'" :ad="null" variant="hero" placement="feed_top" />
          <AdSlot v-else-if="adSlotMode === 'ads' && adFor('feed_top')" :ad="adFor('feed_top')" variant="hero" placement="feed_top" />

          <div v-if="isLoading" class="stack-y-4" aria-busy="true">
            <SkeletonPost v-for="n in 4" :key="n" />
          </div>

          <EmptyState v-else-if="loadError === 'initial'" icon="AlertTriangle" title="Не удалось загрузить ленту" text="Проверьте соединение и попробуйте ещё раз">
            <button type="button" class="toolbar-btn !border-brand-border" @click="retry">
              <BIcon name="RefreshCw" class="w-4 h-4" /> Повторить
            </button>
          </EmptyState>

          <EmptyState v-else-if="!posts.length" icon="MessageSquare" :title="langStore.t.noPosts" :text="langStore.t.beFirst" />

          <div v-else class="stack-y-4">
            <PostCard
              v-for="post in posts"
              :key="post.id"
              v-track-view="post.id"
              :post="post"
              show-follow-button
              :initial-following="followStatus[post.author?.id ?? ''] ?? null"
              :initial-vote="stateOf(post.id).userVote"
              :initial-repawed="stateOf(post.id).repawed"
              :initial-favourited="stateOf(post.id).favourited"
              @deleted="remove"
              @updated="replace"
            />

            <div v-if="isLoadingMore" class="flex justify-center p-4" role="status" aria-label="Загрузка">
              <BIcon name="Loader2" class="animate-spin text-brand-accent w-6 h-6" />
            </div>
            <div v-else-if="loadError === 'more'" class="flex flex-col items-center gap-2 p-4 text-sm text-white/55">
              Не удалось подгрузить посты
              <button type="button" class="toolbar-btn !border-brand-border" @click="retry">
                <BIcon name="RefreshCw" class="w-4 h-4" /> Повторить
              </button>
            </div>
            <p v-else-if="!hasMore" class="text-center text-white/55 text-sm p-4">Вы посмотрели всё, что есть. Загляните позже — появятся новые посты.</p>
            <!-- Маркер конца списка: когда он подъезжает к экрану, подгружается следующая страница -->
            <div v-if="hasMore" ref="sentinel" class="h-px" aria-hidden="true"></div>
          </div>
        </template>
      </main>

      <aside class="w-80 hidden xl:block sticky top-24 self-start stack-y-6">
        <AdSlot v-if="adSlotMode === 'offer'" :ad="null" placement="right_column" />
        <AdSlot v-else-if="adSlotMode === 'ads' && adFor('right_column')" :ad="adFor('right_column')" placement="right_column" />

        <FeedTrendingTags :key="userKey" ref="trendingTags" />
        <FeedRecommendedUsers :key="userKey" />
      </aside>
    </div>

    <!-- Истории создаются только в мобильном приложении -->
    <StoryMobileOnlyModal v-if="showStoryMobileNotice" @close="showStoryMobileNotice = false" />

    <StoryViewer
      v-if="storyViewerOpen && storyGroups.length"
      :groups="storyGroups"
      :group-index="storyViewerGroupIdx"
      :story-index="storyViewerStoryIdx"
      @close="storyViewerOpen = false"
    />
  </div>
</template>
