<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/30 transition-all group">
    <div class="p-5 md:p-6">

      <!-- ── Header ────────────────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-3 mb-4">
        <div class="flex items-center gap-3 min-w-0 cursor-pointer" @click="router.push(`/profile/${post.author.id}`)">
          <!-- Avatar -->
          <div class="relative flex-shrink-0">
            <img
              v-if="post.author.avatar_url"
              :src="post.author.avatar_url"
              :alt="post.author.display_name || post.author.username"
              class="w-11 h-11 rounded-full object-cover border border-brand-border"
              loading="lazy"
              width="44" height="44"
            />
            <div
              v-else
              class="w-11 h-11 rounded-full border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-base"
            >
              {{ avatarInitial(post.author.display_name || post.author.username) }}
            </div>
            <!-- Follow quick-add button -->
            <button
              v-if="showFollowButton && authStore.user && post.author.id !== authStore.user?.id && localFollowing === false"
              @click.stop="toggleFollow"
              class="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-accent rounded-full flex items-center justify-center border-2 border-brand-card hover:bg-brand-accent-plus transition-colors"
              title="Подписаться"
            >
              <BIcon name="Plus" class="w-3 h-3 text-white" />
            </button>
          </div>

          <div class="min-w-0">
            <!-- Display labels row -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="font-bold text-white truncate hover:text-brand-accent transition-colors">
                {{ post.author.display_name || post.author.username }}
              </h4>
              <span v-if="showRepawLabel"
                class="inline-flex items-center gap-1 text-[10px] text-brand-muted bg-brand-bg border border-brand-border px-1.5 py-0.5 rounded-md font-semibold">
                <BIcon name="Repeat2" class="w-3 h-3" /> Репав
              </span>
              <span v-if="isPinnedThis"
                class="inline-flex items-center gap-1 text-[10px] text-brand-accent/70 bg-brand-accent/10 border border-brand-accent/20 px-1.5 py-0.5 rounded-md font-semibold">
                <BIcon name="Pin" class="w-3 h-3" /> Закреплён
              </span>
            </div>
            <p class="text-xs text-brand-muted truncate">@{{ post.author.username }} · {{ fmtDate(post.created_at) }}</p>
          </div>
        </div>

        <!-- Right: NSFW badge + context menu -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <span
            v-if="post.is_nsfw"
            class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-brand-error/15 text-brand-error border border-brand-error/30"
          >NSFW</span>

          <!-- Three-dot menu -->
          <div class="relative">
            <button
              @click.stop="showMenu = !showMenu"
              class="text-brand-muted hover:text-white p-2 rounded-full hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <BIcon name="MoreHorizontal" class="w-5 h-5" />
            </button>
            <div
              v-if="showMenu"
              v-click-outside="() => showMenu = false"
              class="absolute right-0 top-10 z-30 w-48 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
            >
              <button
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5"
                @click="openFullscreen"
              >
                <BIcon name="Maximize2" class="w-4 h-4 text-brand-accent" /> Открыть полностью
              </button>
              <button v-if="canPin && !isPinnedThis" @click="emit('pin', post.id); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                <BIcon name="Pin" class="w-4 h-4 text-brand-accent" /> Закрепить
              </button>
              <button v-if="canPin && isPinnedThis" @click="emit('unpin'); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                <BIcon name="PinOff" class="w-4 h-4 text-brand-accent" /> Открепить
              </button>
              <button v-if="isOwn" @click="startEdit"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                <BIcon name="Pencil" class="w-4 h-4 text-brand-accent" /> Редактировать
              </button>
              <button v-if="isOwn" @click="doDelete" :disabled="isDeleting"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50">
                <BIcon name="Trash2" class="w-4 h-4" /> Удалить
              </button>
              <button @click="doShare"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-muted hover:bg-white/5 hover:text-white">
                <BIcon name="Share2" class="w-4 h-4" /> Поделиться
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Content ───────────────────────────────────────────────────── -->
      <div class="space-y-3">
        <!-- NSFW blur wrapper -->
        <div :class="{ 'blur-md hover:blur-none cursor-pointer transition-all': post.is_nsfw }">

          <!-- Inline edit form -->
          <div v-if="isEditing" class="mb-1">
            <textarea
              v-model="editContent"
              autofocus
              rows="3"
              class="w-full bg-brand-bg border border-brand-accent/50 rounded-2xl px-4 py-3 text-white text-[15px] leading-relaxed resize-none outline-none focus:border-brand-accent"
            ></textarea>
            <div class="flex gap-2 mt-2 justify-end">
              <button @click="cancelEdit" class="px-4 py-1.5 text-sm text-brand-muted hover:text-white hover:bg-white/5 rounded-xl">Отмена</button>
              <button @click="saveEdit" :disabled="isSaving"
                class="px-4 py-1.5 text-sm bg-brand-accent text-white font-bold rounded-xl hover:bg-brand-accent-plus disabled:opacity-50">
                {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </div>

          <!-- Post text with mention highlighting -->
          <p v-else class="text-white/95 text-sm md:text-[15px] leading-relaxed whitespace-pre-wrap">
            <template v-for="seg in parsedContent" :key="seg.key">
              <span v-if="seg.type === 'text'">{{ seg.text }}</span>
              <span v-else
                class="inline-flex items-center gap-0.5 px-2 py-0.5 bg-brand-accent/15 border border-brand-accent/30 rounded-full text-brand-accent text-sm font-semibold cursor-pointer hover:bg-brand-accent/25 transition-all group/mention relative align-baseline"
                @click.stop="goToMention(seg.username!)"
              >
                @{{ seg.username }}
                <span class="absolute bottom-full left-0 mb-2 z-50 w-40 bg-brand-card border border-brand-border rounded-xl p-2.5 shadow-2xl opacity-0 group-hover/mention:opacity-100 scale-95 group-hover/mention:scale-100 transition-all duration-150 pointer-events-none whitespace-normal">
                  <span class="font-bold text-white text-xs block">@{{ seg.username }}</span>
                  <span class="text-[10px] text-brand-muted mt-0.5 block">Нажми, чтобы открыть</span>
                </span>
              </span>
            </template>
          </p>

          <!-- Media grid -->
          <div
            v-if="post.media_urls && post.media_urls.length"
            class="grid gap-2 mt-3"
            :class="post.media_urls.length === 1 ? 'grid-cols-1' : post.media_urls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'"
          >
            <template v-for="(url, i) in post.media_urls" :key="i">
              <img
                v-if="isImg(url)"
                :src="url"
                class="w-full rounded-2xl object-cover max-h-[520px] border border-brand-border cursor-pointer hover:opacity-90 transition-opacity"
                loading="lazy"
                @click="openLightbox(i)"
              />
              <video
                v-else
                :src="url"
                controls
                class="w-full rounded-2xl border border-brand-border max-h-[520px]"
              />
            </template>
          </div>
        </div>

        <!-- Category + tags -->
        <div v-if="post.category || (post.tags && post.tags.length)" class="flex flex-wrap items-center gap-1.5 mt-1">
          <span v-if="post.category"
            class="px-3 py-1 bg-brand-accent/20 text-brand-accent text-xs font-bold rounded-full border border-brand-accent/30">
            {{ post.category }}
          </span>
          <span
            v-for="tag in post.tags" :key="tag.tag?.id ?? tag.id"
            class="px-3 py-1 bg-brand-bg text-brand-muted text-xs font-medium rounded-full border border-brand-border hover:bg-brand-border hover:text-white cursor-pointer transition-colors"
          >
            #{{ tag.tag?.name ?? tag.name }}
          </span>
        </div>
      </div>

      <!-- ── Actions ───────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between pt-4 mt-4 border-t border-brand-border">
        <div class="flex items-center gap-2">
          <!-- Vote -->
          <div class="flex items-center gap-1 bg-brand-bg rounded-full p-1 border border-brand-border">
            <button @click="vote(1)"
              class="p-1 rounded-full transition-all duration-150"
              :class="localVote === 1
                ? 'bg-brand-success/25 text-brand-success shadow-[0_0_8px_0px] shadow-brand-success/40'
                : 'text-brand-muted hover:bg-brand-success/20 hover:text-brand-success'">
              <BIcon name="ArrowUp" class="w-4 h-4" />
            </button>
            <span class="font-bold text-sm min-w-[28px] text-center"
              :class="localVote === 1 ? 'text-emerald-400' : localVote === -1 ? 'text-rose-400' : localRating > 0 ? 'text-emerald-400' : localRating < 0 ? 'text-rose-400' : 'text-white'">
              {{ localRating }}
            </span>
            <button @click="vote(-1)"
              class="p-1 rounded-full transition-all duration-150"
              :class="localVote === -1
                ? 'bg-rose-500/25 text-rose-400 shadow-[0_0_8px_0px] shadow-rose-500/40'
                : 'text-brand-muted hover:bg-rose-500/20 hover:text-rose-400'">
              <BIcon name="ArrowDown" class="w-4 h-4" />
            </button>
          </div>

          <!-- Repaw -->
          <button @click="toggleRepaw"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
            :class="localRepawed
              ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
              : 'bg-brand-bg border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent/30'">
            <BIcon name="Repeat2" class="w-4 h-4" />
            <span class="text-sm">{{ localRepaws }}</span>
          </button>

          <!-- Comments toggle -->
          <button @click="isExpanded = !isExpanded"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs transition-all"
            :class="isExpanded
              ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
              : 'bg-brand-bg border-brand-border text-brand-muted hover:text-white'">
            <BIcon name="MessageSquare" class="w-4 h-4" />
            <span>{{ post._count?.comments ?? 0 }}</span>
          </button>
        </div>

        <div class="flex items-center gap-1">
          <!-- Favourite -->
          <button @click="toggleFavourite"
            class="p-2 rounded-full border transition-all"
            :class="localFavourited
              ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
              : 'bg-brand-bg border-brand-border text-brand-muted hover:text-yellow-400 hover:border-yellow-500/30'">
            <BIcon :name="localFavourited ? 'BookmarkCheck' : 'Bookmark'" class="w-4.5 h-4.5" />
          </button>

          <!-- Share -->
          <button @click="doShare"
            class="p-2 rounded-full border bg-brand-bg border-brand-border text-brand-muted hover:text-white hover:border-brand-border/80 transition-all">
            <BIcon name="Share2" class="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- ── Comments section ──────────────────────────────────────────────── -->
    <Transition name="slide">
      <div v-if="isExpanded" class="border-t border-brand-border px-5 pb-5 pt-4">
        <PostComments :post-id="post.id" />
      </div>
    </Transition>

    <!-- ── Media lightbox ────────────────────────────────────────────────── -->
    <PostLightbox
      v-if="lightboxOpen"
      :images="lightboxUrls"
      :start-index="lightboxIndex"
      @close="lightboxOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import PostComments from '@/components/PostComments.vue'
import PostLightbox from '@/components/PostLightbox.vue'

// ── Props & emits ─────────────────────────────────────────────────────────
const props = defineProps<{
  post: any
  isOwnProfile?: boolean
  isPinnedPostId?: string | null
  showRepawLabel?: boolean
  showFollowButton?: boolean
  initialFollowing?: boolean
}>()

const emit = defineEmits<{
  (e: 'pin', id: string): void
  (e: 'unpin'): void
  (e: 'deleted', id: string): void
  (e: 'updated', post: any): void
}>()

// ── Composables ───────────────────────────────────────────────────────────
const router = useRouter()
const authStore = useAuthStore()

// ── Local state ───────────────────────────────────────────────────────────
const localRating    = ref<number>(props.post.rating ?? 0)
const localRepaws    = ref<number>(props.post._count?.repaws ?? 0)
const localVote      = ref<1 | -1 | 0>(0)
const localRepawed   = ref(false)
const localFavourited = ref(false)
const localFollowing = ref<boolean | null>(props.initialFollowing ?? null)

const showMenu    = ref(false)
const isExpanded  = ref(false)
const isEditing   = ref(false)
const editContent = ref('')
const isSaving    = ref(false)
const isDeleting  = ref(false)

const lightboxOpen  = ref(false)
const lightboxIndex = ref(0)

// ── Computed ──────────────────────────────────────────────────────────────
const isOwn = computed(() =>
  !!authStore.user && (authStore.user.id === props.post.author_id || authStore.user.id === props.post.author?.id)
)
const canPin = computed(() => props.isOwnProfile && isOwn.value)
const isPinnedThis = computed(() => !!props.isPinnedPostId && props.isPinnedPostId === props.post.id)

const lightboxUrls = computed<string[]>(() =>
  (props.post.media_urls ?? []).filter((u: string) => isImg(u))
)

type Seg = { type: 'text' | 'mention'; key: number; text: string; username?: string }
const parsedContent = computed<Seg[]>(() =>
  (props.post.content ?? '').split(/(@\w+)/g).map((part: string, i: number) =>
    /^@\w+$/.test(part)
      ? { type: 'mention' as const, key: i, text: part, username: part.slice(1) }
      : { type: 'text' as const, key: i, text: part }
  )
)

// ── Helpers ───────────────────────────────────────────────────────────────
function avatarInitial(name?: string): string {
  return (name ?? '?')[0].toUpperCase()
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

// ── Actions ───────────────────────────────────────────────────────────────
async function vote(value: 1 | -1) {
  if (!authStore.isAuthenticated) return
  const prev = localVote.value
  localVote.value = prev === value ? 0 : value
  try {
    const r = await api.post(`/posts/${props.post.id}/vote`, { value })
    if (r.data.success) localRating.value = r.data.data.rating ?? localRating.value
  } catch {
    localVote.value = prev
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

async function toggleFavourite() {
  if (!authStore.isAuthenticated) return
  try {
    const r = await api.post(`/posts/${props.post.id}/favourite`)
    if (r.data.success) localFavourited.value = r.data.data.favourited
  } catch {}
}

async function toggleFollow() {
  if (!authStore.isAuthenticated) return
  try {
    const r = await api.post(`/follows/${props.post.author.id}/toggle`)
    if (r.data.success) localFollowing.value = r.data.data.following
  } catch {}
}

async function goToMention(username: string) {
  try {
    const r = await api.get(`/users/search?q=${encodeURIComponent(username)}`)
    const users: any[] = r.data.data?.users ?? []
    const found = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase())
    if (found) router.push(`/profile/${found.id}`)
  } catch {}
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

function openFullscreen() {
  showMenu.value = false
  if (props.post.media_urls?.length) openLightbox(0)
  else router.push(`/post/${props.post.id}`)
}

function startEdit() {
  isEditing.value = true
  editContent.value = props.post.content
  showMenu.value = false
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
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
  } catch {} finally {
    isSaving.value = false
  }
}

async function doDelete() {
  if (isDeleting.value) return
  isDeleting.value = true
  try {
    await api.delete(`/posts/${props.post.id}`)
    emit('deleted', props.post.id)
  } catch {} finally {
    isDeleting.value = false
  }
}

async function doShare() {
  showMenu.value = false
  const url = `${window.location.origin}/post/${props.post.id}`
  try {
    if (navigator.share) await navigator.share({ url })
    else await navigator.clipboard.writeText(url)
  } catch {}
}

// ── Click-outside directive ────────────────────────────────────────────────
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    ;(el as any)._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', (el as any)._clickOutside)
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any)._clickOutside)
  },
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.18s ease;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}
.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 1000px;
}
</style>
