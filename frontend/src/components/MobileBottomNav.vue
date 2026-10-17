<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useMobileHubStore } from '@/stores/mobileHub'
import { useMessagesStore } from '@/stores/messages'
import BIcon from './BIcon.vue'

const router       = useRouter()
const route        = useRoute()
const auth         = useAuthStore()
const langStore    = useLangStore()
const hub          = useMobileHubStore()
const messagesStore = useMessagesStore()

const mobileHubOpen = ref(false)

type MobileTab = 'home' | 'friends' | 'messages' | 'profile'

const activeTab = computed<MobileTab>(() => {
  const name = String(route.name ?? '')
  if (name === 'friends')  return 'friends'
  if (name === 'messages') return 'messages'
  if (name === 'profile')  return 'profile'
  return 'home'
})

function go(name: string) {
  mobileHubOpen.value = false
  router.push({ name })
}

function handleNewPost() {
  mobileHubOpen.value = false
  if (route.name === 'home') {
    hub.triggerPost()
  } else {
    router.push({ name: 'home' })
  }
}

function handleNewStory() {
  mobileHubOpen.value = false
  if (route.name === 'home') {
    hub.triggerStory()
  } else {
    router.push({ name: 'home' })
  }
}
</script>

<template>
  <nav class="fixed bottom-0 inset-x-0 z-[200] md:hidden">
    <!-- Blur backdrop -->
    <div class="absolute inset-0 bg-brand-bg/90 backdrop-blur-xl border-t border-brand-border"></div>

    <div class="relative grid grid-cols-5 items-center px-1 pt-1.5 safe-area-bottom">

      <!-- Home -->
      <button
        @click="go('home')"
        class="nav-item relative flex flex-col items-center justify-center gap-0.5 min-w-0 h-14 px-0.5 rounded-2xl transition-all duration-200 active:scale-95"
        :class="activeTab === 'home' ? 'text-white' : 'text-white/55'">
        <div class="relative">
          <div v-if="activeTab === 'home'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-accent/30 blur-sm"></div>
          <BIcon name="Home" class="w-6 h-6 relative transition-transform duration-200"
            :class="activeTab === 'home' ? 'scale-110 text-white' : ''" />
        </div>
        <span class="block max-w-full truncate text-[10px] leading-tight font-semibold">{{ langStore.t.home }}</span>
        <div v-if="activeTab === 'home'" class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-accent"></div>
      </button>

      <!-- Friends -->
      <button
        @click="go('friends')"
        class="nav-item relative flex flex-col items-center justify-center gap-0.5 min-w-0 h-14 px-0.5 rounded-2xl transition-all duration-200 active:scale-95"
        :class="activeTab === 'friends' ? 'text-white' : 'text-white/55'">
        <div class="relative">
          <div v-if="activeTab === 'friends'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-purple/30 blur-sm"></div>
          <BIcon name="Users" class="w-6 h-6 relative transition-transform duration-200"
            :class="activeTab === 'friends' ? 'scale-110 text-brand-purple' : ''" />
        </div>
        <span class="block max-w-full truncate text-[10px] leading-tight font-semibold">{{ langStore.t.friends }}</span>
        <div v-if="activeTab === 'friends'" class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-purple"></div>
      </button>

      <!-- Hub (FAB) -->
      <div class="relative flex justify-center -mt-3">
        <!-- Backdrop -->
        <Transition name="fade">
          <div
            v-if="mobileHubOpen"
            class="fixed inset-0 z-[199] bg-black/50 backdrop-blur-sm"
            @click="mobileHubOpen = false"
          ></div>
        </Transition>

        <!-- Hub menu -->
        <Transition name="hub-pop">
          <div
            v-if="mobileHubOpen"
            class="absolute bottom-[76px] left-1/2 -translate-x-1/2 z-[201] flex flex-col items-center gap-2 w-52 max-w-[calc(100vw-2rem)]"
          >
            <button
              @click="handleNewPost()"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-accent/20 transition-all">
              <BIcon name="Edit3" class="w-5 h-5 text-brand-accent" /> {{ langStore.t.newPost }}
            </button>
            <button
              @click="handleNewStory()"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-purple/20 transition-all">
              <BIcon name="Camera" class="w-5 h-5 text-brand-purple" /> {{ langStore.t.story }}
            </button>
            <button
              @click="go('groups')"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-success/20 transition-all">
              <BIcon name="Grid" class="w-5 h-5 text-brand-success" /> {{ langStore.t.groups }}
            </button>
            <button
              @click="go('bookmarks')"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-border text-white text-sm font-semibold hover:bg-brand-yellow/20 transition-all">
              <BIcon name="Bookmark" class="w-5 h-5 text-brand-yellow" /> {{ langStore.t.bookmarks }}
            </button>
          </div>
        </Transition>

        <!-- FAB button -->
        <button
          @click="mobileHubOpen = !mobileHubOpen"
          class="relative z-[202] w-14 h-14 rounded-2xl bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/40 hover:bg-brand-accent-plus hover:shadow-brand-accent/60 active:scale-95 transition-all duration-150"
          :class="mobileHubOpen ? 'rotate-45 bg-brand-error shadow-brand-error/40' : ''">
          <BIcon name="Plus" class="w-7 h-7 text-white transition-transform duration-200" />
        </button>
      </div>

      <!-- Messages -->
      <button
        @click="go('messages')"
        class="nav-item relative flex flex-col items-center justify-center gap-0.5 min-w-0 h-14 px-0.5 rounded-2xl transition-all duration-200 active:scale-95"
        :class="activeTab === 'messages' ? 'text-white' : 'text-white/55'">
        <div class="relative">
          <div v-if="activeTab === 'messages'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-success/30 blur-sm"></div>
          <BIcon name="MessageCircle" class="w-6 h-6 relative transition-transform duration-200"
            :class="activeTab === 'messages' ? 'scale-110 text-brand-success' : ''" />
          <span v-if="messagesStore.unreadCount > 0"
            class="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center bg-brand-error rounded-full text-[9px] font-bold text-white border-2 border-brand-bg">
            {{ messagesStore.unreadCount > 9 ? '9+' : messagesStore.unreadCount }}
          </span>
        </div>
        <span class="block max-w-full truncate text-[10px] leading-tight font-semibold">{{ langStore.t.chats }}</span>
        <div v-if="activeTab === 'messages'" class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-success"></div>
      </button>

      <!-- Profile -->
      <button
        @click="mobileHubOpen = false; router.push(`/profile/${auth.user?.username}`)"
        class="nav-item relative flex flex-col items-center justify-center gap-0.5 min-w-0 h-14 px-0.5 rounded-2xl transition-all duration-200 active:scale-95"
        :class="activeTab === 'profile' ? 'text-white' : 'text-white/55'">
        <div class="relative">
          <div v-if="activeTab === 'profile'" class="absolute inset-0 -m-1.5 rounded-xl bg-brand-yellow/30 blur-sm"></div>
          <img
            v-if="auth.avatarUrl"
            :src="auth.avatarUrl"
            class="w-6 h-6 rounded-full object-cover border-2 transition-all duration-200 relative"
            :class="activeTab === 'profile' ? 'border-brand-yellow scale-110' : 'border-white/20'"
          />
          <BIcon
            v-else
            name="User"
            class="w-6 h-6 relative"
            :class="activeTab === 'profile' ? 'scale-110 text-brand-yellow' : ''"
          />
        </div>
        <span class="block max-w-full truncate text-[10px] leading-tight font-semibold">{{ langStore.t.profile }}</span>
        <div v-if="activeTab === 'profile'" class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-yellow"></div>
      </button>

    </div>
  </nav>
</template>

<style scoped>
.safe-area-bottom { padding-bottom: max(0.375rem, env(safe-area-inset-bottom, 0px)); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }

.hub-pop-enter-active { transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
.hub-pop-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.hub-pop-enter-from, .hub-pop-leave-to { opacity: 0; transform: translateY(12px) scale(0.95); }
</style>
