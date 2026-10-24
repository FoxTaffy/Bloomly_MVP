<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
import StoryViewer from './StoryViewer.vue'
import type { Story } from './StoriesBar.vue'

interface ProfileStatus {
  emoji?: string
  text?: string
  color?: string
  music?: null | { title: string; artist: string; artworkUrl: string }
}
interface FriendStatus {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  online: boolean
  profile_status: ProfileStatus | null
  stories: Story[]
}

const router = useRouter()
const langStore = useLangStore()

const friends = ref<FriendStatus[]>([])
const loading = ref(true)
const seenIds = ref<Set<string>>(new Set())

// Тот же ключ, что у ленты историй на главной — просмотренное синхронизировано
const SEEN_KEY = 'bloomly_seen_stories'
function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (raw) seenIds.value = new Set(JSON.parse(raw))
  } catch {}
}
function markSeen(ids: string[]) {
  ids.forEach(id => seenIds.value.add(id))
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds.value])) } catch {}
}

const isSeen = (f: FriendStatus) => f.stories.every(s => seenIds.value.has(s.id))
const hasNote = (f: FriendStatus) => !!(f.profile_status && (f.profile_status.text || f.profile_status.emoji || f.profile_status.music))
const noteColor = (n: ProfileStatus) => n.color || (n.music ? '#c0392b' : '#4C67CF')

// Непросмотренные истории — первыми
const sorted = computed(() =>
  [...friends.value].sort((a, b) => Number(!!b.stories.length && !isSeen(b)) - Number(!!a.stories.length && !isSeen(a)))
)

async function load() {
  try {
    const res = await api.get('/friends/statuses')
    if (res.data.success) friends.value = res.data.data
  } catch {}
  loading.value = false
}
onMounted(() => { loadSeen(); load() })

// ── Просмотр ────────────────────────────────────────────────────────────────
const viewerOpen = ref(false)
const viewerGroups = ref<Story[][]>([])
const viewerGroupIdx = ref(0)

function openFriend(f: FriendStatus) {
  if (!f.stories.length) {
    router.push({ name: 'profile', params: { username: f.username } })
    return
  }
  viewerGroups.value = sorted.value.filter(x => x.stories.length).map(x => x.stories)
  viewerGroupIdx.value = viewerGroups.value.findIndex(g => g[0].user.id === f.id)
  markSeen(f.stories.map(s => s.id))
  viewerOpen.value = true
}
</script>

<template>
  <div v-if="loading || sorted.length" class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl overflow-x-auto no-scrollbar">
    <div class="flex gap-3 min-w-max items-end">
      <template v-if="loading">
        <div v-for="n in 6" :key="n" class="flex flex-col items-center gap-1.5 shrink-0">
          <div class="h-[10px]" />
          <div class="w-[68px] h-[68px] rounded-full bg-white/5 animate-pulse" />
          <div class="h-2.5 w-12 bg-white/5 rounded-full animate-pulse" />
        </div>
      </template>

      <button
        v-for="f in sorted"
        v-else
        :key="f.id"
        class="flex flex-col items-center gap-1.5 group shrink-0"
        @click="openFriend(f)"
      >
        <!-- Статус-заметка над аватаркой -->
        <div v-if="hasNote(f)" class="relative mb-1" style="width:100px">
          <div class="w-full px-2.5 py-2 rounded-2xl text-white shadow-2xl overflow-hidden" :style="`background:${noteColor(f.profile_status!)}`">
            <div v-if="f.profile_status!.text || f.profile_status!.emoji" class="flex gap-1 items-start" :class="f.profile_status!.music ? 'mb-1' : ''">
              <span v-if="f.profile_status!.emoji" class="text-sm shrink-0 leading-tight">{{ f.profile_status!.emoji }}</span>
              <span v-if="f.profile_status!.text" class="text-[11px] font-semibold leading-snug text-left"
                style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;word-break:break-all">{{ f.profile_status!.text }}</span>
            </div>
            <div v-if="f.profile_status!.music" class="flex items-center gap-1.5">
              <img v-if="f.profile_status!.music.artworkUrl" :src="f.profile_status!.music.artworkUrl" class="w-6 h-6 rounded-md object-cover shrink-0" />
              <div class="min-w-0 overflow-hidden text-left">
                <p class="text-[10px] font-bold leading-tight truncate">{{ f.profile_status!.music.artist }}</p>
                <p class="text-[9px] opacity-70 leading-tight truncate">{{ f.profile_status!.music.title }}</p>
              </div>
            </div>
          </div>
          <div class="absolute bottom-[-7px] left-4 w-0 h-0 pointer-events-none"
            :style="`border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${noteColor(f.profile_status!)}`" />
        </div>
        <div v-else class="h-[10px]" />

        <div class="relative w-[68px] h-[68px]">
          <div
            class="absolute inset-0 rounded-full p-[2.5px] transition-all duration-300"
            :class="!f.stories.length
              ? 'bg-transparent'
              : isSeen(f)
                ? 'bg-white/20 group-hover:bg-white/35'
                : 'bg-linear-to-tr/srgb from-brand-accent via-pink-500 to-brand-purple group-hover:opacity-90'"
          >
            <div class="w-full h-full rounded-full border-[3px] border-brand-card overflow-hidden">
              <img v-if="f.avatar_url" :src="f.avatar_url" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" @error="onAvatarError" />
              <div v-else class="w-full h-full bg-linear-to-br/srgb from-brand-accent/20 to-brand-purple/20 flex items-center justify-center">
                <span class="text-brand-accent font-bold text-lg">{{ (f.display_name || f.username)[0].toUpperCase() }}</span>
              </div>
            </div>
          </div>
          <span v-if="f.online" class="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-brand-card" />
        </div>

        <span class="text-[10px] font-bold transition-colors max-w-[68px] truncate"
          :class="f.stories.length && isSeen(f) ? 'text-white/40 group-hover:text-white/70' : 'text-white/70 group-hover:text-white'">
          {{ f.display_name || f.username }}
        </span>
      </button>
    </div>
  </div>

  <StoryViewer
    v-if="viewerOpen && viewerGroups.length"
    :groups="viewerGroups"
    :group-index="viewerGroupIdx"
    :story-index="0"
    @close="viewerOpen = false"
  />
</template>

<style scoped>
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
