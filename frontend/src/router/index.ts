import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
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
    path: '/',
    name: 'home',
    component: () => import('@/components/MainLayout.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/profile/:id',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
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
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// ── Navigation guard ─────────────────────────────────────────────────────────
// Pinia уже установлен в main.ts до app.use(router), поэтому useAuthStore() безопасен здесь.
router.beforeEach((to) => {
  const auth = useAuthStore()

  // Защищённый маршрут без токена → редирект на /login
  if (to.meta.requiresAuth && !auth.token) {
    return { name: 'login' }
  }

  // Уже залогинен → не пускаем на /login повторно
  if (to.name === 'login' && auth.token) {
    return { name: 'home' }
  }
})

export default router
