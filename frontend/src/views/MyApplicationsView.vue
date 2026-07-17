<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import ApplicationsPanel from '@/components/groups/panels/ApplicationsPanel.vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useGroupsStore } from '@/stores/groups'

const route = useRoute()
const router = useRouter()
const nsfwMode = useNsfwMode().nsfwEnabled
const groupId = route.query.group as string | undefined

const groupsStore = useGroupsStore()
const group = computed(() => {
  if (!groupId) return null
  const m = groupsStore.myGroups.find(m => m.group_id === groupId)
  return m?.group ?? null
})
</script>

<template>
  <div class="min-h-screen text-white font-nunito bg-brand-bg">
    <AppHeader v-model:nsfwMode="nsfwMode" />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20">
        <div class="mt-4">
          <ApplicationsPanel :group-id="groupId" :group-type="group?.type" show-back @back="router.back()" />
        </div>
      </main>
    </div>
  </div>
</template>
