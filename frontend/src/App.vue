<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { usePresence } from '@/composables/usePresence'
import { useAuthStore } from '@/stores/auth'
import MobileBottomNav from '@/components/MobileBottomNav.vue'
import NotifToastContainer from '@/components/NotifToastContainer.vue'

usePresence()

const auth  = useAuthStore()
const route = useRoute()

onMounted(() => {
  if (auth.token) auth.fetchMe()
})

const NO_NAV_ROUTES = new Set(['login', 'auth', 'oauth-callback', 'onboarding', 'admin'])

const showMobileNav = computed(() =>
  auth.token && !NO_NAV_ROUTES.has(String(route.name ?? ''))
)
</script>

<template>
  <RouterView />
  <MobileBottomNav v-if="showMobileNav" />
  <NotifToastContainer />
</template>
