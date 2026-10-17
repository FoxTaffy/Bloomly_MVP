<script setup lang="ts">
import { apiErrorStatus } from '@/lib/apiError'
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import PostCard from '@/components/PostCard.vue'

const route = useRoute()
const router = useRouter()

const post = ref<any>(null)
const loading = ref(true)
const notFound = ref(false)

// ── SEO ──────────────────────────────────────────────────────────────────────
const BASE = 'https://bloomly.fun'

useHead({
  title: () => {
    if (!post.value) return 'Bloomly'
    const name = post.value.author?.display_name || post.value.author?.username || 'a user'
    return `${name} — Bloomly`
  },
  meta: [
    { name: 'description', content: () => post.value?.content?.slice(0, 160)?.replace(/\n/g, ' ') || 'A post on Bloomly — the creative social network.' },
    { name: 'robots', content: 'index, follow' },
    { property: 'og:type', content: 'article' },
    { property: 'og:site_name', content: 'Bloomly' },
    { property: 'og:title', content: () => {
        const name = post.value?.author?.display_name || post.value?.author?.username || 'a user'
        return `${name} — Bloomly`
      }
    },
    { property: 'og:description', content: () => post.value?.content?.slice(0, 200)?.replace(/\n/g, ' ') || 'A post on Bloomly.' },
    { property: 'og:image', content: () => (Array.isArray(post.value?.media_urls) && post.value.media_urls[0]) ? String(post.value.media_urls[0]) : `${BASE}/og-default.png` },
    { property: 'og:url', content: () => `${BASE}/post/${route.params.id}` },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: () => {
        const name = post.value?.author?.display_name || post.value?.author?.username || ''
        return `${name} — Bloomly`
      }
    },
    { name: 'twitter:description', content: () => post.value?.content?.slice(0, 160)?.replace(/\n/g, ' ') || 'A post on Bloomly.' },
    { name: 'twitter:image', content: () => (Array.isArray(post.value?.media_urls) && post.value.media_urls[0]) ? String(post.value.media_urls[0]) : `${BASE}/og-default.png` },
  ],
  link: [
    { rel: 'canonical', href: () => `${BASE}/post/${route.params.id}` },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => {
        if (!post.value) return ''
        const name = post.value.author?.display_name || post.value.author?.username
        return JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SocialMediaPosting',
          url: `${BASE}/post/${post.value.id}`,
          description: post.value.content?.slice(0, 200)?.replace(/\n/g, ' ') || '',
          datePublished: post.value.created_at,
          ...(name && post.value.author?.username ? {
            author: {
              '@type': 'Person',
              name,
              url: `${BASE}/profile/${post.value.author.username}`,
            },
          } : {}),
          ...((Array.isArray(post.value.media_urls) && post.value.media_urls[0]) ? {
            image: { '@type': 'ImageObject', url: post.value.media_urls[0] },
          } : {}),
        })
      },
    },
  ],
})

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
  } catch (e) {
    if (apiErrorStatus(e) === 404 || apiErrorStatus(e) === 403) notFound.value = true
  } finally {
    loading.value = false
  }
}

onMounted(fetchPost)
</script>

<template>
  <div class="min-h-screen bg-brand-bg">
    <AppHeader :show-back="true" />

    <main class="pt-16 md:pt-20 max-w-2xl mx-auto px-4 pb-28 md:pb-16">

      <!-- Loading skeleton -->
      <div v-if="loading" class="mt-6 stack-y-4">
        <div class="bg-brand-card border border-brand-border rounded-3xl p-6 animate-pulse">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-11 h-11 rounded-full bg-brand-border"></div>
            <div class="flex-1 stack-y-2">
              <div class="h-3 bg-brand-border rounded-sm w-32"></div>
              <div class="h-2 bg-brand-border rounded-sm w-20"></div>
            </div>
          </div>
          <div class="stack-y-2">
            <div class="h-3 bg-brand-border rounded-sm w-full"></div>
            <div class="h-3 bg-brand-border rounded-sm w-4/5"></div>
            <div class="h-3 bg-brand-border rounded-sm w-2/3"></div>
          </div>
        </div>
      </div>

      <!-- Not found -->
      <div v-else-if="notFound" class="mt-16 text-center">
        <div class="text-6xl mb-4">🐾</div>
        <h2 class="text-xl font-bold text-white mb-2">{{ langStore.t.postNotFoundTitle }}</h2>
        <p class="text-white/55 text-sm mb-6">{{ langStore.t.postNotFoundHint }}</p>
        <button
          @click="router.push('/')"
          class="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent2 rounded-2xl text-white font-semibold text-sm transition-colors">
          {{ langStore.t.goHome }}
        </button>
      </div>

      <!-- Post -->
      <div v-else-if="post" class="mt-6 stack-y-4">
        <PostCard :post="post" start-expanded />
      </div>

    </main>
  </div>
</template>
