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
  created_at: string
  expires_at: string
  isBloomly?: boolean
  title?: string
  body?: string
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

interface BloomlyUpdate {
  id: string
  title: string
  body: string | null
  image_url: string | null
  created_at: string
  is_active: boolean
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
const bloomlyUpdates = ref<BloomlyUpdate[]>([])
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

// ── Bloomly Update group ─────────────────────────────────────────────────────
const BLOOMLY_FAR_FUTURE = '2099-01-01T00:00:00.000Z'

const bloomlyStoryGroup = computed<Story[]>(() => {
  if (!bloomlyUpdates.value.length) return []
  // Convert each update to a Story-shaped object
  return bloomlyUpdates.value.map(u => ({
    id: u.id,
    image_url: u.image_url,
    created_at: u.created_at,
    expires_at: BLOOMLY_FAR_FUTURE,
    isBloomly: true,
    title: u.title,
    body: u.body ?? undefined,
    user: {
      id: 'bloomly',
      username: 'bloomly',
      display_name: 'Bloomly',
      avatar_url: null,
    },
  }))
})

const isBloomlyGroupSeen = computed(() =>
  bloomlyStoryGroup.value.length > 0 &&
  bloomlyStoryGroup.value.every(s => seenIds.value.has(s.id))
)

function openBloomlyGroup() {
  if (!bloomlyStoryGroup.value.length) return
  bloomlyStoryGroup.value.forEach(s => markSeen(s.id))
  emit('open', bloomlyStoryGroup.value[0], bloomlyStoryGroup.value)
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
    const [storiesRes, updatesRes] = await Promise.all([
      api.get('/stories'),
      api.get('/updates'),
    ])
    if (storiesRes.data.success) stories.value = storiesRes.data.data.stories
    if (updatesRes.data.success) bloomlyUpdates.value = updatesRes.data.data.updates
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

        <!-- ── Bloomly Updates Bubble (always first) ──────────────────────── -->
        <button
          v-if="bloomlyStoryGroup.length > 0"
          class="flex flex-col items-center gap-1.5 group flex-shrink-0"
          @click="openBloomlyGroup"
          aria-label="Обновления Bloomly"
        >
          <div class="h-[10px]" />
          <!-- Ring + Icon -->
          <div class="relative w-[68px] h-[68px]">
            <!-- Animated gradient ring (unseen) or muted (seen) -->
            <div
              class="absolute inset-0 rounded-[20px] p-[2.5px] transition-all duration-300"
              :class="isBloomlyGroupSeen
                ? 'bg-white/20 group-hover:bg-white/35'
                : 'bloomly-ring'"
            >
              <div class="w-full h-full rounded-[17px] border-[3px] border-brand-card overflow-hidden bg-gradient-to-br from-[#4C67CF] via-[#7c3aed] to-[#4C67CF] flex items-center justify-center">
                <!-- Bloomly "B" logo -->
                <span class="text-white font-black text-2xl select-none" style="font-family:system-ui,sans-serif;letter-spacing:-1px">B</span>
              </div>
            </div>
            <!-- New indicator dot -->
            <div
              v-if="!isBloomlyGroupSeen"
              class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-accent border-2 border-brand-card animate-pulse"
            />
          </div>
          <span
            class="text-[10px] font-bold transition-colors max-w-[68px] truncate"
            :class="isBloomlyGroupSeen ? 'text-white/40 group-hover:text-white/70' : 'text-brand-accent group-hover:text-white'"
          >Bloomly</span>
        </button>

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
            <div class="absolute inset-0 rounded-[20px] border-2 border-dashed border-white/20 group-hover:border-brand-accent/60 transition-colors duration-300"></div>
            <div class="absolute inset-[4px] rounded-[15px] bg-brand-bg flex items-center justify-center overflow-hidden">
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
            <div class="w-[68px] h-[68px] rounded-[20px] bg-white/5 animate-pulse"></div>
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
                class="absolute inset-0 rounded-[20px] p-[2.5px] transition-all duration-300"
                :class="isGroupSeen(group)
                  ? 'bg-white/20 group-hover:bg-white/35'
                  : 'bg-gradient-to-tr from-brand-accent via-pink-500 to-brand-purple group-hover:opacity-90'"
              >
                <div class="w-full h-full rounded-[17px] border-[3px] border-brand-card overflow-hidden">
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
            v-if="userStories.length === 0 && bloomlyStoryGroup.length === 0"
            class="flex items-center gap-3 text-white/30 px-4 py-2"
          >
            <BIcon name="PhoneOff" class="w-4 h-4" />
            <span class="text-xs">{{ langStore.t.noStoriesYet }}</span>
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

/* Bloomly animated gradient ring */
.bloomly-ring {
  background: linear-gradient(135deg, #4C67CF, #7c3aed, #4C67CF, #06b6d4);
  background-size: 300% 300%;
  animation: bloomlyRingAnim 3s ease infinite;
}
@keyframes bloomlyRingAnim {
  0%   { background-position: 0% 50% }
  50%  { background-position: 100% 50% }
  100% { background-position: 0% 50% }
}
</style>
