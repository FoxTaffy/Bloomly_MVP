<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { usePresence } from '@/composables/usePresence'
import { useAuthStore } from '@/stores/auth'
import MobileBottomNav from '@/components/MobileBottomNav.vue'

// Maintain server-side online status for the logged-in user across all pages
usePresence()

// Ensure fresh user data (avatar, display_name) is loaded on every page mount.
// This fixes the case where sessionStorage has stale data from a previous session
// and the sidebar/header don't reflect the latest avatar until F5.
const auth = useAuthStore()
const route = useRoute()

onMounted(() => {
  if (auth.token) {
    auth.fetchMe()
  }
})

// Routes where the bottom nav should NOT appear
const NO_NAV_ROUTES = new Set(['login', 'auth', 'oauth-callback', 'onboarding', 'admin'])

const showMobileNav = computed(() =>
  auth.token && !NO_NAV_ROUTES.has(String(route.name ?? ''))
)
</script>

<template>
  <RouterView />
  <MobileBottomNav v-if="showMobileNav" />
</template>
