<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import api from '@/api'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useFollowState } from '@/composables/useFollowState'
import EntityAvatar from '../shared/EntityAvatar.vue'

const VISIBLE_USERS = 5

const langStore = useLangStore()
const { nsfwEnabled } = useNsfwMode()
const follows = useFollowState()

const users = ref<any[]>([])
const online = reactive<Record<string, boolean>>({})
const isLoading = ref(true)

// Профили-реклама (role 'ad') скрываем, если NSFW выключен
const visibleUsers = computed(() =>
  (nsfwEnabled.value ? users.value : users.value.filter((u) => u.role !== 'ad')).slice(0, VISIBLE_USERS))

async function load() {
  try {
    const res = await api.get('/users/recommended')
    if (!res.data.success) return
    users.value = res.data.data.users
    const ids: string[] = users.value.map((u) => u.id)
    if (!ids.length) return
    await follows.load(ids)
    // Показывается лишь часть списка, статус «онлайн» спрашиваем только для неё
    const shown = ids.slice(0, VISIBLE_USERS + 3)
    const onlineRes = await api.get('/users/online', { params: { ids: shown.join(',') } })
    if (onlineRes.data.success) Object.assign(online, onlineRes.data.data as Record<string, boolean>)
  } catch {
    users.value = []
  } finally {
    isLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section v-if="isLoading || visibleUsers.length">
    <h3 class="font-bold text-white text-sm mb-3">{{ langStore.t.recommendedFriends }}</h3>

    <div v-if="isLoading" class="stack-y-2">
      <div v-for="n in 3" :key="n" class="flex items-center gap-3 px-1">
        <div class="skeleton w-10 h-10 rounded-full"></div>
        <div class="flex-1 stack-y-1.5"><div class="skeleton h-3 w-28"></div><div class="skeleton h-2.5 w-20"></div></div>
        <div class="skeleton w-16 h-7 rounded-full"></div>
      </div>
    </div>

    <div v-else class="stack-y-1">
      <router-link
        v-for="user in visibleUsers"
        :key="user.id"
        :to="`/profile/${user.username}`"
        class="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-card/60 transition-colors group"
      >
        <div class="relative shrink-0">
          <EntityAvatar
            :src="user.avatar_url"
            :name="user.display_name || user.username"
            class="w-10 h-10 text-sm border-2 border-brand-border group-hover:border-brand-accent/40 transition-colors"
          />
          <span
            v-if="online[user.id]"
            class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-brand-success border-2 border-brand-card shadow-xs"
            title="Онлайн"
          ></span>
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-white truncate leading-tight">{{ user.display_name || user.username }}</p>
          <p class="text-xs text-white/55 truncate">@{{ user.username }}</p>
        </div>

        <button
          type="button"
          class="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
          :class="follows.following[user.id]
            ? 'border-brand-border text-white/55 hover:border-rose-500/40 hover:text-rose-400'
            : 'border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-white hover:border-brand-accent'"
          @click.stop.prevent="follows.toggle(user.id)"
        >
          {{ follows.following[user.id] ? 'Вы подписаны' : 'Читать' }}
        </button>
      </router-link>
    </div>
  </section>
</template>
