<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
const langStore = useLangStore()
import { useRouter } from 'vue-router'
import { ref, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'
import type { FriendUser } from '@/stores/friends'
import api from '@/api'

interface Props {
  user: FriendUser & { online?: boolean }
  isFriend?: boolean
}

const props = withDefaults(defineProps<Props>(), { isFriend: false })
const emit  = defineEmits<{
  message: [id: string]
  remove:  [id: string]
}>()

const router   = useRouter()
const menuOpen = ref(false)
const menuRef  = ref<HTMLElement | null>(null)

const notifyActive  = ref(false)
const notifyLoading = ref(false)

function initials(u: FriendUser) {
  return ((u.display_name || u.username) ?? '?')[0].toUpperCase()
}

function bannerGradient(id: string) {
  const n   = id.charCodeAt(0) + id.charCodeAt(id.length - 1)
  const hue = (n * 47) % 360
  return `linear-gradient(135deg, hsl(${hue},50%,22%) 0%, hsl(${(hue + 40) % 360},60%,16%) 100%)`
}

function openProfile() { menuOpen.value = false; router.push(`/profile/${props.user.username}`) }
function removeFriend() { menuOpen.value = false; emit('remove', props.user.id) }

function onOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) menuOpen.value = false
}

async function fetchNotifyStatus() {
  try {
    const { data } = await api.get(`/users/${props.user.id}/notify-status`)
    notifyActive.value = data.data?.notifyPosts ?? false
  } catch { /* not following — ignore */ }
}

async function toggleNotify() {
  if (notifyLoading.value) return
  notifyLoading.value = true
  try {
    const { data } = await api.post(`/users/${props.user.id}/notify-toggle`)
    notifyActive.value = data.data?.notifyPosts ?? false
  } catch { /* ignore */ } finally {
    notifyLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onOutside, true)
  fetchNotifyStatus()
})
onUnmounted(() => document.removeEventListener('click', onOutside, true))
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-2xl hover:border-brand-accent/40
              transition-all group flex flex-col cursor-default relative overflow-visible">

    <!-- Banner — h-20, clips only inside this div -->
    <div
      class="relative h-20 flex-shrink-0 rounded-t-2xl overflow-hidden"
      :style="user.banner_url ? '' : `background: ${bannerGradient(user.id)}`"
    >
      <img v-if="user.banner_url" :src="user.banner_url" class="w-full h-full object-cover" alt="" />

      <!-- Online badge -->
      <span
        v-if="user.online !== undefined"
        :class="[
          'absolute top-2 right-2 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
          user.online
            ? 'bg-brand-success/20 text-brand-success border border-brand-success/40'
            : 'bg-brand-bg/70 text-white/50 border border-white/10'
        ]"
      >
        <span :class="['w-1.5 h-1.5 rounded-full', user.online ? 'bg-brand-success' : 'bg-white/30']" />
        {{ user.online ? 'Онлайн' : 'Офлайн' }}
      </span>
    </div>

    <!-- Body — separate rounded-b block, z-10 so avatar floats over banner -->
    <div class="px-4 pb-4 pt-0 flex flex-col gap-2 flex-1 rounded-b-2xl bg-brand-card relative z-10 overflow-visible">

      <!-- Avatar (left) + ··· button (right) -->
      <div class="flex items-start justify-between">
        <div class="-mt-9 cursor-pointer" @click="openProfile">
          <img
            v-if="user.avatar_url"
            :src="user.avatar_url"
            :alt="user.display_name || user.username"
            class="w-16 h-16 rounded-full object-cover border-[3px] border-brand-card"
            @error="onAvatarError"
          />
          <div
            v-else
            class="w-16 h-16 rounded-full border-[3px] border-brand-card
                   bg-brand-accent/25 flex items-center justify-center
                   text-brand-accent-minus font-bold text-xl"
          >{{ initials(user) }}</div>
        </div>

        <!-- Kebab menu -->
        <div class="relative mt-2" ref="menuRef">
          <button
            class="w-8 h-8 flex items-center justify-center rounded-xl
                   bg-white/5 hover:bg-white/10 text-white/55 hover:text-white transition-colors"
            @click.stop="menuOpen = !menuOpen"
          >
            <BIcon name="MoreHorizontal" class="w-4 h-4" />
          </button>

          <Transition
            enter-active-class="transition ease-out duration-100 origin-top-right"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75 origin-top-right"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="menuOpen"
              class="absolute right-0 top-10 w-48 bg-brand-card border border-brand-border
                     rounded-2xl shadow-card z-50 py-1 overflow-hidden"
            >
              <button
                class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/80
                       hover:bg-white/5 hover:text-white transition-colors"
                @click="openProfile"
              >
                <BIcon name="User" class="w-4 h-4 text-brand-accent-minus" />
                {{ langStore.t.viewProfileBtn }}
              </button>
              <button
                class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/80
                       hover:bg-white/5 hover:text-white transition-colors"
                @click.stop="menuOpen = false"
              >
                <BIcon name="Ban" class="w-4 h-4 text-brand-warning" />
                {{ langStore.t.blockUserBtn }}
              </button>
              <template v-if="isFriend">
                <div class="border-t border-brand-border mx-3 my-1" />
                <button
                  class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-brand-error
                         hover:bg-brand-error/10 transition-colors"
                  @click="removeFriend"
                >
                  <BIcon name="UserMinus" class="w-4 h-4" />
                  {{ langStore.t.removeFriendTitle }}
                </button>
              </template>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Name -->
      <div class="min-w-0 cursor-pointer leading-snug -mt-1" @click="openProfile">
        <p class="font-semibold text-white truncate text-base leading-tight">
          {{ user.display_name || user.username }}
        </p>
        <p class="text-sm text-white/50 truncate font-normal">@{{ user.username }}</p>
        <p v-if="user.location" class="text-xs text-white/40 flex items-center gap-1 mt-1 truncate">
          <BIcon name="MapPin" class="w-3 h-3 flex-shrink-0" />
          {{ user.location }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mt-auto pt-1">
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                 bg-brand-accent/15 hover:bg-brand-accent/30 text-brand-accent-minus
                 text-sm font-semibold transition-colors"
          @click.stop="emit('message', user.id)"
        >
          <BIcon name="MessageCircle" class="w-4 h-4" />
          {{ langStore.t.msgBtnTitle }}
        </button>
        <!-- Колокольчик уведомлений -->
        <button
          :class="[
            'w-9 h-9 flex items-center justify-center rounded-xl transition-colors flex-shrink-0',
            notifyActive
              ? 'bg-brand-accent/20 text-brand-accent-minus hover:bg-brand-accent/30'
              : 'bg-white/5 hover:bg-brand-accent/15 text-white/55 hover:text-brand-accent-minus',
            notifyLoading ? 'opacity-60 pointer-events-none' : ''
          ]"
          :title="notifyActive ? '{{ langStore.t.disableNotifyTitle }}' : '{{ langStore.t.enableNotifyTitle }}'"
          @click.stop="toggleNotify"
        >
          <BIcon :name="notifyActive ? 'BellRing' : 'Bell'" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
