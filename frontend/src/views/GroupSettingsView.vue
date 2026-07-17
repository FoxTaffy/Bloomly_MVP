<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import SoonBadge from '@/components/groups/SoonBadge.vue'
import ImageCropModal from '@/components/shared/ImageCropModal.vue'
import { useGroupsStore, type GroupMember, type CustomRole } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useShopStore } from '@/stores/shop'
import { useNsfwMode } from '@/composables/useNsfwMode'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const shopStore = useShopStore()

const nsfwMode = useNsfwMode().nsfwEnabled
const activeNav = ref('groups')
const saving = ref(false)

const group = computed(() => groupsStore.currentGroup)
const isOwner = computed(() => group.value?.owner_id === authStore.user?.id)
// Admin (not owner) gets most of the settings page, minus finance/danger/promote-to-admin.
const isAdmin = computed(() => {
  if (isOwner.value || !group.value) return false
  return groupsStore.myGroups.some(m => m.group_id === group.value!.id && m.role === 'admin')
})

// ── Toast ───────────────────────────────────────────────────────────────────
const toast = reactive({ show: false, type: 'success' as 'success' | 'error', message: '' })
let toastTimer = 0
function showToast(type: 'success' | 'error', message: string) {
  clearTimeout(toastTimer)
  Object.assign(toast, { show: true, type, message })
  toastTimer = window.setTimeout(() => { toast.show = false }, 3500)
}

// ── Shake / unsaved warning state ───────────────────────────────────────────
const shaking = ref(false)
const unsavedWarning = ref(false)

// ── Sections (colored, with iconPath like SettingsProfileView) ──────────────
const baseSections = [
  { id: 'sec-general',    label: 'Основные',     color: '#60a5fa', iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'sec-appearance', label: 'Внешний вид',  color: '#f59e0b', iconPath: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'sec-content',    label: 'Контент',       color: '#a78bfa', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
]

const eventSections = [
  { id: 'sec-event',      label: 'Мероприятие',   color: '#34d399', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'sec-organizers', label: 'Организаторы',  color: '#38bdf8', iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', hidden: true },
  { id: 'sec-tickets',    label: 'Билеты',         color: '#a78bfa', iconPath: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
  { id: 'sec-soon',       label: 'SOON Беджи',      color: '#fbbf24', iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { id: 'sec-finance',    label: 'Финансы',         color: '#10b981', iconPath: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
]

const creativeSections = [
  { id: 'sec-commissions', label: 'Заказы',       color: '#f472b6', iconPath: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { id: 'sec-prices',      label: 'Прайс',        color: '#34d399', iconPath: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
]

const shopSections = [
  { id: 'sec-prices',     label: 'Каталог',       color: '#34d399', iconPath: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
]

const tailSections = [
  { id: 'sec-donations',  label: 'Монетизация',   color: '#10b981', iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { id: 'sec-members',    label: 'Команда',       color: '#a78bfa', iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'sec-roles',      label: 'Роли',          color: '#f59e0b', iconPath: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', hidden: true },
  { id: 'sec-social',     label: 'Ссылки',        color: '#38bdf8', iconPath: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' },
  { id: 'sec-customize',  label: 'Кастомизация',   color: '#a78bfa', iconPath: 'M4.098 19.902', hidden: true },
  { id: 'sec-danger',     label: 'Опасная зона',  color: '#ef4444', iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
]

// teamTab: internal tabs for the merged Команда section
const teamTab = ref<'members' | 'roles' | 'organizers'>('members')

// ── Navigation search ───────────────────────────────────────────────────
const settingsSearch = ref('')
const filteredNavSections = computed(() => {
  const q = settingsSearch.value.trim().toLowerCase()
  if (!q) return sections.value
  return sections.value.filter((s: any) => s.label.toLowerCase().includes(q))
})

// Finance/danger settings are owner-only — an admin managing day-to-day operations
// never sees or touches donations, bank card, member-visibility or group deletion.
const OWNER_ONLY_SECTIONS = new Set(['sec-finance', 'sec-donations', 'sec-danger'])

const sections = computed(() => {
  let s = [...baseSections]
  if (group.value?.type === 'event') s.push(...eventSections.filter((x: any) => !x.hidden))
  if (group.value?.type === 'creative') s.push(...creativeSections)
  if (group.value?.type === 'shop') s.push(...shopSections)
  s.push(...tailSections.filter((x: any) => !x.hidden))
  if (!isOwner.value) s = s.filter((x: any) => !OWNER_ONLY_SECTIONS.has(x.id))
  return s
})

// ── Active section ──────────────────────────────────────────────────────────
const openSection = ref<string>('sec-general')

// ── Members management ──────────────────────────────────────────────────────
const MEMBER_ROLES = [
  { value: 'admin',         label: 'Администратор',  color: '#3b82f6',  iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { value: 'moderator',     label: 'Модератор',       color: '#a78bfa', iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { value: 'member',        label: 'Участник',         color: '#9ca3af', iconPath: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { value: 'dealer',        label: 'Дилер',            color: '#34d399', iconPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
  { value: 'volunteer',     label: 'Волонтёр',         color: '#fb923c', iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { value: 'guest_of_honor',label: 'Почётный гость',  color: '#fbbf24', iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
]
// Only the owner may hand out the admin role — an admin managing roles can only grant
// moderator and below, so they can never create a peer admin.
const assignableRoles = computed(() => isOwner.value ? MEMBER_ROLES : MEMBER_ROLES.filter(r => r.value !== 'admin'))
const ROLE_META: Record<string, { label: string; color: string; iconPath: string }> = {
  owner:          { label: 'Владелец',        color: '#f59e0b', iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  admin:          { label: 'Администратор',   color: '#3b82f6', iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  moderator:      { label: 'Модератор',        color: '#a78bfa', iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  member:         { label: 'Участник',          color: '#9ca3af', iconPath: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  dealer:         { label: 'Дилер',             color: '#34d399', iconPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
  volunteer:      { label: 'Волонтёр',          color: '#fb923c', iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  guest_of_honor: { label: 'Почётный гость',   color: '#fbbf24', iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
}
const membersList = ref<GroupMember[]>([])
const membersLoading = ref(false)
const membersLoaded = ref(false)
const roleDropdownFor = ref<string | null>(null)
const memberSaving = ref<Record<string, boolean>>({})
const memberKicking = ref<Record<string, boolean>>({})

function toggleHideMember(userId: string) {
  const idx = form.hiddenMemberIds.indexOf(userId)
  if (idx >= 0) form.hiddenMemberIds.splice(idx, 1)
  else form.hiddenMemberIds.push(userId)
}

async function loadMembers() {
  if (!group.value?.id) return
  membersLoading.value = true
  try {
    membersList.value = await groupsStore.fetchMembers(group.value.id)
    membersLoaded.value = true
  } catch { /* ignore */ } finally {
    membersLoading.value = false
  }
}

async function doSetRole(userId: string, role: string) {
  if (!group.value?.id) return
  memberSaving.value[userId] = true
  roleDropdownFor.value = null
  try {
    const updated = await groupsStore.changeMemberRole(group.value.id, userId, role as any)
    const idx = membersList.value.findIndex(m => m.user_id === userId)
    if (idx !== -1) membersList.value[idx] = { ...membersList.value[idx], role: updated.role }
    showToast('success', 'Роль обновлена')
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message || e.message || 'Ошибка')
  } finally {
    delete memberSaving.value[userId]
  }
}

async function doKickMember(userId: string) {
  if (!group.value?.id) return
  memberKicking.value[userId] = true
  try {
    await groupsStore.removeMember(group.value.id, userId)
    membersList.value = membersList.value.filter(m => m.user_id !== userId)
    showToast('success', 'Участник удалён')
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message || e.message || 'Ошибка')
  } finally {
    delete memberKicking.value[userId]
  }
}

watch(openSection, (val) => {
  if ((val === 'sec-members' || val === 'sec-organizers') && !membersLoaded.value) loadMembers()
  if (val === 'sec-roles' && !customRolesLoaded.value) loadCustomRoles()
  if (val === 'sec-customize') shopStore.loadMyItems()
})

function getShopItemBgUrl(item: import('@/stores/shop').ShopItem): string {
  const data = item.content_data as Record<string, unknown>
  return String(data?.url || item.preview_url || '')
}

const sortedMembers = computed(() => {
  const ORDER: Record<string, number> = { owner: 0, admin: 1, moderator: 2, dealer: 3, volunteer: 4, guest_of_honor: 5, member: 99 }
  return [...membersList.value].sort((a, b) => (ORDER[a.role] ?? 50) - (ORDER[b.role] ?? 50))
})

// ── Role dropdown (fixed positioning to escape overflow-hidden) ─────────────
const dropdownY = ref(0)
const dropdownX = ref(0)

const DROPDOWN_WIDTH = 224 // w-56
const DROPDOWN_MAX_HEIGHT = 340

function openRoleDropdown(event: MouseEvent, userId: string) {
  if (roleDropdownFor.value === userId) {
    roleDropdownFor.value = null
    return
  }
  const btn = event.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()

  // Clamp horizontally so the menu's right edge never lands past the viewport edge
  // and its left edge never goes negative (e.g. narrow viewports, buttons near an edge).
  const right = Math.min(Math.max(rect.right, DROPDOWN_WIDTH + 8), window.innerWidth - 8)
  dropdownX.value = right

  // Flip above the button if there isn't enough room below.
  const fitsBelow = rect.bottom + 8 + DROPDOWN_MAX_HEIGHT <= window.innerHeight
  dropdownY.value = fitsBelow
    ? rect.bottom + 8
    : Math.max(8, rect.top - DROPDOWN_MAX_HEIGHT - 8)

  roleDropdownFor.value = userId
}

const roleDropdownMember = computed(() => membersList.value.find(m => m.user_id === roleDropdownFor.value) ?? null)

function closeRoleDropdown() { roleDropdownFor.value = null }

// ── Custom Roles ─────────────────────────────────────────────────────────────
const customRolesList   = ref<CustomRole[]>([])
const customRolesLoading = ref(false)
const customRolesLoaded  = ref(false)
const customRoleSaving   = ref(false)
const deletingRoleId     = ref<string | null>(null)
const showRoleModal      = ref(false)
const roleModalMode      = ref<'create' | 'edit'>('create')
const editingRoleId      = ref<string | null>(null)
const roleForm           = reactive({ name: '', color: '#a78bfa', icon: '🎖️', permissions: [] as string[] })

const PERMISSIONS_LIST = [
  { id: 'can_post',            label: 'Создавать посты',            iconPath: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', group: 'Контент' },
  { id: 'can_comment',         label: 'Комментировать',             iconPath: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', group: 'Контент' },
  { id: 'can_invite',          label: 'Приглашать участников',      iconPath: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', group: 'Участники' },
  { id: 'can_moderate_posts',  label: 'Удалять посты/комментарии', iconPath: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16', group: 'Модерация' },
  { id: 'can_manage_members',  label: 'Управлять участниками',      iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', group: 'Управление' },
  { id: 'can_manage_events',   label: 'Управлять событиями',        iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', group: 'Управление' },
  { id: 'can_manage_roles',    label: 'Управлять ролями',           iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', group: 'Управление' },
  { id: 'can_manage_settings', label: 'Изменять настройки группы',  iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', group: 'Управление' },
]

const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner:     ['can_post', 'can_comment', 'can_invite', 'can_moderate_posts', 'can_manage_members', 'can_manage_events', 'can_manage_roles', 'can_manage_settings'],
  admin:     ['can_post', 'can_comment', 'can_invite', 'can_moderate_posts', 'can_manage_members', 'can_manage_events', 'can_manage_roles', 'can_manage_settings'],
  moderator: ['can_post', 'can_comment', 'can_invite', 'can_moderate_posts'],
  member:    ['can_post', 'can_comment'],
}

const EMOJI_OPTIONS = ['🎖️', '⭐', '🌟', '💫', '🔥', '❄️', '🎨', '🎭', '🦸', '🛡️', '⚔️', '🔑', '💎', '🏆', '🎯', '🌸', '🦊', '🐺', '🐲', '🦋', '🌈', '🎪', '🚀', '💜', '🎵']

async function loadCustomRoles() {
  if (!group.value?.id) return
  customRolesLoading.value = true
  try {
    customRolesList.value = await groupsStore.fetchCustomRoles(group.value.id)
    customRolesLoaded.value = true
  } catch { } finally { customRolesLoading.value = false }
}

function openCreateRole() {
  roleModalMode.value = 'create'
  editingRoleId.value = null
  Object.assign(roleForm, { name: '', color: '#a78bfa', icon: '🎖️', permissions: [] })
  showRoleModal.value = true
}

function openEditRole(role: CustomRole) {
  roleModalMode.value = 'edit'
  editingRoleId.value = role.id
  Object.assign(roleForm, { name: role.name, color: role.color, icon: role.icon, permissions: [...role.permissions] })
  showRoleModal.value = true
}

function togglePermission(p: string) {
  const idx = roleForm.permissions.indexOf(p)
  if (idx === -1) roleForm.permissions.push(p)
  else roleForm.permissions.splice(idx, 1)
}

async function saveRole() {
  if (!group.value?.id || !roleForm.name.trim()) return
  customRoleSaving.value = true
  try {
    const payload = { name: roleForm.name.trim(), color: roleForm.color, icon: roleForm.icon, permissions: roleForm.permissions }
    if (roleModalMode.value === 'create') {
      const r = await groupsStore.createCustomRole(group.value.id, payload)
      customRolesList.value.push(r)
    } else if (editingRoleId.value) {
      const r = await groupsStore.updateCustomRole(group.value.id, editingRoleId.value, payload)
      const idx = customRolesList.value.findIndex(x => x.id === editingRoleId.value)
      if (idx !== -1) customRolesList.value[idx] = r
    }
    showRoleModal.value = false
    showToast('success', roleModalMode.value === 'create' ? 'Роль создана' : 'Роль обновлена')
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message || 'Ошибка сохранения роли')
  } finally { customRoleSaving.value = false }
}

async function confirmDeleteRole(roleId: string) {
  if (!group.value?.id) return
  deletingRoleId.value = roleId
  try {
    await groupsStore.deleteCustomRole(group.value.id, roleId)
    customRolesList.value = customRolesList.value.filter(r => r.id !== roleId)
    showToast('success', 'Роль удалена')
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message || 'Ошибка')
  } finally { deletingRoleId.value = null }
}

// ── SOON badge management state ─────────────────────────────────────────────
const soonBadgesLoaded = ref(false)
const soonBadgesLoading = ref(false)
const eventSoonMap = ref<Record<string, any[]>>({}) // eventId → soonBadges[]

// Per-event edit state: { shortCode, status, saving, saved }
const soonEditMap = ref<Record<string, { shortCode: string; status: string; saving: boolean; saved: boolean }>>({})

const EVENT_STATUSES = [
  { value: 'teaser',       label: 'Скоро анонс',      color: '#9ca3af', icon: '🌫️' },
  { value: 'announced',    label: 'Анонсировано',     color: '#60a5fa', icon: '📣' },
  { value: 'tickets_open', label: 'Билеты открыты',  color: '#34d399', icon: '🎟️' },
  { value: 'sold_out',     label: 'Распродано',       color: '#f87171', icon: '🔥' },
  { value: 'active',       label: 'Идёт сейчас',      color: '#fbbf24', icon: '⚡' },
  { value: 'finished',     label: 'Завершено',         color: '#6b7280', icon: '✅' },
]

function computeEventStatus(ev: any): string {
  const now = new Date()
  const starts = ev.starts_at ? new Date(ev.starts_at) : null
  const ends   = ev.ends_at   ? new Date(ev.ends_at)   : null
  const tiers  = ev.ticket_tiers ?? ev.ticketTiers ?? []
  const hasSaleOpen = tiers.some((t: any) => {
    const ss = t.sale_starts_at ? new Date(t.sale_starts_at) : null
    const se = t.sale_ends_at   ? new Date(t.sale_ends_at)   : null
    return (!ss || ss <= now) && (!se || se >= now)
  })
  const allSoldOut = tiers.length > 0 && tiers.every((t: any) => {
    const sold  = t.sold_count  ?? 0
    const total = t.total_count ?? Infinity
    return sold >= total
  })
  if (ends   && now > ends)   return 'finished'
  if (starts && now >= starts) return 'active'
  if (allSoldOut) return 'sold_out'
  if (hasSaleOpen) return 'tickets_open'
  if (starts) {
    const daysToStart = (starts.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return daysToStart > 120 ? 'teaser' : 'announced'
  }
  return 'announced'
}

function suggestShortCode(title: string): string {
  if (!title) return ''
  // 1. Multi-word: first letters
  const words = title.trim().split(/[\s\-_]+/).filter(Boolean)
  if (words.length > 1) {
    return words.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  }
  // 2. CamelCase: split at uppercase boundaries
  const camel = title.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ').filter(Boolean)
  if (camel.length > 1) {
    return camel.map(w => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  }
  // 3. Single word: first letter + consonants at 1/3 and 2/3 positions
  const s = title.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s) return ''
  if (s.length <= 4) return s
  const VOWELS = new Set(['A','E','I','O','U'])
  const result: string[] = [s[0]]
  const checkPositions = [Math.floor(s.length / 3), Math.floor(2 * s.length / 3)]
  for (const pos of checkPositions) {
    let found = ''
    for (let d = 0; d <= 3 && !found; d++) {
      if (pos + d < s.length && !VOWELS.has(s[pos + d])) { found = s[pos + d]; break }
      if (pos - d >= 0 && !VOWELS.has(s[pos - d])) { found = s[pos - d]; break }
    }
    if (found && !result.includes(found)) result.push(found)
  }
  return result.slice(0, 4).join('')
}

async function loadSoonBadges() {
  if (soonBadgesLoaded.value) return
  soonBadgesLoading.value = true
  try {
    const events = (group.value as any)?.events ?? []
    const results = await Promise.all(
      events.map((ev: any) =>
        api.get(`/groups/events/${ev.id}`)
          .then((r: any) => ({ eventId: ev.id, badges: r.data?.data?.event?.soonBadges ?? [], event: r.data?.data?.event }))
          .catch(() => ({ eventId: ev.id, badges: [], event: null }))
      )
    )
    for (const { eventId, badges, event } of results) {
      eventSoonMap.value[eventId] = badges
      // init edit state from loaded event data
      if (event && !soonEditMap.value[eventId]) {
        soonEditMap.value[eventId] = {
          shortCode: event.short_code ?? '',
          status: event.status ?? 'announced',
          saving: false,
          saved: false,
        }
      }
    }
    // init any events not yet in edit map from group data
    for (const ev of events) {
      if (!soonEditMap.value[ev.id]) {
        soonEditMap.value[ev.id] = {
          shortCode: ev.short_code ?? '',
          status: ev.status ?? 'announced',
          saving: false,
          saved: false,
        }
      }
    }
    soonBadgesLoaded.value = true
  } finally {
    soonBadgesLoading.value = false
  }
}

async function saveSoonEvent(eventId: string) {
  const edit = soonEditMap.value[eventId]
  if (!edit || edit.saving) return
  edit.saving = true
  edit.saved = false
  try {
    const code = edit.shortCode.trim().toUpperCase()
    if (!code) { showToast('error', 'Введите код бейджа'); return }
    await api.patch(`/groups/events/${eventId}`, {
      shortCode: code,
    })
    edit.shortCode = code
    edit.saved = true
    // refresh group in store to reflect new short_code etc.
    await groupsStore.loadGroup((group.value as any).slug ?? (group.value as any).id)
    // refresh badges
    soonBadgesLoaded.value = false
    await loadSoonBadges()
    showToast('success', 'Мероприятие обновлено')
    setTimeout(() => { if (soonEditMap.value[eventId]) soonEditMap.value[eventId].saved = false }, 2000)
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message || 'Ошибка сохранения')
  } finally {
    if (soonEditMap.value[eventId]) soonEditMap.value[eventId].saving = false
  }
}

async function toggleSoonVisibility(eventId: string) {
  await groupsStore.toggleSoonBadgeVisibility(eventId)
  soonBadgesLoaded.value = false
  await loadSoonBadges()
}
function openSec(id: string) {
  openSection.value = id
  if (id === 'sec-soon') loadSoonBadges()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const form = reactive({
  name: '',
  slug: '',
  description: '',
  aboutText: '',
  accentColor: '#4C67CF',
  isPublic: true,
  isNsfw: false,
  rulesText: '',
  faq: [] as { q: string; a: string }[],
  contactPhone: '',
  contactEmail: '',
  schedule: [] as { time: string; label: string }[],
  whatToBring: [] as string[],
  productionTime: '',
  deliveryInfo: '',
  completedWorks: 0,
  guaranteeText: '',
  socialTelegram: '',
  socialDiscord: '',
  socialTwitter: '',
  socialVk: '',
  socialWebsite: '',
  category: '',
  hideAdmins: false,
  hiddenMemberIds: [] as string[],
  groupBgUrl: '',
  groupFrame: '',
  groupTheme: '',
  donationsEnabled: false,
  bankCardMasked: '',
  supportTiers: [] as Array<{ emoji: string; name: string; price: string; desc: string }>,
  businessEnabled: false,
})

// Slug: авто-санитизация ввода
watch(() => form.slug, (v) => {
  const clean = v.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60)
  if (clean !== v) form.slug = clean
})

const settingsSlugError = computed((): string | null => {
  const s = form.slug
  if (!s) return null
  if (s.length < 3) return 'Минимум 3 символа'
  if (/^[-_]/.test(s)) return 'Нельзя начинать с дефиса или подчёркивания'
  if (/[-_]$/.test(s)) return 'Нельзя заканчивать на дефис или подчёркивание'
  if (/[-_]{2,}/.test(s)) return 'Нельзя ставить два -- или __ подряд'
  return null
})

const savedForm = reactive({
  name: '', slug: '', description: '', aboutText: '', accentColor: '#4C67CF',
  isPublic: true, isNsfw: false, rulesText: '',
  faq: [] as { q: string; a: string }[],
  contactPhone: '', contactEmail: '',
  schedule: [] as { time: string; label: string }[],
  whatToBring: [] as string[],
  productionTime: '', deliveryInfo: '', completedWorks: 0, guaranteeText: '',
  socialTelegram: '', socialDiscord: '', socialTwitter: '', socialVk: '', socialWebsite: '',
  category: '',
  hideAdmins: false,
  hiddenMemberIds: [] as string[],
  groupBgUrl: '',
  groupFrame: '',
  groupTheme: '',
  donationsEnabled: false,
  bankCardMasked: '',
  supportTiers: [] as Array<{ emoji: string; name: string; price: string; desc: string }>,
  businessEnabled: false,
})

function snapshotToSaved() {
  Object.assign(savedForm, {
    name: form.name, slug: form.slug, description: form.description, aboutText: form.aboutText,
    accentColor: form.accentColor, isPublic: form.isPublic, isNsfw: form.isNsfw, rulesText: form.rulesText,
    faq: JSON.parse(JSON.stringify(form.faq)),
    contactPhone: form.contactPhone, contactEmail: form.contactEmail,
    schedule: JSON.parse(JSON.stringify(form.schedule)),
    whatToBring: [...form.whatToBring],
    productionTime: form.productionTime, deliveryInfo: form.deliveryInfo,
    completedWorks: form.completedWorks, guaranteeText: form.guaranteeText,
    socialTelegram: form.socialTelegram, socialDiscord: form.socialDiscord,
    socialTwitter: form.socialTwitter, socialVk: form.socialVk, socialWebsite: form.socialWebsite,
    category: form.category,
    hideAdmins: form.hideAdmins,
    hiddenMemberIds: [...form.hiddenMemberIds],
    groupBgUrl: form.groupBgUrl,
    groupFrame: form.groupFrame,
    groupTheme: form.groupTheme,
    donationsEnabled: form.donationsEnabled,
    bankCardMasked: form.bankCardMasked,
    supportTiers: JSON.parse(JSON.stringify(form.supportTiers)),
    businessEnabled: form.businessEnabled,
  })
}

function resetForm() {
  Object.assign(form, {
    name: savedForm.name, slug: savedForm.slug, description: savedForm.description, aboutText: savedForm.aboutText,
    accentColor: savedForm.accentColor, isPublic: savedForm.isPublic, isNsfw: savedForm.isNsfw, rulesText: savedForm.rulesText,
    faq: JSON.parse(JSON.stringify(savedForm.faq)),
    contactPhone: savedForm.contactPhone, contactEmail: savedForm.contactEmail,
    schedule: JSON.parse(JSON.stringify(savedForm.schedule)),
    whatToBring: [...savedForm.whatToBring],
    productionTime: savedForm.productionTime, deliveryInfo: savedForm.deliveryInfo,
    completedWorks: savedForm.completedWorks, guaranteeText: savedForm.guaranteeText,
    socialTelegram: savedForm.socialTelegram, socialDiscord: savedForm.socialDiscord,
    socialTwitter: savedForm.socialTwitter, socialVk: savedForm.socialVk, socialWebsite: savedForm.socialWebsite,
    category: savedForm.category,
    hideAdmins: savedForm.hideAdmins,
    hiddenMemberIds: [...savedForm.hiddenMemberIds],
    groupBgUrl: savedForm.groupBgUrl,
    groupFrame: savedForm.groupFrame,
    groupTheme: savedForm.groupTheme,
    donationsEnabled: savedForm.donationsEnabled,
    bankCardMasked: savedForm.bankCardMasked,
    supportTiers: JSON.parse(JSON.stringify(savedForm.supportTiers)),
    businessEnabled: savedForm.businessEnabled,
  })
  avatarOriginalSrc.value = ''
  bannerOriginalSrc.value = ''
}

const isDirty = computed(() => {
  return (
    form.name !== savedForm.name || form.description !== savedForm.description ||
    form.aboutText !== savedForm.aboutText || form.accentColor !== savedForm.accentColor ||
    form.isPublic !== savedForm.isPublic || form.isNsfw !== savedForm.isNsfw ||
    form.rulesText !== savedForm.rulesText || form.contactPhone !== savedForm.contactPhone ||
    form.contactEmail !== savedForm.contactEmail || form.productionTime !== savedForm.productionTime ||
    form.deliveryInfo !== savedForm.deliveryInfo || form.completedWorks !== savedForm.completedWorks ||
    form.guaranteeText !== savedForm.guaranteeText ||
    form.socialTelegram !== savedForm.socialTelegram || form.socialDiscord !== savedForm.socialDiscord ||
    form.socialTwitter !== savedForm.socialTwitter || form.socialVk !== savedForm.socialVk ||
    form.socialWebsite !== savedForm.socialWebsite || form.category !== savedForm.category ||
    form.groupBgUrl !== savedForm.groupBgUrl || form.groupFrame !== savedForm.groupFrame ||
    form.groupTheme !== savedForm.groupTheme || form.hideAdmins !== savedForm.hideAdmins ||
    JSON.stringify(form.hiddenMemberIds) !== JSON.stringify(savedForm.hiddenMemberIds) ||
    JSON.stringify(form.faq) !== JSON.stringify(savedForm.faq) ||
    JSON.stringify(form.schedule) !== JSON.stringify(savedForm.schedule) ||
    JSON.stringify(form.whatToBring) !== JSON.stringify(savedForm.whatToBring) ||
    form.donationsEnabled !== savedForm.donationsEnabled ||
    form.bankCardMasked !== savedForm.bankCardMasked ||
    JSON.stringify(form.supportTiers) !== JSON.stringify(savedForm.supportTiers) ||
    form.businessEnabled !== savedForm.businessEnabled
  )
})

// Commission form
const commForm = ref({
  status: 'closed' as 'open' | 'closed' | 'waitlist',
  currency: 'USD',
  maxQueue: 5,
  rushSlots: 0,
  rushMax: 0,
  turnaroundDays: '',
  tosText: '',
  basePrices: {} as Record<string, number>,
  priceList: [] as { name: string; price: number; description: string }[],
})

// ── Donations card linking ────────────────────────────────────────────────────
const cardInputRaw = ref('')
const cardExpInput = ref('')
const showCardForm = ref(false)

function formatSettingsCard(e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 16)
  cardInputRaw.value = raw.replace(/(.{4})/g, '$1 ').trim()
}
function formatSettingsExp(e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4)
  cardExpInput.value = raw.length > 2 ? raw.slice(0, 2) + '/' + raw.slice(2) : raw
}
function linkCard() {
  const digits = cardInputRaw.value.replace(/\s/g, '')
  if (digits.length !== 16 || cardExpInput.value.length !== 5) return
  const last4 = digits.slice(-4)
  form.bankCardMasked = `**** **** **** ${last4}`
  cardInputRaw.value = ''
  cardExpInput.value = ''
  showCardForm.value = false
}
function unlinkCard() {
  form.bankCardMasked = ''
  form.donationsEnabled = false
}

// ── Ticket Tiers ─────────────────────────────────────────────────────────────
const ticketSaving = ref(false)
const ticketError = ref('')
const showNewTierForm = ref<string | null>(null) // eventId for which form is open
const editingTier = ref<string | null>(null) // tierId being edited
const newTierForm = reactive({ name: '', price: 0, currency: 'RUB', totalCount: 100, saleStartsAt: '', saleEndsAt: '' })
const editTierForm = reactive({ name: '', price: 0, currency: 'RUB', totalCount: 100, saleStartsAt: '', saleEndsAt: '' })

function openNewTierForm(eventId: string) {
  showNewTierForm.value = eventId
  editingTier.value = null
  Object.assign(newTierForm, { name: '', price: 0, currency: 'RUB', totalCount: 100, saleStartsAt: '', saleEndsAt: '' })
}

function openEditTierForm(tier: any) {
  editingTier.value = tier.id
  showNewTierForm.value = null
  Object.assign(editTierForm, {
    name: tier.name,
    price: parsed(tier.price),
    currency: tier.currency,
    totalCount: tier.total_count,
    saleStartsAt: tier.sale_starts_at ? tier.sale_starts_at.substring(0, 16) : '',
    saleEndsAt: tier.sale_ends_at ? tier.sale_ends_at.substring(0, 16) : '',
  })
}

function parsed(v: any) { return typeof v === 'string' ? parseFloat(v) || 0 : (v ?? 0) }

async function saveNewTier(eventId: string) {
  if (!newTierForm.name.trim()) return
  ticketSaving.value = true; ticketError.value = ''
  try {
    const tier = await groupsStore.createTicketTier(eventId, {
      name: newTierForm.name.trim(),
      price: newTierForm.price,
      currency: newTierForm.currency,
      totalCount: newTierForm.totalCount,
      saleStartsAt: newTierForm.saleStartsAt || undefined,
      saleEndsAt: newTierForm.saleEndsAt || undefined,
    })
    // Inject tier into the local group events
    if (group.value) {
      const ev = (group.value as any).events?.find((e: any) => e.id === eventId)
      if (ev) { if (!ev.tickets) ev.tickets = []; ev.tickets.push(tier) }
    }
    showNewTierForm.value = null
    showToast('success', 'Билет добавлен')
  } catch (e: any) { ticketError.value = e.message || 'Ошибка' }
  finally { ticketSaving.value = false }
}

async function saveEditTier(tierId: string, eventId: string) {
  if (!editTierForm.name.trim()) return
  ticketSaving.value = true; ticketError.value = ''
  try {
    const updated = await groupsStore.updateTicketTier(tierId, {
      name: editTierForm.name.trim(),
      price: editTierForm.price,
      currency: editTierForm.currency,
      totalCount: editTierForm.totalCount,
      saleStartsAt: editTierForm.saleStartsAt || null,
      saleEndsAt: editTierForm.saleEndsAt || null,
    })
    // Update local tier data
    if (group.value) {
      const ev = (group.value as any).events?.find((e: any) => e.id === eventId)
      if (ev?.tickets) {
        const idx = ev.tickets.findIndex((t: any) => t.id === tierId)
        if (idx !== -1) ev.tickets[idx] = { ...ev.tickets[idx], ...updated }
      }
    }
    editingTier.value = null
    showToast('success', 'Билет обновлён')
  } catch (e: any) { ticketError.value = e.message || 'Ошибка' }
  finally { ticketSaving.value = false }
}

async function deleteTier(tierId: string, eventId: string) {
  if (!confirm('Удалить этот тип билета?')) return
  try {
    await groupsStore.deleteTicketTier(tierId)
    if (group.value) {
      const ev = (group.value as any).events?.find((e: any) => e.id === eventId)
      if (ev?.tickets) ev.tickets = ev.tickets.filter((t: any) => t.id !== tierId)
    }
    showToast('success', 'Билет удалён')
  } catch (e: any) { showToast('error', e.message || 'Ошибка') }
}

// File inputs
const avatarInput = ref<HTMLInputElement | null>(null)
const bannerInput = ref<HTMLInputElement | null>(null)
const avatarPreview = ref('')
const bannerPreview = ref('')
const avatarOriginalSrc = ref('')
const bannerOriginalSrc = ref('')

const presetColors = ['#4C67CF', '#66C770', '#E14664', '#FFC01F', '#CD83F5', '#E76F51', '#F7A9E2', '#00D4AA', '#FF6B6B', '#A855F7']

// ── Crop Modal ──────────────────────────────────────────────────────────────
const cropModal = reactive({
  show: false,
  type: 'avatar' as 'avatar' | 'banner',
  src: '',
})
const cropUploading = ref(false)

function openCrop(file: File, type: 'avatar' | 'banner') {
  const reader = new FileReader()
  reader.onload = (e) => {
    const src = e.target!.result as string
    if (type === 'avatar') avatarOriginalSrc.value = src
    else bannerOriginalSrc.value = src
    cropModal.src = src
    cropModal.type = type
    cropModal.show = true
  }
  reader.readAsDataURL(file)
}

async function reopenCrop(type: 'avatar' | 'banner') {
  const localSrc = type === 'avatar' ? avatarOriginalSrc.value : bannerOriginalSrc.value
  if (localSrc) {
    cropModal.src = localSrc
    cropModal.type = type
    cropModal.show = true
    return
  }
  const url = type === 'avatar' ? avatarPreview.value : bannerPreview.value
  if (!url) return
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    openCrop(new File([blob], 'image.jpg', { type: blob.type }), type)
  } catch {
    cropModal.src = url
    cropModal.type = type
    cropModal.show = true
  }
}

async function confirmCrop({ blob }: { blob: Blob; rel: { x: number; y: number; w: number; h: number } }) {
  cropUploading.value = true
  const type = cropModal.type
  try {
    const fd = new FormData()
    fd.append('file', blob, type === 'avatar' ? 'avatar.jpg' : 'banner.jpg')
    const result = await api.post(
      `/media/upload?folder=${type === 'avatar' ? 'avatars' : 'banners'}`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    const url = result.data.data.url
    if (type === 'avatar') {
      avatarPreview.value = url
      if (group.value) await groupsStore.updateGroup(group.value.id, { avatarUrl: url })
    } else {
      bannerPreview.value = url
      if (group.value) await groupsStore.updateGroup(group.value.id, { bannerUrl: url })
    }
    cropModal.show = false
  } catch (err) {
    console.error(err)
  } finally {
    cropUploading.value = false
  }
}

function cancelCrop() { cropModal.show = false }

// ── Load ────────────────────────────────────────────────────────────────────
async function load() {
  await groupsStore.loadGroup(route.params.slugOrId as string)
  if (!group.value) return
  const g = group.value as any
  form.name = g.name || ''
  form.slug = g.slug || ''
  form.description = g.description || ''
  form.aboutText = g.about_text || ''
  form.accentColor = g.accent_color || '#4C67CF'
  form.isPublic = g.is_public ?? true
  form.isNsfw = g.is_nsfw ?? false
  form.rulesText = g.rules_text || ''
  form.faq = Array.isArray(g.faq) ? [...g.faq] : []
  form.contactPhone = g.contact_phone || ''
  form.contactEmail = g.contact_email || ''
  form.schedule = Array.isArray(g.schedule) ? [...g.schedule] : []
  form.whatToBring = Array.isArray(g.what_to_bring) ? [...g.what_to_bring] : []
  form.productionTime = g.production_time || ''
  form.deliveryInfo = g.delivery_info || ''
  form.completedWorks = g.completed_works || 0
  form.guaranteeText = g.guarantee_text || ''
  avatarPreview.value = g.avatar_url || ''
  bannerPreview.value = g.banner_url || ''
  const sl = (g.social_links || {}) as Record<string, string>
  form.socialTelegram = sl.telegram || ''
  form.socialDiscord = sl.discord || ''
  form.socialTwitter = sl.twitter || ''
  form.socialVk = sl.vk || ''
  form.socialWebsite = sl.website || ''
  form.category = g.category || ''
  form.groupBgUrl = g.group_bg_url || ''
  form.groupFrame = g.group_frame || ''
  form.groupTheme = g.group_theme || ''
  form.hideAdmins = g.hide_admins ?? false
  form.hiddenMemberIds = JSON.parse(g.hidden_member_ids || '[]')
  form.donationsEnabled = (g as any).donations_enabled ?? false
  form.bankCardMasked = (g as any).bank_card_masked || ''
  form.supportTiers = Array.isArray((g as any).support_tiers) ? (g as any).support_tiers : []
  form.businessEnabled = (g as any).business_enabled ?? false
  if (g.commissionInfo) {
    const c = g.commissionInfo
    commForm.value.status = c.status || 'closed'
    commForm.value.currency = c.currency || 'USD'
    commForm.value.maxQueue = c.max_queue || 5
    commForm.value.rushSlots = c.rush_slots || 0
    commForm.value.rushMax = c.rush_max || 0
    commForm.value.turnaroundDays = c.turnaround_days || ''
    commForm.value.tosText = c.tos_text || ''
    commForm.value.basePrices = { ...(c.base_prices || {}) }
    commForm.value.priceList = Array.isArray(c.price_list) ? [...c.price_list] : []
  }
  snapshotToSaved()
}
onMounted(async () => {
  await load()
  const sec = route.query.section as string | undefined
  if (sec && sections.value.some(s => s.id === sec)) openSec(sec)
})

// ── File handlers (open crop instead of direct upload) ──────────────────────
function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  openCrop(file, 'avatar')
  if (avatarInput.value) avatarInput.value.value = ''
}
function onBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  openCrop(file, 'banner')
  if (bannerInput.value) bannerInput.value.value = ''
}

// ── FAQ helpers ─────────────────────────────────────────────────────────────
function addFaq() { form.faq.push({ q: '', a: '' }) }
function removeFaq(i: number) { form.faq.splice(i, 1) }

// ── Schedule helpers ────────────────────────────────────────────────────────
function addSchedule() { form.schedule.push({ time: '', label: '' }) }
function removeSchedule(i: number) { form.schedule.splice(i, 1) }

// ── What to bring helpers ───────────────────────────────────────────────────
const newBringItem = ref('')
function addBringItem() {
  if (newBringItem.value.trim()) {
    form.whatToBring.push(newBringItem.value.trim())
    newBringItem.value = ''
  }
}
function removeBringItem(i: number) { form.whatToBring.splice(i, 1) }

// ── Price list helpers ──────────────────────────────────────────────────────
function addPriceItem() { commForm.value.priceList.push({ name: '', price: 0, description: '' }) }
function removePriceItem(i: number) { commForm.value.priceList.splice(i, 1) }

const basePriceKeys = ['headshot', 'halfbody', 'fullbody', 'ref_sheet']
const basePriceLabels: Record<string, string> = { headshot: 'Хэдшот', halfbody: 'Полтела', fullbody: 'В полный рост', ref_sheet: 'Рефшит' }

// ── Save ────────────────────────────────────────────────────────────────────
async function save() {
  if (!group.value) return
  saving.value = true
  const oldSlug = (group.value as any).slug
  const newSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  form.slug = newSlug || oldSlug
  try {
    const socialLinks: Record<string, string> = {}
    if (form.socialTelegram.trim()) socialLinks.telegram = form.socialTelegram.trim()
    if (form.socialDiscord.trim()) socialLinks.discord = form.socialDiscord.trim()
    if (form.socialTwitter.trim()) socialLinks.twitter = form.socialTwitter.trim()
    if (form.socialVk.trim()) socialLinks.vk = form.socialVk.trim()
    if (form.socialWebsite.trim()) socialLinks.website = form.socialWebsite.trim()
    await groupsStore.updateGroup(group.value.id, {
      name: form.name,
      slug: form.slug,
      description: form.description,
      aboutText: form.aboutText,
      accentColor: form.accentColor,
      isPublic: form.isPublic,
      isNsfw: form.isNsfw,
      rulesText: form.rulesText,
      faq: form.faq.filter((f: { q: string; a: string }) => f.q.trim()),
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail,
      schedule: form.schedule.filter((s: { time: string; label: string }) => s.time.trim()),
      whatToBring: form.whatToBring.filter(Boolean),
      socialLinks,
      productionTime: form.productionTime,
      deliveryInfo: form.deliveryInfo,
      completedWorks: form.completedWorks,
      guaranteeText: form.guaranteeText,
      category: form.category || undefined,
      groupBgUrl: form.groupBgUrl || undefined,
      groupFrame: form.groupFrame || undefined,
      groupTheme: form.groupTheme || undefined,
      // Finance/member-visibility fields are owner-only server-side — an admin's save must
      // omit them entirely, otherwise the backend rejects the whole request.
      ...(isOwner.value ? {
        hideAdmins: form.hideAdmins,
        hiddenMemberIds: form.hiddenMemberIds,
        donationsEnabled: form.donationsEnabled,
        bankCardMasked: form.bankCardMasked || null,
        businessEnabled: form.businessEnabled,
      } : {}),
      supportTiers: form.supportTiers.filter((t: { name: string }) => t.name.trim()),
    })
    if (group.value.type === 'creative') {
      await groupsStore.updateCommission(group.value.id, {
        status: commForm.value.status,
        currency: commForm.value.currency,
        maxQueue: commForm.value.maxQueue,
        rushSlots: commForm.value.rushSlots,
        rushMax: commForm.value.rushMax,
        turnaroundDays: commForm.value.turnaroundDays,
        tosText: commForm.value.tosText,
        basePrices: commForm.value.basePrices,
        priceList: commForm.value.priceList.filter((p: { name: string }) => p.name.trim()),
      })
    }
    snapshotToSaved()
    showToast('success', 'Настройки группы сохранены!')
    // If slug changed, navigate to new URL
    if (form.slug !== oldSlug) {
      await router.replace({ name: 'group-settings', params: { slugOrId: form.slug } })
    }
  } catch (err) {
    showToast('error', 'Ошибка сохранения')
  } finally { saving.value = false }
}

// ── Delete ──────────────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
async function deleteGroup() {
  if (!group.value) return
  await groupsStore.deleteGroup(group.value.id)
  router.push({ name: 'groups' })
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">

    <!-- ─── Toast notification ──────────────────────────────────────── -->
    <Transition name="toast">
      <div v-if="toast.show"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border backdrop-blur-lg pointer-events-none"
        :class="toast.type === 'success' ? 'bg-brand-success/10 border-brand-success/30 text-brand-success' : 'bg-brand-error/10 border-brand-error/30 text-brand-error'">
        <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        {{ toast.message }}
      </div>
    </Transition>

    <!-- ─── Floating save/reset bar (dirty) ──────────────────────────── -->
    <Transition name="floatbar">
      <div v-if="isDirty"
        class="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl border transition-all"
        :class="[shaking ? 'animate-shake' : '', unsavedWarning ? 'bg-brand-error/15 border-brand-error/40 shadow-brand-error/20' : 'bg-brand-card/90 border-brand-border backdrop-blur-xl']">
        <div class="px-3 py-1.5 flex items-center gap-2" :class="unsavedWarning ? 'text-brand-error' : 'text-white/55'">
          <div class="w-2 h-2 rounded-full animate-pulse" :class="unsavedWarning ? 'bg-brand-error' : 'bg-amber-400'"></div>
          <span class="text-xs font-bold">{{ unsavedWarning ? 'Не сохранено!' : 'Есть изменения' }}</span>
        </div>
        <button type="button" @click="resetForm"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-white/55 hover:text-white hover:bg-white/10 border border-transparent hover:border-brand-border">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Сбросить
        </button>
        <button type="button" @click="save" :disabled="saving"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 shadow-lg"
          :style="unsavedWarning ? 'background:#ef4444;box-shadow:0 4px 20px rgba(239,68,68,0.4)' : `background:${form.accentColor};box-shadow:0 4px 20px ${form.accentColor}44`">
          <span v-if="saving" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          {{ saving ? 'Сохранение…' : 'Сохранить' }}
        </button>
      </div>
    </Transition>

    <!-- ═══════ CROP MODAL ═══════ -->
    <ImageCropModal
      :show="cropModal.show"
      :src="cropModal.src"
      :type="cropModal.type"
      :accent-color="form.accentColor"
      :uploading="cropUploading"
      @cancel="cancelCrop"
      @confirm="confirmCrop"
    />

    <AppHeader v-model:nsfwMode="nsfwMode" />
    <input ref="avatarInput" type="file" accept="image/*" class="sr-only" @change="onAvatarChange" />
    <input ref="bannerInput" type="file" accept="image/*" class="sr-only" @change="onBannerChange" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-28 md:pb-10">
      <AppSidebar v-model:activeNav="activeNav" />

      <!-- ─── Settings area ────────────────────────────────────────── -->
      <main class="flex-1 min-w-0">
        <button class="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors"
          @click="router.push({ name: 'group-detail', params: { slugOrId: (group as any)?.slug ?? route.params.slugOrId } })">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Назад к группе
        </button>

        <div v-if="!group" class="text-center py-16">
          <div class="h-8 w-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>

        <template v-else-if="isOwner || isAdmin">
          <div class="flex flex-row-reverse gap-6 items-start">

            <!-- ── Right sticky sidebar ──────────────────────────────── -->
            <aside class="w-56 hidden xl:flex flex-col gap-3 sticky top-24 self-start flex-shrink-0">

              <!-- Mini group preview card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                <div class="h-16 relative"
                  :style="bannerPreview ? `background-image:url(${bannerPreview});background-size:cover;background-position:center` : `background:linear-gradient(135deg,${form.accentColor}33,${form.accentColor}0a)`">
                </div>
                <div class="px-4 pb-4 -mt-6 relative">
                  <div class="w-12 h-12 rounded-full border-[3px] overflow-hidden mb-2 shadow-lg" :style="`border-color:${form.accentColor}66`">
                    <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full flex items-center justify-center font-bold text-lg" :style="`background:${form.accentColor}26;color:${form.accentColor}`">
                      {{ (form.name || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                  <p class="font-bold text-white text-sm truncate leading-tight">{{ form.name || 'Группа' }}</p>
                  <p class="text-xs text-white/55 truncate">@{{ form.slug }}</p>
                </div>
              </div>

              <!-- Section scroll-spy nav -->
              <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                <div class="px-4 py-3 border-b border-brand-border space-y-2">
                  <h4 class="text-[11px] font-bold text-white/55 uppercase tracking-widest">Разделы</h4>
                  <!-- Smart search -->
                  <div class="relative">
                    <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input v-model="settingsSearch" type="text" placeholder="Поиск…"
                      class="w-full bg-brand-bg border border-brand-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/25 focus:border-brand-accent focus:outline-none transition-colors" />
                    <button v-if="settingsSearch" @click="settingsSearch = ''" class="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
                <nav class="p-2 space-y-0.5">
                  <p v-if="filteredNavSections.length === 0" class="text-center text-white/30 text-xs py-4">Не найдено</p>
                  <button v-for="sec in filteredNavSections" :key="sec.id"
                    @click="openSec(sec.id)"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all group"
                    :class="openSection === sec.id ? 'text-white' : 'text-white/55 hover:text-white'"
                    :style="openSection === sec.id ? `background:${sec.color}20;box-shadow:inset 0 0 0 1px ${sec.color}30` : ''">
                    <div class="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                      :style="openSection === sec.id ? `background:${sec.color}30` : ''"
                      :class="openSection !== sec.id ? 'group-hover:bg-white/5' : ''">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        :style="openSection === sec.id ? `color:${sec.color}` : ''"
                        :class="openSection !== sec.id ? 'text-white/55 group-hover:text-white' : ''">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sec.iconPath" />
                      </svg>
                    </div>
                    <span class="flex-1 text-left">{{ sec.label }}</span>
                    <div v-if="openSection === sec.id" class="w-1.5 h-1.5 rounded-full flex-shrink-0" :style="`background:${sec.color}`"></div>
                  </button>
                </nav>
              </div>
            </aside>

            <!-- ── Form column ─────────────────────────────────────────── -->
            <div class="flex-1 min-w-0 space-y-5">

              <!-- Page header -->
              <div class="flex items-center gap-4">
                <div>
                  <h1 class="text-2xl font-extrabold text-white tracking-tight">Настройки группы</h1>
                  <p class="text-sm text-white/55 mt-0.5">{{ sections.find((s: any) => s.id === openSection)?.label ?? 'Группа' }}</p>
                </div>
              </div>

              <!-- Mobile section tabs (xl+ uses the sticky sidebar instead) -->
              <div class="flex gap-2 overflow-x-auto pb-1 xl:hidden no-scrollbar">
                <button v-for="sec in sections" :key="sec.id"
                  @click="openSec(sec.id)"
                  class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
                  :class="openSection === sec.id ? 'text-white border-transparent shadow-lg' : 'text-white/55 border-brand-border hover:border-white/20 bg-brand-card'"
                  :style="openSection === sec.id ? `background:${sec.color};box-shadow:0 4px 12px ${sec.color}44` : ''">
                  {{ sec.label }}
                </button>
              </div>

              <form @submit.prevent="save" class="space-y-5">

                <!-- ═══ § GENERAL ═══════════════════════════════════════ -->
                <section v-show="openSection === 'sec-general'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${baseSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${baseSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${baseSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="baseSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ baseSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Название</label>
                      <input v-model="form.name" class="field-input" placeholder="Название группы" />
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Ссылка (slug)</span>
                        <span v-if="form.slug" class="text-[10px] font-normal normal-case tracking-normal"
                          :class="settingsSlugError ? 'text-brand-error' : 'text-brand-success'">
                          {{ form.slug.length }}/60
                        </span>
                      </label>
                      <div class="relative">
                        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
                        <input v-model="form.slug"
                          class="field-input pl-8 pr-10 transition-colors"
                          :class="form.slug
                            ? (settingsSlugError ? '!border-brand-error focus:!border-brand-error' : '!border-brand-success focus:!border-brand-success')
                            : ''"
                          placeholder="my-group" />
                        <span v-if="form.slug" class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <BIcon v-if="!settingsSlugError" name="CheckCircle" class="w-4 h-4 text-brand-success" />
                          <BIcon v-else name="XCircle" class="w-4 h-4 text-brand-error" />
                        </span>
                      </div>
                      <p v-if="settingsSlugError && form.slug" class="flex items-center gap-1 text-[11px] text-brand-error mt-1.5">
                        <BIcon name="AlertCircle" class="w-3.5 h-3.5 flex-shrink-0" /> {{ settingsSlugError }}
                      </p>
                      <div class="mt-2 px-0.5 space-y-1">
                        <p class="text-[10px] text-white/30 font-bold uppercase tracking-wider">Правила slug</p>
                        <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                          <span class="text-[10px] text-white/30 flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-white/20 shrink-0" />только a–z, 0–9, - и _</span>
                          <span class="text-[10px] text-white/30 flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-white/20 shrink-0" />только строчные буквы</span>
                          <span class="text-[10px] text-white/30 flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-white/20 shrink-0" />от 3 до 60 символов</span>
                          <span class="text-[10px] text-white/30 flex items-center gap-1"><span class="w-1 h-1 rounded-full bg-white/20 shrink-0" />не начинать/кончать на - _</span>
                        </div>
                        <p class="text-[10px] text-white/25 mt-1">После изменения адрес группы обновится.</p>
                      </div>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Категория</label>
                      <div class="field-input flex items-center justify-between cursor-not-allowed opacity-60 select-none">
                        <span class="text-white/80">{{ {
                          art: 'Art — Арт, иллюстрации',
                          cosplay: 'Cosplay — Косплей, костюмы',
                          fandom: 'Fandom — Фандом, сообщество',
                          dev: 'Dev — Разработка, технологии',
                          music: 'Music — Музыка, аудио',
                          fursuit: 'Fursuit — Фурсьюты',
                          writing: 'Writing — Литература, тексты',
                          events: 'Events — Ивенты, слёты',
                          other: 'Other — Прочее',
                        }[form.category] || '— Не выбрана —' }}</span>
                        <svg class="w-4 h-4 text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                        </svg>
                      </div>
                      <p class="text-white/30 text-xs mt-1.5 flex items-center gap-1.5">
                        <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                        Категория задаётся при создании и не может быть изменена.
                      </p>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Краткое описание</label>
                      <textarea v-model="form.description" rows="2" class="field-input resize-none" />
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Подробное описание</label>
                      <textarea v-model="form.aboutText" rows="5" placeholder="Расскажите подробнее о группе..." class="field-input resize-none" />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label class="flex items-center gap-3 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
                        <button type="button" class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
                          :class="form.isPublic ? 'bg-brand-success' : 'bg-brand-muted'" @click="form.isPublic = !form.isPublic">
                          <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="form.isPublic ? 'translate-x-4' : 'translate-x-0'" />
                        </button>
                        <div><p class="text-white text-sm font-semibold">{{ form.isPublic ? 'Публичная' : 'Закрытая' }}</p><p class="text-white/30 text-xs">{{ form.isPublic ? 'Все видят' : 'По приглашению' }}</p></div>
                      </label>
                      <label class="flex items-center gap-3 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
                        <button type="button" class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
                          :class="form.isNsfw ? 'bg-brand-error' : 'bg-brand-muted'" @click="form.isNsfw = !form.isNsfw">
                          <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="form.isNsfw ? 'translate-x-4' : 'translate-x-0'" />
                        </button>
                        <div><p class="text-white text-sm font-semibold">NSFW (18+)</p><p class="text-white/30 text-xs">Контент для взрослых</p></div>
                      </label>
                    </div>
                  </div>
                </section>

                <!-- ═══ § APPEARANCE ═══════════════════════════════════ -->
                <section v-show="openSection === 'sec-appearance'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${baseSections[1].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${baseSections[1].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${baseSections[1].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="baseSections[1].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ baseSections[1].label }}</h2>
                  </div>
                  <div class="p-0">
                    <!-- Combined banner + avatar preview -->
                    <div class="relative">
                      <div class="relative w-full h-48 overflow-hidden cursor-pointer group transition-all"
                        :style="bannerPreview ? `background-image:url(${bannerPreview});background-size:cover;background-position:center` : `background:linear-gradient(135deg,${form.accentColor}30 0%,${form.accentColor}08 60%,transparent 100%)`"
                        @click="bannerInput?.click()">
                        <div v-if="!bannerPreview" class="absolute inset-0 pointer-events-none"
                          style="background-image:repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.025) 39px,rgba(255,255,255,0.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.025) 39px,rgba(255,255,255,0.025) 40px)"></div>
                        <div class="absolute inset-0 transition-all duration-200 flex flex-col items-center justify-center gap-2 pointer-events-none bg-black/50 opacity-0 group-hover:opacity-100">
                          <div class="w-10 h-10 rounded-2xl border bg-white/15 border-white/25 flex items-center justify-center backdrop-blur">
                            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          </div>
                          <span class="text-white text-xs font-bold">{{ bannerPreview ? 'Изменить баннер' : 'Добавить баннер' }}</span>
                        </div>
                        <div v-if="bannerPreview" class="absolute top-3 right-3 flex gap-1.5">
                          <button type="button" @click.stop="reopenCrop('banner')"
                            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/55 border border-white/20 backdrop-blur text-white/75 hover:text-white hover:bg-black/80 transition-all text-[10px] font-bold">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                            Кадр
                          </button>
                          <button type="button" @click.stop="bannerPreview = ''; bannerOriginalSrc = ''; groupsStore.updateGroup(group!.id, { bannerUrl: '' })"
                            class="w-7 h-7 rounded-full bg-black/55 border border-white/20 backdrop-blur flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                      <!-- Avatar -->
                      <div class="absolute left-6 -bottom-10">
                        <div class="relative w-20 h-20 rounded-full cursor-pointer group/av" @click="avatarInput?.click()">
                          <div class="w-20 h-20 rounded-full overflow-hidden border-[3px] shadow-xl" :style="`border-color:${form.accentColor}66`">
                            <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover"/>
                            <div v-else class="w-full h-full flex items-center justify-center font-bold text-3xl" :style="`background:${form.accentColor}26;color:${form.accentColor}`">
                              {{ (form.name || '?')[0].toUpperCase() }}
                            </div>
                          </div>
                          <div class="absolute inset-0 rounded-full transition-all duration-200 flex items-center justify-center bg-black/55 opacity-0 group-hover/av:opacity-100">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          </div>
                          <button v-if="avatarPreview" type="button"
                            @click.stop="avatarPreview = ''; avatarOriginalSrc = ''; groupsStore.updateGroup(group!.id, { avatarUrl: '' })"
                            class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-brand-error border-2 border-brand-card flex items-center justify-center text-white shadow-lg opacity-0 group-hover/av:opacity-100 transition-all">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <!-- Actions -->
                    <div class="pt-12 px-6 pb-4 flex items-end justify-between">
                      <div>
                        <p class="font-bold text-white text-sm">{{ form.name || 'Название' }}</p>
                        <p class="text-xs text-white/55">@{{ form.slug }}</p>
                      </div>
                      <div class="flex flex-wrap gap-2 text-xs text-white/35 font-semibold">
                        <button type="button" @click="avatarInput?.click()"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          Аватар
                        </button>
                        <button type="button" @click="bannerInput?.click()"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          Баннер
                        </button>
                        <button v-if="avatarPreview" type="button" @click="reopenCrop('avatar')"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-sky-400/50 hover:text-sky-300 transition-all">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                          Кадр аватар
                        </button>
                      </div>
                    </div>

                    <!-- Accent color + Customization -->
                    <div class="px-6 pb-6 space-y-5 border-t border-brand-border/40 pt-5 mt-2">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Акцентный цвет</label>
                        <div class="flex flex-wrap gap-2">
                          <button v-for="c in presetColors" :key="c" type="button" class="w-9 h-9 rounded-xl border-2 transition-all duration-200 hover:scale-110"
                            :class="form.accentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'"
                            :style="{ backgroundColor: c }" @click="form.accentColor = c" />
                          <label class="w-9 h-9 rounded-xl border-2 border-dashed border-brand-border hover:border-brand-accent/40 flex items-center justify-center cursor-pointer transition-colors">
                            <BIcon name="Pipette" class="w-4 h-4 text-white/30" />
                            <input v-model="form.accentColor" type="color" class="sr-only" />
                          </label>
                        </div>
                      </div>

                      <!-- ── Кастомизация группы (Внешний вид) ── -->
                      <div class="border-t border-brand-border/40 pt-5">
                        <!-- Header -->
                        <div class="flex items-center justify-between mb-4">
                          <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#a78bfa20,#7c3aed20);border:1px solid #a78bfa25">
                              <BIcon name="Palette" class="w-4 h-4 text-brand-purple" />
                            </div>
                            <div>
                              <p class="text-sm font-bold text-white">Кастомизация</p>
                              <p class="text-[11px] text-white/40">Персонализируй группу</p>
                            </div>
                          </div>
                          <span class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0" style="background:#a78bfa15;color:#a78bfa;border:1px solid #a78bfa30">
                            <BIcon name="Star" class="w-2.5 h-2.5"/>Business
                          </span>
                        </div>

                        <!-- Business-only upsell -->
                        <div v-if="authStore.user?.subscription_tier !== 'business'"
                          class="rounded-2xl overflow-hidden relative" style="background:linear-gradient(135deg,#1a163c,#16192F);border:1px solid #a78bfa20">
                          <div class="absolute top-0 right-0 w-24 h-24 opacity-20 blur-2xl rounded-full pointer-events-none" style="background:#a78bfa"/>
                          <div class="relative p-5">
                            <div class="flex items-center gap-3 mb-3">
                              <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#a78bfa30,#7c3aed30);border:1px solid #a78bfa25">
                                <BIcon name="Lock" class="w-4 h-4 text-brand-purple"/>
                              </div>
                              <div>
                                <p class="font-bold text-white text-sm">Нужна подписка Business</p>
                                <p class="text-[11px] text-white/40">Фоны, рамки и темы из Bloomly Shop</p>
                              </div>
                            </div>
                            <button @click="$router.push('/subscription')" class="w-full py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90" style="background:linear-gradient(135deg,#a78bfa,#7c3aed);box-shadow:0 4px 16px #7c3aed35">
                              Получить Business →
                            </button>
                          </div>
                        </div>

                        <template v-else>
                          <!-- Background section -->
                          <div class="mb-5">
                            <div class="flex items-center justify-between mb-2.5">
                              <div class="flex items-center gap-1.5">
                                <BIcon name="Image" class="w-3.5 h-3.5 text-brand-accent"/>
                                <span class="text-xs font-bold text-white/70">Фон группы</span>
                              </div>
                              <button @click="$router.push('/shop')" class="flex items-center gap-1 text-[10px] font-semibold text-brand-purple hover:underline">
                                <BIcon name="ExternalLink" class="w-3 h-3"/> В магазин
                              </button>
                            </div>
                            <div class="flex gap-2 flex-wrap">
                              <!-- No background -->
                              <button @click="form.groupBgUrl = ''" class="relative w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all"
                                :class="!form.groupBgUrl ? 'border-brand-purple shadow-md shadow-brand-purple/20 bg-brand-purple/10' : 'border-brand-border/60 hover:border-brand-border bg-brand-bg/60'">
                                <BIcon name="X" class="w-4 h-4" :class="!form.groupBgUrl ? 'text-brand-purple' : 'text-white/25'"/>
                                <div v-if="!form.groupBgUrl" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-purple flex items-center justify-center shadow-md">
                                  <BIcon name="Check" class="w-2.5 h-2.5 text-white"/>
                                </div>
                              </button>
                              <!-- Owned backgrounds -->
                              <div v-for="item in shopStore.myItems.filter(i => i.type === 'background')" :key="item.id"
                                class="relative cursor-pointer group/bg" @click="form.groupBgUrl = getShopItemBgUrl(item)">
                                <div class="w-20 h-14 rounded-xl border-2 overflow-hidden transition-all"
                                  :class="form.groupBgUrl === getShopItemBgUrl(item) ? 'border-brand-purple shadow-md shadow-brand-purple/20 scale-105' : 'border-brand-border/60 hover:border-brand-border group-hover/bg:scale-105'">
                                  <img v-if="item.preview_url" :src="item.preview_url" class="w-full h-full object-cover" :alt="item.name"/>
                                  <div v-else class="w-full h-full bg-brand-bg flex items-center justify-center"><BIcon name="Image" class="w-4 h-4 text-white/20"/></div>
                                </div>
                                <div v-if="form.groupBgUrl === getShopItemBgUrl(item)" class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-purple flex items-center justify-center shadow-md">
                                  <BIcon name="Check" class="w-2.5 h-2.5 text-white"/>
                                </div>
                                <p class="text-[9px] text-center text-white/35 mt-1 truncate w-20">{{ item.name }}</p>
                              </div>
                              <!-- Buy bg button -->
                              <button v-if="!shopStore.myItems.filter(i=>i.type==='background').length" @click="$router.push('/shop')"
                                class="h-14 px-3 rounded-xl border border-dashed border-brand-border/50 text-[10px] text-white/25 hover:text-white/50 hover:border-brand-border flex items-center gap-1.5 transition-all">
                                <BIcon name="Plus" class="w-3 h-3"/> Купить фон
                              </button>
                            </div>
                          </div>

                          <!-- Frame section -->
                          <div class="mb-5">
                            <div class="flex items-center justify-between mb-2.5">
                              <div class="flex items-center gap-1.5">
                                <BIcon name="CircleDot" class="w-3.5 h-3.5 text-brand-yellow"/>
                                <span class="text-xs font-bold text-white/70">Рамка аватара</span>
                              </div>
                            </div>
                            <div class="flex gap-2 flex-wrap">
                              <button @click="form.groupFrame = ''" class="relative h-8 px-3 rounded-xl border-2 text-[11px] font-medium transition-all"
                                :class="!form.groupFrame ? 'border-brand-purple text-brand-purple bg-brand-purple/10' : 'border-brand-border/60 text-white/40 hover:border-brand-border'">
                                Нет
                                <div v-if="!form.groupFrame" class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-brand-purple flex items-center justify-center">
                                  <BIcon name="Check" class="w-2 h-2 text-white"/>
                                </div>
                              </button>
                              <button v-for="item in shopStore.myItems.filter(i=>i.type==='frame')" :key="item.id"
                                @click="form.groupFrame = item.id" class="relative h-8 px-3 rounded-xl border-2 text-[11px] font-medium transition-all"
                                :class="form.groupFrame===item.id ? 'border-brand-purple text-brand-purple bg-brand-purple/10' : 'border-brand-border/60 text-white/40 hover:border-brand-border'">
                                {{ item.name }}
                                <div v-if="form.groupFrame===item.id" class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-brand-purple flex items-center justify-center">
                                  <BIcon name="Check" class="w-2 h-2 text-white"/>
                                </div>
                              </button>
                              <button v-if="!shopStore.myItems.filter(i=>i.type==='frame').length" @click="$router.push('/shop')"
                                class="h-8 px-3 rounded-xl border border-dashed border-brand-border/50 text-[10px] text-white/25 hover:text-white/50 hover:border-brand-border flex items-center gap-1 transition-all">
                                <BIcon name="Plus" class="w-3 h-3"/> Купить рамку
                              </button>
                            </div>
                          </div>

                          <!-- Theme section -->
                          <div>
                            <div class="flex items-center gap-1.5 mb-2.5">
                              <BIcon name="Sparkles" class="w-3.5 h-3.5 text-brand-pink"/>
                              <span class="text-xs font-bold text-white/70">Тема оформления</span>
                            </div>
                            <div class="flex gap-2 flex-wrap">
                              <button @click="form.groupTheme = ''" class="relative h-8 px-3 rounded-xl border-2 text-[11px] font-medium transition-all"
                                :class="!form.groupTheme ? 'border-brand-purple text-brand-purple bg-brand-purple/10' : 'border-brand-border/60 text-white/40 hover:border-brand-border'">
                                По умолчанию
                                <div v-if="!form.groupTheme" class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-brand-purple flex items-center justify-center">
                                  <BIcon name="Check" class="w-2 h-2 text-white"/>
                                </div>
                              </button>
                              <button v-for="item in shopStore.myItems.filter(i=>i.type==='theme')" :key="item.id"
                                @click="form.groupTheme = item.id" class="relative h-8 px-3 rounded-xl border-2 text-[11px] font-medium transition-all"
                                :class="form.groupTheme===item.id ? 'border-brand-purple text-brand-purple bg-brand-purple/10' : 'border-brand-border/60 text-white/40 hover:border-brand-border'">
                                {{ item.name }}
                                <div v-if="form.groupTheme===item.id" class="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-brand-purple flex items-center justify-center">
                                  <BIcon name="Check" class="w-2 h-2 text-white"/>
                                </div>
                              </button>
                              <button v-if="!shopStore.myItems.filter(i=>i.type==='theme').length" @click="$router.push('/shop')"
                                class="h-8 px-3 rounded-xl border border-dashed border-brand-border/50 text-[10px] text-white/25 hover:text-white/50 hover:border-brand-border flex items-center gap-1 transition-all">
                                <BIcon name="Plus" class="w-3 h-3"/> Купить тему
                              </button>
                            </div>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § CONTENT ════════════════════════════════════════ -->
                <section v-show="openSection === 'sec-content'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${baseSections[2].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${baseSections[2].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${baseSections[2].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="baseSections[2].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ baseSections[2].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Правила</label>
                      <textarea v-model="form.rulesText" rows="6" placeholder="Напишите правила группы…" class="field-input resize-none" />
                    </div>
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">FAQ</label>
                        <button type="button" class="text-xs font-semibold hover:text-brand-accent-plus transition-colors" :style="`color:${baseSections[2].color}`" @click="addFaq">+ Добавить</button>
                      </div>
                      <div class="space-y-3">
                        <div v-for="(item, idx) in form.faq" :key="idx" class="bg-brand-bg/40 border border-brand-border rounded-2xl p-3 space-y-2 relative">
                          <button type="button" class="absolute top-2 right-2 w-6 h-6 rounded-lg bg-brand-error/10 flex items-center justify-center hover:bg-brand-error/20 transition-colors" @click="removeFaq(idx)">
                            <BIcon name="X" class="w-3 h-3 text-brand-error" />
                          </button>
                          <input v-model="item.q" placeholder="Вопрос" class="field-input" />
                          <textarea v-model="item.a" rows="2" placeholder="Ответ" class="field-input resize-none" />
                        </div>
                      </div>
                      <p v-if="!form.faq.length" class="text-white/25 text-xs mt-1.5">Нажмите «Добавить» чтобы создать FAQ</p>
                    </div>
                  </div>
                </section>

                <!-- ═══ § EVENT ══════════════════════════════════════════ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-event'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${eventSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${eventSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${eventSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ eventSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Расписание</label>
                        <button type="button" class="text-xs font-semibold" :style="`color:${eventSections[0].color}`" @click="addSchedule">+ Добавить</button>
                      </div>
                      <div class="space-y-2">
                        <div v-for="(item, idx) in form.schedule" :key="idx" class="flex items-center gap-2">
                          <input v-model="item.time" placeholder="09:30 - 10:00" class="w-32 field-input font-mono" />
                          <input v-model="item.label" placeholder="Описание" class="flex-1 field-input" />
                          <button type="button" class="w-8 h-8 rounded-lg bg-brand-error/10 flex items-center justify-center hover:bg-brand-error/20 shrink-0" @click="removeSchedule(idx)">
                            <BIcon name="X" class="w-3 h-3 text-brand-error" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Что взять с собой</label>
                      <div class="flex flex-wrap gap-2 mb-2">
                        <span v-for="(item, idx) in form.whatToBring" :key="idx"
                          class="flex items-center gap-1.5 bg-brand-bg/60 border border-brand-border rounded-xl px-3 py-1.5 text-white text-xs">
                          {{ item }}
                          <button type="button" class="text-brand-error hover:text-brand-error/70" @click="removeBringItem(idx)"><BIcon name="X" class="w-3 h-3" /></button>
                        </span>
                      </div>
                      <div class="flex gap-2">
                        <input v-model="newBringItem" placeholder="Коврик, вода…" class="flex-1 field-input" @keyup.enter="addBringItem" />
                        <button type="button" class="px-3 py-2 rounded-xl text-white text-xs font-bold" :style="`background:${eventSections[0].color}`" @click="addBringItem">Добавить</button>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § ORGANIZERS ═════════════════════════════════════ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-organizers'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${eventSections[1].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${eventSections[1].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${eventSections[1].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventSections[1].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ eventSections[1].label }}</h2>
                  </div>
                  <div class="p-5 space-y-5">

                    <!-- Current admins/organizers -->
                    <div>
                      <div class="flex items-center justify-between mb-3">
                        <p class="text-xs font-bold text-white/55 uppercase tracking-wider">Текущие организаторы</p>
                        <span class="text-[10px] text-white/30">Роли: owner, admin, moderator</span>
                      </div>
                      <div v-if="membersLoading" class="flex items-center gap-2 py-4 text-white/40 text-sm">
                        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        Загрузка участников…
                      </div>
                      <div v-else-if="!sortedMembers.filter(m => ['owner','admin','moderator'].includes(m.role)).length"
                        class="py-4 text-center text-white/30 text-sm bg-brand-bg border border-dashed border-brand-border/60 rounded-2xl">
                        Нет назначенных организаторов
                      </div>
                      <div v-else class="space-y-2">
                        <div v-for="m in sortedMembers.filter(m => ['owner','admin','moderator'].includes(m.role))" :key="m.user_id"
                          class="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-brand-bg border border-brand-border">
                          <div class="w-9 h-9 rounded-xl bg-brand-accent/15 overflow-hidden flex-shrink-0">
                            <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" />
                            <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-xs font-bold">{{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}</div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-white truncate">{{ m.user.display_name || m.user.username }}</p>
                            <p class="text-[10px] mt-0.5 flex items-center gap-1" :style="`color: ${ROLE_META[m.role]?.color || '#9ca3af'}`"><svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="ROLE_META[m.role]?.iconPath ?? ROLE_META.member.iconPath"/></svg>{{ ROLE_META[m.role]?.label }}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Add organizer from members -->
                    <div v-if="sortedMembers.filter(m => m.role === 'member').length">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">Назначить из участников</p>
                      <div class="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                        <div v-for="m in sortedMembers.filter(m => m.role === 'member').slice(0, 20)" :key="m.user_id"
                          class="flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-bg/60 border border-brand-border/60 hover:border-brand-border transition-colors">
                          <div class="w-8 h-8 rounded-lg bg-brand-accent/10 overflow-hidden flex-shrink-0">
                            <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" />
                            <div v-else class="w-full h-full flex items-center justify-center text-brand-accent/60 text-xs font-bold">{{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}</div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm text-white/80 truncate">{{ m.user.display_name || m.user.username }}</p>
                          </div>
                          <div class="flex gap-1.5">
                            <button type="button" :disabled="!!memberSaving[m.user_id]"
                              class="px-2.5 py-1 rounded-lg border border-[#a78bfa]/30 text-[#a78bfa] text-[10px] font-bold hover:bg-[#a78bfa]/10 transition-colors disabled:opacity-40"
                              @click="doSetRole(m.user_id, 'moderator')">
                              Модератор
                            </button>
                            <button v-if="isOwner" type="button" :disabled="!!memberSaving[m.user_id]"
                              class="px-2.5 py-1 rounded-lg border border-[#3b82f6]/30 text-[#3b82f6] text-[10px] font-bold hover:bg-[#3b82f6]/10 transition-colors disabled:opacity-40"
                              @click="doSetRole(m.user_id, 'admin')">
                              Админ
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Contact info -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-brand-border/30 pt-5">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Телефон</label>
                        <input v-model="form.contactPhone" placeholder="+7 (999) 123-45-67" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Email</label>
                        <input v-model="form.contactEmail" placeholder="event@example.com" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § TICKETS ══════════════════════════════════════╗ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-tickets'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${eventSections[2].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${eventSections[2].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${eventSections[2].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventSections[2].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ eventSections[2].label }}</h2>
                  </div>
                  <div class="p-6 space-y-6">

                    <!-- No events notice -->
                    <div v-if="!(group as any).events?.length" class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-6 text-center">
                      <p class="text-white/50 text-sm">Сначала создайте мероприятие, чтобы добавить билеты.</p>
                    </div>

                    <!-- Per-event ticket management -->
                    <div v-for="ev in (group as any).events || []" :key="ev.id" class="space-y-3">
                      <!-- Event header -->
                      <div class="flex items-center justify-between">
                        <div>
                          <h4 class="text-sm font-bold text-white">{{ ev.title }}</h4>
                          <p class="text-xs text-white/40 mt-0.5">
                            {{ ev.short_code }} · {{ new Date(ev.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) }}
                          </p>
                        </div>
                        <button type="button"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                          :style="`background:${eventSections[2].color}1a; color:${eventSections[2].color}; border:1px solid ${eventSections[2].color}30`"
                          @click="openNewTierForm(ev.id)">
                          <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить
                        </button>
                      </div>

                      <!-- Existing tiers -->
                      <div v-if="ev.tickets?.length" class="space-y-2">
                        <div v-for="tier in ev.tickets" :key="tier.id">
                          <!-- Edit form -->
                          <div v-if="editingTier === tier.id" class="bg-brand-bg/60 border border-brand-border rounded-2xl p-4 space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                              <div class="col-span-2">
                                <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Название</label>
                                <input v-model="editTierForm.name" placeholder="VIP, Стандарт…" class="field-input" />
                              </div>
                              <div>
                                <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Цена</label>
                                <input v-model.number="editTierForm.price" type="number" min="0" step="0.01" class="field-input" />
                              </div>
                              <div>
                                <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Валюта</label>
                                <select v-model="editTierForm.currency" class="field-input appearance-none">
                                  <option value="RUB">RUB ₽</option>
                                  <option value="USD">USD $</option>
                                  <option value="EUR">EUR €</option>
                                </select>
                              </div>
                              <div>
                                <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Кол-во</label>
                                <input v-model.number="editTierForm.totalCount" type="number" min="1" class="field-input" />
                              </div>
                              <div class="col-span-2 grid grid-cols-2 gap-3">
                                <div>
                                  <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Продажи с</label>
                                  <input v-model="editTierForm.saleStartsAt" type="datetime-local" class="field-input" />
                                </div>
                                <div>
                                  <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Продажи до</label>
                                  <input v-model="editTierForm.saleEndsAt" type="datetime-local" class="field-input" />
                                </div>
                              </div>
                            </div>
                            <div class="flex gap-2 justify-end pt-1">
                              <button type="button" @click="editingTier = null" class="px-4 py-2 text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border rounded-xl transition-all">Отмена</button>
                              <button type="button" :disabled="ticketSaving" @click="saveEditTier(tier.id, ev.id)"
                                class="px-4 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 transition-all"
                                :style="`background:${eventSections[2].color}`">
                                {{ ticketSaving ? 'Сохранение…' : 'Сохранить' }}
                              </button>
                            </div>
                          </div>

                          <!-- Tier card (view mode) -->
                          <div v-else class="flex items-center gap-3 px-4 py-3 bg-brand-bg/40 border border-brand-border rounded-2xl">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2">
                                <span class="text-sm font-bold text-white truncate">{{ tier.name }}</span>
                                <span class="text-xs font-bold px-2 py-0.5 rounded-lg"
                                  :style="`color:${eventSections[2].color}; background:${eventSections[2].color}1a; border:1px solid ${eventSections[2].color}30`">
                                  {{ tier.currency === 'RUB' ? `${parseFloat(tier.price).toLocaleString('ru-RU')} ₽` : `${parseFloat(tier.price)} ${tier.currency}` }}
                                </span>
                              </div>
                              <p class="text-xs text-white/40 mt-0.5">
                                {{ tier.sold_count }}/{{ tier.total_count }} продано
                                <template v-if="tier.sale_starts_at">
                                  · с {{ new Date(tier.sale_starts_at).toLocaleDateString('ru-RU') }}
                                </template>
                                <template v-if="tier.sale_ends_at">
                                  до {{ new Date(tier.sale_ends_at).toLocaleDateString('ru-RU') }}
                                </template>
                              </p>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0">
                              <button type="button" @click="openEditTierForm(tier)"
                                class="w-8 h-8 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center hover:border-brand-accent/40 hover:text-brand-accent text-white/55 transition-all">
                                <BIcon name="Pencil" class="w-3.5 h-3.5" />
                              </button>
                              <button type="button" @click="deleteTier(tier.id, ev.id)"
                                class="w-8 h-8 rounded-xl bg-brand-error/10 border border-brand-error/25 flex items-center justify-center hover:bg-brand-error/20 text-brand-error transition-all">
                                <BIcon name="Trash2" class="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- No tiers -->
                      <div v-else-if="showNewTierForm !== ev.id" class="bg-brand-bg/40 border border-dashed border-brand-border rounded-2xl p-4 text-center text-xs text-white/40">
                        Билетов нет — нажмите «Добавить»
                      </div>

                      <!-- New tier form -->
                      <div v-if="showNewTierForm === ev.id" class="bg-brand-bg/60 border border-brand-border rounded-2xl p-4 space-y-3">
                        <h5 class="text-xs font-bold text-white/70 uppercase tracking-wider">Новый тип билета</h5>
                        <div class="grid grid-cols-2 gap-3">
                          <div class="col-span-2">
                            <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Название</label>
                            <input v-model="newTierForm.name" placeholder="VIP, Стандарт, Press…" class="field-input" />
                          </div>
                          <div>
                            <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Цена</label>
                            <input v-model.number="newTierForm.price" type="number" min="0" step="0.01" class="field-input" />
                          </div>
                          <div>
                            <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Валюта</label>
                            <select v-model="newTierForm.currency" class="field-input appearance-none">
                              <option value="RUB">RUB ₽</option>
                              <option value="USD">USD $</option>
                              <option value="EUR">EUR €</option>
                            </select>
                          </div>
                          <div class="col-span-2">
                            <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Количество билетов</label>
                            <input v-model.number="newTierForm.totalCount" type="number" min="1" class="field-input" />
                          </div>
                          <div>
                            <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Начало продаж</label>
                            <input v-model="newTierForm.saleStartsAt" type="datetime-local" class="field-input" />
                          </div>
                          <div>
                            <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-1.5 block">Конец продаж</label>
                            <input v-model="newTierForm.saleEndsAt" type="datetime-local" class="field-input" />
                          </div>
                        </div>
                        <p v-if="ticketError" class="text-xs text-brand-error">{{ ticketError }}</p>
                        <div class="flex gap-2 justify-end pt-1">
                          <button type="button" @click="showNewTierForm = null" class="px-4 py-2 text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border rounded-xl transition-all">Отмена</button>
                          <button type="button" :disabled="ticketSaving || !newTierForm.name.trim()" @click="saveNewTier(ev.id)"
                            class="px-4 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 transition-all"
                            :style="`background:${eventSections[2].color}`">
                            {{ ticketSaving ? 'Сохранение…' : 'Добавить билет' }}
                          </button>
                        </div>
                      </div>

                      <!-- Divider between events -->
                      <div v-if="(group as any).events?.length > 1" class="h-px bg-brand-border mt-2" />
                    </div>
                  </div>
                </section>

                <!-- ═══ § SOON BADGES ════════════════════════════════════ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-soon'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${eventSections[3].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${eventSections[3].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${eventSections[3].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventSections[3].iconPath"/>
                      </svg>
                    </div>
                    <div>
                      <h2 class="font-bold text-white text-sm">{{ eventSections[3].label }}</h2>
                      <p class="text-white/40 text-xs">Настройте бейджи и статусы мероприятий</p>
                    </div>
                  </div>
                  <div class="p-6 space-y-6">
                    <!-- No events notice -->
                    <div v-if="!(group as any).events?.length" class="bg-brand-bg/40 border border-brand-border/60 rounded-2xl p-8 text-center">
                      <div class="text-3xl mb-3">🌟</div>
                      <p class="text-white/60 text-sm font-medium">Сначала создайте мероприятие</p>
                      <p class="text-white/30 text-xs mt-1">SOON бейджи появятся после добавления ивентов</p>
                    </div>

                    <!-- Loading -->
                    <div v-else-if="soonBadgesLoading" class="flex flex-col items-center justify-center py-12 gap-3">
                      <div class="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      <p class="text-white/40 text-xs">Загружаем статистику...</p>
                    </div>

                    <template v-else>
                      <!-- Global stats bar -->
                      <div class="grid grid-cols-3 gap-3">
                        <div class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl p-3.5 text-center">
                          <p class="text-2xl font-black text-white">
                            {{ Object.values(eventSoonMap).reduce((s, arr) => s + arr.length, 0) }}
                          </p>
                          <p class="text-[10px] text-white/40 mt-0.5 font-medium uppercase tracking-wide">Следят</p>
                        </div>
                        <div class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl p-3.5 text-center">
                          <p class="text-2xl font-black text-white">{{ (group as any).events?.length ?? 0 }}</p>
                          <p class="text-[10px] text-white/40 mt-0.5 font-medium uppercase tracking-wide">Ивентов</p>
                        </div>
                        <div class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl p-3.5 text-center">
                          <p class="text-2xl font-black" :style="`color: ${EVENT_STATUSES.find(s => s.value === computeEventStatus((group as any).events?.[0]))?.color || '#fbbf24'}`">
                            {{ EVENT_STATUSES.find(s => s.value === computeEventStatus((group as any).events?.[0]))?.icon || '⭐' }}
                          </p>
                          <p class="text-[10px] text-white/40 mt-0.5 font-medium uppercase tracking-wide">Статус</p>
                        </div>
                      </div>

                      <!-- Per-event editor -->
                      <div v-for="(ev, evIdx) in ((group as any).events || [])" :key="ev.id"
                        class="rounded-3xl border overflow-hidden transition-all"
                        :style="`border-color: ${EVENT_STATUSES.find(s=>s.value===computeEventStatus(ev))?.color || '#fbbf24'}33`">

                        <!-- Event header with banner -->
                        <div class="relative h-24 overflow-hidden">
                          <img v-if="ev.banner_url || (group as any)?.banner_url" :src="ev.banner_url || (group as any)?.banner_url" class="w-full h-full object-cover" />
                          <div v-else class="w-full h-full" :style="`background: linear-gradient(135deg, ${(group as any).accent_color || '#4C67CF'}44, ${(group as any).accent_color || '#4C67CF'}11)`" />
                          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                          <!-- Status badge top-right -->
                          <div class="absolute top-2 right-2">
                            <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-sm"
                              :style="`background: ${EVENT_STATUSES.find(s=>s.value===computeEventStatus(ev))?.color || '#fbbf24'}33; color: ${EVENT_STATUSES.find(s=>s.value===computeEventStatus(ev))?.color || '#fbbf24'}; border: 1px solid ${EVENT_STATUSES.find(s=>s.value===computeEventStatus(ev))?.color || '#fbbf24'}44`">
                              <span>{{ EVENT_STATUSES.find(s=>s.value===computeEventStatus(ev))?.icon }}</span>
                              {{ EVENT_STATUSES.find(s=>s.value===computeEventStatus(ev))?.label }}
                            </span>
                          </div>
                          <!-- Title + date bottom-left -->
                          <div class="absolute bottom-2 left-3 right-16">
                            <p class="text-white font-bold text-sm truncate">{{ ev.title }}</p>
                            <p class="text-white/55 text-[11px]">{{ new Date(ev.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) }}</p>
                          </div>
                          <!-- Interested count bottom-right -->
                          <div class="absolute bottom-2 right-3 flex items-center gap-1 text-white/70 text-[11px] font-bold">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                            {{ (eventSoonMap[ev.id] ?? []).length }}
                          </div>
                        </div>

                        <!-- Edit body -->
                        <div class="p-4 space-y-4 bg-brand-bg/30">

                          <!-- Short code row -->
                          <div>
                            <div class="flex items-center justify-between mb-2">
                              <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Код бейджа (макс. 4 символа)</label>
                              <button
                                type="button"
                                @click="() => { if(soonEditMap[ev.id]) soonEditMap[ev.id].shortCode = suggestShortCode((group as any).name || ev.title) }"
                                class="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all hover:opacity-80 active:scale-95"
                                style="background:#fbbf2415; color:#fbbf24; border:1px solid #fbbf2430"
                              >
                                ✨ Предложить
                              </button>
                            </div>
                            <div class="flex items-center gap-3">
                              <div class="flex-shrink-0 scale-110 origin-left">
                                <SoonBadge :short-code="soonEditMap[ev.id]?.shortCode || '???'" />
                              </div>
                              <div class="flex-1 relative">
                                <input
                                  v-if="soonEditMap[ev.id]"
                                  v-model="soonEditMap[ev.id].shortCode"
                                  @input="() => { if (soonEditMap[ev.id]) soonEditMap[ev.id].shortCode = soonEditMap[ev.id].shortCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }"
                                  maxlength="4"
                                  placeholder="EF"
                                  class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-white text-sm font-mono placeholder-white/25 focus:outline-none focus:border-amber-400/60 transition-colors uppercase tracking-widest text-center text-lg"
                                />
                                <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/25 font-mono">
                                  {{ (soonEditMap[ev.id]?.shortCode || '').length }}/4
                                </span>
                              </div>
                            </div>
                          </div>

                          <!-- Save row -->
                          <div class="flex items-center justify-between pt-1 border-t border-brand-border/40">
                            <Transition name="fade">
                              <span v-if="soonEditMap[ev.id]?.saved" class="text-xs text-green-400 flex items-center gap-1.5 font-medium">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                                Сохранено!
                              </span>
                              <span v-else class="text-[11px] text-white/25">Изменения не сохранены</span>
                            </Transition>
                            <button
                              @click="saveSoonEvent(ev.id)"
                              :disabled="soonEditMap[ev.id]?.saving"
                              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 hover:opacity-80"
                              style="background:linear-gradient(135deg, #fbbf2430, #f59e0b20); border: 1px solid #fbbf2450; color: #fbbf24"
                            >
                              <svg v-if="soonEditMap[ev.id]?.saving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                              <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                              {{ soonEditMap[ev.id]?.saving ? 'Сохраняем...' : 'Сохранить изменения' }}
                            </button>
                          </div>
                        </div>

                        <!-- Badge holders -->
                        <div class="px-4 pb-4 bg-brand-bg/30 space-y-2.5">
                          <div class="flex items-center justify-between">
                            <p class="text-xs font-bold text-white/40 uppercase tracking-wider">Интересуются</p>
                            <div class="flex items-center gap-2">
                              <!-- Mini avatars stack -->
                              <div v-if="(eventSoonMap[ev.id] ?? []).length" class="flex -space-x-2">
                                <div v-for="badge in (eventSoonMap[ev.id] ?? []).slice(0, 5)" :key="badge.id"
                                  class="w-5 h-5 rounded-full border border-brand-card overflow-hidden bg-brand-accent/20">
                                  <img v-if="badge.user.avatar_url" :src="badge.user.avatar_url" class="w-full h-full object-cover" />
                                  <div v-else class="w-full h-full flex items-center justify-center text-[8px] font-bold text-white">
                                    {{ (badge.user.display_name || badge.user.username)[0].toUpperCase() }}
                                  </div>
                                </div>
                              </div>
                              <span class="text-xs font-bold px-2 py-0.5 rounded-lg"
                                :style="`background:${eventSections[3].color}1a; color:${eventSections[3].color}`">
                                {{ (eventSoonMap[ev.id] ?? []).length }} чел.
                              </span>
                            </div>
                          </div>

                          <div v-if="(eventSoonMap[ev.id] ?? []).length" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <div
                              v-for="badge in eventSoonMap[ev.id]"
                              :key="badge.id"
                              class="flex items-center gap-2.5 px-3 py-2 bg-brand-bg/60 border border-brand-border/60 rounded-xl cursor-pointer hover:border-amber-400/20 hover:bg-brand-bg transition-all group"
                              @click="router.push({ name: 'profile', params: { id: badge.user.id } })"
                            >
                              <div class="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-brand-border bg-brand-accent/20">
                                <img v-if="badge.user.avatar_url" :src="badge.user.avatar_url" class="w-full h-full object-cover" />
                                <div v-else class="w-full h-full flex items-center justify-center text-[10px] font-bold text-brand-accent">
                                  {{ (badge.user.display_name || badge.user.username)[0].toUpperCase() }}
                                </div>
                              </div>
                              <div class="flex-1 min-w-0">
                                <p class="text-white text-xs font-bold truncate">{{ badge.user.display_name || badge.user.username }}</p>
                                <p class="text-white/35 text-[10px] truncate">@{{ badge.user.username }}</p>
                              </div>
                              <BIcon name="ChevronRight" class="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors flex-shrink-0" />
                            </div>
                          </div>

                          <div v-else class="rounded-2xl p-4 text-center" style="border: 1px dashed rgba(251,191,36,0.2); background: rgba(251,191,36,0.04)">
                            <p class="text-[11px] font-medium" style="color:rgba(251,191,36,0.4)">Пока никто не добавил этот бейдж</p>
                          </div>
                        </div>

                        <!-- Divider -->
                        <div v-if="evIdx < ((group as any).events?.length ?? 0) - 1" class="h-0" />
                      </div>
                    </template>
                  </div>
                </section>

                <!-- ═══ § FINANCE ════════════════════════════════════════ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-finance'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    style="background:linear-gradient(90deg,#10b98112 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#10b98120">
                      <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/>
                      </svg>
                    </div>
                    <div>
                      <h2 class="font-bold text-white text-sm">Финансы</h2>
                      <p class="text-white/40 text-xs">Доходы, расходы и взаиморасчёты — предварительный макет</p>
                    </div>
                    <span class="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full" style="background:#10b98120;color:#10b981;border:1px solid #10b98130">MOCKUP</span>
                  </div>

                  <div class="p-6 space-y-6">

                    <!-- Сводка -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div class="bg-brand-bg/70 border border-brand-border/60 rounded-2xl p-4 flex flex-col gap-1">
                        <p class="text-[10px] font-bold text-white/40 uppercase tracking-wide">Общий доход</p>
                        <p class="text-2xl font-black text-emerald-400">124 800 ₽</p>
                        <p class="text-[10px] text-emerald-400/60 flex items-center gap-1">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7 7 7M5 19l7-7 7 7"/></svg>
                          +12% к прошлому
                        </p>
                      </div>
                      <div class="bg-brand-bg/70 border border-brand-border/60 rounded-2xl p-4 flex flex-col gap-1">
                        <p class="text-[10px] font-bold text-white/40 uppercase tracking-wide">Билеты</p>
                        <p class="text-2xl font-black text-white">98 400 ₽</p>
                        <p class="text-[10px] text-white/40">164 продано</p>
                      </div>
                      <div class="bg-brand-bg/70 border border-brand-border/60 rounded-2xl p-4 flex flex-col gap-1">
                        <p class="text-[10px] font-bold text-white/40 uppercase tracking-wide">Донаты</p>
                        <p class="text-2xl font-black text-purple-400">26 400 ₽</p>
                        <p class="text-[10px] text-purple-400/60">от 43 человек</p>
                      </div>
                      <div class="bg-brand-bg/70 border border-brand-border/60 rounded-2xl p-4 flex flex-col gap-1">
                        <p class="text-[10px] font-bold text-white/40 uppercase tracking-wide">Ожидается</p>
                        <p class="text-2xl font-black text-amber-400">14 200 ₽</p>
                        <p class="text-[10px] text-amber-400/60">3 ожидают оплаты</p>
                      </div>
                    </div>

                    <!-- График доходов -->
                    <div class="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-4">
                      <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-bold text-white">Динамика продаж</h3>
                        <span class="text-[10px] text-white/30 bg-white/5 px-2.5 py-1 rounded-full">последние 30 дней</span>
                      </div>
                      <div class="flex items-end gap-1.5 h-24">
                        <div v-for="(bar, i) in [18,25,32,28,40,55,48,60,72,65,80,74,90,84,78,96,88,100,92,84,76,88,95,80,70,62,74,85,90,78]"
                          :key="i"
                          class="flex-1 rounded-t-sm transition-all"
                          :style="`height:${bar}%;background:linear-gradient(to top,#10b981${i>=20?'99':'44'},#10b981${i>=20?'cc':'66'})`"
                          :title="`День ${i+1}`"
                        />
                      </div>
                      <div class="flex justify-between mt-2 text-[9px] text-white/25">
                        <span>1 фев</span><span>8 фев</span><span>15 фев</span><span>22 фев</span><span>1 мар</span>
                      </div>
                    </div>

                    <!-- Разбивка по типам билетов -->
                    <div class="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-4">
                      <h3 class="text-sm font-bold text-white mb-4">Продажи по категориям</h3>
                      <div class="space-y-3">
                        <div v-for="(tier, i) in [
                          { name: 'Стандарт', sold: 100, total: 150, revenue: '60 000 ₽', pct: 67, color: '#34d399' },
                          { name: 'Спонсор', sold: 40, total: 50, revenue: '28 000 ₽', pct: 80, color: '#a78bfa' },
                          { name: 'VIP', sold: 24, total: 30, revenue: '36 000 ₽', pct: 80, color: '#fbbf24' },
                        ]" :key="i" class="flex items-center gap-3">
                          <div class="w-24 text-xs text-white/70 truncate font-medium">{{ tier.name }}</div>
                          <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div class="h-full rounded-full transition-all" :style="`width:${tier.pct}%;background:${tier.color}`" />
                          </div>
                          <div class="text-xs font-bold text-white/60 w-16 text-right">{{ tier.sold }}/{{ tier.total }}</div>
                          <div class="text-xs font-bold w-24 text-right" :style="`color:${tier.color}`">{{ tier.revenue }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- Последние транзакции -->
                    <div class="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-4">
                      <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-bold text-white">Последние транзакции</h3>
                        <button class="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">Все →</button>
                      </div>
                      <div class="space-y-1">
                        <div v-for="(tx, i) in [
                          { user: 'Taffy', type: 'Билет: VIP', amount: '+1 500 ₽', time: '2 мин. назад', color: '#34d399', icon: '🎟️' },
                          { user: 'FoxDev', type: 'Донат', amount: '+500 ₽', time: '15 мин. назад', color: '#a78bfa', icon: '💜' },
                          { user: 'Wolfy', type: 'Билет: Стандарт', amount: '+600 ₽', time: '1 ч. назад', color: '#34d399', icon: '🎟️' },
                          { user: 'DragonX', type: 'Билет: Спонсор', amount: '+700 ₽', time: '3 ч. назад', color: '#34d399', icon: '🎟️' },
                          { user: 'SnowPaw', type: 'Донат', amount: '+200 ₽', time: 'вчера', color: '#a78bfa', icon: '💜' },
                        ]" :key="i"
                          class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
                          <span class="text-base">{{ tx.icon }}</span>
                          <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold text-white truncate">{{ tx.user }}</p>
                            <p class="text-[10px] text-white/40">{{ tx.type }}</p>
                          </div>
                          <div class="text-right flex-shrink-0">
                            <p class="text-sm font-black" :style="`color:${tx.color}`">{{ tx.amount }}</p>
                            <p class="text-[9px] text-white/25">{{ tx.time }}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Взаиморасчёты -->
                    <div class="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-4">
                      <h3 class="text-sm font-bold text-white mb-1">Взаиморасчёты</h3>
                      <p class="text-[11px] text-white/35 mb-4">Кто что должен организаторам или фуреализует предоплату</p>
                      <div class="space-y-2">
                        <div v-for="(item, i) in [
                          { user: 'Wolfy', status: 'ожидает', amount: '1 200 ₽', due: '15 мар', statusColor: '#fbbf24' },
                          { user: 'KitsuFox', status: 'ожидает', amount: '700 ₽', due: '20 мар', statusColor: '#fbbf24' },
                          { user: 'SnowPaw', status: 'просрочено', amount: '600 ₽', due: '1 мар', statusColor: '#f87171' },
                          { user: 'BluePaw', status: 'оплачено', amount: '2 000 ₽', due: '28 фев', statusColor: '#34d399' },
                          { user: 'NeonDeer', status: 'оплачено', amount: '1 500 ₽', due: '1 мар', statusColor: '#34d399' },
                        ]" :key="i"
                          class="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all"
                          :style="`border-color: ${item.statusColor}25; background: ${item.statusColor}08`">
                          <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                            :style="`background:${item.statusColor}20;color:${item.statusColor}`">
                            {{ item.user[0] }}
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold text-white">{{ item.user }}</p>
                            <p class="text-[10px] text-white/40">до {{ item.due }}</p>
                          </div>
                          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            :style="`background:${item.statusColor}20;color:${item.statusColor}`">
                            {{ item.status }}
                          </span>
                          <p class="text-sm font-black text-white/80 w-20 text-right">{{ item.amount }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Заглушка про реальные данные -->
                    <div class="rounded-2xl p-4 flex items-start gap-3" style="background:rgba(16,185,129,0.06);border:1px dashed rgba(16,185,129,0.25)">
                      <svg class="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <p class="text-[11px] text-emerald-400/70 leading-relaxed">
                        Это предварительный макет раздела. Реальные данные будут подключены к платёжной системе на следующем этапе разработки.
                      </p>
                    </div>

                  </div>
                </section>

                <!-- ═══ § COMMISSIONS ════════════════════════════════════ -->
                <section v-if="group.type === 'creative'" v-show="openSection === 'sec-commissions'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${creativeSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${creativeSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${creativeSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="creativeSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ creativeSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Статус приёма заказов</label>
                      <div class="grid grid-cols-3 gap-2">
                        <button v-for="s in [
                          { value: 'open' as const, label: 'Открыт', cls: 'brand-success' },
                          { value: 'waitlist' as const, label: 'Ожидание', cls: 'brand-yellow' },
                          { value: 'closed' as const, label: 'Закрыт', cls: 'brand-error' },
                        ]" :key="s.value" type="button"
                          class="py-2.5 rounded-xl border text-xs font-bold transition-all"
                          :class="commForm.status === s.value ? `bg-${s.cls}/10 border-${s.cls}/40 text-${s.cls}` : 'bg-brand-bg/40 border-brand-border text-white/40'"
                          @click="commForm.status = s.value">
                          {{ s.label }}
                        </button>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Макс. очередь</label>
                        <input v-model.number="commForm.maxQueue" type="number" min="1" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Валюта</label>
                        <select v-model="commForm.currency" class="field-input appearance-none">
                          <option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="RUB">RUB (₽)</option>
                        </select>
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Быстрых мест</label>
                        <input v-model.number="commForm.rushSlots" type="number" min="0" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Срок выполнения</label>
                        <input v-model="commForm.turnaroundDays" placeholder="5-7 дней" class="field-input" />
                      </div>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Условия (ToS)</label>
                      <textarea v-model="commForm.tosText" rows="4" placeholder="Условия приёма заказов…" class="field-input resize-none" />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Срок изготовления</label>
                        <input v-model="form.productionTime" placeholder="2-3 месяца" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Выполнено работ</label>
                        <input v-model.number="form.completedWorks" type="number" min="0" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Доставка</label>
                        <input v-model="form.deliveryInfo" placeholder="По всему миру" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Гарантия</label>
                        <input v-model="form.guaranteeText" placeholder="Гарантия качества" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § PRICES ═════════════════════════════════════════ -->
                <section v-if="group.type === 'creative' || group.type === 'shop'" v-show="openSection === 'sec-prices'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,#34d3990c 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#34d3991a">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#34d399">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">Прайс-лист</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Базовые цены</label>
                      <div class="space-y-2">
                        <div v-for="key in basePriceKeys" :key="key" class="flex items-center gap-3 bg-brand-bg/40 border border-brand-border rounded-xl px-3 py-2">
                          <span class="text-white text-xs font-semibold flex-1">{{ basePriceLabels[key] }}</span>
                          <input v-model.number="commForm.basePrices[key]" type="number" min="0" placeholder="0"
                            class="w-24 bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-white text-xs text-right focus:border-brand-accent focus:outline-none" />
                          <span class="text-white/30 text-xs w-8">{{ commForm.currency }}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Детальный прайс</label>
                        <button type="button" class="text-xs font-semibold" style="color:#34d399" @click="addPriceItem">+ Добавить</button>
                      </div>
                      <div class="space-y-2">
                        <div v-for="(item, idx) in commForm.priceList" :key="idx" class="bg-brand-bg/40 border border-brand-border rounded-2xl p-3 space-y-2 relative">
                          <button type="button" class="absolute top-2 right-2 w-6 h-6 rounded-lg bg-brand-error/10 flex items-center justify-center" @click="removePriceItem(idx)">
                            <BIcon name="X" class="w-3 h-3 text-brand-error" />
                          </button>
                          <div class="flex gap-2">
                            <input v-model="item.name" placeholder="Название" class="flex-1 field-input" />
                            <input v-model.number="item.price" type="number" min="0" placeholder="Цена" class="w-24 field-input text-right" />
                          </div>
                          <input v-model="item.description" placeholder="Описание (опционально)" class="field-input text-xs" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § МОНЕТИЗАЦИЯ / ДОНАТЫ ════════════════════════ -->
                <section v-show="openSection === 'sec-donations'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl scroll-mt-28 overflow-hidden">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    style="background:linear-gradient(90deg,#10b98112 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                      <BIcon name="Heart" class="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h2 class="font-bold text-white text-sm">Монетизация</h2>
                      <p class="text-white/40 text-xs">Принимайте пожертвования от подписчиков</p>
                    </div>
                  </div>

                  <div class="p-6 space-y-6">

                    <!-- Card linking -->
                    <div class="space-y-3">
                      <div class="flex items-center gap-2">
                        <BIcon name="CreditCard" class="w-4 h-4 text-white/40" />
                        <p class="text-sm font-bold text-white">Карта для получения</p>
                      </div>

                      <!-- Card linked -->
                      <template v-if="form.bankCardMasked && !showCardForm">
                        <div class="flex items-center gap-4 px-4 py-3.5 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl">
                          <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <BIcon name="CreditCard" class="w-5 h-5 text-emerald-400" />
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-xs text-white/40 uppercase tracking-wide font-bold mb-0.5">Привязана карта</p>
                            <p class="text-sm font-bold text-white font-mono tracking-widest">{{ form.bankCardMasked }}</p>
                          </div>
                          <div class="flex gap-2 flex-shrink-0">
                            <button @click="showCardForm = true"
                              class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-white/55 hover:text-white transition-all border border-white/8">
                              Заменить
                            </button>
                            <button @click="unlinkCard()"
                              class="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-error/10 hover:bg-brand-error/20 text-brand-error transition-all border border-brand-error/20">
                              Удалить
                            </button>
                          </div>
                        </div>
                      </template>

                      <!-- No card / card form -->
                      <template v-else>
                        <div v-if="!form.bankCardMasked && !showCardForm"
                          class="px-4 py-4 bg-brand-bg border border-dashed border-white/10 rounded-2xl text-center space-y-3">
                          <BIcon name="CreditCard" class="w-8 h-8 mx-auto text-white/20" />
                          <p class="text-sm text-white/40">Карта не привязана</p>
                          <p class="text-xs text-white/25">Привяжите карту, чтобы включить донаты</p>
                          <button @click="showCardForm = true"
                            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition-all">
                            <BIcon name="Plus" class="w-4 h-4" /> Привязать карту
                          </button>
                        </div>

                        <!-- Card input form -->
                        <div v-if="showCardForm" class="space-y-3 bg-brand-bg border border-brand-border rounded-2xl p-4">
                          <p class="text-xs font-bold text-white/40 uppercase tracking-wider">Реквизиты карты</p>
                          <input
                            type="text"
                            inputmode="numeric"
                            placeholder="0000 0000 0000 0000"
                            :value="cardInputRaw"
                            @input="formatSettingsCard"
                            maxlength="19"
                            class="w-full bg-brand-bg/0 border border-brand-border focus:border-emerald-500/40 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder-white/20 outline-none transition-all" />
                          <div class="grid grid-cols-2 gap-3">
                            <input
                              type="text"
                              inputmode="numeric"
                              placeholder="ММ/ГГ"
                              :value="cardExpInput"
                              @input="formatSettingsExp"
                              maxlength="5"
                              class="w-full bg-brand-bg/0 border border-brand-border focus:border-emerald-500/40 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder-white/20 outline-none transition-all" />
                            <div class="flex items-center justify-center text-xs text-white/25 bg-brand-bg border border-brand-border rounded-xl px-3">
                              CVV не нужен
                            </div>
                          </div>
                          <div class="flex gap-2 pt-1">
                            <button @click="linkCard()"
                              :disabled="cardInputRaw.replace(/\s/g,'').length !== 16 || cardExpInput.length !== 5"
                              class="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                              Привязать
                            </button>
                            <button @click="showCardForm = false; cardInputRaw = ''; cardExpInput = ''"
                              class="px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-white border border-brand-border hover:border-white/20 transition-all">
                              Отмена
                            </button>
                          </div>
                          <p class="text-[10px] text-white/20">Только номер и срок — для идентификации получателя. CVV не хранится.</p>
                        </div>
                      </template>
                    </div>

                    <!-- Donations toggle -->
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <BIcon name="Zap" class="w-4 h-4 text-white/40" />
                        <p class="text-sm font-bold text-white">Включить донаты</p>
                      </div>
                      <div class="flex items-center justify-between px-4 py-3.5 bg-brand-bg border rounded-2xl transition-all"
                        :class="form.bankCardMasked ? 'border-brand-border' : 'border-dashed border-white/8'">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-semibold" :class="form.bankCardMasked ? 'text-white' : 'text-white/30'">
                            {{ form.donationsEnabled ? 'Кнопка «Поддержать» видна всем' : 'Донаты отключены' }}
                          </p>
                          <p class="text-xs mt-0.5" :class="form.bankCardMasked ? 'text-white/40' : 'text-white/20'">
                            {{ form.bankCardMasked ? 'Bloomly берёт 5% с каждой транзакции' : 'Сначала привяжите карту' }}
                          </p>
                        </div>
                        <button
                          :disabled="!form.bankCardMasked"
                          @click="form.bankCardMasked && (form.donationsEnabled = !form.donationsEnabled)"
                          class="relative w-12 h-6 rounded-full transition-all flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                          :style="form.donationsEnabled ? 'background: #10b981' : 'background: rgba(255,255,255,0.08)'">
                          <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all"
                            :class="form.donationsEnabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'" />
                        </button>
                      </div>
                    </div>

                    <!-- Info block -->
                    <div v-if="form.donationsEnabled" class="bg-emerald-500/8 border border-emerald-500/15 rounded-2xl px-4 py-3.5 space-y-2">
                      <div class="flex items-center gap-2">
                        <BIcon name="Info" class="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <p class="text-xs font-bold text-emerald-400">Донаты активны</p>
                      </div>
                      <ul class="space-y-1 text-[11px] text-white/40">
                        <li class="flex gap-1.5"><span class="text-emerald-500 mt-0.5 flex-shrink-0">✓</span> Кнопка «Поддержать» появляется в шапке группы</li>
                        <li class="flex gap-1.5"><span class="text-emerald-500 mt-0.5 flex-shrink-0">✓</span> Посетители видят донат-модал с выбором суммы</li>
                        <li class="flex gap-1.5"><span class="text-emerald-500 mt-0.5 flex-shrink-0">✓</span> Деньги поступают на привязанную карту</li>
                        <li class="flex gap-1.5"><span class="text-white/25 mt-0.5 flex-shrink-0">•</span> Bloomly берёт комиссию 5% за обработку платежа</li>
                      </ul>
                    </div>

                    <!-- Business tab toggle -->
                    <div class="space-y-2">
                      <div class="flex items-center gap-2">
                        <BIcon name="Briefcase" class="w-4 h-4 text-white/40" />
                        <p class="text-sm font-bold text-white">Вкладка «Бизнес» (заказы)</p>
                      </div>
                      <div class="flex items-center justify-between px-4 py-3.5 bg-brand-bg border border-brand-border rounded-2xl transition-all">
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-semibold text-white">
                            {{ form.businessEnabled ? 'Вкладка «Бизнес» включена' : 'Вкладка «Бизнес» выключена' }}
                          </p>
                          <p class="text-xs mt-0.5 text-white/40">Участники смогут оформлять заказы и общаться с вами в чате по каждому заказу</p>
                        </div>
                        <button
                          @click="form.businessEnabled = !form.businessEnabled"
                          class="relative w-12 h-6 rounded-full transition-all flex-shrink-0"
                          :style="form.businessEnabled ? 'background: #10b981' : 'background: rgba(255,255,255,0.08)'">
                          <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all"
                            :class="form.businessEnabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'" />
                        </button>
                      </div>
                      <router-link v-if="form.businessEnabled && group" :to="{ name: 'group-business', params: { slugOrId: group.slug } }"
                        class="inline-flex items-center gap-1 text-xs text-brand-accent hover:underline">
                        Открыть вкладку «Бизнес» <BIcon name="ArrowRight" class="w-3 h-3" />
                      </router-link>
                    </div>

                    <!-- Support tiers -->
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <BIcon name="Crown" class="w-4 h-4 text-brand-yellow" />
                          <p class="text-sm font-bold text-white">Тарифы поддержки</p>
                        </div>
                        <button
                          @click="form.supportTiers.push({ emoji: '⭐', name: '', price: '', desc: '' })"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/25 hover:bg-brand-yellow/20 transition-all">
                          <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить тариф
                        </button>
                      </div>
                      <p class="text-xs text-white/35">Укажи уровни поддержки — они появятся в сайдбаре группы вместо заглушек</p>

                      <div v-if="!form.supportTiers.length"
                        class="px-4 py-5 bg-brand-bg border border-dashed border-white/10 rounded-2xl text-center">
                        <BIcon name="Crown" class="w-7 h-7 mx-auto mb-2 text-white/15" />
                        <p class="text-sm text-white/30">Тарифы не настроены</p>
                        <p class="text-xs text-white/20 mt-0.5">Блок «Поддержать» в группе будет скрыт</p>
                      </div>

                      <div v-for="(tier, idx) in form.supportTiers" :key="idx"
                        class="bg-brand-bg border border-brand-border rounded-2xl p-4 space-y-3">
                        <div class="flex items-center gap-2">
                          <input v-model="tier.emoji" maxlength="4" placeholder="⭐"
                            class="w-14 text-center bg-brand-bg/0 border border-brand-border focus:border-brand-yellow/40 rounded-xl px-2 py-2 text-lg outline-none transition-all" />
                          <input v-model="tier.name" placeholder="Название тарифа"
                            class="flex-1 bg-brand-bg/0 border border-brand-border focus:border-brand-yellow/40 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none transition-all" />
                          <input v-model="tier.price" placeholder="500 ₽/мес" maxlength="20"
                            class="w-28 bg-brand-bg/0 border border-brand-border focus:border-brand-yellow/40 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none transition-all" />
                          <button @click="form.supportTiers.splice(idx, 1)"
                            class="w-8 h-8 flex items-center justify-center rounded-xl text-white/30 hover:text-brand-error hover:bg-brand-error/10 transition-all flex-shrink-0">
                            <BIcon name="Trash2" class="w-4 h-4" />
                          </button>
                        </div>
                        <input v-model="tier.desc" placeholder="Описание — что получит подписчик"
                          class="w-full bg-brand-bg/0 border border-brand-border focus:border-brand-yellow/40 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none transition-all" />
                      </div>
                    </div>

                    <div class="pt-2">
                      <button @click="handleSave" :disabled="saving || !isDirty"
                        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        <BIcon v-if="saving" name="Loader2" class="w-4 h-4 animate-spin" />
                        <BIcon v-else name="Check" class="w-4 h-4" />
                        {{ saving ? 'Сохраняем…' : 'Сохранить настройки' }}
                      </button>
                    </div>

                  </div>
                </section>

                <!-- ═══ § КОМАНДА & РОЛИ ════════════════════════════════ -->
                <section v-show="openSection === 'sec-members'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl scroll-mt-28 overflow-hidden">
                  <!-- Header -->
                  <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between"
                    :style="`background:linear-gradient(90deg,${tailSections[0].color}0c 0%,transparent 100%)`">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${tailSections[0].color}1a`">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${tailSections[0].color}`">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tailSections[0].iconPath"/>
                        </svg>
                      </div>
                      <h2 class="font-bold text-white text-sm">Команда</h2>
                    </div>
                    <button @click="loadMembers" class="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" :class="membersLoading ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Обновить
                    </button>
                  </div>

                  <!-- Tab pills -->
                  <div class="flex gap-1 p-3 border-b border-brand-border bg-brand-bg/30">
                    <button type="button" @click="teamTab = 'members'"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      :class="teamTab === 'members' ? 'bg-[#a78bfa]/15 text-[#a78bfa] border border-[#a78bfa]/30' : 'text-white/40 hover:text-white/70 border border-transparent hover:bg-white/5'">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      Команда
                    </button>
                    <button type="button" @click="teamTab = 'roles'"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      :class="teamTab === 'roles' ? 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30' : 'text-white/40 hover:text-white/70 border border-transparent hover:bg-white/5'">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                      Роли
                    </button>
                    <button type="button" @click="teamTab = 'organizers'"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                      :class="teamTab === 'organizers' ? 'bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30' : 'text-white/40 hover:text-white/70 border border-transparent hover:bg-white/5'">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                      Организаторы
                    </button>
                  </div>

                  <!-- ── Tab: Команда ── -->
                  <div v-show="teamTab === 'members'" class="p-6">
                    <!-- Loading state -->
                    <div v-if="membersLoading" class="flex items-center justify-center py-10">
                      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"/>
                    </div>

                    <!-- Empty -->
                    <div v-else-if="membersLoaded && !membersList.length" class="text-center py-10 text-white/40 text-sm">Участников не найдено</div>

                    <!-- Members list -->
                    <div v-else class="space-y-2">
                      <!-- Role legend -->
                      <div class="flex flex-wrap gap-1.5 mb-4">
                        <span v-for="r in MEMBER_ROLES" :key="r.value"
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-white/10"
                          :style="`background:${r.color}15;color:${r.color}`">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="r.iconPath"/></svg>
                          {{ r.label }}
                        </span>
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-white/10"
                          style="background:#f59e0b15;color:#f59e0b">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                          Владелец
                        </span>
                      </div>

                      <!-- Each member row -->
                      <div v-for="m in sortedMembers" :key="m.user_id"
                        class="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors group/row"
                        :class="form.hiddenMemberIds.includes(m.user_id) ? 'bg-brand-bg/20 border-brand-border/40 opacity-60' : 'bg-brand-bg/50 border-brand-border hover:border-white/15'">
                        <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                        <div v-else class="w-9 h-9 rounded-xl bg-brand-border flex items-center justify-center flex-shrink-0 text-white/40 font-bold text-sm">
                          {{ (m.user.display_name || m.user.username).charAt(0).toUpperCase() }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-semibold text-white truncate">{{ m.user.display_name || m.user.username }}</p>
                          <p class="text-xs text-white/40 truncate">@{{ m.user.username }}</p>
                        </div>
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-white/10 flex-shrink-0"
                          :style="`background:${(ROLE_META[m.role] ?? ROLE_META.member).color}15;color:${(ROLE_META[m.role] ?? ROLE_META.member).color}`">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="(ROLE_META[m.role] ?? ROLE_META.member).iconPath"/></svg>
                          {{ (ROLE_META[m.role] ?? ROLE_META.member).label }}
                        </span>
                        <!-- Eye toggle (hide/show from public) - owner-only, for non-members only -->
                        <button v-if="isOwner && ['owner','admin','moderator'].includes(m.role)"
                          type="button"
                          @click="toggleHideMember(m.user_id)"
                          class="w-8 h-8 rounded-xl border flex items-center justify-center transition-all flex-shrink-0"
                          :class="form.hiddenMemberIds.includes(m.user_id) ? 'border-brand-error/40 bg-brand-error/10 text-brand-error hover:bg-brand-error/20' : 'border-brand-border/60 bg-brand-bg text-white/30 hover:border-white/30 hover:text-white/60'"
                          :title="form.hiddenMemberIds.includes(m.user_id) ? 'Показать публично' : 'Скрыть от публики'">
                          <svg v-if="!form.hiddenMemberIds.includes(m.user_id)" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                        </button>
                        <!-- Role changer (not for owner) -->
                        <div v-if="m.role !== 'owner'" class="relative flex-shrink-0">
                          <div v-if="memberSaving[m.user_id]" class="w-5 h-5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"/>
                          <template v-else>
                            <button @click="openRoleDropdown($event, m.user_id)"
                              class="w-8 h-8 rounded-xl border border-brand-border bg-brand-bg hover:border-white/30 flex items-center justify-center transition-colors"
                              :class="roleDropdownFor === m.user_id ? 'border-brand-accent bg-brand-accent/10' : ''"
                              title="Изменить роль">
                              <svg class="w-3.5 h-3.5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                              </svg>
                            </button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- ── Tab: Роли ── -->
                  <div v-show="teamTab === 'roles'" class="p-6">
                    <div class="flex justify-end mb-4">
                      <button @click="openCreateRole"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors"
                        style="background:#f59e0b20;color:#f59e0b">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        Создать роль
                      </button>
                    </div>

                    <div v-if="customRolesLoading" class="flex items-center justify-center py-10">
                      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"/>
                    </div>

                    <div v-else>
                      <!-- Системные роли -->
                      <div class="mb-6">
                        <p class="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Встроенные роли</p>
                        <div class="space-y-2">
                          <div v-for="(perms, rkey) in SYSTEM_ROLE_PERMISSIONS" :key="rkey"
                            class="flex items-start gap-3 px-4 py-3 rounded-2xl bg-brand-bg/50 border border-brand-border">
                            <span class="mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center" :style="`background:${(ROLE_META[rkey] ?? ROLE_META.member).color}15`">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${(ROLE_META[rkey] ?? ROLE_META.member).color}`"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="(ROLE_META[rkey] ?? ROLE_META.member).iconPath"/></svg>
                            </span>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 mb-1.5">
                                <span class="text-sm font-semibold text-white">{{ (ROLE_META[rkey] ?? ROLE_META.member).label }}</span>
                                <span class="text-xs px-2 py-0.5 rounded-md border border-white/10 text-white/40">встроенная</span>
                              </div>
                              <div class="flex flex-wrap gap-1.5">
                                <span v-for="p in PERMISSIONS_LIST" :key="p.id"
                                  class="text-xs px-2 py-0.5 rounded-lg border"
                                  :class="perms.includes(p.id) ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-white/8 text-white/20 bg-transparent'">
                                  <svg class="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="p.iconPath"/></svg>
                                  {{ p.label }}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Кастомные роли -->
                      <div>
                        <p class="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Пользовательские роли</p>
                        <div v-if="!customRolesList.length" class="text-center py-8 text-white/30 text-sm border border-dashed border-white/10 rounded-2xl">
                          Нет ролей. Нажмите «Создать роль» чтобы добавить.
                        </div>
                        <div v-else class="space-y-2 mb-4">
                          <div v-for="role in customRolesList" :key="role.id"
                            class="flex items-start gap-3 px-4 py-3 rounded-2xl bg-brand-bg/50 border border-brand-border hover:border-white/15 transition-colors">
                            <span class="text-xl flex-shrink-0 mt-0.5">{{ role.icon }}</span>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 mb-1.5">
                                <span class="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" :style="`background:${role.color}`"/>
                                <span class="text-sm font-semibold text-white">{{ role.name }}</span>
                              </div>
                              <div class="flex flex-wrap gap-1.5">
                                <span v-for="p in PERMISSIONS_LIST" :key="p.id"
                                  class="text-xs px-2 py-0.5 rounded-lg border"
                                  :class="role.permissions.includes(p.id) ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-white/8 text-white/20'">
                                  <svg class="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="p.iconPath"/></svg>
                                  {{ p.label }}
                                </span>
                              </div>
                            </div>
                            <div class="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                              <button @click="openEditRole(role)"
                                class="w-8 h-8 rounded-xl border border-brand-border bg-brand-bg hover:border-white/30 flex items-center justify-center transition-colors text-white/50 hover:text-white"
                                title="Редактировать">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                              </button>
                              <button @click="confirmDeleteRole(role.id)"
                                :disabled="deletingRoleId === role.id"
                                class="w-8 h-8 rounded-xl border border-red-500/20 bg-brand-bg hover:border-red-500/50 hover:bg-red-500/10 flex items-center justify-center transition-colors text-red-400/60 hover:text-red-400"
                                title="Удалить">
                                <svg v-if="deletingRoleId !== role.id" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                                <div v-else class="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>
                              </button>
                            </div>
                          </div>
                        </div>
                        <button @click="openCreateRole"
                          class="w-full py-3 rounded-2xl border border-dashed border-white/15 text-sm text-white/40 hover:text-white/70 hover:border-white/30 transition-colors flex items-center justify-center gap-2">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                          </svg>
                          Добавить роль
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ── Tab: Организаторы ── -->
                  <div v-show="teamTab === 'organizers'" class="p-5 space-y-5">
                    <!-- Current admins/organizers -->
                    <div>
                      <div class="flex items-center justify-between mb-3">
                        <p class="text-xs font-bold text-white/55 uppercase tracking-wider">Текущие организаторы</p>
                        <span class="text-[10px] text-white/30">Роли: owner, admin, moderator</span>
                      </div>
                      <div v-if="membersLoading" class="flex items-center gap-2 py-4 text-white/40 text-sm">
                        <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        Загрузка участников…
                      </div>
                      <div v-else-if="!sortedMembers.filter(m => ['owner','admin','moderator'].includes(m.role)).length"
                        class="py-4 text-center text-white/30 text-sm bg-brand-bg border border-dashed border-brand-border/60 rounded-2xl">
                        Нет назначенных организаторов
                      </div>
                      <div v-else class="space-y-2">
                        <div v-for="m in sortedMembers.filter(m => ['owner','admin','moderator'].includes(m.role))" :key="m.user_id"
                          class="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-brand-bg border border-brand-border">
                          <div class="w-9 h-9 rounded-xl bg-brand-accent/15 overflow-hidden flex-shrink-0">
                            <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" />
                            <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-xs font-bold">{{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}</div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-white truncate">{{ m.user.display_name || m.user.username }}</p>
                            <p class="text-[10px] mt-0.5 flex items-center gap-1" :style="`color: ${ROLE_META[m.role]?.color || '#9ca3af'}`"><svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="ROLE_META[m.role]?.iconPath ?? ROLE_META.member.iconPath"/></svg>{{ ROLE_META[m.role]?.label }}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Add organizer from members -->
                    <div v-if="sortedMembers.filter(m => m.role === 'member').length">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">Назначить из участников</p>
                      <div class="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                        <div v-for="m in sortedMembers.filter(m => m.role === 'member').slice(0, 20)" :key="m.user_id"
                          class="flex items-center gap-3 px-3 py-2 rounded-xl bg-brand-bg/60 border border-brand-border/60 hover:border-brand-border transition-colors">
                          <div class="w-8 h-8 rounded-lg bg-brand-accent/10 overflow-hidden flex-shrink-0">
                            <img v-if="m.user.avatar_url" :src="m.user.avatar_url" class="w-full h-full object-cover" />
                            <div v-else class="w-full h-full flex items-center justify-center text-brand-accent/60 text-xs font-bold">{{ (m.user.display_name || m.user.username || '?')[0].toUpperCase() }}</div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm text-white/80 truncate">{{ m.user.display_name || m.user.username }}</p>
                          </div>
                          <div class="flex gap-1.5">
                            <button type="button" :disabled="!!memberSaving[m.user_id]"
                              class="px-2.5 py-1 rounded-lg border border-[#a78bfa]/30 text-[#a78bfa] text-[10px] font-bold hover:bg-[#a78bfa]/10 transition-colors disabled:opacity-40"
                              @click="doSetRole(m.user_id, 'moderator')">
                              Модератор
                            </button>
                            <button v-if="isOwner" type="button" :disabled="!!memberSaving[m.user_id]"
                              class="px-2.5 py-1 rounded-lg border border-[#3b82f6]/30 text-[#3b82f6] text-[10px] font-bold hover:bg-[#3b82f6]/10 transition-colors disabled:opacity-40"
                              @click="doSetRole(m.user_id, 'admin')">
                              Админ
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Contact info -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-brand-border/30 pt-5">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Телефон</label>
                        <input v-model="form.contactPhone" placeholder="+7 (999) 123-45-67" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Email</label>
                        <input v-model="form.contactEmail" placeholder="event@example.com" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § SOCIAL LINKS ═══════════════════════════════════ -->
                <section v-show="openSection === 'sec-social'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${tailSections[2].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${tailSections[2].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${tailSections[2].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tailSections[2].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ tailSections[2].label }}</h2>
                  </div>
                  <div class="p-6 space-y-4">
                    <div v-for="link in [
                      { key: 'socialTelegram', label: 'Telegram', placeholder: 'https://t.me/...', d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
                      { key: 'socialDiscord', label: 'Discord', placeholder: 'https://discord.gg/...', d: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z' },
                      { key: 'socialTwitter', label: 'Twitter / X', placeholder: 'https://x.com/...', d: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z' },
                      { key: 'socialVk', label: 'VK', placeholder: 'https://vk.com/...', d: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20' },
                      { key: 'socialWebsite', label: 'Сайт', placeholder: 'https://...', d: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
                    ]" :key="link.key" class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                        <svg class="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="link.d"/></svg>
                      </div>
                      <div class="flex-1">
                        <label class="text-xs font-semibold text-white/55 mb-0.5 block">{{ link.label }}</label>
                        <input v-model="(form as any)[link.key]" :placeholder="link.placeholder" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § CUSTOMIZE ═══════════════════════════════════════ -->
                <section v-show="openSection === 'sec-customize'" class="bg-brand-card border border-border-default rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-border-default flex items-center gap-3"
                    style="background:linear-gradient(90deg,rgba(167,139,250,0.05) 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(167,139,250,0.12)">
                      <BIcon name="Palette" class="w-4 h-4" style="color:#a78bfa" />
                    </div>
                    <h2 class="font-bold text-sm text-text-primary">Кастомизация группы</h2>
                  </div>

                  <div class="p-6">
                    <!-- Business upsell -->
                    <div v-if="authStore.user?.subscription_tier !== 'business'" class="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 flex flex-col items-center gap-3 text-center">
                      <div class="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center">
                        <BIcon name="Lock" class="w-6 h-6 text-violet-400" />
                      </div>
                      <div>
                        <p class="font-semibold text-text-primary">Доступно для Business</p>
                        <p class="text-sm text-text-muted mt-1">Кастомизация группы — приобретайте фоны, рамки и темы в магазине Bloomly. Требуется Business-подписка.</p>
                      </div>
                      <button @click="$router.push('/subscription')" class="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
                        Перейти к подпискам
                      </button>
                    </div>

                    <!-- Customization editors (business only) -->
                    <template v-else>
                      <!-- My items from shop -->
                      <div class="space-y-6">
                        <!-- Background -->
                        <div>
                          <label class="block text-sm font-medium text-text-primary mb-2">Фон группы</label>
                          <p class="text-xs text-text-muted mb-3">Купите фоны в <span class="text-violet-400 cursor-pointer hover:underline" @click="$router.push('/shop')">Bloomly Shop</span> и применяйте здесь</p>
                          <div class="flex flex-wrap gap-2">
                            <button
                              @click="form.groupBgUrl = ''"
                              :class="['h-16 w-16 rounded-xl border-2 transition-all flex items-center justify-center text-xs text-text-muted', !form.groupBgUrl ? 'border-violet-500 bg-violet-500/10' : 'border-border-default hover:border-border-hover bg-bg-elevated']"
                            >Нет</button>
                            <div
                              v-for="item in shopStore.myItems.filter(i => i.type === 'background')"
                              :key="item.id"
                              class="relative cursor-pointer"
                              @click="form.groupBgUrl = getShopItemBgUrl(item)"
                            >
                              <div
                                :class="['h-16 w-24 rounded-xl border-2 transition-all overflow-hidden', form.groupBgUrl === getShopItemBgUrl(item) ? 'border-violet-500 scale-105 shadow-lg shadow-violet-500/20' : 'border-border-default hover:border-border-hover']"
                              >
                                <img v-if="item.preview_url" :src="item.preview_url" class="w-full h-full object-cover" :alt="item.name" />
                                <div v-else class="w-full h-full bg-bg-elevated flex items-center justify-center"><BIcon name="Image" class="w-5 h-5 text-text-muted" /></div>
                              </div>
                              <p class="text-xs text-center text-text-muted mt-1 truncate w-24">{{ item.name }}</p>
                            </div>
                            <div v-if="shopStore.myItems.filter(i => i.type === 'background').length === 0" class="text-xs text-text-muted py-2 px-3 bg-bg-secondary rounded-lg border border-border-default">
                              У вас нет купленных фонов
                            </div>
                          </div>
                        </div>

                        <!-- Frame -->
                        <div>
                          <label class="block text-sm font-medium text-text-primary mb-2">Рамка</label>
                          <div class="flex flex-wrap gap-2">
                            <button
                              @click="form.groupFrame = ''"
                              :class="['h-12 px-3 rounded-xl border-2 transition-all text-xs text-text-muted', !form.groupFrame ? 'border-violet-500 bg-violet-500/10' : 'border-border-default hover:border-border-hover bg-bg-elevated']"
                            >Нет</button>
                            <button
                              v-for="item in shopStore.myItems.filter(i => i.type === 'frame')"
                              :key="item.id"
                              @click="form.groupFrame = item.id"
                              :class="['h-12 px-3 rounded-xl border-2 transition-all text-xs font-medium', form.groupFrame === item.id ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-border-default text-text-muted hover:border-border-hover bg-bg-elevated']"
                            >{{ item.name }}</button>
                            <div v-if="shopStore.myItems.filter(i => i.type === 'frame').length === 0" class="text-xs text-text-muted py-2 px-3 bg-bg-secondary rounded-lg border border-border-default">
                              У вас нет купленных рамок
                            </div>
                          </div>
                        </div>

                        <!-- Theme -->
                        <div>
                          <label class="block text-sm font-medium text-text-primary mb-2">Тема оформления</label>
                          <div class="flex flex-wrap gap-2">
                            <button
                              @click="form.groupTheme = ''"
                              :class="['h-12 px-3 rounded-xl border-2 transition-all text-xs text-text-muted', !form.groupTheme ? 'border-violet-500 bg-violet-500/10' : 'border-border-default hover:border-border-hover bg-bg-elevated']"
                            >По умолчанию</button>
                            <button
                              v-for="item in shopStore.myItems.filter(i => i.type === 'theme')"
                              :key="item.id"
                              @click="form.groupTheme = item.id"
                              :class="['h-12 px-3 rounded-xl border-2 transition-all text-xs font-medium', form.groupTheme === item.id ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-border-default text-text-muted hover:border-border-hover bg-bg-elevated']"
                            >{{ item.name }}</button>
                            <div v-if="shopStore.myItems.filter(i => i.type === 'theme').length === 0" class="text-xs text-text-muted py-2 px-3 bg-bg-secondary rounded-lg border border-border-default">
                              У вас нет купленных тем
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>
                </section>

                <!-- ═══ § DANGER ZONE ════════════════════════════════════ -->
                <section v-show="openSection === 'sec-danger'" class="bg-brand-card border border-brand-error/20 rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-error/20 flex items-center gap-3"
                    style="background:linear-gradient(90deg,rgba(239,68,68,0.05) 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(239,68,68,0.1)">
                      <svg class="w-4 h-4 text-brand-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-brand-error text-sm">Опасная зона</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <p class="text-white/40 text-sm">Эти действия необратимы. Будьте осторожны.</p>
                    <div class="bg-brand-bg/40 border border-brand-error/20 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p class="text-white font-bold text-sm">Удалить группу</p>
                        <p class="text-white/40 text-xs">Все данные, события и подписчики будут удалены</p>
                      </div>
                      <button v-if="!showDeleteConfirm" type="button" class="px-4 py-2 rounded-xl bg-brand-error/10 text-brand-error text-xs font-bold hover:bg-brand-error/20 transition-colors"
                        @click="showDeleteConfirm = true">Удалить</button>
                      <div v-else class="flex gap-2">
                        <button type="button" class="px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-white/50 text-xs font-bold" @click="showDeleteConfirm = false">Отмена</button>
                        <button type="button" class="px-3 py-2 rounded-xl bg-brand-error text-white text-xs font-bold" @click="deleteGroup">Подтвердить</button>
                      </div>
                    </div>
                  </div>
                </section>

              </form>
            </div><!-- /form column -->
          </div><!-- /flex-row-reverse -->
        </template>

        <div v-else class="text-center py-16">
          <BIcon name="Lock" class="w-12 h-12 text-brand-error mx-auto mb-4" />
          <p class="text-white/40 text-sm">У вас нет доступа к настройкам этой группы</p>
        </div>
      </main>
    </div>
  </div>

  <!-- ══ Dropdown роли (Teleport to body, fixes overflow-hidden clip) ══ -->
  <Teleport to="body">
    <div v-if="roleDropdownFor && roleDropdownMember"
      class="fixed z-[999] bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1.5 w-56"
      :style="`top:${dropdownY}px;right:${
        typeof window !== 'undefined' ? window.innerWidth - dropdownX : 0
      }px`"
      @click.stop>
      <div class="px-3 pb-1 pt-0.5 mb-1 border-b border-brand-border">
        <p class="text-xs font-semibold text-white/40">Изменить роль</p>
      </div>
      <button v-for="r in assignableRoles" :key="r.value"
        @click="doSetRole(roleDropdownMember!.user_id, r.value)"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-white/5 transition-colors text-left"
        :class="roleDropdownMember!.role === r.value ? 'text-white font-bold' : 'text-white/70'">
        <span class="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center" :style="`background:${r.color}20`">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${r.color}`"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="r.iconPath"/></svg>
        </span>
        <span class="flex-1">{{ r.label }}</span>
        <svg v-if="roleDropdownMember!.role === r.value" class="w-3.5 h-3.5 flex-shrink-0" style="color:#a78bfa" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
        </svg>
      </button>
      <!-- Admins may not remove other admins — only the owner can -->
      <div v-if="isOwner || roleDropdownMember!.role !== 'admin'" class="border-t border-brand-border mt-1 pt-1">
        <button @click="doKickMember(roleDropdownMember!.user_id); closeRoleDropdown()"
          :disabled="memberKicking[roleDropdownMember!.user_id]"
          class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6m3-3l3 3-3 3"/>
          </svg>
          Кикнуть
        </button>
      </div>
    </div>
    <!-- Backdrop to close dropdown -->
    <div v-if="roleDropdownFor" class="fixed inset-0 z-[998]" @click="closeRoleDropdown()"/>
  </Teleport>

  <!-- ══ Модалка создания/редактирования роли ═══════════════════════════ -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showRoleModal" class="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showRoleModal = false"/>
        <div class="relative bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-lg p-6 z-10" @click.stop>
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-bold text-white">{{ roleModalMode === 'create' ? 'Новая роль' : 'Редактировать роль' }}</h2>
            <button @click="showRoleModal = false" class="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <!-- Имя + цвет + иконка -->
          <div class="flex items-end gap-3 mb-5">
            <div class="flex-1">
              <label class="text-xs font-semibold text-white/50 mb-1.5 block">Название роли <span class="text-brand-accent">*</span></label>
              <input v-model="roleForm.name" maxlength="50" placeholder="Например: Художник" class="field-input" autofocus />
            </div>
            <div>
              <label class="text-xs font-semibold text-white/50 mb-1.5 block">Цвет</label>
              <input type="color" v-model="roleForm.color" class="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0.5" />
            </div>
          </div>

          <!-- Эмодзи-иконка -->
          <div class="mb-5">
            <label class="text-xs font-semibold text-white/50 mb-2 block">Иконка</label>
            <div class="flex flex-wrap gap-2">
              <button v-for="e in EMOJI_OPTIONS" :key="e"
                type="button"
                @click="roleForm.icon = e"
                class="w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all border"
                :class="roleForm.icon === e ? 'border-brand-accent bg-brand-accent/20 shadow-md scale-110' : 'border-white/10 bg-white/5 hover:bg-white/10'">
                {{ e }}
              </button>
            </div>
          </div>

          <!-- Разрешения -->
          <div class="mb-6">
            <label class="text-xs font-semibold text-white/50 mb-2 block">Разрешения</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button v-for="p in PERMISSIONS_LIST" :key="p.id"
                type="button"
                @click="togglePermission(p.id)"
                class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all text-left"
                :class="roleForm.permissions.includes(p.id)
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                  : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/70'">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="p.iconPath"/></svg>
                <span class="text-xs font-medium leading-tight">{{ p.label }}</span>
                <svg v-if="roleForm.permissions.includes(p.id)" class="w-3.5 h-3.5 ml-auto text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Preview -->
          <div class="mb-6 px-4 py-3 rounded-2xl bg-brand-bg/60 border border-brand-border flex items-center gap-3">
            <span class="text-xl">{{ roleForm.icon }}</span>
            <div class="flex-1">
              <p class="text-sm font-semibold text-white">{{ roleForm.name || 'Название роли' }}</p>
              <p class="text-xs text-white/40">{{ roleForm.permissions.length }} разрешений</p>
            </div>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-white/10"
              :style="`background:${roleForm.color}15;color:${roleForm.color}`">
              {{ roleForm.icon }} {{ roleForm.name || '...' }}
            </span>
          </div>

          <!-- Кнопки -->
          <div class="flex items-center justify-end gap-3">
            <button @click="showRoleModal = false"
              class="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors rounded-xl hover:bg-white/5">
              Отмена
            </button>
            <button @click="saveRole"
              :disabled="customRoleSaving || !roleForm.name.trim()"
              class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-brand-accent hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors">
              <div v-if="customRoleSaving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              {{ roleModalMode === 'create' ? 'Создать' : 'Сохранить' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.field-input {
  @apply w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/50 focus:outline-none transition-all;
}
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.toast-enter-active, .toast-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.88); }
.floatbar-enter-active, .floatbar-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.floatbar-enter-from, .floatbar-leave-to { opacity: 0; transform: translateY(20px) scale(0.92); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.25s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@keyframes shake {
  0%,100% { transform: translateX(0); }
  15%     { transform: translateX(-6px); }
  30%     { transform: translateX(6px); }
  45%     { transform: translateX(-5px); }
  60%     { transform: translateX(5px); }
  75%     { transform: translateX(-3px); }
  90%     { transform: translateX(3px); }
}
.animate-shake { animation: shake 0.55s ease; }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
</style>