<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import { formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()

// ── Logs & Settings ───────────────────────────────────────────────────────
const siteSettings = ref<Record<string, boolean> | null>(null)
const isLoadingSettings = ref(false)
const auditLogs = ref<any[]>([])
const isLoadingAuditLogs = ref(false)

const SETTING_META = computed<{ key: 'open_registration' | 'automod_enabled' | 'maintenance_mode'; label: string; desc: string }[]>(() => [
  { key: 'open_registration', label: langStore.t.adminSettingOpenRegistration, desc: langStore.t.adminSettingOpenRegistrationDesc },
  { key: 'automod_enabled',   label: langStore.t.adminSettingAutoModAI,        desc: langStore.t.adminSettingAutoModAIDesc },
  { key: 'maintenance_mode',  label: langStore.t.adminSettingMaintenanceMode,  desc: langStore.t.adminSettingMaintenanceModeDesc },
])

const fetchSettingsAndLogs = async () => {
  isLoadingSettings.value = true
  isLoadingAuditLogs.value = true
  try {
    const [s, l] = await Promise.all([
      api.get('/admin/settings'),
      api.get('/admin/automod/logs', { params: { page: 1 } }),
    ])
    if (s.data.success) siteSettings.value = s.data.data.settings
    if (l.data.success) auditLogs.value = l.data.data.logs
  } catch {} finally { isLoadingSettings.value = false; isLoadingAuditLogs.value = false }
}

const toggleSetting = async (key: string) => {
  if (!siteSettings.value) return
  const next = !siteSettings.value[key]
  siteSettings.value[key] = next // optimistic
  try {
    const res = await api.patch('/admin/settings', { key, value: next })
    if (res.data.success) siteSettings.value = res.data.data.settings
    fetchSettingsAndLogs()
  } catch {
    siteSettings.value![key] = !next // revert
  }
}

const AUDIT_ACTION_ICON: Record<string, string> = {
  ban: 'Ban', unban: 'ShieldCheck', freeze: 'Snowflake', unfreeze: 'Unlock',
  warn: 'TriangleAlert', clear_warns: 'CheckCircle2', delete_post: 'Trash2',
  pin_post: 'Pin', unpin_post: 'Pin', role_change: 'UserCog', subscription_change: 'Sparkles',
  resolve_report: 'CheckCircle2', dismiss_report: 'X', approve_ad: 'Megaphone', reject_ad: 'Megaphone',
  activate_banner: 'Image', deactivate_banner: 'Image', settings_change: 'Settings',
  verify_profile: 'BadgeCheck', reject_verification: 'BadgeCheck',
}
const AUDIT_ACTION_LABEL = computed<Record<string, (l: any) => string>>(() => ({
  ban: (l) => `${langStore.t.auditActionBan} @${l.user?.username}`,
  unban: (l) => `${langStore.t.auditActionUnban} @${l.user?.username}`,
  freeze: (l) => `${langStore.t.auditActionFreeze} @${l.user?.username}`,
  unfreeze: (l) => `${langStore.t.auditActionUnfreeze} @${l.user?.username}`,
  warn: (l) => `${langStore.t.auditActionWarn} @${l.user?.username}`,
  clear_warns: (l) => `${langStore.t.auditActionClearWarns} @${l.user?.username}`,
  delete_post: (l) => `${langStore.t.auditActionDeletePost} @${l.user?.username}`,
  pin_post: (l) => `${langStore.t.auditActionPinPost} @${l.user?.username}`,
  unpin_post: (l) => `${langStore.t.auditActionUnpinPost} @${l.user?.username}`,
  role_change: (l) => `${langStore.t.auditActionRoleChange} @${l.user?.username}`,
  subscription_change: (l) => `${langStore.t.auditActionSubscriptionChange} @${l.user?.username}`,
  resolve_report: () => langStore.t.auditActionResolveReport,
  dismiss_report: () => langStore.t.auditActionDismissReport,
  approve_ad: () => langStore.t.auditActionApproveAd,
  reject_ad: () => langStore.t.auditActionRejectAd,
  activate_banner: () => langStore.t.auditActionActivateBanner,
  deactivate_banner: () => langStore.t.auditActionDeactivateBanner,
  settings_change: (l) => l.reason,
  verify_profile: (l) => `${langStore.t.auditActionVerifyProfile} @${l.user?.username}`,
  reject_verification: (l) => `${langStore.t.auditActionRejectVerification} @${l.user?.username}`,
}))
const auditActionText = (l: any) => (AUDIT_ACTION_LABEL.value[l.action] ?? (() => l.reason))(l)
const auditActorName = (l: any) => l.actor ? (l.actor.display_name || l.actor.username) : 'AutoMod'

onActivated(fetchSettingsAndLogs)
</script>

<template>
  <div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="rounded-2xl border border-brand-border bg-brand-card p-5 h-fit">
        <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminPlatformSettingsTitle }}</h3>
        <div v-if="isLoadingSettings" class="space-y-3">
          <div v-for="n in 3" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
        </div>
        <div v-else-if="siteSettings" class="space-y-4">
          <div v-for="s in SETTING_META" :key="s.key" class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-bold text-white">{{ s.label }}</p>
              <p class="text-xs text-white/40 mt-0.5">{{ s.desc }}</p>
            </div>
            <button @click="toggleSetting(s.key)" class="w-11 h-6 rounded-full flex-shrink-0 transition-all relative"
              :class="siteSettings[s.key] ? 'bg-brand-accent' : 'bg-white/10'">
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" :class="siteSettings[s.key] ? 'left-[22px]' : 'left-0.5'" />
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminAuditLogTitle }}</h3>
        <div v-if="isLoadingAuditLogs" class="space-y-3">
          <div v-for="n in 5" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
        </div>
        <div v-else-if="!auditLogs.length" class="text-xs text-white/25 text-center py-10">{{ langStore.t.adminNoActionsYet }}</div>
        <div v-else class="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          <div v-for="l in auditLogs" :key="l.id" class="flex items-start gap-3">
            <div class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
              <BIcon :name="AUDIT_ACTION_ICON[l.action] ?? 'Activity'" class="w-3.5 h-3.5 text-white/50" />
            </div>
            <div class="min-w-0">
              <p class="text-sm text-white/80"><span class="font-bold text-white">{{ auditActorName(l) }}</span> {{ auditActionText(l) }}</p>
              <p class="text-[11px] text-white/30 mt-0.5">{{ formatDate(l.created_at) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
