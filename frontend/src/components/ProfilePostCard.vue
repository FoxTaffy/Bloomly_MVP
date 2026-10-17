<template>
  <div class="bg-brand-bg border border-brand-border rounded-xl overflow-hidden hover:border-brand-border/80 transition-all group">
    <div class="p-4">
      <!-- Header -->
      <div class="flex items-start justify-between mb-3 gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <router-link :to="'/profile/' + post.author.username" class="shrink-0">
            <img
              :src="avatarUrl(post.author.avatar_url, 'sm')"
              :alt="post.author.display_name || post.author.username"
              class="w-9 h-9 rounded-xl object-cover border border-brand-border hover:border-brand-accent transition-colors"
              loading="lazy"
              width="36" height="36"
            />
          </router-link>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <router-link
                :to="'/profile/' + post.author.username"
                class="font-bold text-white hover:text-brand-accent transition-colors text-sm truncate"
              >{{ post.author.display_name || post.author.username }}</router-link>
              <span v-if="post.author.deceased_at" title="Светлая память" class="shrink-0">🪦</span>
              <!-- Verification badge -->
              <VerificationBadge v-if="post.author.is_verified"
                :type="post.author.verification_type"
                icon-class="w-4 h-4 shrink-0" />
              <span v-if="showRepawLabel"
                class="inline-flex items-center gap-1 text-[10px] text-white/55 bg-brand-card border border-brand-border px-1.5 py-0.5 rounded-md font-semibold">
                <Repeat2 class="w-3 h-3" /> Репав
              </span>
              <span v-if="isPinnedThis"
                class="inline-flex items-center gap-1 text-[10px] text-brand-accent/70 bg-brand-accent/10 border border-brand-accent/20 px-1.5 py-0.5 rounded-md font-semibold">
                <Pin class="w-3 h-3" /> Закреплён
              </span>
            </div>
            <p class="text-[11px] text-white/55">@{{ post.author.username }} · {{ fmtDate(post.created_at) }}</p>
          </div>
        </div>

        <!-- Context menu -->
        <div class="relative shrink-0">
          <button
            @click.stop="showMenu = !showMenu"
            class="p-1.5 text-white/55 hover:text-white rounded-lg hover:bg-brand-card transition opacity-0 group-hover:opacity-100"
          >
            <MoreVertical class="w-4 h-4" />
          </button>
          <div
            v-if="showMenu"
            v-click-outside="() => showMenu = false"
            @click.stop
            class="absolute right-0 top-8 z-30 w-48 bg-brand-card border border-brand-border rounded-xl shadow-2xl overflow-hidden py-1"
          >
            <button
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition text-left"
              @click="openFullscreen"
            >
              <Maximize2 class="w-4 h-4 shrink-0" /> Открыть полностью
            </button>
            <button v-if="canPin && !isPinnedThis" @click="emit('pin', post.id); showMenu = false"
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition text-left">
              <Pin class="w-4 h-4 shrink-0" /> Закрепить
            </button>
            <button v-if="canPin && isPinnedThis" @click="emit('unpin'); showMenu = false"
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition text-left">
              <PinOff class="w-4 h-4 shrink-0" /> Открепить
            </button>
            <button v-if="isEditable" @click="startEdit"
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition text-left">
              <Pencil class="w-4 h-4 shrink-0" /> Редактировать
            </button>
            <button v-if="isOwn" @click="deletePost" :disabled="isDeleting"
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-brand-error hover:bg-brand-error/10 transition text-left disabled:opacity-50">
              <Trash2 class="w-4 h-4 shrink-0" /> Удалить
            </button>
          </div>
        </div>
      </div>

      <!-- Tags row (category / nsfw) -->
      <div v-if="post.is_nsfw || post.category" class="flex gap-1.5 flex-wrap mb-3">
        <span v-if="post.is_nsfw"
          class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-error/10 border border-brand-error/30 rounded-md text-[11px] font-bold text-brand-error">NSFW</span>
        <span v-if="post.category"
          class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/20 rounded-md text-[11px] font-semibold text-brand-accent">{{ post.category }}</span>
      </div>

      <!-- Edit form -->
      <div v-if="isEditing" class="mb-3">
        <textarea
          v-model="editContent"
          rows="3"
          class="w-full bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-brand-accent outline-hidden"
        ></textarea>
        <div class="flex items-center gap-2 mt-2">
          <button @click="isEditing = false" class="px-3 py-1.5 text-xs text-white/55 hover:text-white transition">Отмена</button>
          <button @click="saveEdit" :disabled="isSaving"
            class="px-4 py-1.5 bg-brand-accent text-white text-xs font-bold rounded-lg disabled:opacity-50 transition hover:bg-brand-accent-plus">
            {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
          </button>
        </div>
      </div>

      <!-- Content -->
      <p v-else class="text-sm text-white/85 leading-relaxed mb-3 whitespace-pre-wrap wrap-break-word">
        <template v-for="seg in parsedContent" :key="seg.key">
          <span v-if="seg.type === 'text'">{{ seg.text }}</span>
          <span v-else
            @click.stop="goToUser(seg.username!)"
            class="inline-flex items-center px-1.5 py-0.5 bg-brand-accent/15 border border-brand-accent/25 rounded-md text-brand-accent text-xs font-semibold cursor-pointer hover:bg-brand-accent/25 transition-all align-baseline"
          >{{ seg.text }}</span>
        </template>
      </p>

      <!-- Media -->
      <div v-if="post.media_urls && post.media_urls.length"
        class="relative mb-3 rounded-xl overflow-hidden"
      >
        <!-- Blurred media grid -->
        <div
          class="transition-all duration-300"
          :class="[
            (post.is_nsfw && !nsfwEnabled) || (isPaywalled && !paidRevealed) ? 'blur-xl scale-110 pointer-events-none select-none' : '',
            post.media_urls.length === 1 ? '' : 'grid grid-cols-2 gap-0.5'
          ]"
        >
          <template v-for="(url, i) in post.media_urls" :key="i">
            <CustomPlayer :src="url" @click-image="showLightboxUrl = url" class="w-full h-full object-cover"
              :disable-autoplay="(post.is_nsfw && !nsfwEnabled) || (isPaywalled && !paidRevealed)" />
          </template>
        </div>

          <!-- NSFW overlay -->
        <Transition name="fade">
          <div
            v-if="post.is_nsfw && !nsfwEnabled"
            class="absolute inset-0 z-10 flex items-center justify-center"
            style="background: rgba(0,0,0,0.55)"
          >
            <div class="bg-[#1a1a2e]/90 backdrop-blur-xs border border-white/10 rounded-2xl px-6 py-5 text-center max-w-xs">
              <div class="w-10 h-10 rounded-full border-2 border-red-500/40 bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle class="w-5 h-5 text-red-400" />
              </div>
              <h3 class="font-bold text-white text-sm mb-1.5">NSFW Контент</h3>
              <p class="text-white/45 text-xs mb-4">{{ canUseNsfw ? 'Предназначен для пользователей старше 18 лет. Включите NSFW в шапке сайта.' : 'Предназначен для пользователей старше 18 лет. Подтвердите дату рождения в настройках профиля.' }}</p>
              <button
                @click.stop="handleEnableNsfw"
                class="w-full py-2 bg-red-500 hover:bg-red-400 text-white font-bold text-xs rounded-xl transition-colors"
              >
                {{ canUseNsfw ? 'Включить NSFW' : 'Подтвердить возраст' }}
              </button>
            </div>
          </div>
        </Transition>

        <!-- Paid / subscriber-only overlay -->
        <Transition name="fade">
          <div
            v-if="(!post.is_nsfw || nsfwEnabled) && isPaywalled && !paidRevealed"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 py-6"
            style="background: rgba(0,0,0,0.6)"
          >
            <template v-if="post.video_title">
              <h3 class="font-bold text-white text-sm mb-1 text-center">{{ post.video_title }}</h3>
              <p v-if="post.video_description" class="text-white/50 text-xs mb-2 text-center">{{ post.video_description }}</p>
            </template>
            <div class="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <button class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-black/50 border border-white/20 rounded-full text-white text-xs font-semibold hover:bg-black/70 transition-colors">
                <Lock class="w-3.5 h-3.5" /> Подписаться
              </button>
              <button v-if="post.is_paid" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-black/50 border border-white/20 rounded-full text-white text-xs font-semibold hover:bg-black/70 transition-colors">
                <Lock class="w-3.5 h-3.5" /> Купить видео
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Hashtags -->
      <div v-if="post.tags && post.tags.length" class="flex flex-wrap gap-1 mb-3">
        <span v-for="pt in post.tags" :key="pt.tag?.id ?? pt.id"
          class="px-2 py-0.5 bg-brand-card border border-brand-border text-brand-accent-minus text-[11px] rounded-md font-medium hover:border-brand-accent/50 transition cursor-pointer">
          #{{ pt.tag?.name ?? pt.name }}
        </span>
      </div>

      <!-- Actions bar -->
      <div class="flex items-center gap-0.5 pt-2 border-t border-brand-border/40">
        <!-- Upvote -->
        <button @click="vote(1)"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold transition-all min-w-[52px]"
          :class="localVote === 1 ? 'text-brand-success bg-brand-success/10' : 'text-white/55 hover:text-brand-success hover:bg-brand-success/8'">
          <ThumbsUp class="w-4 h-4 shrink-0" />
          {{ localRating }}
        </button>
        <!-- Downvote -->
        <button @click="vote(-1)"
          class="p-1.5 rounded-lg text-sm transition-all"
          :class="localVote === -1 ? 'text-brand-error bg-brand-error/10' : 'text-white/55 hover:text-brand-error hover:bg-brand-error/8'">
          <ThumbsDown class="w-4 h-4" />
        </button>
        <!-- Repaw -->
        <button @click="toggleRepaw"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold transition-all"
          :class="localRepawed ? 'text-brand-accent bg-brand-accent/10' : 'text-white/55 hover:text-brand-accent hover:bg-brand-accent/8'">
          <Repeat2 class="w-4 h-4 shrink-0" />
          {{ localRepaws }}
        </button>
        <!-- Comments -->
        <button @click="isExpanded = !isExpanded"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold text-white/55 hover:text-brand-accent-minus hover:bg-brand-card transition-all ml-auto">
          <MessageCircle class="w-4 h-4 shrink-0" />
          {{ post._count?.comments ?? 0 }}
        </button>
      </div>
    </div>

    <!-- Comments section -->
    <div v-if="isExpanded" class="border-t border-brand-border/40 px-4 pb-4 pt-3">
      <PostComments :post-id="post.id" />
    </div>

    <!-- Image lightbox -->
    <Transition name="fade">
      <div v-if="showLightboxUrl"
        class="fixed inset-0 z-500 bg-black/90 flex items-center justify-center p-4"
        @click.self="showLightboxUrl = null">
        <button @click="showLightboxUrl = null"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all">
          <X class="w-5 h-5" />
        </button>
        <img :src="showLightboxUrl" class="max-w-full max-h-[90vh] rounded-2xl object-contain shadow-2xl" />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import VerificationBadge from '@/components/VerificationBadge.vue'
import api from '@/api'
import PostComments from '@/components/PostComments.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import {
  ThumbsUp, ThumbsDown, Repeat2, MessageCircle, Pin, PinOff,
  Pencil, Trash2, MoreVertical, Maximize2, X, AlertTriangle, Lock
} from 'lucide-vue-next'

// ── Props & emits ──────────────────────────────────────────────────────────
const props = defineProps<{
  post: any
  isOwnProfile?: boolean
  isPinned?: boolean
  pinnedPostId?: string | null
  showRepawLabel?: boolean
}>()

const emit = defineEmits<{
  (e: 'pin', id: string): void
  (e: 'unpin'): void
  (e: 'deleted', id: string): void
  (e: 'updated', post: any): void
}>()

// ── Composables ────────────────────────────────────────────────────────────
const router = useRouter()
const authStore = useAuthStore()
const { nsfwEnabled, canUseNsfw, enableNsfw } = useNsfwMode()

function handleEnableNsfw() {
  if (canUseNsfw.value) {
    enableNsfw()
    return
  }
  alert('Укажите дату рождения в настройках профиля, чтобы подтвердить возраст 18+.')
  router.push('/settings/profile')
}

// ── State ──────────────────────────────────────────────────────────────────
const localRating  = ref<number>(props.post.rating ?? 0)
const localRepaws  = ref<number>(props.post._count?.repaws ?? 0)
const localVote    = ref<1 | -1 | 0>(0)
const localRepawed = ref(false)
const votePending  = ref(false)
const showMenu     = ref(false)
const isExpanded   = ref(false)
const isEditing    = ref(false)
const editContent  = ref('')
const isSaving     = ref(false)
const isDeleting   = ref(false)
const showLightboxUrl = ref<string | null>(null)
const paidRevealed = ref(false)

// ── Computed ───────────────────────────────────────────────────────────────
const isOwn = computed(() =>
  authStore.user?.id === props.post.author_id || authStore.user?.id === props.post.author?.id
)
const POST_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const isEditable = computed(() =>
  isOwn.value && (Date.now() - new Date(props.post.created_at).getTime() < POST_EDIT_WINDOW_MS)
)
const canPin = computed(() => props.isOwnProfile && isOwn.value)
const isPinnedThis = computed(() => props.pinnedPostId === props.post.id)
const isPaywalled = computed(() =>
  (props.post.subscriber_only || props.post.is_paid) && !isOwn.value
)

type Seg = { type: 'text' | 'mention'; key: number; text: string; username?: string }
const parsedContent = computed<Seg[]>(() =>
  (props.post.content ?? '').split(/(@\w+(?:-\w+)*)/g).map((part: string, i: number) =>
    /^@\w+(?:-\w+)*$/.test(part)
      ? { type: 'mention' as const, key: i, text: part, username: part.slice(1) }
      : { type: 'text' as const, key: i, text: part }
  )
)

// ── Helpers ────────────────────────────────────────────────────────────────
/** Generate avatar URL with size hint (icon=24, sm=36, md=64, lg=128) */
function avatarUrl(src: string | null | undefined, size: 'icon' | 'sm' | 'md' | 'lg'): string {
  const sizeMap = { icon: 24, sm: 36, md: 64, lg: 128 }
  const px = sizeMap[size]
  if (!src) return ''
  // For S3/MinIO URLs, add size param (supported by most CDNs/proxies)
  try {
    const url = new URL(src)
    url.searchParams.set('w', String(px))
    url.searchParams.set('h', String(px))
    url.searchParams.set('fit', 'cover')
    return url.toString()
  } catch {
    return src
  }
}

function fmtDate(d: string): string {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function isImg(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}

// ── Actions ────────────────────────────────────────────────────────────────
async function goToUser(username: string) {
  try {
    const r = await api.get(`/users/search?q=${encodeURIComponent(username)}`)
    const users: any[] = r.data.data?.users ?? []
    const found = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase())
    if (found) router.push(`/profile/${found.username}`)
  } catch {}
}

async function vote(value: 1 | -1) {
  if (!authStore.isAuthenticated || votePending.value) return
  votePending.value = true
  try {
    const r = await api.post(`/posts/${props.post.id}/vote`, { value })
    if (r.data.success) {
      localRating.value = r.data.data.rating ?? localRating.value
      localVote.value = localVote.value === value ? 0 : value
    }
  } catch {
  } finally {
    votePending.value = false
  }
}

async function toggleRepaw() {
  if (!authStore.isAuthenticated) return
  try {
    const r = await api.post(`/posts/${props.post.id}/repaw`, {})
    if (r.data.success) {
      localRepawed.value = r.data.data.repawed
      localRepaws.value = r.data.data.repaw_count
    }
  } catch {}
}

function openFullscreen() {
  showMenu.value = false
  // Navigate to post permalink or open lightbox if media present
  if (props.post.media_urls?.length) {
    showLightboxUrl.value = props.post.media_urls[0]
  } else {
    router.push(`/post/${props.post.id}`)
  }
}

function startEdit() {
  isEditing.value = true
  editContent.value = props.post.content
  showMenu.value = false
}

async function saveEdit() {
  if (!editContent.value.trim() || isSaving.value) return
  isSaving.value = true
  try {
    const r = await api.patch(`/posts/${props.post.id}`, { content: editContent.value.trim() })
    if (r.data.success) {
      emit('updated', r.data.data.post)
      isEditing.value = false
    }
  } catch {}
  isSaving.value = false
}

async function deletePost() {
  if (isDeleting.value) return
  isDeleting.value = true
  try {
    await api.delete(`/posts/${props.post.id}`)
    emit('deleted', props.post.id)
  } catch {} finally {
    isDeleting.value = false
  }
}

// ── Click-outside directive ────────────────────────────────────────────────
const vClickOutside = {
  mounted(el: HTMLElement & { _clickOutside?: (e: Event) => void }, binding: any) {
    el._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any)._clickOutside)
  },
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
