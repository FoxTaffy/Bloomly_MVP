<script setup lang="ts">
import { ref, computed, watchEffect, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const { confirmDialog } = useConfirm()
const { badges } = useAdminContext()

// ── Notifications / broadcasts ───────────────────────────────────────────
const broadcasts = ref<any[]>([])
const isLoadingBroadcasts = ref(false)
const broadcastTitle = ref('')
const broadcastBody = ref('')
const broadcastAudience = ref<'all' | 'premium' | 'new' | 'staff'>('all')
const isSendingBroadcast = ref(false)

const fetchBroadcasts = async () => {
  isLoadingBroadcasts.value = true
  try {
    const res = await api.get('/admin/broadcasts')
    if (res.data.success) broadcasts.value = res.data.data.broadcasts
  } catch {} finally { isLoadingBroadcasts.value = false }
}

const AUDIENCE_LABEL = computed<Record<string, string>>(() => ({ all: langStore.t.adminAudienceAll, premium: langStore.t.adminAudiencePremium, new: langStore.t.adminAudienceNew, staff: langStore.t.adminAudienceStaff }))

const sendBroadcast = async () => {
  if (!broadcastTitle.value.trim() || !broadcastBody.value.trim() || isSendingBroadcast.value) return
  isSendingBroadcast.value = true
  try {
    const res = await api.post('/admin/broadcasts', { title: broadcastTitle.value.trim(), body: broadcastBody.value.trim(), audience: broadcastAudience.value })
    if (res.data.success) {
      broadcasts.value.unshift({ ...res.data.data.broadcast, opens: 0 })
      broadcastTitle.value = ''
      broadcastBody.value = ''
    }
  } catch {} finally { isSendingBroadcast.value = false }
}

// ── Bloomly Updates ───────────────────────────────────────────────────────────
const updates = ref<any[]>([])
const isLoadingUpdates = ref(false)
const newUpdateTitle = ref('')
const newUpdateBody = ref('')
const newUpdateImageUrl = ref('')
const isSavingUpdate = ref(false)

const fetchUpdates = async () => {
  isLoadingUpdates.value = true
  try {
    const res = await api.get('/updates/all')
    if (res.data.success) updates.value = res.data.data.updates
  } catch {} finally { isLoadingUpdates.value = false }
}

const createUpdate = async () => {
  if (!newUpdateTitle.value.trim() || isSavingUpdate.value) return
  isSavingUpdate.value = true
  try {
    const res = await api.post('/updates', {
      title: newUpdateTitle.value.trim(),
      body: newUpdateBody.value.trim() || undefined,
      image_url: newUpdateImageUrl.value.trim() || undefined,
    })
    if (res.data.success) {
      updates.value.unshift(res.data.data.update)
      newUpdateTitle.value = ''
      newUpdateBody.value = ''
      newUpdateImageUrl.value = ''
    }
  } catch {} finally { isSavingUpdate.value = false }
}

const deleteUpdate = async (id: string) => {
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteUpdate, { danger: true }))) return
  try {
    await api.delete(`/updates/${id}`)
    updates.value = updates.value.filter(u => u.id !== id)
  } catch {}
}

const toggleUpdate = async (id: string, is_active: boolean) => {
  try {
    const res = await api.patch(`/updates/${id}/toggle`, { is_active })
    if (res.data.success) {
      const u = updates.value.find(u => u.id === id)
      if (u) u.is_active = res.data.data.update.is_active
    }
  } catch {}
}

// Two views: changelog posts, or push broadcasts
const commsViewMode = ref<'updates' | 'broadcasts'>('updates')
const switchCommsView = (mode: typeof commsViewMode.value) => {
  commsViewMode.value = mode
  if (mode === 'broadcasts' && !broadcasts.value.length) fetchBroadcasts()
}

onActivated(() => { if (!updates.value.length) fetchUpdates() })
watchEffect(() => { badges.updates = updates.value.filter((u: any) => u.is_active).length })
</script>

<template>
  <div class="stack-y-6">

    <!-- Segmented toggle: changelog updates vs push broadcasts (merged from the old separate tab) -->
    <div class="flex items-center gap-2 p-1 rounded-2xl bg-white/4 w-fit">
      <button type="button" @click="switchCommsView('updates')"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="commsViewMode === 'updates' ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/40 hover:text-white/70'">
        <BIcon name="Sparkles" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavUpdates }}
      </button>
      <button type="button" @click="switchCommsView('broadcasts')"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="commsViewMode === 'broadcasts' ? 'bg-violet-500/20 text-violet-400' : 'text-white/40 hover:text-white/70'">
        <BIcon name="Send" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavBroadcasts }}
      </button>
    </div>

    <template v-if="commsViewMode === 'updates'">

    <!-- Create form -->
    <div class="relative rounded-3xl border border-brand-border p-6 stack-y-4 overflow-hidden" style="background:#1F223C">
      <div class="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-20 pointer-events-none"
        style="background:radial-gradient(circle,#7c3aed,transparent 70%)" />
      <div class="flex items-center gap-3 mb-2 relative">
        <div class="w-9 h-9 rounded-xl bg-linear-to-br/srgb from-[#4C67CF] to-[#7c3aed] flex items-center justify-center shrink-0 shadow-lg shadow-[#4C67CF]/20">
          <span class="text-white font-black text-sm select-none">B</span>
        </div>
        <h3 class="font-extrabold text-white">{{ langStore.t.adminNewUpdateTitle }}</h3>
        <span class="text-xs text-white/30 ml-auto flex items-center gap-1">
          <BIcon name="Sparkles" class="w-3.5 h-3.5" /> {{ langStore.t.adminUpdateShownFirstHint }}
        </span>
      </div>

      <input
        v-model="newUpdateTitle"
        class="adm-input relative"
        :placeholder="langStore.t.adminUpdateTitlePlaceholderExample"
        maxlength="120"
      />
      <textarea
        v-model="newUpdateBody"
        class="adm-input resize-none relative"
        rows="3"
        :placeholder="langStore.t.adminUpdateBodyPlaceholder"
        maxlength="800"
      />
      <div v-if="newUpdateImageUrl" class="relative flex items-center gap-3 p-3 bg-white/5 border border-white/8 rounded-2xl">
        <img :src="newUpdateImageUrl" class="w-20 h-12 object-cover rounded-xl shrink-0 border border-white/10" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-white/70">{{ langStore.t.adminCoverUploadedLabel }}</p>
          <p class="text-[10px] text-white/30 truncate mt-0.5">{{ newUpdateImageUrl }}</p>
        </div>
        <button type="button" @click="newUpdateImageUrl = ''"
          class="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center shrink-0 transition-colors">
          <BIcon name="X" class="w-3.5 h-3.5" />
        </button>
      </div>
      <MediaUpload v-else type="banners" accept="image/*" @uploaded="(urls) => newUpdateImageUrl = urls[0] ?? ''" />
      <button
        @click="createUpdate"
        :disabled="!newUpdateTitle.trim() || isSavingUpdate"
        class="relative flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40 shadow-lg shadow-[#4C67CF]/20"
        style="background:linear-gradient(135deg,#4C67CF,#7c3aed)"
      >
        <BIcon v-if="isSavingUpdate" name="Loader2" class="w-4 h-4 animate-spin" />
        <BIcon v-else name="Send" class="w-4 h-4" />
        <span v-if="isSavingUpdate">{{ langStore.t.adminPublishingLabel }}</span>
        <span v-else>{{ langStore.t.adminPublishUpdateBtn }}</span>
      </button>
    </div>

    <!-- Updates list -->
    <div v-if="isLoadingUpdates" class="flex items-center justify-center py-16">
      <BIcon name="Loader2" class="w-8 h-8 text-white/30 animate-spin" />
    </div>
    <div v-else-if="updates.length === 0" class="flex flex-col items-center gap-4 py-20 text-white/25 rounded-3xl border border-brand-border" style="background:#1F223C">
      <BIcon name="Megaphone" class="w-12 h-12 opacity-30" />
      <p class="text-sm font-semibold">{{ langStore.t.adminNoUpdatesYet }}</p>
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="u in updates"
        :key="u.id"
        class="relative rounded-3xl border overflow-hidden transition-all group"
        :class="u.is_active ? 'border-brand-accent/25 hover:border-brand-accent/45' : 'border-brand-border opacity-55 hover:opacity-80'"
        style="background:#1F223C"
      >
        <!-- Cover banner -->
        <div class="relative h-28 w-full overflow-hidden shrink-0">
          <img v-if="u.image_url" :src="u.image_url"
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
          <div v-else class="w-full h-full flex items-center justify-center relative overflow-hidden"
            style="background:linear-gradient(135deg,#4C67CF,#7c3aed)">
            <span class="text-white/25 font-black text-7xl select-none absolute -right-2 -bottom-4">B</span>
            <BIcon name="Sparkles" class="w-8 h-8 text-white/70 relative" />
          </div>
          <div class="absolute inset-0 bg-linear-to-t/srgb from-black/85 via-black/10 to-transparent" />
          <span class="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full backdrop-blur-xs"
            :class="u.is_active ? 'bg-emerald-500/85 text-white' : 'bg-white/15 text-white/70'">
            <span class="w-1.5 h-1.5 rounded-full" :class="u.is_active ? 'bg-white' : 'bg-white/50'" />
            {{ u.is_active ? langStore.t.adminActiveShort : langStore.t.adminHiddenShort }}
          </span>
          <p class="absolute bottom-2.5 left-4 right-4 font-extrabold text-white text-sm truncate drop-shadow-sm">{{ u.title }}</p>
        </div>

        <!-- Content -->
        <div class="p-4 flex flex-col gap-3">
          <p v-if="u.body" class="text-xs text-white/50 line-clamp-2">{{ u.body }}</p>
          <div class="flex items-center justify-between gap-2 pt-1">
            <span class="text-[11px] text-white/25 flex items-center gap-1">
              <BIcon name="Clock" class="w-3 h-3" /> {{ formatDate(u.created_at) }}
            </span>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                @click="toggleUpdate(u.id, !u.is_active)"
                class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                :class="u.is_active
                  ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                  : 'bg-white/6 text-white/40 hover:bg-white/10'"
              >
                {{ u.is_active ? langStore.t.adminActiveShort : langStore.t.adminHiddenShort }}
              </button>
              <button
                @click="deleteUpdate(u.id)"
                class="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center justify-center"
                :title="langStore.t.deleteBtn"
              >
                <BIcon name="Trash2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    </template>

    <template v-else>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminNewBroadcastTitle }}</h3>
        <div class="stack-y-3">
          <input v-model="broadcastTitle" :placeholder="langStore.t.adminNotificationTitlePlaceholder" class="adm-input" />
          <textarea v-model="broadcastBody" :placeholder="langStore.t.adminMessageTextPlaceholder" class="adm-input resize-none h-28" />
          <select v-model="broadcastAudience" class="adm-input">
            <option value="all">{{ langStore.t.adminAudienceAll }}</option>
            <option value="premium">{{ langStore.t.adminAudiencePremium }}</option>
            <option value="new">{{ langStore.t.adminAudienceNew }}</option>
            <option value="staff">{{ langStore.t.adminAudienceStaff }}</option>
          </select>
          <button @click="sendBroadcast" :disabled="isSendingBroadcast || !broadcastTitle.trim() || !broadcastBody.trim()"
            class="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
            style="background:linear-gradient(135deg,#4C67CF,#8b5cf6)">
            <BIcon name="Send" class="w-4 h-4" /> {{ isSendingBroadcast ? langStore.t.adminSendingLabel : langStore.t.adminSendBroadcastBtn }}
          </button>
        </div>
      </div>

      <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminBroadcastHistoryTitle }}</h3>
        <div v-if="isLoadingBroadcasts" class="stack-y-3">
          <div v-for="n in 3" :key="n" class="h-12 rounded-xl bg-white/5 animate-pulse" />
        </div>
        <div v-else-if="!broadcasts.length" class="text-xs text-white/25 text-center py-10">{{ langStore.t.adminNoBroadcastsYet }}</div>
        <div v-else class="divide-y divide-brand-border -mx-1">
          <div v-for="b in broadcasts" :key="b.id" class="py-3 px-1">
            <p class="font-bold text-sm text-white">{{ b.title }}</p>
            <p class="text-xs text-white/40 mt-0.5">{{ AUDIENCE_LABEL[b.audience] ?? b.audience }} · {{ formatDate(b.created_at) }} · {{ b.recipient_count }} {{ langStore.t.adminRecipientsSuffix }} · {{ b.opens }} {{ langStore.t.adminOpensSuffix }}</p>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
