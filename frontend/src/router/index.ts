import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

// ── Расширяем RouteMeta ───────────────────────────────────────────────────────
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
  },
  {
    path: '/terms',
    name: 'terms',
    component: () => import('@/views/TermsView.vue'),
  },
  {
    path: '/privacy',
    name: 'privacy',
    component: () => import('@/views/PrivacyView.vue'),
  },
  {
    // После OAuth редиректа бэкенд направляет сюда с ?token=...
    path: '/auth/callback',
    name: 'oauth-callback',
    component: () => import('@/views/OAuthCallbackView.vue'),
  },
  {
    // Страница для передачи ошибки OAuth (deny / failed)
    path: '/auth',
    name: 'auth',
    component: () => import('@/views/LoginView.vue'),
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/components/MainLayout.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/profile/:username',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
  },
  {
    path: '/bookmarks',
    name: 'bookmarks',
    component: () => import('@/views/BookmarksView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/scheduled-posts',
    name: 'scheduled-posts',
    component: () => import('@/views/ScheduledPostsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/explore',
    name: 'explore',
    component: () => import('@/views/ExploreView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/messages',
    name: 'messages',
    component: () => import('@/views/MessagesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/views/NotificationsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/profile',
    name: 'settings-profile',
    component: () => import('@/views/SettingsProfileView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/post/:id',
    name: 'post',
    component: () => import('@/views/PostView.vue'),
  },
  {
    path: '/friends',
    name: 'friends',
    component: () => import('@/views/FriendsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/subscriptions',
    name: 'subscriptions',
    component: () => import('@/views/SubscriptionView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/groups',
    name: 'groups',
    component: () => import('@/views/GroupsView.vue'),
  },
  {
    path: '/groups/:slugOrId',
    name: 'group-detail',
    component: () => import('@/views/GroupDetailView.vue'),
  },
  {
    path: '/groups/:slugOrId/settings',
    name: 'group-settings',
    component: () => import('@/views/GroupSettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/groups/:slugOrId/business',
    name: 'group-business',
    component: () => import('@/views/GroupBusinessView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/groups/:slugOrId/admin',
    name: 'group-admin-tools',
    component: () => import('@/views/GroupAdminToolsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/events/:eventId',
    name: 'event-detail',
    component: () => import('@/views/EventDetailView.vue'),
  },
  {
    path: '/dealers-den',
    name: 'dealers-den',
    component: () => import('@/views/DealersDenView.vue'),
  },
  {
    path: '/dealers-den/seller/:username',
    name: 'den-seller',
    component: () => import('@/views/DenSellerView.vue'),
  },
  {
    path: '/dealers-den/fair/:id',
    name: 'den-fair',
    component: () => import('@/views/DenFairView.vue'),
  },
  {
    path: '/dealers-den/:id',
    name: 'dealer-listing',
    component: () => import('@/views/DealerListingView.vue'),
  },
  {
    path: '/shop',
    name: 'shop',
    component: () => import('@/views/ShopView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/stickers',
    redirect: '/shop',
  },
  {
    path: '/stickers/invite/:code',
    name: 'sticker-invite',
    component: () => import('@/views/StickerPackView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/stickers/:id',
    name: 'sticker-pack',
    component: () => import('@/views/StickerPackView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/automation',
    redirect: () => ({ name: 'settings-profile' }),
  },
  {
    path: '/help',
    name: 'help',
    component: () => import('@/views/HelpView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/my-applications',
    name: 'my-applications',
    component: () => import('@/views/MyApplicationsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/my-tickets',
    name: 'my-tickets',
    component: () => import('@/views/MyTicketsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/my-todolist',
    name: 'my-todolist',
    component: () => import('@/views/MyTodolistView.vue'),
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0, behavior: 'instant' }
  },
})

// ── Navigation guard ─────────────────────────────────────────────────────────
// Pinia уже установлен в main.ts до app.use(router), поэтому useAuthStore() безопасен здесь.
// Страницы, не требующие онбординга (публичные или сам онбординг)
const ONBOARDING_BYPASS = new Set(['login', 'auth', 'oauth-callback', 'onboarding'])

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Wait for the initial refresh attempt to complete before making auth decisions
  if (!auth.isInitialized) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => auth.isInitialized,
        (val) => { if (val) { stop(); resolve() } },
        { immediate: true },
      )
    })
  }

  // Защищённый маршрут без токена → редирект на /login
  if (to.meta.requiresAuth && !auth.token) {
    return { name: 'login' }
  }

  // Уже залогинен → не пускаем на /login повторно
  if (to.name === 'login' && auth.token) {
    // Если онбординг не пройден — на онбординг
    if (auth.user && !auth.user.onboarding_done) return { name: 'onboarding' }
    return { name: 'home' }
  }

  // Залогинен, онбординг не пройден → принудительно на онбординг
  if (
    auth.token &&
    auth.user &&
    !auth.user.onboarding_done &&
    !ONBOARDING_BYPASS.has(String(to.name))
  ) {
    return { name: 'onboarding' }
  }
})

// После деплоя хэши чанков меняются — старая вкладка попытается запросить
// файл, которого больше нет на сервере, и получит index.html вместо JS.
// В этом случае просто перезагружаем страницу, чтобы подхватить новый билд.
router.onError((error, to) => {
  const isChunkLoadError =
    /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
      error.message,
    )
  if (isChunkLoadError) {
    window.location.href = to.fullPath
  }
})

export default router
