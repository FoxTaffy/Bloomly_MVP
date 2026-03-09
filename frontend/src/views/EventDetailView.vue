<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsStore } from '@/stores/groups'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()

onMounted(async () => {
  try {
    const { data } = await api.get(`/groups/events/${route.params.eventId}`)
    const groupSlug = data.data?.event?.group?.slug || data.data?.event?.group_id
    if (groupSlug) {
      router.replace({ name: 'group-detail', params: { slugOrId: groupSlug } })
    } else {
      router.replace({ name: 'groups' })
    }
  } catch {
    router.replace({ name: 'groups' })
  }
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg flex items-center justify-center">
    <div class="w-10 h-10 border-[3px] border-brand-accent border-t-transparent rounded-full animate-spin" />
  </div>
</template>
