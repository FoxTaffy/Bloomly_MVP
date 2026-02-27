<script setup lang="ts">
import { RouterView } from 'vue-router'
import { usePresence } from '@/composables/usePresence'

// Maintain server-side online status for the logged-in user across all pages
usePresence()
</script>

<template>
  <RouterView />
</template>
