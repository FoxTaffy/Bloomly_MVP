<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { visualMedia } from '@/lib/postMedia'
import { useRouter } from 'vue-router'
import api from '@/api'
import { useNsfwMode } from '@/composables/useNsfwMode'
import BIcon from './BIcon.vue'

const props = defineProps<{ postId: string; isMine?: boolean }>()

type PostPreview = {
  id: string
  content: string | null
  media_urls: string[]
  is_nsfw: boolean
  subscriber_only: boolean
  is_paid: boolean
  created_at: string
  author: { username: string; display_name: string | null; avatar_url: string | null } | null
}

// Module-level cache shared across every card instance in the chat
const cache = new Map<string, PostPreview | null>()
const pending = new Map<string, Promise<PostPreview | null>>()

async function fetchPost(id: string): Promise<PostPreview | null> {
  if (cache.has(id)) return cache.get(id) ?? null
  if (pending.has(id)) return pending.get(id)!
  const promise = api.get(`/posts/${id}`)
    .then((res) => {
      const post = res.data.success ? res.data.data.post : null
      cache.set(id, post)
      pending.delete(id)
      return post
    })
    .catch(() => { cache.set(id, null); pending.delete(id); return null })
  pending.set(id, promise)
  return promise
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}

function fmtDate(d: string): string {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const router = useRouter()
const { nsfwEnabled } = useNsfwMode()
const loading = ref(true)
const post = ref<PostPreview | null>(null)

onMounted(async () => {
  post.value = await fetchPost(props.postId)
  loading.value = false
})

// A locked (paid/subscriber-only) or un-revealed NSFW post shouldn't leak its thumbnail
// into a chat where we have no idea whether the recipient can actually see it.
const thumbnailLocked = computed(() => {
  if (!post.value) return false
  if (post.value.subscriber_only || post.value.is_paid) return true
  if (post.value.is_nsfw && !nsfwEnabled.value) return true
  return false
})

const firstMedia = computed(() => visualMedia(post.value?.media_urls)[0] ?? null) // вложения-файлы миниатюрой не бывают

function open() {
  router.push(`/post/${props.postId}`)
}
</script>

<template>
  <div
    class="mb-0.5 w-[240px] rounded-2xl overflow-hidden border border-brand-border bg-brand-bg shadow-xs cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all"
    :class="isMine ? 'rounded-br-md' : 'rounded-bl-md'"
    @click.stop="open"
  >
    <div v-if="loading" class="flex items-center justify-center py-8">
      <BIcon name="Loader2" class="w-5 h-5 text-white/30 animate-spin" />
    </div>
    <div v-else-if="!post" class="flex items-center gap-2 px-3.5 py-3 text-white/40 text-xs">
      <BIcon name="FileX" class="w-4 h-4" /> Пост недоступен
    </div>
    <template v-else>
      <div v-if="firstMedia" class="relative w-full h-32 bg-black/30 overflow-hidden">
        <template v-if="thumbnailLocked">
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-linear-to-b/srgb from-white/5 to-transparent">
            <BIcon :name="post.is_nsfw ? 'EyeOff' : 'Lock'" class="w-5 h-5 text-white/50" />
            <span class="text-[10px] font-semibold text-white/40 uppercase tracking-wide">{{ post.is_nsfw ? 'NSFW' : 'Платный доступ' }}</span>
          </div>
        </template>
        <template v-else>
          <video v-if="!isImageUrl(firstMedia)" :src="firstMedia" muted playsinline preload="metadata" class="w-full h-full object-cover" />
          <img v-else :src="firstMedia" class="w-full h-full object-cover" />
          <div v-if="!isImageUrl(firstMedia)" class="absolute inset-0 flex items-center justify-center bg-black/15">
            <div class="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
              <BIcon name="Play" class="w-3.5 h-3.5 text-white fill-white ml-0.5" />
            </div>
          </div>
        </template>
      </div>
      <div class="px-3 py-2.5">
        <div class="flex items-center gap-1.5 mb-1">
          <img v-if="post.author?.avatar_url" :src="post.author.avatar_url" class="w-5 h-5 rounded-full object-cover border border-brand-border shrink-0" />
          <div v-else class="w-5 h-5 rounded-full bg-brand-accent/20 flex items-center justify-center text-[8px] font-bold text-brand-accent shrink-0">
            {{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}
          </div>
          <span class="text-[11px] font-bold text-white/85 truncate">{{ post.author?.display_name || post.author?.username }}</span>
          <span class="text-[10px] text-white/35 shrink-0 ml-auto">{{ fmtDate(post.created_at) }}</span>
        </div>
        <p v-if="post.content" class="text-[11px] text-white/60 truncate">{{ post.content }}</p>
      </div>
    </template>
  </div>
</template>
