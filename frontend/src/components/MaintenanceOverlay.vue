<script setup lang="ts">
import { isModerator } from '@/lib/roles'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { maintenanceActive } from '@/api'
import { useAuthStore } from '@/stores/auth'
import BIcon from './BIcon.vue'

const route = useRoute()
const auth = useAuthStore()

// Moderator+ can use the whole site as normal during maintenance (mirrors the
// backend's onRequest gate in server.ts, which lets the same roles through).
const isStaff = computed(() => isModerator(auth.user?.role))

const show = computed(() => maintenanceActive.value && !isStaff.value && route.name !== 'admin' && route.name !== 'login')
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-200 flex items-center justify-center p-4"
    style="background:rgba(5,8,20,0.92);backdrop-filter:blur(6px)">
    <div class="max-w-sm w-full rounded-3xl border border-brand-border bg-brand-card p-8 text-center shadow-2xl">
      <div class="w-14 h-14 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center mx-auto mb-4">
        <BIcon name="Wrench" class="w-7 h-7 text-brand-accent" />
      </div>
      <h1 class="text-lg font-black text-white mb-2">Bloomly на обслуживании</h1>
      <p class="text-sm text-white/50">Мы ненадолго закрыли доступ, чтобы что-то поправить. Загляните чуть позже — обычно это быстро.</p>
    </div>
  </div>
</template>
