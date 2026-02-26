<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex flex-col items-center justify-center min-h-screen gap-4">
      <p class="text-brand-error text-lg">{{ error }}</p>
      <button
        class="px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus rounded-xl text-sm font-bold transition-colors"
        @click="loadProfile"
      >
        Повторить
      </button>
    </div>

    <!-- Profile content -->
    <div v-else-if="viewedProfile">

      <!-- Banner -->
      <div
        class="relative w-full h-48 md:h-64 bg-gradient-to-br from-[#1F223C] to-[#2A2D45] overflow-hidden"
        :style="viewedProfile.banner_url
          ? `background-image: url('${viewedProfile.banner_url}'); background-size: cover; background-position: center;`
          : (viewedProfile.accent_color ? `background-color: ${viewedProfile.accent_color}22` : '')"
      >
        <div class="absolute inset-0 bg-gradient-to-t from-[#16192F]/60 to-transparent"></div>
      </div>

      <!-- Profile card -->
      <div class="max-w-2xl mx-auto px-4 pb-12">
        <div class="relative -mt-16 mb-4 flex items-end justify-between">
          <!-- Avatar -->
          <img
            :src="avatarSrc"
            :alt="viewedProfile.display_name ?? viewedProfile.username"
            class="w-32 h-32 rounded-2xl border-4 border-brand-bg object-cover bg-brand-card shadow-xl"
          />
          <!-- Edit button aligned to right on mobile -->
          <div v-if="isOwnProfile" class="mb-2">
            <router-link
              to="/settings/profile"
              class="inline-flex items-center gap-2 px-4 py-2 border border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-white rounded-xl text-sm font-bold transition-all"
            >
              Редактировать
            </router-link>
          </div>
        </div>

        <!-- Names & status -->
        <div class="mb-5">
          <h1 class="text-2xl font-extrabold leading-tight text-brand-offwhite">
            {{ viewedProfile.display_name ?? viewedProfile.username }}
          </h1>
          <p class="text-brand-accent-minus text-sm mt-0.5">@{{ viewedProfile.username }}</p>
          <p v-if="viewedProfile.status" class="mt-1.5 text-brand-accent-minus text-sm italic">
            {{ viewedProfile.status }}
          </p>
        </div>

        <!-- Persona tag -->
        <div
          v-if="viewedProfile.persona"
          class="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-full text-sm font-semibold border"
          :style="accentStyle"
        >
          <span>🐾</span>
          <span>{{ viewedProfile.persona }}</span>
        </div>

        <!-- Bio -->
        <p v-if="viewedProfile.bio" class="text-brand-offwhite/80 leading-relaxed mb-6 whitespace-pre-wrap text-sm">
          {{ viewedProfile.bio }}
        </p>

        <!-- Likes / Dislikes -->
        <div v-if="viewedProfile.likes.length || viewedProfile.dislikes.length" class="flex flex-col gap-4 mb-6">

          <div v-if="viewedProfile.likes.length">
            <h3 class="text-xs font-bold uppercase tracking-widest text-brand-muted mb-2">Нравится</h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in viewedProfile.likes"
                :key="item"
                class="px-3 py-1 bg-brand-success/10 border border-brand-success/25 text-brand-success text-sm rounded-full font-medium"
              >
                {{ item }}
              </span>
            </div>
          </div>

          <div v-if="viewedProfile.dislikes.length">
            <h3 class="text-xs font-bold uppercase tracking-widest text-brand-muted mb-2">Не нравится</h3>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in viewedProfile.dislikes"
                :key="item"
                class="px-3 py-1 bg-brand-error/10 border border-brand-error/25 text-brand-error text-sm rounded-full font-medium"
              >
                {{ item }}
              </span>
            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- Not found -->
    <div v-else class="flex flex-col items-center justify-center min-h-screen gap-3">
      <p class="text-brand-muted text-lg font-semibold">Пользователь не найден</p>
      <router-link to="/" class="text-brand-accent hover:text-brand-accent-minus text-sm font-semibold transition-colors">
        ← На главную
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
  return `https://ui-avatars.com/api/?name=${name}&background=4067CF&color=fff&bold=true&rounded=true&size=256`
})

const accentStyle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C97CF'
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
