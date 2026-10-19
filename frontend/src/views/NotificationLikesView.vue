<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PostCard from '@/components/PostCard.vue'
import SkeletonPost from '@/components/SkeletonPost.vue'
import BIcon from '@/components/BIcon.vue'

const route = useRoute()
const router = useRouter()

const posts = ref<any[]>([])
const liker = ref<any>(null)
const isLoading = ref(true)
const failed = ref(false)

const likerName = () => liker.value?.display_name || liker.value?.username || ''

const load = async () => {
  isLoading.value = true
  failed.value = false
  try {
    const res = await api.get(`/posts/me/liked-by/${route.params.userId}`)
    if (res.data.success) {
      posts.value = res.data.data.posts ?? []
      liker.value = res.data.data.liker
    }
  } catch { failed.value = true } finally { isLoading.value = false }
}

const goBack = () => (window.history.length > 1 ? router.back() : router.push('/notifications'))
const onPostDeleted = (id: string) => { posts.value = posts.value.filter((p: any) => p.id !== id) }
const onPostUpdated = (u: any) => { const i = posts.value.findIndex((p: any) => p.id === u.id); if (i !== -1) posts.value[i] = u }

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20 max-w-2xl">
        <div class="flex items-center gap-3 mb-4 px-1">
          <button @click="goBack" class="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-colors shrink-0" aria-label="Назад">
            <BIcon name="ArrowLeft" class="w-5 h-5" />
          </button>
          <div class="min-w-0">
            <h1 class="text-xl font-extrabold text-white tracking-tight">Лайки</h1>
            <p v-if="liker" class="text-xs text-white/40 truncate">
              от
              <router-link :to="`/profile/${liker.username}`" class="hover:underline">{{ likerName() }}</router-link>
              · {{ posts.length }}
            </p>
          </div>
        </div>

        <div v-if="isLoading" class="space-y-3"><SkeletonPost v-for="n in 3" :key="n" /></div>
        <div v-else-if="failed" class="rounded-3xl border border-white/8 bg-white/2 py-16 text-center text-sm text-white/40">
          Не удалось загрузить.
          <button class="text-brand-accent font-semibold ml-1" @click="load">Повторить</button>
        </div>
        <div v-else-if="posts.length === 0" class="rounded-3xl border border-white/8 bg-white/2 flex flex-col items-center gap-3 py-16 text-white/30">
          <BIcon name="Heart" class="w-8 h-8" />
          <p class="text-sm font-semibold">Лайки сняты или посты удалены</p>
        </div>
        <div v-else class="space-y-3">
          <PostCard v-for="post in posts" :key="post.id" :post="post" @deleted="onPostDeleted" @updated="onPostUpdated" />
        </div>
      </main>
    </div>
  </div>
</template>
