<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from './BIcon.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'

interface StatusNote {
  emoji: string
  text: string
  color: string
  music: null | { title: string; artist: string; artworkUrl: string }
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface Story {
  id: string
  image_url: string | null
  video_url?: string | null
  created_at: string
  expires_at: string
  isBloomly?: boolean
  title?: string
  body?: string
  score?: number
  my_vote?: 1 | -1 | 0
  view_count?: number
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

// ── Props / Emits ────────────────────────────────────────────────────────────
const emit = defineEmits<{
  (e: 'open', story: Story, allStories: Story[]): void
  (e: 'create'): void
}>()

const auth = useAuthStore()
const langStore = useLangStore()

// ── State ────────────────────────────────────────────────────────────────────
const stories = ref<Story[]>([])
const loading = ref(true)
const seenIds = ref<Set<string>>(new Set())

// ── Load seen from localStorage ───────────────────────────────────────────
const SEEN_KEY = 'bloomly_seen_stories'
function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (raw) seenIds.value = new Set(JSON.parse(raw))
  } catch {}
}
function markSeen(id: string) {
  seenIds.value.add(id)
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds.value])) } catch {}
}

// ── Grouped user stories ─────────────────────────────────────────────────────
const userStories = computed(() => {
  const map = new Map<string, Story[]>()
  for (const s of stories.value) {
    const uid = s.user.id
    if (!map.has(uid)) map.set(uid, [])
    map.get(uid)!.push(s)
  }
  map.forEach(arr => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
  return [...map.values()]
})

const isGroupSeen = (group: Story[]) => group.every(s => seenIds.value.has(s.id))

// ── Fetch ───────────────────────────────────────────────────────────────────
const fetchStories = async () => {
  loading.value = true
  try {
    const storiesRes = await api.get('/stories')
    if (storiesRes.data.success) stories.value = storiesRes.data.data.stories
  } catch {}
  loading.value = false
}
defineExpose({ fetchStories, userStories })

// ── Own status note ──────────────────────────────────────────────────────────
const statusNote = ref<StatusNote | null>(null)

function loadStatusNote() {
  try {
    const raw = localStorage.getItem('profile_status')
    if (!raw) return
    const d = JSON.parse(raw)
    if (d.expiresAt && d.expiresAt < Date.now()) { localStorage.removeItem('profile_status'); return }
    if (d.text || d.music) {
      statusNote.value = { emoji: d.emoji ?? '', text: d.text ?? '', color: d.color ?? '', music: d.music ?? null }
    }
  } catch {}
}

function noteBubbleBg(note: StatusNote): string {
  const c = note.color || (note.music ? '#c0392b' : '#4C67CF')
  return `background:${c}`
}
function noteBubbleArrowColor(note: StatusNote): string {
  return note.color || (note.music ? '#c0392b' : '#4C67CF')
}

onMounted(() => { loadSeen(); fetchStories(); loadStatusNote() })

// ── Open story ───────────────────────────────────────────────────────────────
function openGroup(group: Story[]) {
  group.forEach(s => markSeen(s.id))
  emit('open', group[0], group)
}
</script>

<template>
  <div class="relative">
    <!-- Container -->
    <div
      class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl overflow-x-auto stories-scrollbar"
    >
      <div class="flex gap-3 min-w-max items-end">

        <!-- ── Add Story Button ───────────────────────────────────────────── -->
        <button
          class="flex flex-col items-center gap-1.5 group flex-shrink-0"
          @click="emit('create')"
          aria-label="Добавить историю"
        >
          <!-- Notes bubble above avatar -->
          <div v-if="statusNote" class="relative mb-1 overflow-hidden" style="width:100px">
            <div class="w-full px-2.5 py-2 rounded-[16px] text-white shadow-2xl overflow-hidden"
              :style="noteBubbleBg(statusNote)">
              <div v-if="statusNote.text || statusNote.emoji"
                class="flex gap-1 items-start"
                :class="statusNote.music ? 'mb-1' : ''">
                <span v-if="statusNote.emoji" class="text-sm flex-shrink-0 leading-tight">{{ statusNote.emoji }}</span>
                <span v-if="statusNote.text"
                  class="text-[11px] font-semibold leading-snug"
                  style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;word-break:break-all">{{ statusNote.text }}</span>
              </div>
              <div v-if="statusNote.music" class="flex items-center gap-1.5">
                <div class="flex items-end gap-[2px] h-3 flex-shrink-0">
                  <span v-for="(h, i) in [50,100,65,85]" :key="i"
                    class="w-[3px] rounded-full bg-white note-bar"
                    :style="`height:${h}%; animation-delay:${i*0.08}s`" />
                </div>
                <div class="min-w-0 overflow-hidden">
                  <p class="text-[10px] font-bold leading-tight truncate">{{ statusNote.music.artist }}</p>
                  <p class="text-[9px] opacity-70 leading-tight truncate">{{ statusNote.music.title }}</p>
                </div>
              </div>
            </div>
            <div class="absolute -bottom-[7px] left-4 w-0 h-0 pointer-events-none"
              :style="`border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${noteBubbleArrowColor(statusNote)}`" />
          </div>

          <div v-else class="h-[10px]" />

          <div class="relative w-[68px] h-[68px]">
            <div class="absolute inset-0 rounded-full border-2 border-dashed border-white/20 group-hover:border-brand-accent/60 transition-colors duration-300"></div>
            <div class="absolute inset-[4px] rounded-full bg-brand-bg flex items-center justify-center overflow-hidden">
              <img
                v-if="auth.avatarUrl"
                :src="auth.avatarUrl"
                class="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                @error="onAvatarError"
              />
              <div v-else class="w-full h-full bg-gradient-to-br from-brand-accent/20 to-brand-purple/20 flex items-center justify-center">
                <span class="text-brand-accent font-bold text-lg">
                  {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
                </span>
              </div>
            </div>
            <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-accent border-2 border-brand-card flex items-center justify-center shadow-lg shadow-brand-accent/40 group-hover:scale-110 transition-transform duration-200">
              <BIcon name="Plus" class="w-3 h-3 text-white" />
            </div>
          </div>
          <span class="text-[10px] font-bold text-white/55 group-hover:text-white transition-colors">{{ langStore.t.story }}</span>
        </button>

        <!-- ── Divider ───────────────────────────────────────────────────── -->
        <div class="w-px h-10 bg-brand-border flex-shrink-0 mx-1" v-if="userStories.length || loading"></div>

        <!-- ── Loading Skeletons ─────────────────────────────────────────── -->
        <template v-if="loading">
          <div
            v-for="n in 5"
            :key="n"
            class="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            <div class="h-[10px]" />
            <div class="w-[68px] h-[68px] rounded-full bg-white/5 animate-pulse"></div>
            <div class="h-2.5 w-12 bg-white/5 rounded-full animate-pulse"></div>
          </div>
        </template>

        <!-- ── Story Bubbles ─────────────────────────────────────────────── -->
        <template v-else>
          <button
            v-for="group in userStories"
            :key="group[0].user.id"
            class="flex flex-col items-center gap-1.5 group flex-shrink-0"
            @click="openGroup(group)"
          >
            <div class="h-[10px]" />
            <div class="relative w-[68px] h-[68px]">
              <div
                class="absolute inset-0 rounded-full p-[2.5px] transition-all duration-300"
                :class="isGroupSeen(group)
                  ? 'bg-white/20 group-hover:bg-white/35'
                  : 'bg-gradient-to-tr from-brand-accent via-pink-500 to-brand-purple group-hover:opacity-90'"
              >
                <div class="w-full h-full rounded-full border-[3px] border-brand-card overflow-hidden">
                  <img
                    v-if="group[0].user.avatar_url"
                    :src="group[0].user.avatar_url"
                    class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    @error="onAvatarError"
                  />
                  <div
                    v-else
                    class="w-full h-full bg-gradient-to-br from-brand-accent/20 to-brand-purple/20 flex items-center justify-center"
                  >
                    <span class="text-brand-accent font-bold text-lg">
                      {{ (group[0].user.username ?? '?')[0].toUpperCase() }}
                    </span>
                  </div>
                </div>
              </div>

              <div
                v-if="group[group.length - 1].video_url"
                class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-accent border-2 border-brand-card flex items-center justify-center"
              >
                <BIcon name="Play" class="w-2.5 h-2.5 text-white" style="margin-left:1px" />
              </div>

              <div
                v-if="group.length > 1"
                class="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5"
              >
                <div
                  v-for="(s, si) in group.slice(0, 4)"
                  :key="s.id"
                  class="w-1.5 h-1.5 rounded-full border border-brand-card"
                  :class="seenIds.has(s.id) ? 'bg-white/30' : 'bg-brand-accent'"
                ></div>
              </div>
            </div>

            <span
              class="text-[10px] font-bold transition-colors max-w-[68px] truncate"
              :class="isGroupSeen(group) ? 'text-white/40 group-hover:text-white/70' : 'text-white/70 group-hover:text-white'"
            >
              {{ group[0].user.display_name || group[0].user.username }}
            </span>
          </button>

          <!-- Empty state -->
          <div
            v-if="userStories.length === 0"
            class="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            <div class="h-[10px]" />
            <div class="w-[68px] h-[68px] rounded-full flex items-center justify-center bg-white/5 border border-dashed border-white/10">
              <BIcon name="Sparkles" class="w-5 h-5 text-white/25" />
            </div>
            <span class="text-[10px] font-bold text-white/35 max-w-[68px] truncate">{{ langStore.t.noStoriesYet }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stories-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.stories-scrollbar::-webkit-scrollbar {
  display: none;
}
.note-bar {
  animation: noteBar 0.6s ease-in-out infinite;
}
@keyframes noteBar {
  0%, 100% { transform: scaleY(0.35) }
  50%       { transform: scaleY(1) }
}
</style>
