<script setup lang="ts">
import { ref, watchEffect, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { badges } = useAdminContext()

// ── Avatar frame submissions ─────────────────────────────────────────
const frameSubmissions = ref<any[]>([])
const frameFilter = ref('pending')
const isLoadingFrames = ref(false)

const fetchFrameSubmissions = async () => {
  isLoadingFrames.value = true
  try {
    const params: any = { page: 1 }
    if (frameFilter.value) params.status = frameFilter.value
    const res = await api.get('/admin/avatar-frames', { params })
    if (res.data.success) frameSubmissions.value = res.data.data.submissions
  } catch {} finally { isLoadingFrames.value = false }
}

const reviewFrameSubmission = async (id: string, action: 'approve' | 'reject', reason?: string) => {
  try {
    await api.patch(`/admin/avatar-frames/${id}`, { action, reason })
    frameSubmissions.value = frameSubmissions.value.filter(f => f.id !== id)
  } catch {}
}

// Same reasoning as rejectVerRequest above — window.prompt must be called from script.
const rejectFrameSubmission = (id: string) => {
  const reason = window.prompt(langStore.t.adminFrameRejectPrompt) || undefined
  reviewFrameSubmission(id, 'reject', reason)
}

onActivated(() => { if (!frameSubmissions.value.length) fetchFrameSubmissions() })
watchEffect(() => { badges.frames = frameSubmissions.value.filter((f: any) => f.status === 'pending').length })
</script>

<template>
  <div>
    <div class="flex gap-2 mb-5 flex-wrap">
      <button v-for="s in (['', 'pending', 'approved', 'rejected'] as const)" :key="s"
        @click="frameFilter = s; fetchFrameSubmissions()"
        class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
        :class="frameFilter === s
          ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
          : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
        {{ { '': langStore.t.tabAll, pending: langStore.t.adminVerFilterPending, approved: langStore.t.adminVerFilterApproved, rejected: langStore.t.adminVerFilterRejected }[s] }}
      </button>
    </div>

    <div class="space-y-3">
      <div v-if="isLoadingFrames">
        <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
      </div>
      <div v-else-if="frameSubmissions.length === 0"
        class="flex flex-col items-center gap-3 py-20 text-white/25">
        <BIcon name="CircleDashed" class="w-10 h-10 opacity-40" />
        <p class="text-sm font-semibold">{{ langStore.t.adminFramesQueueEmpty }}</p>
      </div>
      <div v-else class="space-y-3">
        <div v-for="fr in frameSubmissions" :key="fr.id"
          class="w-full max-w-full rounded-2xl border overflow-hidden transition-colors"
          :class="fr.status==='pending'
            ? 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50'
            : fr.status==='approved'
              ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-500/50'
              : 'border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-500/50'">

          <div class="flex items-center gap-3 px-4 pt-3.5 pb-2.5 min-w-0">
            <div class="relative w-12 h-12 flex-shrink-0">
              <div class="w-12 h-12 rounded-full bg-white/5 border border-white/10 overflow-hidden">
                <img v-if="fr.creator?.avatar_url" :src="fr.creator.avatar_url" class="w-full h-full object-cover" />
              </div>
              <img :src="fr.image_url" class="absolute inset-0 w-full h-full object-contain pointer-events-none"
                :style="{ transform: `translate(${fr.default_offset_x*100}%, ${fr.default_offset_y*100}%) rotate(${fr.default_rotation}deg) scale(${fr.default_scale})` }" />
            </div>
            <router-link :to="`/profile/${fr.creator?.username}`" target="_blank" class="min-w-0 group/user">
              <p class="font-bold text-[13px] text-white group-hover/user:text-blue-400 transition-colors truncate">{{ fr.creator?.display_name || fr.creator?.username }}</p>
              <p class="text-[11px] text-white/35 truncate">@{{ fr.creator?.username }}</p>
            </router-link>
            <div class="flex items-center gap-2 flex-shrink-0 ml-auto">
              <span class="text-xs font-extrabold px-2.5 py-1 rounded-full border"
                :class="fr.status==='pending'
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : fr.status==='approved'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20'">
                {{ {pending: langStore.t.adminVerStatusPending, approved: langStore.t.adminVerStatusApproved, rejected: langStore.t.adminVerStatusRejected}[fr.status as 'pending' | 'approved' | 'rejected'] }}
              </span>
              <span class="text-[10px] text-white/25 whitespace-nowrap">{{ formatDate(fr.created_at) }}</span>
            </div>
          </div>

          <div class="px-4 pb-3 flex items-center gap-2 min-w-0">
            <p class="font-bold text-sm text-white truncate">{{ fr.name }}</p>
            <span class="text-xs text-white/35 flex-shrink-0">{{ fr.price === '0' || fr.price === 0 ? 'FREE' : fr.price }}</span>
          </div>

          <div v-if="fr.status === 'pending'" class="border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5 flex gap-2">
            <button @click="reviewFrameSubmission(fr.id,'approve')"
              class="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5">
              <BIcon name="Check" class="w-3.5 h-3.5" /> {{ langStore.t.adminFrameApprove }}
            </button>
            <button @click="rejectFrameSubmission(fr.id)"
              class="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-1.5">
              <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminFrameReject }}
            </button>
          </div>
          <div v-else class="h-3.5" />
        </div>
      </div>
    </div>
  </div>
</template>
