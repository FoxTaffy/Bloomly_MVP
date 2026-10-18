<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import { formatDate } from './adminHelpers'

const langStore = useLangStore()
const { confirmDialog } = useConfirm()

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

onActivated(() => { if (!broadcasts.value.length) fetchBroadcasts() })
</script>

<template>
  <div class="stack-y-6">

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
  </div>
</template>
