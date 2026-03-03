<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import PostCard from '@/components/PostCard.vue'
import PostComments from '@/components/PostComments.vue'

const route = useRoute()
const router = useRouter()

const post = ref<any>(null)
const loading = ref(true)
const notFound = ref(false)

const fetchPost = async () => {
  loading.value = true
  notFound.value = false
  try {
    const res = await api.get(`/posts/${route.params.id}`)
    if (res.data.success) {
      post.value = res.data.data.post
    } else {
      notFound.value = true
    }
  } catch (e: any) {
    if (e?.response?.status === 404) notFound.value = true
  } finally {
    loading.value = false
  }
}

onMounted(fetchPost)
</script>

<template>
  <div class="min-h-screen bg-brand-bg">
    <AppHeader :show-back="true" />

    <main class="pt-16 md:pt-20 max-w-2xl mx-auto px-4 pb-16">

      <!-- Loading skeleton -->
      <div v-if="loading" class="mt-6 space-y-4">
        <div class="bg-brand-card border border-brand-border rounded-3xl p-6 animate-pulse">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-11 h-11 rounded-full bg-brand-border"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-brand-border rounded w-32"></div>
              <div class="h-2 bg-brand-border rounded w-20"></div>
            </div>
          </div>
          <div class="space-y-2">
            <div class="h-3 bg-brand-border rounded w-full"></div>
            <div class="h-3 bg-brand-border rounded w-4/5"></div>
            <div class="h-3 bg-brand-border rounded w-2/3"></div>
          </div>
        </div>
      </div>

      <!-- Not found -->
      <div v-else-if="notFound" class="mt-16 text-center">
        <div class="text-6xl mb-4">🐾</div>
        <h2 class="text-xl font-bold text-white mb-2">Публикация не найдена</h2>
        <p class="text-white/55 text-sm mb-6">Возможно, она была удалена или никогда не существовала.</p>
        <button
          @click="router.push('/')"
          class="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent2 rounded-2xl text-white font-semibold text-sm transition-colors">
          На главную
        </button>
      </div>

      <!-- Post -->
      <div v-else-if="post" class="mt-6 space-y-4">
        <PostCard :post="post" />
        <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl p-5 md:p-6">
          <PostComments :post-id="post.id" />
        </div>
      </div>

    </main>
  </div>
</template>
