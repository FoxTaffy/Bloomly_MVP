<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
    <p class="text-6xl font-bold text-brand-accent">404</p>
    <h1 class="mt-4 text-xl font-semibold text-white">Page not found</h1>
    <p class="mt-2 text-sm text-slate-400">The page you are looking for does not exist or was removed.</p>
    <RouterLink to="/" class="mt-6 rounded-xl bg-brand-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">Back to Bloomly</RouterLink>
  </div>
</template>
