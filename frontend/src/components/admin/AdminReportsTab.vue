<script setup lang="ts">
import { ref, computed, watchEffect, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { fetchReportEvidence } from '@/composables/useReportEvidence'
import BIcon from '@/components/BIcon.vue'
import PostLightbox from '@/components/PostLightbox.vue'
import ResolveReportModal from '@/components/ResolveReportModal.vue'
import SafeMedia from '@/components/SafeMedia.vue'
import AdminMediaPreview from './AdminMediaPreview.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { badges } = useAdminContext()

// ── Reports ────────────────────────────────────────────────────────────
// `reports` holds "folders": one tile per (target_type, target_id), collapsing
// repeated complaints about the same post into a single card (grouped server-side).
const reports = ref<any[]>([])
const reportFilter = ref<'pending' | 'resolved' | 'dismissed' | ''>('')
const isLoadingReports = ref(false)
const expandedReportGroups = ref<Set<string>>(new Set())

const reportGroupKey = (folder: any) => `${folder.target_type}:${folder.target_id}`
const toggleReportGroup = (folder: any) => {
  const key = reportGroupKey(folder)
  if (expandedReportGroups.value.has(key)) expandedReportGroups.value.delete(key)
  else expandedReportGroups.value.add(key)
}

const fetchReports = async () => {
  isLoadingReports.value = true
  try {
    const res = await api.get('/admin/reports', { params: { status: reportFilter.value || undefined } })
    if (res.data.success) reports.value = res.data.data.reports
  } catch {} finally { isLoadingReports.value = false }
}

const resolveReportGroup = async (folder: any, status: 'resolved' | 'dismissed') => {
  try {
    const ids = folder.reports.filter((r: any) => r.status === 'pending').map((r: any) => r.id)
    if (!ids.length) return
    await api.patch('/admin/reports/resolve-batch', { ids, status })
    folder.status = status
    folder.reports.forEach((r: any) => { if (r.status === 'pending') r.status = status })
  } catch {}
}

// The only path that ever creates a warning from the reports queue — opens a modal
// where the moderator writes a reason (and optionally attaches evidence) before any
// content is removed or a warning is sent, so a warning is never issued without one.
const resolvingFolder = ref<any | null>(null)
const openResolveModal = (folder: any) => { resolvingFolder.value = folder }
const onFolderResolved = () => {
  if (!resolvingFolder.value) return
  const folder = resolvingFolder.value
  folder.status = 'resolved'
  folder.reports.forEach((r: any) => { if (r.status === 'pending') r.status = 'resolved' })
}

// Фото из всех жалоб папки, а не только из первой: каждый заявитель мог приложить свои
const folderEvidence = (folder: any): string[] =>
  [...new Set<string>(folder.reports.flatMap((r: any) => r.evidence_urls ?? []))]

// Оценка AutoMod: самая уверенная категория среди жалоб папки
const AI_CATEGORY_LABEL = computed<Record<string, string>>(() => ({
  spam: langStore.t.adminCategorySpam, toxic: langStore.t.adminCategoryToxic, duplicate: langStore.t.adminCategoryDuplicate,
  fraud: langStore.t.adminCategoryFraud, suspicious: langStore.t.adminCategorySuspicious, manual: langStore.t.adminCategoryManual,
}))
const folderAi = (folder: any) => {
  const best = [...folder.reports].filter((r: any) => r.ai_category && r.ai_score > 0).sort((a: any, b: any) => b.ai_score - a.ai_score)[0]
  return best ? { label: AI_CATEGORY_LABEL.value[best.ai_category] ?? best.ai_category, pct: Math.round(best.ai_score * 100) } : null
}

// Кто и как закрыл папку
const folderResolution = (folder: any) => folder.reports.find((r: any) => r.status !== 'pending' && r.resolver) ?? null

const openPostMedia = (images: string[], start: number) => { evidenceLightbox.value = { images, start } }

const REPORT_TARGET_LABEL = computed<Record<string, string>>(() => ({ post: langStore.t.adminReportTargetPost, group: langStore.t.adminReportTargetGroup, listing: langStore.t.adminReportTargetListing, message: langStore.t.messageBtn, user: langStore.t.viewProfile }))

// ── Warning appeals ────────────────────────────────────────────────────
const appeals = ref<any[]>([])
const isLoadingAppeals = ref(false)
const decidingAppealId = ref<string | null>(null)

const fetchAppeals = async () => {
  isLoadingAppeals.value = true
  try {
    const res = await api.get('/admin/appeals')
    if (res.data.success) appeals.value = res.data.data.appeals
  } catch {} finally { isLoadingAppeals.value = false }
}

const decideAppeal = async (logId: string, decision: 'accepted' | 'rejected') => {
  decidingAppealId.value = logId
  try {
    await api.patch(`/admin/appeals/${logId}`, { decision })
    appeals.value = appeals.value.filter((a: any) => a.id !== logId)
  } catch {} finally { decidingAppealId.value = null }
}

const evidenceLightbox = ref<{ images: string[]; start: number } | null>(null)

// Фото жалоб закрыты от прямого доступа: в просмотрщик отдаём blob-ссылки, недоступные файлы пропускаем
const openReportEvidence = async (urls: string[], start: number) => {
  const settled = await Promise.allSettled(urls.map((u) => fetchReportEvidence(u)))
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

const reportsViewMode = ref<'reports' | 'appeals'>('reports')
const switchReportsView = (mode: typeof reportsViewMode.value) => {
  reportsViewMode.value = mode
  if (mode === 'appeals' && !appeals.value.length) fetchAppeals()
}

onActivated(() => { if (!reports.value.length) fetchReports() })
watchEffect(() => { badges.reports = reports.value.filter((r: any) => r.status === 'pending').length })
</script>

<template>
  <div>
    <!-- Segmented toggle: user reports vs ban/freeze appeals (merged from the old separate tab) -->
    <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/4 w-fit">
      <button type="button" @click="switchReportsView('reports')"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="reportsViewMode === 'reports' ? 'bg-amber-500/20 text-amber-400' : 'text-white/40 hover:text-white/70'">
        <BIcon name="Flag" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavReports }}
      </button>
      <button type="button" @click="switchReportsView('appeals')"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="reportsViewMode === 'appeals' ? 'bg-violet-500/20 text-violet-400' : 'text-white/40 hover:text-white/70'">
        <BIcon name="Gavel" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavAppeals }}
        <span v-if="appeals.length" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          :class="reportsViewMode === 'appeals' ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-white/40'">{{ appeals.length }}</span>
      </button>
    </div>

    <template v-if="reportsViewMode === 'reports'">
    <!-- Filter pills -->
    <div class="flex gap-2 mb-5 flex-wrap">
      <button v-for="s in (['', 'pending', 'resolved', 'dismissed'] as const)" :key="s"
        @click="reportFilter = s; fetchReports()"
        class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
        :class="reportFilter === s
          ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent'
          : 'bg-brand-card border-brand-border text-white/40 hover:text-white/70'">
        {{ { '': langStore.t.tabAll, pending: langStore.t.reportStatusPending, resolved: langStore.t.reportStatusResolved, dismissed: langStore.t.reportStatusDismissed }[s] }}
      </button>
    </div>

    <div v-if="isLoadingReports" class="stack-y-3">
      <div v-for="n in 4" :key="n" class="h-24 rounded-2xl border border-brand-border bg-brand-card animate-pulse" />
    </div>
    <div v-else-if="reports.length === 0"
      class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
      <BIcon name="Flag" class="w-10 h-10 opacity-40" />
      <p class="text-sm font-semibold">{{ langStore.t.adminNoReports }}</p>
    </div>
    <div v-else class="stack-y-3">
      <div v-for="folder in reports" :key="reportGroupKey(folder)"
        class="rounded-2xl border border-brand-border bg-brand-card p-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0 flex-1">
            <!-- Tag pills -->
            <div class="flex items-center gap-1.5 mb-2 flex-wrap">
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/60">
                {{ REPORT_TARGET_LABEL[folder.target_type] ?? folder.target_type }}
              </span>
              <span v-if="folder.target_type === 'post' && folder.post?.is_nsfw"
                class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">NSFW</span>
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                :class="folder.status === 'pending'
                  ? 'bg-amber-500/15 text-amber-400'
                  : folder.status === 'resolved'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-white/5 text-white/30'">
                {{ { pending: langStore.t.reportStatusPending, resolved: langStore.t.reportStatusResolved, dismissed: langStore.t.reportStatusDismissed }[folder.status as 'pending' | 'resolved' | 'dismissed'] }}
              </span>
              <span v-if="folderAi(folder)"
                class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300" title="AutoMod">
                AI: {{ folderAi(folder)!.label }} {{ folderAi(folder)!.pct }}%
              </span>
              <span v-if="folder.target_type === 'post' && folder.post?.deleted_at"
                class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/50">{{ langStore.t.adminReportedPostDeleted }}</span>
              <span v-if="folder.count > 1"
                class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400"
                :title="`${folder.count} ${langStore.t.adminSameTargetReportsTooltip}`">
                ×{{ folder.count }}
              </span>
            </div>

            <!-- Title = complaint reason -->
            <p class="font-bold text-white">{{ folder.reports[0].reason }}</p>

            <!-- Что именно оспаривают: превью поста / профиля / группы -->
            <div v-if="folder.target_type === 'post'" class="mt-3 flex gap-3 rounded-xl border border-white/8 bg-white/3 p-2.5 max-w-xl">
              <template v-if="folder.post">
                <button v-if="folder.post.media_urls?.length" type="button" @click="openPostMedia(folder.post.media_urls, 0)"
                  class="relative w-20 h-20 rounded-lg overflow-hidden bg-black/20 shrink-0"
                  :class="{ 'blur-sm hover:blur-none transition': folder.post.is_nsfw }">
                  <AdminMediaPreview :src="folder.post.media_urls[0]" />
                  <span v-if="folder.post.media_urls.length > 1"
                    class="absolute bottom-1 right-1 flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-black/65 text-white">
                    <BIcon name="Images" class="w-2.5 h-2.5" /> {{ folder.post.media_urls.length }}
                  </span>
                </button>
                <div class="min-w-0 flex-1">
                  <p class="text-[11px] font-semibold text-white/50 truncate">{{ folder.post.author?.display_name || folder.post.author?.username }}
                    <span class="text-white/25">@{{ folder.post.author?.username }}</span></p>
                  <p class="text-xs text-white/70 line-clamp-3 break-words mt-0.5" :class="{ 'italic text-white/30': !folder.post.content }">{{ folder.post.content || langStore.t.adminReportNoText }}</p>
                  <router-link :to="`/post/${folder.target_id}`" target="_blank"
                    class="inline-flex items-center gap-1 text-[11px] font-bold text-brand-accent hover:underline mt-1">
                    <BIcon name="ExternalLink" class="w-3 h-3" /> {{ langStore.t.adminOpenPostBtn }}
                  </router-link>
                </div>
              </template>
              <p v-else class="text-xs text-white/35 italic">{{ langStore.t.adminReportedPostDeleted }}</p>
            </div>
            <router-link v-else-if="folder.target_type === 'user' && folder.reportedUser" :to="`/profile/${folder.reportedUser.username}`" target="_blank"
              class="mt-3 flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/3 p-2.5 max-w-xs hover:border-brand-accent/30 transition-colors">
              <img v-if="folder.reportedUser.avatar_url" :src="folder.reportedUser.avatar_url" class="w-9 h-9 rounded-full object-cover shrink-0" />
              <span v-else class="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-xs font-bold text-white/40 shrink-0">{{ (folder.reportedUser.display_name || folder.reportedUser.username || '?')[0].toUpperCase() }}</span>
              <span class="min-w-0 text-xs font-bold text-white/70 truncate">{{ folder.reportedUser.display_name || folder.reportedUser.username }}
                <span class="font-normal text-white/30">@{{ folder.reportedUser.username }}</span></span>
            </router-link>
            <router-link v-else-if="folder.target_type === 'group' && folder.reportedGroup" :to="`/groups/${folder.reportedGroup.slug}`" target="_blank"
              class="mt-3 flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/3 p-2.5 max-w-xs hover:border-brand-accent/30 transition-colors">
              <img v-if="folder.reportedGroup.avatar_url" :src="folder.reportedGroup.avatar_url" class="w-9 h-9 rounded-xl object-cover shrink-0" />
              <span v-else class="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-xs font-bold text-white/40 shrink-0">{{ (folder.reportedGroup.name || '?')[0].toUpperCase() }}</span>
              <span class="min-w-0 text-xs font-bold text-white/70 truncate">{{ folder.reportedGroup.name }}</span>
            </router-link>

            <!-- Evidence attached by the reporter -->
            <div v-if="folderEvidence(folder).length" class="flex gap-2 mt-2 flex-wrap">
              <button v-for="(url, ei) in folderEvidence(folder)" :key="ei" type="button"
                @click="openReportEvidence(folderEvidence(folder), ei)"
                class="w-14 h-14 rounded-lg overflow-hidden border border-white/8 shrink-0">
                <SafeMedia :src="url" source="report-evidence" class="w-full h-full object-cover" />
              </button>
            </div>

            <!-- Subtitle: reporter + target -->
            <p class="text-xs text-white/40 mt-1">
              {{ langStore.t.adminReportFromPrefix }} <span class="font-semibold text-white/60">{{ folder.reports[0].reporter?.display_name || folder.reports[0].reporter?.username }}</span>
              {{ langStore.t.adminReportOnPrefix }} {{ (REPORT_TARGET_LABEL[folder.target_type] ?? folder.target_type).toLowerCase() }}
              <router-link v-if="folder.target_type === 'post' && folder.post" :to="`/post/${folder.target_id}`" target="_blank" class="font-semibold text-brand-accent hover:underline">@{{ folder.post.author?.username }}</router-link>
              <router-link v-else-if="folder.target_type === 'user' && folder.reportedUser" :to="`/profile/${folder.reportedUser.username}`" target="_blank" class="font-semibold text-brand-accent hover:underline">@{{ folder.reportedUser.username }}</router-link>
              <router-link v-else-if="folder.target_type === 'group' && folder.reportedGroup" :to="`/groups/${folder.reportedGroup.slug}`" target="_blank" class="font-semibold text-brand-accent hover:underline">{{ folder.reportedGroup.name }}</router-link>
              <span v-else class="font-semibold text-white/50">{{ folder.target_id.slice(0, 8) }}…</span>
              · {{ formatDate(folder.created_at) }}
            </p>

            <p v-if="folderResolution(folder)" class="text-[11px] text-white/35 mt-1">
              {{ langStore.t.adminReportResolvedByPrefix }} <span class="font-semibold text-white/55">@{{ folderResolution(folder).resolver.username }}</span><template v-if="folderResolution(folder).note"> — {{ folderResolution(folder).note }}</template>
            </p>

            <button v-if="folder.count > 1" @click="toggleReportGroup(folder)"
              class="text-[11px] font-bold text-brand-accent/80 hover:text-brand-accent mt-1.5 transition-colors">
              {{ expandedReportGroups.has(reportGroupKey(folder)) ? langStore.t.adminHideLabel : langStore.t.adminShowAllReports }} ({{ folder.count }})
            </button>
            <Transition name="filter-expand">
              <div v-if="folder.count > 1 && expandedReportGroups.has(reportGroupKey(folder))"
                class="mt-2 stack-y-1.5 border-t border-brand-border pt-2 max-h-40 overflow-y-auto">
                <p v-for="r in folder.reports" :key="r.id" class="text-xs text-white/50">
                  {{ r.reason }}
                  <span class="text-white/25">— @{{ r.reporter?.username }} · {{ formatDate(r.created_at) }}</span>
                </p>
              </div>
            </Transition>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 shrink-0">
            <button @click="openResolveModal(folder)" :disabled="folder.status !== 'pending'"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <BIcon name="TriangleAlert" class="w-3.5 h-3.5" /> {{ langStore.t.adminResolveProblemBtn }}
            </button>
            <button @click="resolveReportGroup(folder, 'dismissed')" :disabled="folder.status !== 'pending'"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminRejectBtn }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ResolveReportModal v-if="resolvingFolder" :folder="resolvingFolder"
      @close="resolvingFolder = null" @resolved="onFolderResolved" />
    </template>

    <template v-else>
    <div v-if="isLoadingAppeals" class="stack-y-3">
      <div v-for="n in 3" :key="n" class="h-28 rounded-2xl border border-brand-border bg-brand-card animate-pulse" />
    </div>
    <div v-else-if="appeals.length === 0"
      class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
      <BIcon name="Gavel" class="w-10 h-10 opacity-40" />
      <p class="text-sm font-semibold">{{ langStore.t.adminNoAppealsPending }}</p>
    </div>
    <div v-else class="stack-y-3">
      <div v-for="a in appeals" :key="a.id" class="rounded-2xl border border-brand-border bg-brand-card p-4">
        <div class="flex items-start gap-3">
          <img v-if="a.user?.avatar_url" :src="a.user.avatar_url" class="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" />
          <div v-else class="w-9 h-9 rounded-full border border-violet-500/20 bg-violet-500/10 flex items-center justify-center text-xs font-bold text-violet-400 shrink-0">
            {{ (a.user?.display_name || a.user?.username || '?')[0].toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-sm text-white truncate">{{ a.user?.display_name || a.user?.username }} <span class="text-white/30 font-normal">@{{ a.user?.username }}</span></p>
            <p class="text-xs text-white/40 mt-1"><span class="font-bold text-amber-400">{{ langStore.t.adminWarnReasonLabel }}</span> {{ a.reason }}</p>
            <img v-if="a.image_url" :src="a.image_url" class="mt-2 max-h-32 rounded-xl border border-white/10 object-cover" />
            <p class="text-xs text-white/60 mt-2 bg-white/3 border border-white/8 rounded-xl p-2.5"><span class="font-bold text-violet-400">{{ langStore.t.adminAppealLabel }}</span> {{ a.appeal_text }}</p>
            <p class="text-[11px] text-white/25 mt-1.5">{{ formatDate(a.appeal_created_at) }}</p>
          </div>
          <div class="flex flex-col gap-2 shrink-0">
            <button @click="decideAppeal(a.id, 'accepted')" :disabled="decidingAppealId === a.id"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 transition-all">
              <BIcon name="Check" class="w-3.5 h-3.5" /> {{ langStore.t.adminAcceptBtn }}
            </button>
            <button @click="decideAppeal(a.id, 'rejected')" :disabled="decidingAppealId === a.id"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/40 hover:text-white disabled:opacity-30 transition-all">
              <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminRejectBtn }}
            </button>
          </div>
        </div>
      </div>
    </div>
    </template>

  <PostLightbox v-if="evidenceLightbox"
    :images="evidenceLightbox.images"
    :start-index="evidenceLightbox.start"
    @close="evidenceLightbox = null"
  />
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
