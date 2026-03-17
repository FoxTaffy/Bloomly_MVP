<template>
  <div class="space-y-4">

    <!-- ── Шапка секции ──────────────────────────────────── -->
    <div class="flex items-center justify-between">
      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
        </svg>
        {{ t.fursuitTitle }}
      </p>
      <button
        type="button"
        @click="openCreateForm"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all text-brand-accent border-brand-accent/40 bg-brand-accent/10 hover:bg-brand-accent/20 active:scale-95"
      >{{ t.fursuitAddBtn }}</button>
    </div>

    <!-- Loading -->
    <div v-if="userStore.fursuitsLoading" class="flex justify-center py-8">
      <div class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!showForm && userStore.fursuits.length === 0"
      class="p-6 border border-dashed border-brand-border/50 rounded-2xl text-center space-y-1.5">
      <div class="w-12 h-12 mx-auto rounded-2xl bg-brand-accent/10 flex items-center justify-center">
        <svg class="w-6 h-6 text-brand-accent/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
        </svg>
      </div>
      <p class="text-sm text-white/30">{{ t.fursuitEmptyMsg }}</p>
    </div>

    <!-- Fursuit list -->
    <div v-else-if="!showForm" class="space-y-2">
      <div
        v-for="suit in userStore.fursuits"
        :key="suit.id"
        class="flex items-center gap-3 p-3 bg-brand-bg/60 border border-brand-border/60 rounded-2xl transition-all hover:border-brand-border"
      >
        <!-- Photo / NSFW blur -->
        <div class="relative flex-shrink-0">
          <img
            v-if="suit.image_url"
            :src="suit.image_url"
            alt="Fursuit"
            class="w-12 h-12 rounded-xl object-cover border border-brand-border"
            :class="suit.is_nsfw ? 'blur-sm' : ''"
            draggable="false"
          />
          <div v-else class="w-12 h-12 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center text-brand-accent/30">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
            </svg>
          </div>
          <span v-if="suit.is_nsfw"
            class="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-rose-600/90 text-white leading-none">
            18+
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p v-if="suit.description" class="text-sm text-white/80 line-clamp-1">{{ suit.description }}</p>
          <p v-else class="text-sm text-white/30 italic">—</p>
          <div class="flex items-center gap-2 mt-0.5 flex-wrap">
            <span v-if="suit.maker_id" class="text-[11px] text-brand-accent/70 flex items-center gap-0.5">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Bloomly
            </span>
            <span v-if="suit.external_maker_links?.length"
              class="text-[11px] text-white/30">
              {{ suit.external_maker_links.length }} {{ t.fursuitLinksLabel.toLowerCase() }}
            </span>
          </div>
        </div>
        <div class="flex gap-1.5 flex-shrink-0">
          <button type="button" @click="openEditForm(suit)"
            class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40 transition-all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button type="button" @click="handleDelete(suit.id)"
            class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border text-white/35 hover:text-rose-400 hover:border-rose-500/40 transition-all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Форма создания / редактирования ──────────────── -->
    <div v-if="showForm" class="p-4 bg-brand-bg/60 border border-brand-accent/30 rounded-2xl space-y-5">

      <!-- Заголовок формы -->
      <div class="flex items-center justify-between">
        <p class="text-xs font-bold text-brand-accent uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
          </svg>
          {{ editingId ? t.fursuitEditTitle : t.fursuitNewTitle }}
        </p>
        <button type="button" @click="closeForm"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-white hover:bg-brand-border/30 transition-all text-xl leading-none">
          ×
        </button>
      </div>

      <!-- Фото + NSFW -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          {{ t.fursuitPhotoLabel }}
        </label>
        <div class="flex items-start gap-4">
          <div v-if="form.image_url" class="relative inline-block group flex-shrink-0">
            <img :src="form.image_url" alt="Fursuit photo"
              class="w-20 h-20 rounded-xl object-cover border border-brand-border"
              :class="form.is_nsfw ? 'blur-sm' : ''"
              draggable="false" />
            <div class="absolute inset-0 rounded-xl bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <button type="button" @click="form.image_url = null"
                class="text-white text-xs font-bold px-2 py-1 bg-rose-500/80 rounded-lg">
                {{ t.fursuitPhotoRemove }}
              </button>
            </div>
          </div>
          <MediaUpload
            v-else
            accept="image/*"
            folder="fursuits"
            @uploaded="(urls: string[]) => form.image_url = urls[0] ?? null"
          />
          <!-- NSFW toggle -->
          <div v-if="form.image_url" class="flex items-start gap-2 pt-1">
            <button
              type="button"
              :class="['relative w-11 h-6 rounded-full border transition-all flex-shrink-0',
                form.is_nsfw
                  ? 'bg-rose-500/20 border-rose-500/60'
                  : 'bg-brand-bg border-brand-border']"
              @click="form.is_nsfw = !form.is_nsfw"
            >
              <span :class="['absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-all',
                form.is_nsfw ? 'translate-x-5 bg-rose-500' : 'translate-x-0 bg-white/40']"></span>
            </button>
            <div>
              <p class="text-xs font-bold" :class="form.is_nsfw ? 'text-rose-400' : 'text-white/50'">
                {{ t.fursuitNsfwLabel }}
              </p>
              <p class="text-[11px] text-white/25 leading-tight">{{ t.fursuitNsfwHint }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Поиск мастера (группы + пользователи) -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
          {{ t.fursuitMakerLabel }}
        </label>

        <!-- Если мастер выбран -->
        <div v-if="selectedMaker" class="flex items-center gap-3 p-2.5 bg-brand-bg border border-brand-accent/30 rounded-xl">
          <img v-if="selectedMaker.avatar_url" :src="selectedMaker.avatar_url"
            class="w-8 h-8 rounded-lg object-cover border border-brand-border flex-shrink-0" />
          <div v-else class="w-8 h-8 rounded-lg bg-brand-accent/10 flex items-center justify-center flex-shrink-0">
            <span class="text-brand-accent text-xs font-bold">{{ (selectedMaker.name || selectedMaker.username || '?')[0].toUpperCase() }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-white truncate">
              {{ selectedMaker.name || selectedMaker.display_name || selectedMaker.username }}
            </p>
            <p class="text-[11px] text-white/35">
              {{ selectedMaker.type === 'user' ? '@' + selectedMaker.username : t.fursuitMakerByGroup }}
            </p>
          </div>
          <button type="button" @click="clearMaker"
            class="text-white/30 hover:text-rose-400 transition-colors text-base leading-none px-1">×</button>
        </div>

        <!-- Поисковый инпут -->
        <div v-else class="relative">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              v-model="makerQuery"
              type="text"
              :placeholder="t.fursuitMakerSearchPlaceholder"
              class="w-full bg-brand-bg border border-brand-border rounded-xl pl-8 pr-4 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/50 transition-all"
              @input="debouncedSearchMaker"
              @focus="() => { if (makerQuery.length >= 2) showMakerDropdown = true }"
              @blur="() => setTimeout(() => { showMakerDropdown = false }, 150)"
            />
            <div v-if="makerLoading" class="absolute right-3 top-1/2 -translate-y-1/2">
              <div class="w-3.5 h-3.5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>

          <!-- Dropdown результатов -->
          <Transition name="dropdown">
            <div v-if="showMakerDropdown && (makerResults.groups.length || makerResults.users.length)"
              class="absolute z-30 w-full mt-1.5 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden">

              <!-- Группы/Студии -->
              <div v-if="makerResults.groups.length">
                <div class="px-3 pt-2.5 pb-1 text-[10px] font-bold text-brand-accent/60 uppercase tracking-wider flex items-center gap-1.5">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  {{ t.fursuitMakerByGroup }}
                </div>
                <button
                  v-for="g in makerResults.groups"
                  :key="g.id"
                  type="button"
                  @mousedown.prevent="pickMaker({ id: g.id, name: g.name, username: g.slug, display_name: g.name, avatar_url: g.avatar_url, type: 'group' })"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-brand-border/20 transition-colors"
                >
                  <img v-if="g.avatar_url" :src="g.avatar_url"
                    class="w-7 h-7 rounded-lg object-cover border border-brand-border flex-shrink-0" />
                  <div v-else class="w-7 h-7 rounded-lg bg-brand-accent/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-brand-accent">
                    {{ g.name[0].toUpperCase() }}
                  </div>
                  <span class="font-semibold text-white">{{ g.name }}</span>
                  <span class="text-white/30 text-xs ml-auto">{{ g.slug }}</span>
                </button>
              </div>

              <!-- Пользователи -->
              <div v-if="makerResults.users.length">
                <div class="px-3 pt-2.5 pb-1 text-[10px] font-bold text-white/35 uppercase tracking-wider flex items-center gap-1.5"
                  :class="makerResults.groups.length ? 'border-t border-brand-border/40' : ''">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  {{ t.fursuitMakerByUser }}
                </div>
                <button
                  v-for="u in makerResults.users"
                  :key="u.id"
                  type="button"
                  @mousedown.prevent="pickMaker({ id: u.id, name: u.display_name || u.username, username: u.username, display_name: u.display_name, avatar_url: null, type: 'user' })"
                  class="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-brand-border/20 transition-colors"
                >
                  <div class="w-7 h-7 rounded-full bg-brand-accent/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-brand-accent">
                    {{ u.username[0].toUpperCase() }}
                  </div>
                  <span class="font-bold text-brand-accent">@{{ u.username }}</span>
                  <span v-if="u.display_name" class="text-white/35 text-xs">{{ u.display_name }}</span>
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Ссылки на мастера (только если мастер не выбран из Bloomly) -->
      <Transition name="fade-section">
        <div v-if="!form.maker_id" class="space-y-2">
          <label class="block text-xs font-bold text-white/55 uppercase tracking-wider">
            {{ t.fursuitLinksLabel }}
            <span class="text-white/25 font-normal ml-1 normal-case">({{ t.fursuitLinksHint }})</span>
          </label>
          <div class="space-y-2">
            <div v-for="(link, idx) in form.external_maker_links" :key="idx" class="flex gap-2">
              <input
                :value="link"
                type="url"
                maxlength="500"
                placeholder="https://..."
                class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-accent/40 transition-all"
                @input="updateLink(idx, ($event.target as HTMLInputElement).value)"
              />
              <button type="button" @click="removeLink(idx)"
                class="w-9 h-9 flex items-center justify-center rounded-xl text-white/35 hover:text-rose-400 border border-brand-border hover:border-rose-500/40 transition-all text-lg flex-shrink-0">
                ×
              </button>
            </div>
            <button
              v-if="(form.external_maker_links?.length ?? 0) < 3"
              type="button"
              @click="addLink"
              class="text-xs font-bold text-brand-accent/60 hover:text-brand-accent transition-colors py-0.5 flex items-center gap-1"
            >
              <span class="text-sm leading-none">+</span>{{ t.fursuitAddLink }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- Описание -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 6h16M4 12h16M4 18h7"/>
          </svg>
          {{ t.fursuitDescLabel }}
        </label>
        <div class="relative">
          <textarea
            v-model="form.description"
            rows="3"
            maxlength="2000"
            :placeholder="t.fursuitDescPlaceholder"
            class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-brand-accent/40 transition-all resize-none"
          />
          <span class="absolute right-3 bottom-2 text-[10px]"
            :class="(form.description?.length ?? 0) > 1800 ? 'text-amber-400' : 'text-white/20'">
            {{ form.description?.length ?? 0 }}/2000
          </span>
        </div>
      </div>

      <!-- Кнопки сохранения -->
      <div class="flex items-center gap-2 pt-1">
        <button
          type="button"
          :disabled="saving"
          @click="submitForm"
          class="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all"
          style="background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;box-shadow:0 4px 16px #7c3aed20"
          :class="saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 active:scale-95'"
        >
          <span v-if="saving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ saving ? t.fursuitSavingBtn : (editingId ? t.fursuitUpdateBtn : t.fursuitCreateBtn) }}
        </button>
        <button type="button" @click="closeForm"
          class="px-4 py-2 rounded-xl text-xs font-bold text-white/30 hover:text-white transition-colors">
          {{ t.cancel }}
        </button>
        <span v-if="formError" class="text-rose-400 text-xs ml-1">{{ formError }}</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useLangStore } from '@/stores/lang'
import type { UpsertFursuitInput, Fursuit } from '@/stores/user'
import MediaUpload from '@/components/MediaUpload.vue'

const userStore = useUserStore()
const langStore = useLangStore()
const t = computed(() => langStore.t)

const showForm  = ref(false)
const editingId = ref<string | null>(null)
const saving    = ref(false)
const formError = ref('')

const form = reactive<UpsertFursuitInput & { image_url: string | null; is_nsfw: boolean }>({
  image_url: null,
  maker_id: null,
  external_maker_links: [],
  description: null,
  is_nsfw: false,
})

// ── Maker search ─────────────────────────────────────────────────────────────
interface MakerEntry {
  id: string
  name: string
  username: string
  display_name: string | null
  avatar_url: string | null
  type: 'group' | 'user'
}
const makerQuery     = ref('')
const makerLoading   = ref(false)
const showMakerDropdown = ref(false)
const selectedMaker  = ref<MakerEntry | null>(null)
const makerResults   = ref<{
  groups: { id: string; name: string; slug: string; avatar_url: string | null; type: string }[]
  users:  { id: string; username: string; display_name: string | null }[]
}>({ groups: [], users: [] })

let makerSearchTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSearchMaker() {
  if (makerSearchTimer) clearTimeout(makerSearchTimer)
  makerSearchTimer = setTimeout(searchMaker, 300)
}

async function searchMaker() {
  const q = makerQuery.value.trim()
  if (q.length < 2) { makerResults.value = { groups: [], users: [] }; showMakerDropdown.value = false; return }
  makerLoading.value = true
  try {
    const { default: api } = await import('@/api')
    const [gRes, uRes] = await Promise.all([
      api.get(`/groups/search?q=${encodeURIComponent(q)}`),
      api.get(`/users/search?q=${encodeURIComponent(q)}`),
    ])
    makerResults.value = {
      groups: gRes.data.data?.groups ?? [],
      users:  uRes.data.data?.users  ?? [],
    }
    showMakerDropdown.value = true
  } catch {
    makerResults.value = { groups: [], users: [] }
  } finally {
    makerLoading.value = false
  }
}

function pickMaker(entry: MakerEntry) {
  selectedMaker.value = entry
  form.maker_id = entry.id
  makerQuery.value = ''
  makerResults.value = { groups: [], users: [] }
  showMakerDropdown.value = false
}

function clearMaker() {
  selectedMaker.value = null
  form.maker_id = null
}

// ── Form lifecycle ────────────────────────────────────────────────────────────
onMounted(async () => {
  const auth = await import('@/stores/auth').then((m) => m.useAuthStore())
  if (auth.user?.id) await userStore.fetchFursuits(auth.user.id)
})

function openCreateForm() {
  editingId.value = null
  clearMaker()
  Object.assign(form, { image_url: null, maker_id: null, external_maker_links: [], description: null, is_nsfw: false })
  showForm.value = true
  formError.value = ''
}

function openEditForm(suit: Fursuit) {
  editingId.value = suit.id
  clearMaker()
  Object.assign(form, {
    image_url: suit.image_url,
    maker_id: suit.maker_id,
    external_maker_links: [...suit.external_maker_links],
    description: suit.description,
    is_nsfw: suit.is_nsfw ?? false,
  })
  // If there was a maker_id but we don't know the details, show a placeholder
  if (suit.maker_id) {
    selectedMaker.value = { id: suit.maker_id, name: 'Bloomly', username: '', display_name: null, avatar_url: null, type: 'group' }
  }
  showForm.value = true
  formError.value = ''
}

function closeForm() { showForm.value = false; editingId.value = null }

function addLink() {
  if (!form.external_maker_links) form.external_maker_links = []
  if (form.external_maker_links.length < 3) form.external_maker_links.push('')
}
function removeLink(idx: number) { form.external_maker_links?.splice(idx, 1) }
function updateLink(idx: number, val: string) {
  if (form.external_maker_links) form.external_maker_links[idx] = val
}

async function submitForm() {
  saving.value = true
  formError.value = ''
  try {
    const payload: UpsertFursuitInput = {
      image_url: form.image_url || null,
      maker_id: form.maker_id || null,
      external_maker_links: (form.external_maker_links ?? []).filter(Boolean),
      description: form.description || null,
      is_nsfw: form.is_nsfw,
    }
    if (editingId.value) {
      await userStore.updateFursuit(editingId.value, payload)
    } else {
      await userStore.createFursuit(payload)
    }
    closeForm()
  } catch (e: any) {
    formError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  if (!confirm(t.value.fursuitDeleteConfirm)) return
  try {
    await userStore.deleteFursuit(id)
  } catch (e: any) {
    alert(e?.response?.data?.error?.message ?? 'Failed to delete fursuit')
  }
}
</script>

<style scoped>
.dropdown-enter-active, .dropdown-leave-active { transition: all 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-4px); }
.fade-section-enter-active, .fade-section-leave-active { transition: all 0.2s ease; overflow: hidden; }
.fade-section-enter-from, .fade-section-leave-to { opacity: 0; max-height: 0; }
.fade-section-enter-to, .fade-section-leave-from { max-height: 200px; }
</style>
