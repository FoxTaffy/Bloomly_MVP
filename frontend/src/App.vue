<script setup lang="ts">
import { computed, onMounted } from 'vue'
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

onMounted(() => {
  if (auth.token) auth.fetchMe()
  langStore.detectLangFromIP()
})

const NO_NAV_ROUTES = new Set(['login', 'auth', 'oauth-callback', 'onboarding', 'admin'])

const showMobileNav = computed(() =>
  auth.token && !NO_NAV_ROUTES.has(String(route.name ?? ''))
)
</script>

<template>
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
