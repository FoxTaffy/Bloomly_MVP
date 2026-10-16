<script setup lang="ts">
import { ref, computed, watchEffect, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { verTypeIconUrl } from '@/lib/verificationIcons'
import { fetchVerificationEvidence } from '@/composables/useReportEvidence'
import BIcon from '@/components/BIcon.vue'
import PostLightbox from '@/components/PostLightbox.vue'
import SafeMedia from '@/components/SafeMedia.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { badges, reportAdminError } = useAdminContext()

// ── Verification ──────────────────────────────────────────────────────
const verRequests = ref<any[]>([])
const verFilter = ref('pending')
const isLoadingVer = ref(false)
const verLoadError = ref(false)
const verBusy = ref<Record<string, boolean>>({})
let verFetchSeq = 0

const fetchVerRequests = async () => {
  const seq = ++verFetchSeq
  isLoadingVer.value = true
  verLoadError.value = false
  try {
    const params: any = { page: 1 }
    if (verFilter.value) params.status = verFilter.value
    const res = await api.get('/verification/admin/requests', { params })
    if (seq === verFetchSeq && res.data.success && Array.isArray(res.data.data?.requests)) {
      verRequests.value = res.data.data.requests
    }
  } catch { if (seq === verFetchSeq) verLoadError.value = true } finally {
    if (seq === verFetchSeq) isLoadingVer.value = false
  }
}

const reviewVerRequest = async (id: string, action: 'approve' | 'reject', reason?: string) => {
  if (verBusy.value[id]) return
  verBusy.value[id] = true
  try {
    await api.patch(`/verification/admin/requests/${id}`, { action, reason })
    if (verFilter.value === '') {
      // "All" view keeps decided requests visible — just flip the status locally
      const r = verRequests.value.find(r => r.id === id)
      if (r) r.status = action === 'approve' ? 'approved' : 'rejected'
    } else {
      verRequests.value = verRequests.value.filter(r => r.id !== id)
    }
  } catch (e) { reportAdminError(e) } finally { delete verBusy.value[id] }
}

// `prompt()` cannot be called directly inside a template expression — Vue's compiler
// only resolves a small allowlist of browser globals there (window.prompt isn't in
// it), so a bare `prompt(...)` in `@click` silently resolves to `undefined` and
// "Отклонить" appeared to do nothing. Calling it from a plain script function works.
const rejectVerRequest = (id: string) => {
  const reason = window.prompt(langStore.t.adminReasonPromptLabel) || undefined
  reviewVerRequest(id, 'reject', reason)
}

const evidenceLightbox = ref<{ images: string[]; start: number } | null>(null)
// Документы верификации закрыты от прямого доступа: в просмотрщик отдаём blob-ссылки, недоступные файлы пропускаем
const openEvidenceLightbox = async (urls: string[], start: number) => {
  const settled = await Promise.allSettled(urls.map((u) => fetchVerificationEvidence(u)))
  const images: string[] = []
  let startIndex = 0
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    if (i === start) startIndex = images.length
    images.push(r.value)
  })
  if (images.length === 0 || settled[start]?.status !== 'fulfilled') return
  evidenceLightbox.value = { images, start: startIndex }
}

const verTypeLabels = computed<Record<string, string>>(() => ({
  artist: langStore.t.verTypeArtist,
  master: langStore.t.verTypeMaster,
  fursuiter: langStore.t.verTypeFursuiter,
  popular: langStore.t.verTypePopular,
  writer: langStore.t.verTypeWriter,
  organizer: langStore.t.verTypeOrganizer,
  event: langStore.t.verTypeEvent,
  photographer: langStore.t.verTypePhotographer,
  programmer: langStore.t.verTypeProgrammer,
}))
const verTypeColors: Record<string, string> = {
  artist: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  master: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  fursuiter: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  popular: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  writer: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  organizer: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  event: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  photographer: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
  programmer: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20',
}

onActivated(() => { if (!verRequests.value.length) fetchVerRequests() })
watchEffect(() => { badges.verification = verRequests.value.filter((r: any) => r.status === 'pending').length })
</script>

<template>
  <div>
    <div class="flex gap-2 mb-5 flex-wrap">
      <button v-for="s in (['', 'pending', 'approved', 'rejected'] as const)" :key="s"
        @click="verFilter = s; fetchVerRequests()"
        class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
        :class="verFilter === s
          ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
          : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
        {{ { '': langStore.t.tabAll, pending: langStore.t.adminVerFilterPending, approved: langStore.t.adminVerFilterApproved, rejected: langStore.t.adminVerFilterRejected }[s] }}
      </button>
    </div>

    <div class="space-y-3">
      <div v-if="isLoadingVer">
        <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
      </div>
      <div v-else-if="verLoadError && verRequests.length === 0" class="flex flex-col items-center gap-3 py-20 text-white/30">
        <p class="text-sm font-semibold">{{ langStore.t.adminLoadFailed }}</p>
        <button @click="fetchVerRequests" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/60 hover:text-white transition-all">{{ langStore.t.adminRetryBtn }}</button>
      </div>
      <div v-else-if="verRequests.length === 0"
        class="flex flex-col items-center gap-3 py-20 text-white/25">
        <BIcon name="BadgeCheck" class="w-10 h-10 opacity-40" />
        <p class="text-sm font-semibold">{{ langStore.t.adminNoRequestsFound }}</p>
      </div>
      <div v-else class="space-y-3">
        <div v-for="req in verRequests" :key="req.id"
          class="w-full max-w-full rounded-2xl border overflow-hidden transition-colors"
          :class="req.status==='pending'
            ? 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50'
            : req.status==='approved'
              ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-500/50'
              : 'border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-500/50'">

          <!-- Header -->
          <div class="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 min-w-0">
            <router-link :to="`/profile/${req.user?.username}`" target="_blank"
              class="flex items-center gap-2.5 group/user min-w-0">
              <img v-if="req.user?.avatar_url" :src="req.user.avatar_url"
                class="w-9 h-9 rounded-xl object-cover border border-white/10 flex-shrink-0" />
              <div v-else class="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs flex-shrink-0">
                {{ (req.user?.display_name || req.user?.username || '?')[0].toUpperCase() }}
              </div>
              <div class="min-w-0">
                <p class="font-bold text-[13px] text-white group-hover/user:text-blue-400 transition-colors flex items-center gap-1 truncate">
                  <span class="truncate">{{ req.user?.display_name || req.user?.username }}</span>
                  <BIcon name="ExternalLink" class="w-3 h-3 opacity-0 group-hover/user:opacity-60 transition-opacity flex-shrink-0" />
                </p>
                <p class="text-[11px] text-white/35 truncate">@{{ req.user?.username }}</p>
              </div>
            </router-link>

              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-xs font-extrabold px-2.5 py-1 rounded-full border"
                  :class="req.status==='pending'
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : req.status==='approved'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-rose-400 bg-rose-500/10 border-rose-500/20'">
                  {{ {pending: langStore.t.adminVerStatusPending, approved: langStore.t.adminVerStatusApproved, rejected: langStore.t.adminVerStatusRejected}[req.status as 'pending' | 'approved' | 'rejected'] }}
                </span>
                <span class="text-[10px] text-white/25 whitespace-nowrap">{{ formatDate(req.created_at) }}</span>
              </div>
            </div>

            <div v-if="req.verification_type" class="mt-2.5">
              <span class="text-xs font-bold pl-1.5 pr-2.5 py-1 rounded-full border inline-flex items-center gap-1.5"
                :class="verTypeColors[req.verification_type] || 'text-blue-400 bg-blue-400/10 border-blue-400/20'">
                <img :src="verTypeIconUrl(req.verification_type)" :alt="req.verification_type" class="w-4 h-4 rounded-sm flex-shrink-0 object-cover" />
                {{ verTypeLabels[req.verification_type] || req.verification_type }}
              </span>
            </div>

          <!-- Criteria: single wrapping row, never overflows -->
          <div class="px-4 flex flex-wrap items-center gap-1 min-w-0">
            <span v-for="chip in [
              {label: req.account_age_days+' '+langStore.t.adminDaysSuffixShort, ok: req.account_age_days>=14},
              {label: req.post_count+' '+langStore.t.posts, ok: req.post_count>=3},
              {label: langStore.t.avatarBtnLabel, ok: req.has_avatar},
              {label: langStore.t.complBioLabel, ok: req.has_bio},
              {label: 'Email', ok: req.has_email},
              {label: req.follower_count+' '+langStore.t.adminFollowersSuffixShort, ok: req.follower_count>=5},
            ]" :key="chip.label"
              class="text-[10.5px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0"
              :class="chip.ok ? 'text-emerald-400/90 bg-emerald-500/[0.07]' : 'text-rose-400/80 bg-rose-500/[0.06]'">
              <BIcon :name="chip.ok ? 'Check' : 'X'" class="w-2.5 h-2.5 flex-shrink-0" /> {{ chip.label }}
            </span>
          </div>

          <!-- Evidence -->
          <div v-if="req.evidence_urls?.length || req.evidence_text" class="px-4 mt-2.5 flex flex-col gap-2 min-w-0">
            <div v-if="req.evidence_text" class="min-w-0">
              <p class="text-sm text-white/75 whitespace-pre-line line-clamp-3 break-words">{{ req.evidence_text }}</p>
            </div>
            <div v-if="req.evidence_urls?.length" class="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">
              <button v-for="(url,i) in req.evidence_urls" :key="i"
                @click="openEvidenceLightbox(req.evidence_urls, i)"
                class="relative w-14 h-14 rounded-lg overflow-hidden border border-white/[0.08] hover:border-blue-500/40 transition-colors flex-shrink-0 group/ev">
                <SafeMedia :src="url" source="verification-evidence" class="w-full h-full object-cover" />
                <div class="absolute inset-0 bg-black/0 group-hover/ev:bg-black/20 transition-colors" />
              </button>
            </div>
          </div>
          <p v-else class="px-4 mt-2 text-[11px] text-white/25">{{ langStore.t.adminNoEvidenceLabel }}</p>

          <!-- Footer actions -->
          <div v-if="req.status === 'pending'" class="mt-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5 flex gap-2">
            <button @click="reviewVerRequest(req.id,'approve')" :disabled="verBusy[req.id]"
              class="disabled:opacity-50 disabled:pointer-events-none flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5">
              <BIcon name="Check" class="w-3.5 h-3.5" /> {{ langStore.t.adminApproveBtn }}
            </button>
            <button @click="rejectVerRequest(req.id)" :disabled="verBusy[req.id]"
              class="disabled:opacity-50 disabled:pointer-events-none flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-1.5">
              <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminRejectBtn }}
            </button>
          </div>
          <div v-else class="h-3.5" />
        </div>
      </div>
    </div>

    <PostLightbox v-if="evidenceLightbox"
      :images="evidenceLightbox.images"
      :start-index="evidenceLightbox.start"
      @close="evidenceLightbox = null" />
  </div>
</template>
