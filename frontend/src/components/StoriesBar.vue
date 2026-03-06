<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import BIcon from './BIcon.vue'

// ── Types ────────────────────────────────────────────────────────────────────
export interface Story {
  id: string
  image_url: string | null
  created_at: string
  expires_at: string
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

// ── Grouped stories by user ──────────────────────────────────────────────────
// Each bubble = one user's latest story
const userStories = computed(() => {
  const map = new Map<string, Story[]>()
  for (const s of stories.value) {
    const uid = s.user.id
    if (!map.has(uid)) map.set(uid, [])
    map.get(uid)!.push(s)
  }
  // Sort each group by created_at asc
  map.forEach(arr => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
  return [...map.values()]
})

// Is entire group seen?
const isGroupSeen = (group: Story[]) => group.every(s => seenIds.value.has(s.id))

// ── Fetch ───────────────────────────────────────────────────────────────────
const fetchStories = async () => {
  loading.value = true
  try {
    const res = await api.get('/stories')
    if (res.data.success) stories.value = res.data.data.stories
  } catch {}
  loading.value = false
}
defineExpose({ fetchStories, userStories })

onMounted(() => { loadSeen(); fetchStories() })

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
      <div class="flex gap-3 min-w-max items-center">

        <!-- ── Add Story Button ───────────────────────────────────────────── -->
        <button
          class="flex flex-col items-center gap-1.5 group flex-shrink-0"
          @click="emit('create')"
          aria-label="Добавить историю"
        >
          <!-- Avatar ring -->
          <div class="relative w-[68px] h-[68px]">
            <!-- Dashed ring outer -->
            <div class="absolute inset-0 rounded-[20px] border-2 border-dashed border-white/20 group-hover:border-brand-accent/60 transition-colors duration-300"></div>
            <!-- Inner card -->
            <div class="absolute inset-[4px] rounded-[15px] bg-brand-bg flex items-center justify-center overflow-hidden">
              <img
                v-if="auth.avatarUrl"
                :src="auth.avatarUrl"
                class="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
              />
              <div v-else class="w-full h-full bg-gradient-to-br from-brand-accent/20 to-brand-purple/20 flex items-center justify-center">
                <span class="text-brand-accent font-bold text-lg">
                  {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
                </span>
              </div>
            </div>
            <!-- Plus badge -->
            <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-accent border-2 border-brand-card flex items-center justify-center shadow-lg shadow-brand-accent/40 group-hover:scale-110 transition-transform duration-200">
              <BIcon name="Plus" class="w-3 h-3 text-white" />
            </div>
          </div>
          <span class="text-[10px] font-bold text-white/55 group-hover:text-white transition-colors">История</span>
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
            <!-- Ring + Avatar -->
            <div class="relative w-[68px] h-[68px]">
              <!-- Gradient ring (unseen) OR grey ring (seen) -->
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

              <!-- Multi-story indicator (dots at bottom) -->
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

            <!-- Username -->
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
            class="flex items-center gap-3 text-white/30 px-4 py-2"
          >
            <BIcon name="PhoneOff" class="w-4 h-4" />
            <span class="text-xs">Пока нет историй</span>
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
</style>
