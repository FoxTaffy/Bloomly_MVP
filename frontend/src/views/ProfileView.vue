<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
      <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-screen gap-4">
      <p class="text-red-400 text-lg">{{ error }}</p>
      <button
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm transition-colors"
        @click="loadProfile"
      >
        Retry
      </button>
    </div>

    <!-- Profile content -->
    <div v-else-if="viewedProfile">

      <!-- Banner -->
      <div
        class="relative w-full h-48 md:h-64 bg-gradient-to-br from-indigo-900 to-gray-800 overflow-hidden"
        :style="viewedProfile.banner_url ? `background-image: url('${viewedProfile.banner_url}'); background-size: cover; background-position: center;` : (viewedProfile.accent_color ? `background-color: ${viewedProfile.accent_color}` : '')"
      ></div>

      <!-- Profile card -->
      <div class="max-w-2xl mx-auto px-4">
        <div class="relative -mt-16 mb-4">
          <!-- Avatar -->
          <img
            :src="avatarSrc"
            :alt="viewedProfile.display_name ?? viewedProfile.username"
            class="w-32 h-32 rounded-full border-4 border-gray-950 object-cover bg-gray-800"
          />
        </div>

        <!-- Names & status -->
        <div class="mb-4">
          <h1 class="text-2xl font-bold leading-tight">
            {{ viewedProfile.display_name ?? viewedProfile.username }}
          </h1>
          <p class="text-gray-400 text-sm">@{{ viewedProfile.username }}</p>
          <p v-if="viewedProfile.status" class="mt-1 text-indigo-300 text-sm italic">
            {{ viewedProfile.status }}
          </p>
          <a
            v-if="viewedProfile.telegram"
            :href="`https://t.me/${viewedProfile.telegram}`"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Telegram: @${viewedProfile.telegram}`"
            class="mt-1 inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 transition-colors"
          >
            <span>✈</span>
            <span>@{{ viewedProfile.telegram }}</span>
          </a>
        </div>

        <!-- Persona block -->
        <div
          v-if="viewedProfile.persona"
          class="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full text-sm font-medium"
          :style="accentStyle"
        >
          <span>🐾</span>
          <span>{{ viewedProfile.persona }}</span>
        </div>

        <!-- Bio -->
        <p v-if="viewedProfile.bio" class="text-gray-300 leading-relaxed mb-6 whitespace-pre-wrap">
          {{ viewedProfile.bio }}
        </p>

        <!-- Likes / Dislikes -->
        <div v-if="viewedProfile.likes.length || viewedProfile.dislikes.length" class="flex flex-col gap-4 mb-6">

          <div v-if="viewedProfile.likes.length">
            <h3 class="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Loves</h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in viewedProfile.likes"
                :key="item"
                class="px-3 py-1 bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 text-sm rounded-full"
              >
                {{ item }}
              </span>
            </div>
          </div>

          <div v-if="viewedProfile.dislikes.length">
            <h3 class="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Dislikes</h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in viewedProfile.dislikes"
                :key="item"
                class="px-3 py-1 bg-rose-900/50 border border-rose-700/50 text-rose-300 text-sm rounded-full"
              >
                {{ item }}
              </span>
            </div>
          </div>

        </div>

        <!-- Edit profile button (only for own profile) -->
        <div v-if="isOwnProfile" class="mb-6">
          <router-link
            to="/settings/profile"
            class="inline-block px-4 py-2 border border-indigo-500 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-lg text-sm transition-colors"
          >
            Edit Profile
          </router-link>
        </div>

      </div>
    </div>

    <!-- Not found -->
    <div v-else class="flex flex-col items-center justify-center min-h-screen gap-2">
      <p class="text-gray-400 text-lg">User not found</p>
      <router-link to="/" class="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
        ← Back to home
      </router-link>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore, type UserProfile } from '@/stores/user'

const route      = useRoute()
const authStore  = useAuthStore()
const userStore  = useUserStore()

const viewedProfile = ref<UserProfile | null>(null)
const isLoading     = ref(false)
const error         = ref<string | null>(null)

const isOwnProfile = computed(
  () => !!authStore.user && authStore.user.id === viewedProfile.value?.id,
)

const avatarSrc = computed(() => {
  if (viewedProfile.value?.avatar_url) return viewedProfile.value.avatar_url
  const name = encodeURIComponent(
    viewedProfile.value?.display_name ?? viewedProfile.value?.username ?? 'U',
  )
  return `https://ui-avatars.com/api/?name=${name}&background=4C67CF&color=fff&bold=true&rounded=true&size=256`
})

const accentStyle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return {
    backgroundColor: `${color}22`,
    borderColor: `${color}66`,
    color,
    border: '1px solid',
  }
})

async function loadProfile() {
  const id = route.params.id as string
  isLoading.value = true
  error.value = null
  viewedProfile.value = null
  try {
    const result = await userStore.fetchProfile(id)
    viewedProfile.value = result
    if (!result) error.value = null // show "not found" UI
  } catch {
    error.value = 'Failed to load profile'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadProfile)
watch(() => route.params.id, loadProfile)
</script>
