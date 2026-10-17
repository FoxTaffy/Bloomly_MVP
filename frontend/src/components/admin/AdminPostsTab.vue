<script setup lang="ts">
import { ref, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import PostLightbox from '@/components/PostLightbox.vue'
import AdminMediaPreview from './AdminMediaPreview.vue'
import { formatNum, formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { confirmDialog } = useConfirm()

// ── Posts ─────────────────────────────────────────────────────────────
const posts = ref<any[]>([])
const postPage = ref(1)
const postTotal = ref(0)
const postSearch = ref('')
const postFilter = ref<'' | 'media' | 'nsfw' | 'announcement'>('')
const isLoadingPosts = ref(false)
let postSearchDebounce: ReturnType<typeof setTimeout>

const fetchPosts = async () => {
  isLoadingPosts.value = true
  try {
    const res = await api.get('/admin/posts', {
      params: { page: postPage.value, search: postSearch.value || undefined, filter: postFilter.value || undefined },
    })
    if (res.data.success) { posts.value = res.data.data.posts; postTotal.value = res.data.data.total }
  } catch {} finally { isLoadingPosts.value = false }
}

const onPostSearch = () => {
  clearTimeout(postSearchDebounce)
  postSearchDebounce = setTimeout(() => { postPage.value = 1; fetchPosts() }, 300)
}

const deletePost = async (postId: string) => {
  if (!(await confirmDialog(langStore.t.adminConfirmDeletePost, { danger: true }))) return
  try {
    await api.delete(`/admin/posts/${postId}`)
    posts.value = posts.value.filter(p => p.id !== postId)
  } catch {}
}

// "Pin" reuses the existing is_announcement flag as the admin feature/pin toggle.
const togglePostPin = async (post: any) => {
  try {
    const res = await api.patch(`/admin/posts/${post.id}/pin`)
    if (res.data.success) post.is_announcement = res.data.data.post.is_announcement
  } catch {}
}

const postMediaLightbox = ref<{ images: string[]; start: number } | null>(null)
const openPostMediaLightbox = (images: string[], start: number) => { postMediaLightbox.value = { images, start } }

onActivated(() => { if (!posts.value.length) fetchPosts() })
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <div class="relative flex-1 max-w-sm">
        <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input v-model="postSearch" @input="onPostSearch" type="text" :placeholder="langStore.t.adminSearchPlaceholderPosts"
          class="w-full bg-white/5 border border-white/[0.08] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
            outline-none focus:border-[#4C67CF]/40 focus:bg-white/[0.08] transition-all" />
      </div>
      <button @click="fetchPosts()"
        class="px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white/50 hover:text-white transition-all">
        <BIcon name="RefreshCw" class="w-3.5 h-3.5" />
      </button>
      <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/[0.08]">{{ postTotal }}</span>
    </div>

    <!-- Filter pills -->
    <div class="flex gap-2 mb-5 flex-wrap">
      <button v-for="f in ([
        { v: '', l: langStore.t.tabAll },
        { v: 'media', l: langStore.t.adminFilterWithMedia },
        { v: 'nsfw', l: 'NSFW' },
        { v: 'announcement', l: langStore.t.adminFilterAnnouncements },
      ] as const)" :key="f.v"
        @click="postFilter = f.v; postPage = 1; fetchPosts()"
        class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
        :class="postFilter === f.v
          ? 'bg-[#4C67CF]/15 border-[#4C67CF]/25 text-[#4C67CF]'
          : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
        {{ f.l }}
      </button>
    </div>

    <div v-if="isLoadingPosts" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="n in 6" :key="n" class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden animate-pulse">
        <div class="aspect-[4/3] bg-white/[0.06]" />
        <div class="p-4 space-y-2">
          <div class="h-3 bg-white/[0.08] rounded-full w-2/3" />
          <div class="h-2.5 bg-white/5 rounded-full w-full" />
          <div class="h-2.5 bg-white/5 rounded-full w-1/2" />
        </div>
      </div>
    </div>
    <div v-else-if="!posts.length" class="flex flex-col items-center gap-3 py-20 text-white/25 rounded-2xl border border-brand-border bg-brand-card">
      <BIcon name="FileText" class="w-10 h-10 opacity-40" />
      <p class="text-sm font-semibold">{{ langStore.t.adminNoPostsFound }}</p>
    </div>

    <!-- Tile grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="post in posts" :key="post.id"
        class="relative rounded-2xl border border-brand-border bg-brand-card overflow-hidden flex flex-col transition-all
          hover:border-[#4C67CF]/35 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20 group">

        <!-- Media preview / text placeholder -->
        <button v-if="post.media_urls?.length" type="button"
          @click="openPostMediaLightbox(post.media_urls, 0)"
          class="relative aspect-[4/3] w-full overflow-hidden bg-black/20 flex-shrink-0">
          <AdminMediaPreview :src="post.media_urls[0]" />
          <div v-if="post.media_urls.length > 1"
            class="absolute top-2.5 right-2.5 flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white">
            <BIcon name="Images" class="w-3 h-3" /> {{ post.media_urls.length }}
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <div v-else class="relative aspect-[4/3] w-full flex items-center justify-center flex-shrink-0 p-5 text-center overflow-hidden"
          style="background:linear-gradient(150deg,rgba(76,103,207,0.16),rgba(139,92,246,0.10) 55%,rgba(76,103,207,0.05))">
          <BIcon name="Quote" class="absolute top-3 left-3 w-8 h-8 text-white/[0.06] -scale-x-100" />
          <p class="relative text-sm text-white/65 font-semibold line-clamp-5 leading-relaxed">{{ post.content || post.title }}</p>
        </div>

        <!-- Badges -->
        <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap max-w-[calc(100%-1.25rem)]">
          <span v-if="post.category"
            class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-accent/85 text-white backdrop-blur-sm shadow-sm">
            #{{ post.category }}
          </span>
          <span v-if="post.is_nsfw"
            class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-500/90 text-white backdrop-blur-sm shadow-sm">NSFW</span>
          <span v-if="post.is_announcement"
            class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-sm shadow-sm">{{ langStore.t.adminPinnedLabel }}</span>
          <span v-if="post.is_paid"
            class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white backdrop-blur-sm shadow-sm">{{ langStore.t.adminPaidLabel }}</span>
        </div>

        <!-- Hover actions -->
        <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <router-link :to="`/post/${post.id}`" target="_blank" @click.stop
            class="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/80
              flex items-center justify-center transition-all" :title="langStore.t.adminOpenOnSiteTooltip">
            <BIcon name="ExternalLink" class="w-3.5 h-3.5" />
          </router-link>
          <button @click="togglePostPin(post)" :title="langStore.t.adminTogglePinTooltip"
            class="w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center transition-all"
            :class="post.is_announcement ? 'bg-amber-500/80 text-white' : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/80'">
            <BIcon name="Pin" class="w-3.5 h-3.5" />
          </button>
          <button @click="deletePost(post.id)"
            class="w-8 h-8 rounded-full bg-rose-500/80 text-white hover:bg-rose-500
              flex items-center justify-center transition-all" :title="langStore.t.deleteBtn">
            <BIcon name="Trash2" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 flex flex-col gap-3 flex-1">
          <router-link :to="post.groupPosts?.[0]?.group ? `/groups/${post.groupPosts[0].group.slug}` : `/profile/${post.author?.username}`" target="_blank" class="flex items-center gap-2 min-w-0 group/user">
            <img v-if="post.groupPosts?.[0]?.group?.avatar_url" :src="post.groupPosts[0].group.avatar_url"
              class="w-7 h-7 rounded-lg object-cover border border-white/10 flex-shrink-0 group-hover/user:opacity-80 transition-opacity" />
            <div v-else-if="post.groupPosts?.[0]?.group" class="w-7 h-7 rounded-lg border border-white/10 bg-[#4C67CF]/15 flex items-center justify-center text-[#4C67CF] font-bold text-xs flex-shrink-0">
              {{ post.groupPosts[0].group.name[0].toUpperCase() }}
            </div>
            <img v-else-if="post.author?.avatar_url" :src="post.author.avatar_url"
              class="w-7 h-7 rounded-full object-cover border border-white/10 flex-shrink-0 group-hover/user:opacity-80 transition-opacity" />
            <div v-else class="w-7 h-7 rounded-full border border-white/10 bg-[#4C67CF]/15 flex items-center justify-center text-[#4C67CF] font-bold text-xs flex-shrink-0">
              {{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}
            </div>
            <span class="text-sm font-bold text-white truncate group-hover/user:text-[#4C67CF] transition-colors">{{ post.groupPosts?.[0]?.group?.name || post.author?.display_name || post.author?.username }}</span>
            <span class="text-[11px] text-white/30 flex-shrink-0 ml-auto">{{ formatDate(post.created_at) }}</span>
          </router-link>

          <div v-if="post.media_urls?.length && (post.title || post.content)" class="min-w-0">
            <p v-if="post.title" class="text-sm font-bold text-white/90 truncate">{{ post.title }}</p>
            <p class="text-xs text-white/50 line-clamp-2 mt-0.5">{{ post.content }}</p>
          </div>
          <p v-else-if="post.title" class="text-sm font-bold text-white/90 truncate -mt-0.5">{{ post.title }}</p>

          <!-- Stats footer -->
          <div class="flex items-center gap-3 mt-auto pt-2.5 border-t border-white/[0.06]">
            <span class="flex items-center gap-1 text-xs font-bold text-emerald-400/80" :title="langStore.t.adminLikesLabel">
              <BIcon name="ThumbsUp" class="w-3.5 h-3.5" /> {{ formatNum(post.likes_count ?? 0) }}
            </span>
            <span class="flex items-center gap-1 text-xs font-bold text-rose-400/80" :title="langStore.t.adminDislikesLabel">
              <BIcon name="ThumbsDown" class="w-3.5 h-3.5" /> {{ formatNum(post.dislikes_count ?? 0) }}
            </span>
            <span class="w-px h-3 bg-white/[0.08]" />
            <span class="flex items-center gap-1 text-xs font-semibold text-white/50">
              <BIcon name="MessageCircle" class="w-3.5 h-3.5 text-sky-400/70" /> {{ formatNum(post._count?.comments ?? 0) }}
            </span>
            <span class="flex items-center gap-1 text-xs font-semibold text-white/50 ml-auto">
              <BIcon name="Repeat2" class="w-3.5 h-3.5 text-violet-400/70" /> {{ formatNum(post._count?.repaws ?? 0) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="postTotal > 20" class="flex items-center justify-center gap-2 mt-4">
      <button @click="postPage--; fetchPosts()" :disabled="postPage <= 1"
        class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
        <BIcon name="ChevronLeft" class="w-4 h-4" />
      </button>
      <span class="text-xs font-bold text-white/40 px-3">{{ postPage }} / {{ Math.ceil(postTotal/20) }}</span>
      <button @click="postPage++; fetchPosts()" :disabled="postPage >= Math.ceil(postTotal/20)"
        class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
        <BIcon name="ChevronRight" class="w-4 h-4" />
      </button>
    </div>

    <PostLightbox v-if="postMediaLightbox"
      :images="postMediaLightbox.images"
      :start-index="postMediaLightbox.start"
      @close="postMediaLightbox = null" />
  </div>
</template>
