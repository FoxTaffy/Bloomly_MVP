<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BIcon from './BIcon.vue'
import VerificationBadge from './VerificationBadge.vue'
import PostComments from './PostComments.vue'
import CustomPlayer from './CustomPlayer.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import { useAutoTranslate } from '@/composables/useAutoTranslate'
import { useLangStore } from '@/stores/lang'
import { parsePostSegments } from '@/lib/postText'
import { usePostDiscussion } from '@/composables/usePostDiscussion'
import { isVideoUrl } from '@/lib/mediaType'

const props = defineProps<{
  focusComments?: boolean
  commentsDisabled?: boolean
  group?: { name: string; slug: string; avatar_url?: string | null } | null
  images: string[]
  originalImages?: string[]
  types?: string[]
  startIndex?: number
  postId?: string
  author?: {
    id?: string
    username: string
    display_name?: string | null
    avatar_url?: string | null
    is_verified?: boolean
    verification_type?: string | null
    deceased_at?: string | null
  } | null
  createdAt?: string | null
  content?: string | null
  tags?: any[]
  category?: string | null
  /** Author id used for the "can't repaw own post" check — falls back to author.id when omitted. */
  authorId?: string | null
  rating?: number
  initialVote?: 1 | -1 | 0
  initialRepawed?: boolean
  initialFavourited?: boolean
  repawCount?: number
  commentsCount?: number
  viewsCount?: number
  /** Показывать в адресной строке ссылку на публикацию, пока окно открыто (карточка поста в ленте/профиле/группе). */
  syncAddress?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'comments-change', payload: { postId: string; delta: number }): void
  (e: 'voted', payload: { postId: string; vote: 1 | -1 | 0; rating: number }): void
  (e: 'repaw-toggled', payload: { postId: string; repawed: boolean; count: number }): void
  (e: 'favourite-changed', payload: { postId: string; favourited: boolean }): void
}>()
const route = useRoute()
const dialog = ref<HTMLElement | null>(null)
const mobileTab = ref(props.focusComments || !props.images.length ? 'comments' : 'media')
const slots = useSlots()
const authStore = useAuthStore()
const langStore = useLangStore()
const discussion = usePostDiscussion(() => props.postId ?? '', () => authStore.user?.id)
const localCommentsCount = discussion.count
watch(() => props.commentsCount, count => { if (count !== undefined) discussion.seedCount(count, true) }, { immediate: true })
watch(() => route.fullPath, () => emit('close'))

// Адрес публикации в строке браузера, пока окно открыто: её можно скопировать или обновить страницу.
// Без новой записи в истории и без перехода роутера (иначе окно закрылось бы): при закрытии
// возвращается адрес страницы, с которой окно открыли. Ссылка внутри окна уводит обычным переходом.
const router = useRouter()
let addressBeforeOpen: string | null = null
const currentAddress = () => location.pathname + location.search + location.hash
const postAddress = () => router.resolve(`/post/${encodeURIComponent(props.postId ?? '')}`).href
function showPostAddress() {
  if (!props.syncAddress || !props.postId) return
  const href = postAddress()
  if (location.pathname === href) return
  addressBeforeOpen = currentAddress()
  history.replaceState(history.state, '', href)
}
function restoreAddress() {
  if (addressBeforeOpen === null) return
  if (currentAddress() === postAddress()) history.replaceState(history.state, '', addressBeforeOpen)
  addressBeforeOpen = null
}
function commentsChanged(delta: number) { if (props.postId) emit('comments-change', { postId: props.postId, delta }) }
const { displayText, isTranslating, showTranslation, toggle: toggleTranslation, canTranslate } = useAutoTranslate(() => props.postId ?? '', () => slots['post-content'] ? '' : props.content ?? '')
const contentSegments = computed(() => parsePostSegments(displayText.value))
const tagName = (tag: any) => String(tag?.tag?.name ?? tag?.name ?? tag ?? '')
function closeFromBackdrop(event: MouseEvent) {
  if (event.target === event.currentTarget) emit('close')
}
const identity = computed(() => props.group ? {
  name: props.group.name, avatar: props.group.avatar_url,
  href: `/groups/${props.group.slug}`, handle: `@${props.group.slug}`,
} : {
  name: props.author?.display_name || props.author?.username || 'Публикация', avatar: props.author?.avatar_url,
  href: props.author?.username ? `/profile/${props.author.username}` : '', handle: props.author?.username ? `@${props.author.username}` : '',
})
const actionError = ref('')

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function formatPostDate(d?: string | null): string {
  if (!d) return ''
  const date = new Date(d)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const day = `${date.getDate()} ${MONTHS_RU[date.getMonth()]}${sameYear ? '' : ' ' + date.getFullYear()}`
  return `${day} в ${hh}:${mm}`
}

const showComments = ref(!!props.postId)
const isVideo = isVideoUrl

// ── Vote / repaw / favourite (mirrors PostCard.vue) ─────────────────────────
const localRating     = ref(props.rating ?? 0)
const localVote       = ref<1 | -1 | 0>(props.initialVote ?? 0)
const localRepawed    = ref(props.initialRepawed ?? false)
const localRepaws     = ref(props.repawCount ?? 0)
const localFavourited = ref(props.initialFavourited ?? false)
const votePending  = ref(false)
const repawPending = ref(false)
const favouritePending = ref(false)
const isOwnPost = computed(() => !!authStore.user?.id && authStore.user.id === (props.authorId ?? props.author?.id))

watch(() => props.rating, (v) => { if (v !== undefined) localRating.value = v })
watch(() => props.initialVote, (v) => { if (v !== undefined) localVote.value = v })
watch(() => props.initialRepawed, (v) => { if (v !== undefined) localRepawed.value = v })
watch(() => props.initialFavourited, (v) => { if (v !== undefined) localFavourited.value = v })
watch(() => props.repawCount, (v) => { if (v !== undefined) localRepaws.value = v })

async function vote(value: 1 | -1) {
  if (!props.postId || !authStore.isAuthenticated || votePending.value) return
  actionError.value = ''
  votePending.value = true
  const prev = localVote.value
  const prevRating = localRating.value
  const next: 1 | -1 | 0 = prev === value ? 0 : value
  localVote.value = next
  localRating.value = prevRating + (next - prev)
  try {
    const r = await api.post(`/posts/${props.postId}/vote`, { value })
    if (!r.data.success) throw new Error('Vote rejected')
    localRating.value = r.data.data.rating ?? localRating.value
    emit('voted', { postId: props.postId, vote: next, rating: localRating.value })
  } catch {
    actionError.value = 'Не удалось сохранить оценку. Попробуйте ещё раз.'
    localVote.value = prev
    localRating.value = prevRating
  } finally {
    votePending.value = false
  }
}

async function toggleRepaw() {
  if (!props.postId || !authStore.isAuthenticated || repawPending.value || isOwnPost.value) return
  actionError.value = ''
  repawPending.value = true
  const wasRepawed = localRepawed.value
  localRepawed.value = !wasRepawed
  localRepaws.value += wasRepawed ? -1 : 1
  try {
    const r = await api.post(`/posts/${props.postId}/repaw`, {})
    if (r.data.success) {
      localRepawed.value = r.data.data.repawed
      localRepaws.value = r.data.data.repaw_count
    } else throw new Error('Repaw rejected')
    emit('repaw-toggled', { postId: props.postId, repawed: localRepawed.value, count: localRepaws.value })
  } catch {
    actionError.value = 'Не удалось сохранить репав. Попробуйте ещё раз.'
    localRepawed.value = wasRepawed
    localRepaws.value += wasRepawed ? 1 : -1
  } finally {
    repawPending.value = false
  }
}

async function toggleFavourite() {
  if (!props.postId || !authStore.isAuthenticated || favouritePending.value) return
  favouritePending.value = true
  actionError.value = ''
  try {
    const r = await api.post(`/posts/${props.postId}/favourite`)
    if (!r.data.success) throw new Error('Favourite rejected')
    localFavourited.value = r.data.data.favourited
    emit('favourite-changed', { postId: props.postId, favourited: localFavourited.value })
  } catch {
    actionError.value = 'Не удалось обновить закладки. Попробуйте ещё раз.'
  } finally { favouritePending.value = false }
}

const current = ref(Math.max(0, Math.min(props.startIndex ?? 0, props.images.length - 1)))
watch(() => props.images.length, length => { current.value = Math.max(0, Math.min(current.value, length - 1)) })
const total = computed(() => props.images.length)
const currentUrl = computed(() => props.images[current.value])
const currentOriginalUrl = computed(() => props.originalImages?.[current.value] || currentUrl.value)
const currentMsgType = computed(() => props.types?.[current.value])

const downloading = ref(false)
async function downloadOriginal() {
  const url = currentOriginalUrl.value
  if (!url || downloading.value) return
  downloading.value = true
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = url.split('/').pop() || 'image'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  } finally {
    downloading.value = false
  }
}
const prev = () => { if (total.value > 1) current.value = (current.value - 1 + total.value) % total.value }
const next = () => { if (total.value > 1) current.value = (current.value + 1) % total.value }

function focusables() {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])
    .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'))
}
function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return
  if (e.key === 'Escape') { e.preventDefault(); emit('close'); return }
  if (e.key === 'Tab') {
    const controls = focusables()
    const first = controls[0], last = controls[controls.length - 1]
    if (!first) { e.preventDefault(); dialog.value?.focus(); return }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
      e.preventDefault(); first.focus()
    }
    return
  }
  const target = e.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'ArrowLeft' && target.closest('.post-media')) { e.preventDefault(); prev() }
  if (e.key === 'ArrowRight' && target.closest('.post-media')) { e.preventDefault(); next() }
}
let touchStartX = 0
let touchStartY = 0
let multiTouch = false
function onTouchStart(e: TouchEvent) {
  multiTouch = e.touches.length !== 1
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}
function onTouchEnd(e: TouchEvent) {
  if (multiTouch) return
  const dx = touchStartX - e.changedTouches[0].clientX
  const dy = touchStartY - e.changedTouches[0].clientY
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) dx > 0 ? next() : prev()
}
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
const background: { element: HTMLElement; inert: boolean }[] = []
onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement | null
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  for (const element of Array.from(document.body.children)) {
    if (element instanceof HTMLElement && element !== dialog.value && !element.contains(dialog.value)) {
      background.push({ element, inert: element.inert })
      element.inert = true
    }
  }
  document.addEventListener('keydown', onKey)
  showPostAddress()
  await nextTick()
  dialog.value?.focus()
})
onUnmounted(() => {
  restoreAddress()
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = previousOverflow
  for (const { element, inert } of background) element.inert = inert
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport to="body">
    <section ref="dialog" role="dialog" aria-modal="true" aria-label="Публикация и комментарии" tabindex="-1"
      class="post-dialog" :class="{ 'post-dialog--text': !total, 'post-dialog--media-only': !postId || !showComments }">
      <header class="post-dialog-header">
        <div class="post-dialog-heading">
          <span class="post-dialog-mark"><BIcon name="MessageSquare" class="w-5 h-5" aria-hidden="true" /></span>
          <div><h2>Публикация</h2><p>{{ postId ? 'Обсуждение в Bloomly' : 'Просмотр медиа' }}</p></div>
        </div>
        <nav v-if="total && postId" class="post-mobile-tabs" aria-label="Содержимое публикации">
          <button :aria-pressed="mobileTab === 'media'" @click="mobileTab = 'media'">Медиа</button>
          <button :aria-pressed="mobileTab === 'comments'" @click="mobileTab = 'comments'; showComments = true">Обсуждение</button>
        </nav>
        <div class="post-header-actions">
              <button v-if="postId" class="post-icon-button post-desktop-toggle" :aria-pressed="showComments" @click="showComments = !showComments" aria-label="Показать или скрыть обсуждение" title="Обсуждение"><BIcon name="MessageSquare" class="w-5 h-5" aria-hidden="true" /></button>
              <button v-if="currentUrl && !isVideo(currentUrl)" class="post-icon-button" @click="downloadOriginal" :disabled="downloading" aria-label="Скачать оригинал" title="Скачать оригинал"><BIcon :name="downloading ? 'Loader2' : 'Download'" :class="['w-5 h-5', { 'animate-spin': downloading }]" aria-hidden="true" /></button>

          <router-link v-if="postId" :to="`/post/${postId}`" class="post-icon-button post-permalink" aria-label="Открыть страницу публикации" title="Страница публикации">
            <BIcon name="ExternalLink" class="w-5 h-5" aria-hidden="true" />
          </router-link>
          <button class="post-icon-button" @click="emit('close')" aria-label="Закрыть публикацию" title="Закрыть (Esc)"><BIcon name="X" class="w-5 h-5" aria-hidden="true" /></button>
        </div>
      </header>
      <div class="post-dialog-body">
        <div v-if="total" class="post-media" @click.self="closeFromBackdrop" :class="{ 'post-mobile-hidden': postId && mobileTab === 'comments' }"
          @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
          <div class="post-media-toolbar">
            <span class="post-media-counter">{{ current + 1 }} / {{ total }}</span>

          </div>
          <div class="post-media-player" @click="closeFromBackdrop"><CustomPlayer :key="currentUrl" :src="currentUrl" :msg-type="currentMsgType" @click-image="() => {}" /></div>
          <button v-if="total > 1" class="post-icon-button post-media-prev" @click="prev" aria-label="Предыдущее медиа"><BIcon name="ChevronLeft" class="w-6 h-6" aria-hidden="true" /></button>
          <button v-if="total > 1" class="post-icon-button post-media-next" @click="next" aria-label="Следующее медиа"><BIcon name="ChevronRight" class="w-6 h-6" aria-hidden="true" /></button>
          <div v-if="total > 1" class="post-media-thumbs" aria-label="Медиа публикации">
            <button v-for="(url, idx) in images" :key="idx" @click="current = idx" :aria-label="`Медиа ${idx + 1}`" :aria-pressed="current === idx">
              <img v-if="!isVideo(url)" :src="url" alt="" />
              <BIcon v-else name="Play" class="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <aside v-if="postId" v-show="showComments" class="post-discussion" :class="{ 'post-mobile-hidden': total && mobileTab !== 'comments' }" aria-label="Обсуждение публикации">
          <div class="post-discussion-title"><h3>Комментарии</h3><span role="status" aria-live="polite" aria-atomic="true"><span class="sr-only">Комментариев: </span>{{ localCommentsCount }}</span></div>
          <PostComments :post-id="postId" :comments-disabled="commentsDisabled" fullscreen :overlay-target="dialog" @count-change="commentsChanged">
            <template #post>
              <article class="post-context">
                <component :is="identity.href ? 'router-link' : 'div'" :to="identity.href || undefined" class="post-identity">
                  <img v-if="identity.avatar" :src="identity.avatar" @error="onAvatarError" alt="" width="44" height="44" :class="{ 'post-group-avatar': group }" />
                  <span v-else class="post-identity-fallback">{{ identity.name[0].toUpperCase() }}</span>
                  <div class="min-w-0"><div class="flex items-center gap-2"><strong>{{ identity.name }}</strong><VerificationBadge v-if="!group && author?.is_verified" :type="author.verification_type" icon-class="w-4 h-4" /></div><p>{{ identity.handle }}<span v-if="createdAt"> · {{ formatPostDate(createdAt) }}</span></p></div>
                </component>
                <slot name="post-content"><div v-if="content" class="post-content">
                  <p><template v-for="segment in contentSegments" :key="segment.key"><span v-if="segment.type === 'text'">{{ segment.text }}</span><a v-else-if="segment.type === 'url'" :href="segment.href" target="_blank" rel="noopener noreferrer nofollow ugc">{{ segment.text }}</a><router-link v-else :to="`/profile/${segment.username}`">{{ segment.text }}</router-link></template></p>
                  <button v-if="canTranslate" type="button" class="post-translate" @click="toggleTranslation" :disabled="isTranslating" :aria-pressed="showTranslation">
                    <BIcon :name="isTranslating ? 'Loader2' : 'Languages'" :class="['w-4 h-4', { 'animate-spin': isTranslating }]" aria-hidden="true" />{{ isTranslating ? langStore.t.translating : showTranslation ? langStore.t.showOriginal : langStore.t.autoTranslate }}
                  </button>
                </div>
                <div v-if="category || tags?.length" class="post-tags"><span v-if="category" class="post-category">{{ category }}</span><router-link v-for="tag in tags" :key="tagName(tag)" :to="`/search?q=${encodeURIComponent(tagName(tag))}`">#{{ tagName(tag) }}</router-link></div></slot>
                <div class="post-reactions">
                  <div class="post-votes">
                    <button @click="vote(1)" :disabled="!authStore.isAuthenticated || votePending" :aria-pressed="localVote === 1" aria-label="Нравится" :class="{ positive: localVote === 1 }"><BIcon name="ArrowBigUp" class="w-5 h-5" :fill="localVote === 1 ? 'currentColor' : 'none'" aria-hidden="true" /></button>
                    <span>{{ localRating }}</span>
                    <button @click="vote(-1)" :disabled="!authStore.isAuthenticated || votePending" :aria-pressed="localVote === -1" aria-label="Не нравится" :class="{ negative: localVote === -1 }"><BIcon name="ArrowBigDown" class="w-5 h-5" :fill="localVote === -1 ? 'currentColor' : 'none'" aria-hidden="true" /></button>
                  </div>
                  <button class="post-reaction-button" @click="toggleRepaw" :disabled="!authStore.isAuthenticated || isOwnPost || repawPending" :aria-pressed="localRepawed" aria-label="Репав" :title="isOwnPost ? 'Нельзя репавсить свой пост' : 'Репав'"><BIcon name="Repeat2" class="w-4 h-4" aria-hidden="true" />{{ localRepaws }}</button>
                  <button class="post-icon-button" @click="toggleFavourite" :disabled="!authStore.isAuthenticated || favouritePending" :aria-pressed="localFavourited" :aria-label="localFavourited ? 'Убрать из закладок' : 'В закладки'"><BIcon :name="localFavourited ? 'BookmarkCheck' : 'Bookmark'" class="w-5 h-5" aria-hidden="true" /></button>
                  <span class="post-views" aria-label="Просмотры"><BIcon name="Eye" class="w-4 h-4" aria-hidden="true" />{{ viewsCount ?? 0 }}</span>
                </div>
                <p v-if="actionError" class="post-action-error" role="alert">{{ actionError }}</p>
              </article>
            </template>
          </PostComments>
        </aside>
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
.post-context :deep(.post-body p) { font-size:16px; line-height:1.6; overflow-wrap:anywhere; }
.post-context :deep(.post-body button),.post-context :deep(.post-body a) { color:var(--color-brand-accent-minus); }
.post-context :deep(.post-body button) { font-size:13px; min-height:36px; }

.post-content a,.post-translate,.post-tags a { color:var(--color-brand-accent-minus); }
.post-content a:hover,.post-tags a:hover { text-decoration:underline; }
.post-translate { display:inline-flex; align-items:center; gap:6px; min-height:36px; margin-top:8px; font-size:13px; font-weight:700; white-space:normal; }
.post-tags { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.post-tags a { padding:4px 10px; border:1px solid var(--color-brand-border); border-radius:10px; background:var(--color-brand-bg); font-size:13px; overflow-wrap:anywhere; }
.post-header-actions { flex-wrap:wrap; justify-content:flex-end; }

.post-dialog { position:fixed; inset:0; z-index:300; display:flex; flex-direction:column; height:100dvh; overflow:hidden; color:var(--color-brand-offwhite); background:var(--color-brand-bg); animation:post-arrive .18s ease-out; }
.post-dialog-header { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; gap:16px; min-height:80px; padding:calc(12px + env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 12px max(24px, env(safe-area-inset-left)); border-bottom:1px solid var(--color-brand-border); background:var(--color-brand-card); }
.post-dialog-heading { display:flex; align-items:center; gap:12px; min-width:0; }
.post-dialog-mark { display:grid; place-items:center; width:44px; height:44px; border:1px solid var(--color-brand-accent-plus); border-radius:16px; color:var(--color-brand-accent-minus); background:var(--color-brand-accent-plus-plus); }
.post-dialog-heading h2 { font-size:18px; font-weight:800; line-height:1.4; }
.post-dialog-heading p, .post-identity p { color:var(--color-brand-accent-minus-minus); opacity:.8; font-size:12px; line-height:1.5; }
.post-header-actions { display:flex; align-items:center; gap:8px; }
.post-icon-button { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:44px; height:44px; border:1px solid var(--color-brand-border); border-radius:14px; color:var(--color-brand-offwhite); background:var(--color-brand-bg); transition:background-color .15s, border-color .15s; }
.post-icon-button:hover { background:var(--color-brand-border); border-color:var(--color-brand-accent); }
.post-dialog :is(button,a):focus-visible { outline:2px solid var(--color-brand-accent-minus); outline-offset:3px; }
.post-dialog button { cursor:pointer; }
.post-dialog button:disabled { cursor:default; opacity:.45; }
.post-dialog-body { display:grid; grid-template-columns:minmax(0,1fr) minmax(420px,480px); flex:1; min-height:0; }
.post-media { position:relative; display:flex; min-width:0; min-height:0; align-items:center; justify-content:center; background:color-mix(in srgb, var(--color-brand-bg) 40%, black); overflow:hidden; }
.post-media-toolbar { position:absolute; inset:16px 16px auto; z-index:2; display:flex; align-items:center; justify-content:space-between; }
.post-media-counter { font-size:13px; font-weight:700; padding:8px 12px; border-radius:12px; background:var(--color-brand-bg); border:1px solid var(--color-brand-border); }
.post-media-player { display:flex; align-items:center; justify-content:center; width:100%; height:100%; min-height:0; padding:80px 56px 88px; }
.post-media-player :deep(> img) { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; border-radius:16px; cursor:default; }
.post-media-player :deep(> div) { width:100%; max-height:100%; }
.post-media-prev,.post-media-next { position:absolute; top:50%; transform:translateY(-50%); }
.post-media-prev { left:12px; } .post-media-next { right:12px; }
.post-media-thumbs { position:absolute; bottom:16px; display:flex; max-width:calc(100% - 32px); gap:8px; padding:4px; overflow-x:auto; }
.post-media-thumbs button { display:grid; place-items:center; width:48px; height:48px; flex-shrink:0; border-radius:12px; border:2px solid var(--color-brand-border); background:var(--color-brand-card); overflow:hidden; opacity:.65; }
.post-media-thumbs button[aria-pressed=true] { border-color:var(--color-brand-accent-minus); opacity:1; }
.post-media-thumbs img { width:100%; height:100%; object-fit:cover; }
.post-discussion { display:flex; flex-direction:column; min-height:0; min-width:0; background:var(--color-brand-card); border-left:1px solid var(--color-brand-border); }
.post-discussion-title { display:flex; align-items:center; gap:10px; padding:20px 24px 16px; border-bottom:1px solid var(--color-brand-border); }
.post-discussion-title h3 { font-size:.875rem; font-weight:600; line-height:1.5; }
.post-discussion-title > span { padding:3px 9px; border-radius:8px; background:var(--color-brand-bg); color:var(--color-brand-accent-minus); font-size:.75rem; font-weight:600; font-variant-numeric:tabular-nums; }
.post-context { padding-bottom:20px; margin-bottom:24px; border-bottom:1px solid var(--color-brand-border); }
.post-identity { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.post-identity img,.post-identity-fallback { width:44px; height:44px; border-radius:50%; flex-shrink:0; object-fit:cover; }
.post-identity .post-group-avatar { border-radius:14px; }
.post-identity-fallback { display:grid; place-items:center; background:var(--color-brand-accent-plus-plus); color:var(--color-brand-accent-minus); font-weight:800; }
.post-identity strong { font-size:15px; overflow-wrap:anywhere; }
.post-content { font-size:16px; line-height:1.65; white-space:pre-wrap; overflow-wrap:anywhere; }
.post-reactions { display:flex; align-items:center; gap:8px; margin-top:20px; }
.post-votes { display:flex; align-items:center; border:1px solid var(--color-brand-border); border-radius:14px; background:var(--color-brand-bg); }
.post-votes button { width:40px; height:42px; display:grid; place-items:center; border-radius:12px; color:var(--color-brand-accent-minus-minus); }
.post-votes span { min-width:24px; text-align:center; font-size:14px; font-weight:800; font-variant-numeric:tabular-nums; }
.post-votes .positive { color:var(--color-brand-success); } .post-votes .negative { color:var(--color-brand-pink); }
.post-reaction-button { display:flex; align-items:center; justify-content:center; height:44px; gap:8px; padding:0 12px; border:1px solid var(--color-brand-border); border-radius:14px; background:var(--color-brand-bg); font-size:14px; }
.post-dialog [aria-pressed=true] { color:var(--color-brand-accent-minus); }
.post-views { display:flex; align-items:center; gap:6px; margin-left:auto; font-size:12px; color:var(--color-brand-accent-minus-minus); }
.post-action-error { margin-top:12px; color:var(--color-brand-pink); font-size:13px; }
.post-dialog--text .post-dialog-body { display:flex; justify-content:center; overflow:hidden; }
.post-dialog--text .post-discussion { width:min(100%,880px); border-right:1px solid var(--color-brand-border); }
.post-dialog--text .post-discussion-title { padding-inline:32px; }
.post-dialog--media-only .post-dialog-body { grid-template-columns:minmax(0,1fr); }
.post-mobile-tabs { display:none; }
@keyframes post-arrive { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@media (max-width:900px) {
  .post-dialog-body { display:flex; flex:1; }
  .post-media,.post-discussion { width:100%; flex:1; }
  .post-mobile-hidden { display:none !important; }
  .post-desktop-toggle { display:none; }
  .post-dialog-header { flex-wrap:wrap; gap:8px; padding:calc(10px + env(safe-area-inset-top)) 16px 10px; min-height:72px; }
  .post-dialog-heading h2 { font-size:16px; }
  .post-dialog-heading p { font-size:12px; }
  .post-dialog-mark { display:none; }
  .post-mobile-tabs { display:flex; justify-content:center; order:3; width:100%; gap:4px; padding:4px; border-radius:14px; background:var(--color-brand-bg); }
  .post-mobile-tabs button { flex:1; min-height:40px; border-radius:10px; font-size:13px; font-weight:800; color:var(--color-brand-accent-minus-minus); }
  .post-mobile-tabs button[aria-pressed=true] { background:var(--color-brand-border); color:var(--color-brand-offwhite); }
  .post-discussion { border:0; }
  .post-discussion-title,.post-dialog--text .post-discussion-title { padding:16px 20px; }
  .post-media-player { padding:70px 16px 80px; }
}
@media (max-height:500px) and (max-width:900px) {
  .post-dialog-header { flex-wrap:nowrap; min-height:60px; }
  .post-dialog-heading p { display:none; }
  .post-mobile-tabs { order:0; width:auto; flex:1; max-width:260px; }
  .post-permalink { display:none; }
  .post-discussion-title { padding-block:8px; }
}
@media (prefers-reduced-motion:reduce) { .post-dialog { animation:none; } .post-dialog * { transition:none !important; } }
</style>
