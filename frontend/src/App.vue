<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { usePresence } from '@/composables/usePresence'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import MobileBottomNav from '@/components/MobileBottomNav.vue'
import NotifToastContainer from '@/components/NotifToastContainer.vue'
import UpdateAnnouncementModal from '@/components/UpdateAnnouncementModal.vue'
import MaintenanceOverlay from '@/components/MaintenanceOverlay.vue'
import WarningDetailModal from '@/components/WarningDetailModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import FrozenAccountModal from '@/components/FrozenAccountModal.vue'
usePresence()

const auth  = useAuthStore()
const route = useRoute()
const langStore = useLangStore()
const cookieConsent = ref(false)

onMounted(() => {
  const saved = localStorage.getItem('cookie_consent')
  cookieConsent.value = saved === '1'
  if (auth.token) auth.fetchMe()
  langStore.detectLangFromIP()
})

const NO_NAV_ROUTES = new Set(['login', 'auth', 'oauth-callback', 'onboarding', 'admin'])

const showMobileNav = computed(() =>
  auth.token && !NO_NAV_ROUTES.has(String(route.name ?? ''))
)

function acceptCookies() {
  cookieConsent.value = true
  localStorage.setItem('cookie_consent', '1')
}
</script>

<template>
  <div
    v-if="!cookieConsent && !route.meta?.hideCookieBanner"
    class="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/95 px-3 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:px-4"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
      <div class="text-left text-sm leading-relaxed text-slate-200">
        Мы используем cookie и аналогичные технологии для работы сервиса, безопасности и аналитики.
        <RouterLink to="/privacy" class="text-brand-accent underline-offset-2 hover:underline">Подробнее в политике</RouterLink>.
      </div>
      <button
        type="button"
        @click="acceptCookies"
        class="min-h-[44px] rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-accent/20 transition-opacity hover:opacity-90 active:opacity-80 sm:min-w-[120px]"
      >
        Принять
      </button>
    </div>
  </div>
  <RouterView v-slot="{ Component }">
    <KeepAlive :include="['MainLayout']">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
  <MobileBottomNav v-if="showMobileNav" />
  <NotifToastContainer />
  <UpdateAnnouncementModal v-if="auth.token" />
  <MaintenanceOverlay />
  <WarningDetailModal />
  <ConfirmModal />
  <FrozenAccountModal
    v-if="auth.frozenPrompt"
    :show="auth.frozenPrompt.show"
    :email="auth.frozenPrompt.email"
    :reason="auth.frozenPrompt.reason"
    :remember="true"
    @close="auth.frozenPrompt = null"
    @unfrozen="auth.frozenPrompt = null"
  />
</template>
