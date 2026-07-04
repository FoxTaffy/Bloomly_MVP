<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
import api from '@/api'
import BIcon from './BIcon.vue'

const props = defineProps<{ user: any }>()
const emit  = defineEmits<{ unbookmarked: [id: string] }>()

const router    = useRouter()
const langStore = useLangStore()
const removing  = ref(false)

function bannerGradient(id: string) {
  const n   = id.charCodeAt(0) + id.charCodeAt(id.length - 1)
  const hue = (n * 47) % 360
  return `linear-gradient(135deg, hsl(${hue},50%,22%) 0%, hsl(${(hue + 40) % 360},60%,16%) 100%)`
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}

async function removeBookmark() {
  removing.value = true
  try {
    await api.post(`/bookmarks/users/${props.user.id}`)
    emit('unbookmarked', props.user.id)
  } catch {}
  finally { removing.value = false }
}
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/40 transition-all group flex flex-col">

    <!-- Banner -->
    <div
      class="relative h-16 flex-shrink-0"
      :style="user.banner_url ? '' : `background: ${bannerGradient(user.id)}`"
    >
      <img v-if="user.banner_url" :src="user.banner_url" class="w-full h-full object-cover" alt="" />
      <!-- Remove bookmark button -->
      <button
        @click.stop="removeBookmark"
        :disabled="removing"
        class="absolute top-2 right-2 p-1.5 rounded-xl bg-black/50 backdrop-blur-sm text-white/70 hover:text-yellow-400 hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-30"
        :title="langStore.t.unbookmarkUser">
        <BIcon name="BookmarkX" class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Body -->
    <div class="px-3 pb-3 pt-0 flex flex-col gap-1.5 flex-1">
      <!-- Avatar -->
      <div class="-mt-6 mb-1">
        <img
          v-if="user.avatar_url"
          :src="user.avatar_url"
          class="w-12 h-12 rounded-full object-cover border-[3px] border-brand-card cursor-pointer"
          @click="router.push(`/profile/${user.username}`)"
          @error="onAvatarError"
        />
        <div
          v-else
          class="w-12 h-12 rounded-full border-[3px] border-brand-card bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold text-lg cursor-pointer"
          @click="router.push(`/profile/${user.username}`)">
          {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
        </div>
      </div>

      <!-- Name & username -->
      <div class="min-w-0 cursor-pointer" @click="router.push(`/profile/${user.username}`)">
        <div class="flex items-center gap-1 min-w-0">
          <p class="font-bold text-sm text-white truncate leading-tight">
            {{ user.display_name || user.username }}
          </p>
          <img v-if="user.is_verified" src="/icons/badges/paw_offical.svg" class="w-3.5 h-3.5 flex-shrink-0" />
        </div>
        <p class="text-xs text-white/45 truncate">@{{ user.username }}</p>
      </div>

      <!-- Bio -->
      <p v-if="user.bio" class="text-[11px] text-white/40 line-clamp-2 leading-relaxed">{{ user.bio }}</p>

      <!-- Stats -->
      <div class="flex items-center gap-3 text-xs text-white/40 mt-auto pt-1">
        <span class="flex items-center gap-1">
          <BIcon name="Users" class="w-3 h-3" />
          {{ fmtNum(user._count?.followers ?? 0) }} {{ langStore.t.followersCount }}
        </span>
        <span v-if="user.location" class="flex items-center gap-1 truncate">
          <BIcon name="MapPin" class="w-3 h-3 flex-shrink-0" />
          {{ user.location }}
        </span>
      </div>

      <!-- Go to profile -->
      <button
        @click="router.push(`/profile/${user.username}`)"
        class="w-full mt-1 py-1.5 rounded-xl bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent text-xs font-semibold transition-colors">
        {{ langStore.t.viewProfile }}
      </button>
    </div>
  </div>
</template>
