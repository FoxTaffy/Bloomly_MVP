<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <div class="max-w-2xl mx-auto px-4 py-8">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-8">
        <router-link
          to="/"
          class="text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Back"
        >
          ←
        </router-link>
        <h1 class="text-xl font-bold">Edit Profile</h1>
      </div>

      <!-- Success banner -->
      <div
        v-if="saved"
        class="mb-6 px-4 py-3 bg-emerald-900/50 border border-emerald-700 text-emerald-300 rounded-lg text-sm"
      >
        Profile saved successfully.
      </div>

      <!-- Error banner -->
      <div
        v-if="userStore.error"
        class="mb-6 px-4 py-3 bg-rose-900/50 border border-rose-700 text-rose-300 rounded-lg text-sm"
      >
        {{ userStore.error }}
      </div>

      <form @submit.prevent="handleSubmit" class="flex flex-col gap-6">

        <!-- Display name -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
          <input
            v-model="form.display_name"
            type="text"
            maxlength="50"
            placeholder="Your display name"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <p class="text-xs text-gray-500 mt-1">{{ form.display_name?.length ?? 0 }} / 50</p>
        </div>

        <!-- Bio -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Bio</label>
          <textarea
            v-model="form.bio"
            rows="4"
            maxlength="300"
            placeholder="Tell something about yourself…"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          ></textarea>
          <p class="text-xs text-gray-500 mt-1">{{ form.bio?.length ?? 0 }} / 300</p>
        </div>

        <!-- Status -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Status</label>
          <input
            v-model="form.status"
            type="text"
            maxlength="100"
            placeholder="What are you up to?"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <!-- Persona -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Persona</label>
          <input
            v-model="form.persona"
            type="text"
            placeholder="e.g. Wolf, Cat, Fox…"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <!-- Telegram -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Telegram</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">@</span>
            <input
              v-model="form.telegram"
              type="text"
              maxlength="100"
              placeholder="username"
              class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <p class="text-xs text-gray-500 mt-1">Your Telegram username (without @)</p>
        </div>

        <!-- Avatar URL -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Avatar URL</label>
          <input
            v-model="form.avatar_url"
            type="url"
            placeholder="https://…"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <!-- Banner URL -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Banner URL</label>
          <input
            v-model="form.banner_url"
            type="url"
            placeholder="https://…"
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <!-- Accent color -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Accent Color</label>
          <div class="flex items-center gap-3">
            <input
              v-model="form.accent_color"
              type="color"
              class="h-9 w-14 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <input
              v-model="form.accent_color"
              type="text"
              maxlength="7"
              placeholder="#4C67CF"
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <p class="text-xs text-gray-500 mt-1">HEX format: #RRGGBB</p>
        </div>

        <!-- Likes -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Loves</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <span
              v-for="(item, idx) in form.likes"
              :key="idx"
              class="flex items-center gap-1 px-3 py-1 bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 text-sm rounded-full"
            >
              {{ item }}
              <button
                type="button"
                class="ml-1 text-emerald-500 hover:text-emerald-200 leading-none"
                @click="removeTag('likes', idx)"
              >×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newLike"
              type="text"
              placeholder="Add something you love…"
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              @keydown.enter.prevent="addTag('likes')"
            />
            <button
              type="button"
              class="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm transition-colors"
              @click="addTag('likes')"
            >
              Add
            </button>
          </div>
        </div>

        <!-- Dislikes -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Dislikes</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <span
              v-for="(item, idx) in form.dislikes"
              :key="idx"
              class="flex items-center gap-1 px-3 py-1 bg-rose-900/50 border border-rose-700/50 text-rose-300 text-sm rounded-full"
            >
              {{ item }}
              <button
                type="button"
                class="ml-1 text-rose-500 hover:text-rose-200 leading-none"
                @click="removeTag('dislikes', idx)"
              >×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newDislike"
              type="text"
              placeholder="Add something you dislike…"
              class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              @keydown.enter.prevent="addTag('dislikes')"
            />
            <button
              type="button"
              class="px-3 py-2 bg-rose-700 hover:bg-rose-600 rounded-lg text-sm transition-colors"
              @click="addTag('dislikes')"
            >
              Add
            </button>
          </div>
        </div>

        <!-- Submit -->
        <div class="pt-2">
          <button
            type="submit"
            :disabled="userStore.isLoading"
            class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors"
          >
            <span v-if="userStore.isLoading">Saving…</span>
            <span v-else>Save Profile</span>
          </button>
        </div>

      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/stores/auth'

const userStore = useUserStore()
const authStore = useAuthStore()

const saved      = ref(false)
const newLike    = ref('')
const newDislike = ref('')

const form = reactive({
  display_name: '',
  bio:          '',
  status:       '',
  persona:      '',
  telegram:     '',
  avatar_url:   '',
  banner_url:   '',
  accent_color: '#4C67CF',
  likes:        [] as string[],
  dislikes:     [] as string[],
})

onMounted(async () => {
  await userStore.fetchMyProfile()
  const p = userStore.profile
  if (!p) return
  form.display_name = p.display_name ?? ''
  form.bio          = p.bio          ?? ''
  form.status       = p.status       ?? ''
  form.persona      = p.persona      ?? ''
  form.telegram     = p.telegram     ?? ''
  form.avatar_url   = p.avatar_url   ?? ''
  form.banner_url   = p.banner_url   ?? ''
  form.accent_color = p.accent_color ?? '#4C67CF'
  form.likes        = [...p.likes]
  form.dislikes     = [...p.dislikes]
})

function addTag(field: 'likes' | 'dislikes') {
  const raw  = field === 'likes' ? newLike : newDislike
  const val  = raw.value.trim()
  if (!val || form[field].includes(val)) return
  form[field].push(val)
  if (field === 'likes') newLike.value = ''
  else newDislike.value = ''
}

function removeTag(field: 'likes' | 'dislikes', idx: number) {
  form[field].splice(idx, 1)
}

async function handleSubmit() {
  saved.value = false
  const payload: Record<string, unknown> = {}

  if (form.display_name) payload.display_name = form.display_name
  if (form.bio)          payload.bio           = form.bio
  if (form.status)       payload.status        = form.status
  if (form.persona)      payload.persona       = form.persona
  if (form.telegram)     payload.telegram      = form.telegram
  if (form.avatar_url)   payload.avatar_url    = form.avatar_url
  if (form.banner_url)   payload.banner_url    = form.banner_url
  if (/^#[0-9A-Fa-f]{6}$/.test(form.accent_color)) payload.accent_color = form.accent_color

  payload.likes    = form.likes
  payload.dislikes = form.dislikes

  try {
    await userStore.updateProfile(payload)
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } catch {
    // error is shown via userStore.error
  }
}
</script>
