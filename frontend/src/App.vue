<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { usePresence } from '@/composables/usePresence'
import { useAuthStore } from '@/stores/auth'

// Maintain server-side online status for the logged-in user across all pages
usePresence()

// Ensure fresh user data (avatar, display_name) is loaded on every page mount.
// This fixes the case where sessionStorage has stale data from a previous session
// and the sidebar/header don't reflect the latest avatar until F5.
const auth = useAuthStore()
onMounted(() => {
  if (auth.token) {
    auth.fetchMe()
  }
})
</script>

<template>
  <RouterView />
</template>
