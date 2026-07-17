<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import TicketsPanel from '@/components/groups/panels/TicketsPanel.vue'
import { useNsfwMode } from '@/composables/useNsfwMode'

const route = useRoute()
const router = useRouter()
const nsfwMode = useNsfwMode().nsfwEnabled
const groupId = route.query.group as string | undefined
</script>

<template>
  <div class="min-h-screen text-white font-nunito bg-brand-bg">
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20">
        <div class="mt-4">
          <TicketsPanel :group-id="groupId" show-back @back="router.back()" />
        </div>
      </main>
    </div>
  </div>
</template>
