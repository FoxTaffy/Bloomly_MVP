<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/30 transition-all group select-none">
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
              <!-- Verification badge -->
              <img v-if="post.author.is_verified && post.author.verification_type"
                :src="`/icons/badges/${post.author.verification_type}.svg`"
                class="w-4 h-4 flex-shrink-0" :title="({ artist: 'Верифицированный художник', master: 'Верифицированный мастер', event: 'Мероприятие' } as Record<string, string>)[post.author.verification_type] || 'Верифицирован'" />
              <img v-else-if="post.author.is_verified"
                src="/icons/badges/verified.svg"
                class="w-4 h-4 flex-shrink-0" title="Верифицирован" />
              <!-- AD badge -->
              <span v-if="post.author.role === 'ad'"
                class="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded-md">
                AD
              </span>
              <span v-if="showRepawLabel"
                class="inline-flex items-center gap-1 text-[10px] text-white/55 bg-brand-bg border border-brand-border px-1.5 py-0.5 rounded-md font-semibold">
                <BIcon name="Repeat2" class="w-3 h-3" /> Репав
              </span>
              <span v-if="isPinnedThis"
                class="inline-flex items-center gap-1 text-[10px] text-brand-accent/70 bg-brand-accent/10 border border-brand-accent/20 px-1.5 py-0.5 rounded-md font-semibold">
                <BIcon name="Pin" class="w-3 h-3" /> Закреплён
              </span>
            </div>
            <p class="text-xs text-white/55 truncate">@{{ post.author.username }} · {{ fmtDate(post.created_at) }}</p>
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
              class="text-white/55 hover:text-white p-2 rounded-full hover:bg-white/5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <BIcon name="MoreHorizontal" class="w-5 h-5" />
            </button>
            <div
              v-if="showMenu"
              v-click-outside="() => showMenu = false"
              class="absolute right-0 top-10 z-30 w-48 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
            >
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
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/55 hover:bg-white/5 hover:text-white">
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
              <button @click="cancelEdit" class="px-4 py-1.5 text-sm text-white/55 hover:text-white hover:bg-white/5 rounded-xl">Отмена</button>
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
              <!-- ── MENTION PILL ── -->
              <span v-else
                class="mention-pill inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 bg-brand-accent/15 border border-brand-accent/30 rounded-full text-brand-accent text-[13px] font-semibold cursor-pointer hover:bg-brand-accent/25 transition-all align-middle"
                style="vertical-align: middle; white-space: nowrap;"
                @click.stop="goToMention(seg.username!)"
                @mouseenter="onMentionEnter(seg.username!, $event)"
                @mouseleave="onMentionLeave()"
              >
                <!-- Avatar or initials -->
                <span class="flex-shrink-0 w-5 h-5 rounded-full overflow-hidden border border-brand-accent/40 bg-brand-accent/20 flex items-center justify-center">
                  <img
                    v-if="mentionUsers[seg.username!]?.avatar_url"
                    :src="mentionUsers[seg.username!]!.avatar_url!"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[8px] font-bold text-brand-accent leading-none">
                    {{ (seg.username ?? '?')[0].toUpperCase() }}
                  </span>
                </span>
                <span class="leading-none">{{ seg.username }}</span>
              </span>
            </template>
          </p>

          <!-- ── Media carousel ────────────────────────────────────── -->
          <div
            v-if="post.media_urls && post.media_urls.length"
            class="relative mt-3 rounded-2xl overflow-hidden bg-black/20 group/carousel"
            :class="adMode ? 'select-none' : ''"
            @contextmenu="adMode ? ($event as Event).preventDefault() : null"
            @touchstart.passive="carouselTouchStart"
            @touchend.passive="carouselTouchEnd"
          >
            <!-- Slide -->
            <div class="carousel-track" :style="{ transform: `translateX(-${carouselIndex * 100}%)` }">
              <div
                v-for="(url, i) in post.media_urls"
                :key="i"
                class="carousel-slide"
                :style="isImg(url) ? { '--blur-url': `url(${url})` } : {}"
                :data-has-blur="isImg(url) ? 'true' : 'false'"
                @click="openLightbox(i)"
              >
                <CustomPlayer :src="url" @click-image="openLightbox(i)" />
              </div>
            </div>

            <!-- Counter badge -->
            <div
              v-if="post.media_urls.length > 1"
              class="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-bold backdrop-blur-sm border border-white/10 select-none"
            >
              {{ carouselIndex + 1 }}&thinsp;/&thinsp;{{ post.media_urls.length }}
            </div>

            <!-- Prev / Next arrows -->
            <button
              v-if="post.media_urls.length > 1 && carouselIndex > 0"
              @click.stop="carouselIndex--"
              class="carousel-arrow left-2 opacity-0 group-hover/carousel:opacity-100"
            >
              <BIcon name="ChevronLeft" class="w-5 h-5" />
            </button>
            <button
              v-if="post.media_urls.length > 1 && carouselIndex < post.media_urls.length - 1"
              @click.stop="carouselIndex++"
              class="carousel-arrow right-2 opacity-0 group-hover/carousel:opacity-100"
            >
              <BIcon name="ChevronRight" class="w-5 h-5" />
            </button>

            <!-- Dots -->
            <div
              v-if="post.media_urls.length > 1"
              class="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 select-none"
            >
              <button
                v-for="(_, i) in post.media_urls"
                :key="i"
                @click.stop="carouselIndex = i"
                class="w-1.5 h-1.5 rounded-full transition-all duration-200"
                :class="i === carouselIndex ? 'bg-white w-4' : 'bg-white/40'"
              />
            </div>

            <!-- Expand to lightbox with comments -->
            <button
              @click.stop="openLightbox(carouselIndex)"
              class="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors opacity-0 group-hover/carousel:opacity-100"
              title="Открыть"
            >
              <BIcon name="Expand" class="w-4 h-4" />
            </button>
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
            class="px-3 py-1 bg-brand-bg text-white/55 text-xs font-medium rounded-full border border-brand-border hover:bg-brand-border hover:text-white cursor-pointer transition-colors"
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
                : 'text-white/55 hover:bg-brand-success/20 hover:text-brand-success'">
              <BIcon name="ThumbsUp" class="w-4 h-4" />
            </button>
            <span class="font-bold text-sm min-w-[28px] text-center"
              :class="localVote === 1 ? 'text-emerald-400' : localVote === -1 ? 'text-rose-400' : localRating > 0 ? 'text-emerald-400' : localRating < 0 ? 'text-rose-400' : 'text-white'">
              {{ localRating }}
            </span>
            <button @click="vote(-1)"
              class="p-1 rounded-full transition-all duration-150"
              :class="localVote === -1
                ? 'bg-rose-500/25 text-rose-400 shadow-[0_0_8px_0px] shadow-rose-500/40'
                : 'text-white/55 hover:bg-rose-500/20 hover:text-rose-400'">
              <BIcon name="ThumbsDown" class="w-4 h-4" />
            </button>
          </div>

          <!-- Repaw -->
          <button v-if="!adMode" @click="toggleRepaw"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
            :class="localRepawed
              ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
              : 'bg-brand-bg border-brand-border text-white/55 hover:text-brand-accent hover:border-brand-accent/30'">
            <BIcon name="Repeat2" class="w-4 h-4" />
            <span class="text-sm">{{ localRepaws }}</span>
          </button>

          <!-- Comments toggle -->
          <button @click="isExpanded = !isExpanded"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs transition-all"
            :class="isExpanded
              ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
              : 'bg-brand-bg border-brand-border text-white/55 hover:text-white'">
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
              : 'bg-brand-bg border-brand-border text-white/55 hover:text-yellow-400 hover:border-yellow-500/30'">
            <BIcon :name="localFavourited ? 'BookmarkCheck' : 'Bookmark'" class="w-4.5 h-4.5" />
          </button>

          <!-- Share -->
          <button v-if="!adMode" @click="doShare"
            class="p-2 rounded-full border bg-brand-bg border-brand-border text-white/55 hover:text-white hover:border-brand-border/80 transition-all">
            <BIcon name="Share2" class="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- ── Repaw undo bar ────────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div v-if="!adMode && repawUndoVisible" class="flex items-center justify-between gap-3 px-5 py-2.5 bg-brand-accent/10 border-t border-brand-accent/25">
        <div class="flex items-center gap-2 text-brand-accent text-xs font-bold">
          <BIcon name="Repeat2" class="w-3.5 h-3.5" />
          Репав через {{ repawCountdown }}с...
        </div>
        <button @click.stop="undoRepaw"
          class="px-3 py-1 rounded-full bg-brand-card border border-brand-border hover:border-brand-accent/40 text-white/55 hover:text-white text-xs font-semibold transition-all">
          Отменить
        </button>
      </div>
    </Transition>

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
      :post-id="post.id"
      @close="lightboxOpen = false"
    />
  </div>

  <!-- ── Mention hover popup (teleported to body, escapes overflow:hidden) ── -->
  <Teleport to="body">
    <Transition name="mention-popup">
      <div
        v-if="hoveredMention && mentionUsers[hoveredMention]"
        class="fixed z-[9999] w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden pointer-events-none"
        :style="{ top: mentionPopupPos.top, left: mentionPopupPos.left, transform: 'translateY(calc(-100% - 6px))' }"
      >
        <!-- Banner -->
        <div class="w-full h-14 relative overflow-hidden bg-gradient-to-br from-brand-accent/30 to-brand-accent-plus/20">
          <img
            v-if="mentionUsers[hoveredMention]?.banner_url"
            :src="mentionUsers[hoveredMention]!.banner_url!"
            class="w-full h-full object-cover"
            loading="lazy"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-brand-card/70 to-transparent"></div>
        </div>
        <!-- Avatar overlapping banner -->
        <div class="px-3 pb-3 -mt-5 relative">
          <div class="w-10 h-10 rounded-full border-2 border-brand-card overflow-hidden bg-brand-accent/20 flex items-center justify-center">
            <img
              v-if="mentionUsers[hoveredMention]?.avatar_url"
              :src="mentionUsers[hoveredMention]!.avatar_url!"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <span v-else class="text-sm font-bold text-brand-accent">
              {{ (hoveredMention ?? '?')[0].toUpperCase() }}
            </span>
          </div>
          <div class="mt-1.5">
            <div class="text-sm font-bold text-white leading-tight truncate">
              {{ mentionUsers[hoveredMention]?.display_name || hoveredMention }}
            </div>
            <div class="text-xs text-white/55 truncate">@{{ hoveredMention }}</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import PostComments from '@/components/PostComments.vue'
import PostLightbox from '@/components/PostLightbox.vue'

// ── Module-level mention user cache (shared across all PostCard instances) ──
type MentionUser = { id: string; username: string; display_name: string | null; avatar_url: string | null; banner_url: string | null }
const _mentionCache = new Map<string, MentionUser | null>()
const _pendingFetches = new Map<string, Promise<MentionUser | null>>()

async function lookupMentionUser(username: string): Promise<MentionUser | null> {
  if (_mentionCache.has(username)) return _mentionCache.get(username) ?? null
  if (_pendingFetches.has(username)) return _pendingFetches.get(username)!
  const promise = api.get(`/users/search?q=${encodeURIComponent(username)}`).then(r => {
    const users: any[] = r.data.data?.users ?? []
    const found = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase()) ?? null
    const result: MentionUser | null = found ? {
      id: found.id, username: found.username,
      display_name: found.display_name ?? null,
      avatar_url: found.avatar_url ?? null,
      banner_url: found.banner_url ?? null,
    } : null
    _mentionCache.set(username, result)
    _pendingFetches.delete(username)
    return result
  }).catch(() => { _mentionCache.set(username, null); _pendingFetches.delete(username); return null })
  _pendingFetches.set(username, promise)
  return promise
}

// ── Props & emits ─────────────────────────────────────────────────────────
const props = defineProps<{
  post: any
  isOwnProfile?: boolean
  isPinnedPostId?: string | null
  showRepawLabel?: boolean
  showFollowButton?: boolean
  initialFollowing?: boolean
  initialVote?: 1 | -1 | 0
  initialRepawed?: boolean
  initialFavourited?: boolean
  adMode?: boolean
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
const localVote      = ref<1 | -1 | 0>(props.initialVote ?? 0)
const localRepawed   = ref(props.initialRepawed ?? false)
const localFavourited = ref(props.initialFavourited ?? false)
const localFollowing = ref<boolean | null>(props.initialFollowing ?? null)

// Sync with parent postStatus when it loads asynchronously
watch(() => props.initialVote, (val) => { if (val !== undefined) localVote.value = val })
watch(() => props.initialRepawed, (val) => { if (val !== undefined) localRepawed.value = val })
watch(() => props.initialFavourited, (val) => { if (val !== undefined) localFavourited.value = val })

const showMenu    = ref(false)
const isExpanded  = ref(false)
const isEditing   = ref(false)
const editContent = ref('')
const isSaving    = ref(false)
const isDeleting  = ref(false)

const repawUndoVisible = ref(false)
const repawCountdown = ref(5)
let repawTimer: ReturnType<typeof setTimeout> | null = null
let repawCountdownTimer: ReturnType<typeof setInterval> | null = null

const lightboxOpen  = ref(false)
const lightboxIndex = ref(0)

// ── Carousel ──────────────────────────────────────────────────────────────
const carouselIndex = ref(0)
watch(() => props.post.id, () => { carouselIndex.value = 0 })

let _carouselTouchX = 0
function carouselTouchStart(e: TouchEvent) { _carouselTouchX = e.touches[0].clientX }
function carouselTouchEnd(e: TouchEvent) {
  const diff = _carouselTouchX - e.changedTouches[0].clientX
  const total = props.post.media_urls?.length ?? 1
  if (diff > 50 && carouselIndex.value < total - 1) carouselIndex.value++
  else if (diff < -50 && carouselIndex.value > 0) carouselIndex.value--
}

// ── Mention hover popup (Teleport-based to escape overflow:hidden) ─────────
const hoveredMention = ref<string | null>(null)
const mentionPopupPos = ref({ top: '0px', left: '0px' })

function onMentionEnter(username: string, e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  hoveredMention.value = username
  const left = Math.max(0, Math.min(rect.left, window.innerWidth - 224))
  mentionPopupPos.value = {
    top: `${rect.top}px`,
    left: `${left}px`,
  }
}
function onMentionLeave() { hoveredMention.value = null }

// ── Mention user data ──────────────────────────────────────────────────────
// reactive map so template updates when data arrives
const mentionUsers = ref<Record<string, MentionUser | null>>({})

async function loadMentionUsers() {
  const content = props.post.content ?? ''
  const usernames = [...new Set((content.match(/@(\w+)/g) ?? []).map((m: string) => m.slice(1)))]
  for (const username of usernames) {
    if (!(username in mentionUsers.value)) {
      const user = await lookupMentionUser(username)
      mentionUsers.value = { ...mentionUsers.value, [username]: user }
    }
  }
}

onMounted(() => { loadMentionUsers() })
watch(() => props.post.content, () => { loadMentionUsers() })


// ── Computed ──────────────────────────────────────────────────────────────
const isOwn = computed(() =>
  !!authStore.user && (authStore.user.id === props.post.author_id || authStore.user.id === props.post.author?.id)
)
const canPin = computed(() => props.isOwnProfile && isOwn.value)
const isPinnedThis = computed(() => !!props.isPinnedPostId && props.isPinnedPostId === props.post.id)

const lightboxUrls = computed<string[]>(() =>
  props.post.media_urls ?? []
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

  // If already repawed, undo immediately (no toast)
  if (localRepawed.value) {
    if (repawTimer) { clearTimeout(repawTimer); repawTimer = null }
    if (repawCountdownTimer) { clearInterval(repawCountdownTimer); repawCountdownTimer = null }
    repawUndoVisible.value = false
    localRepawed.value = false
    localRepaws.value = Math.max(0, localRepaws.value - 1)
    try {
      const r = await api.post(`/posts/${props.post.id}/repaw`, {})
      if (r.data.success) {
        localRepawed.value = r.data.data.repawed
        localRepaws.value = r.data.data.repaw_count
      }
    } catch {}
    return
  }

  // Optimistic update + show undo toast with countdown
  localRepawed.value = true
  localRepaws.value++
  repawUndoVisible.value = true
  repawCountdown.value = 5
  if (repawTimer) clearTimeout(repawTimer)
  if (repawCountdownTimer) clearInterval(repawCountdownTimer)
  repawCountdownTimer = setInterval(() => {
    repawCountdown.value--
    if (repawCountdown.value <= 0 && repawCountdownTimer) {
      clearInterval(repawCountdownTimer)
      repawCountdownTimer = null
    }
  }, 1000)
  repawTimer = setTimeout(async () => {
    repawUndoVisible.value = false
    repawTimer = null
    if (repawCountdownTimer) { clearInterval(repawCountdownTimer); repawCountdownTimer = null }
    // Commit: call API to actually create the repaw
    try {
      const r = await api.post(`/posts/${props.post.id}/repaw`, {})
      if (r.data.success) {
        localRepawed.value = r.data.data.repawed
        localRepaws.value = r.data.data.repaw_count
      }
    } catch {
      localRepawed.value = false
      localRepaws.value = Math.max(0, localRepaws.value - 1)
    }
  }, 5000)
}

function undoRepaw() {
  if (repawTimer) { clearTimeout(repawTimer); repawTimer = null }
  if (repawCountdownTimer) { clearInterval(repawCountdownTimer); repawCountdownTimer = null }
  repawUndoVisible.value = false
  localRepawed.value = false
  localRepaws.value = Math.max(0, localRepaws.value - 1)
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
  carouselIndex.value = index
  lightboxOpen.value = true
}

function openLightboxByUrl(url: string) {
  const index = (props.post.media_urls ?? []).indexOf(url)
  openLightbox(index !== -1 ? index : 0)
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
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.slide-up-enter-to,
.slide-up-leave-from {
  opacity: 1;
  max-height: 60px;
}

/* ── Carousel ───────────────────────────────────────────────────────────── */
.carousel-track {
  display: flex;
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
  will-change: transform;
}
.carousel-slide {
  position: relative;
  flex: 0 0 100%;
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0d14;
  min-height: 220px;
}
/* Blur layer — только для изображений (data-has-blur=true) */
.carousel-slide[data-has-blur='true']::before {
  content: '';
  position: absolute;
  inset: -40px;
  background-image: var(--blur-url);
  background-size: cover;
  background-position: center;
  filter: blur(32px);
  opacity: 0.55;
  z-index: 0;
  pointer-events: none;
}
/* Прямой дочерний <img> (тип image) — центрирование с contain */
.carousel-slide[data-has-blur='true'] :deep(> img) {
  position: relative;
  z-index: 1;
  display: block !important;
  width: auto !important;
  height: auto !important;
  max-width: 100% !important;
  max-height: 480px !important;
  object-fit: contain !important;
  border-radius: 12px !important;
  border: none !important;
  margin: 0 auto !important;
}
/* GIF и Video враппер — без изменений, просто z-index поверх blur нет (нет blur у них) */
.carousel-slide[data-has-blur='false'] :deep(> div) {
  width: 100%;
}
.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: opacity 0.2s, background 0.2s;
  backdrop-filter: blur(4px);
}
.carousel-arrow:hover { background: rgba(0,0,0,0.8); }

/* ── Media grid cells (legacy, kept for compatibility) ───────────────────── */
.media-cell {
  position: relative;
  overflow: hidden;
}
/* Заставляем изображения и видео полностью заполнять ячейку */
.media-cell :deep(> div),
.media-cell :deep(> figure) {
  width: 100%;
  height: 100%;
}
.media-cell :deep(img),
.media-cell :deep(video) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  max-height: none !important;
  border-radius: 0 !important;
  border: none !important;
  display: block;
}

/* Mention pill */
.mention-pill {
  position: relative;
}
/* Mention popup teleport transition */
.mention-popup-enter-active,
.mention-popup-leave-active {
  transition: opacity 0.12s ease;
}
.mention-popup-enter-from,
.mention-popup-leave-to {
  opacity: 0;
}
.mention-popup-enter-to,
.mention-popup-leave-from {
  opacity: 1;
}
</style>
