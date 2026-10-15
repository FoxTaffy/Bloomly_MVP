import { computed, ref, watch } from 'vue'
import api from '@/api'
import { useMessagesStore, type Conversation, type MsgSender } from '@/stores/messages'
import type { MentionUser } from './useMentionAutocomplete'

export interface GroupChatMember { user_id: string; role: string; user: MsgSender }

/** Members, online counters and admin actions (add/kick/promote) of a group conversation. */
export function useGroupChatManagement(convId: () => string, conv: () => Conversation | undefined) {
  const store = useMessagesStore()

  // ── Members ───────────────────────────────────────────────────────────
  const groupMembers = ref<GroupChatMember[]>([])
  const membersLoading = ref(false)
  // When the group has no custom banner, the banner is filled with a collage of member avatars.
  const bannerCollage = computed(() => groupMembers.value.slice(0, 8).map((m) => m.user))

  // Member search (within the info modal — separate from the admin "add member" search below)
  const memberSearchQuery = ref('')
  const filteredGroupMembers = computed(() => {
    const q = memberSearchQuery.value.trim().toLowerCase()
    if (!q) return groupMembers.value
    return groupMembers.value.filter((m) =>
      m.user?.username?.toLowerCase().includes(q) || m.user?.display_name?.toLowerCase().includes(q))
  })

  // Online status for every member — reuses the same batch endpoint the DM header uses.
  const groupOnlineStatus = ref<Record<string, boolean>>({})
  const groupOnlineCount = computed(() => Object.values(groupOnlineStatus.value).filter(Boolean).length)
  async function fetchGroupOnlineStatus() {
    if (!groupMembers.value.length) return
    try {
      const ids = groupMembers.value.map((m) => m.user_id).join(',')
      const res = await api.get(`/users/online?ids=${ids}`)
      groupOnlineStatus.value = res.data?.data ?? {}
    } catch { /* silent */ }
  }

  async function fetchGroupMembers() {
    if (!conv()?.is_group) return
    membersLoading.value = true
    try { groupMembers.value = await store.getGroupMembers(convId()) }
    catch { /* silent */ }
    finally { membersLoading.value = false }
    fetchGroupOnlineStatus()
  }

  async function kickMember(userId: string) {
    await store.removeGroupMember(convId(), userId)
    groupMembers.value = groupMembers.value.filter((m) => m.user_id !== userId)
  }

  async function toggleMemberRole(m: GroupChatMember) {
    const newRole = m.role === 'admin' ? 'member' : 'admin'
    await store.setGroupMemberRole(convId(), m.user_id, newRole)
    m.role = newRole
  }

  // ── Add member ────────────────────────────────────────────────────────
  const showAddMember = ref(false)
  const addMemberSearch = ref('')
  const addMemberResults = ref<MentionUser[]>([])
  const addMemberLoading = ref(false)
  let addMemberTimer: ReturnType<typeof setTimeout> | null = null
  function debouncedAddMemberSearch() {
    if (addMemberTimer) clearTimeout(addMemberTimer)
    addMemberTimer = setTimeout(runAddMemberSearch, 300)
  }
  async function runAddMemberSearch() {
    const q = addMemberSearch.value.trim()
    if (q.length < 2) { addMemberResults.value = []; return }
    addMemberLoading.value = true
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=10`)
      addMemberResults.value = res.data.data.users ?? []
    } catch { addMemberResults.value = [] }
    finally { addMemberLoading.value = false }
  }
  async function doAddMember(u: MentionUser) {
    if (groupMembers.value.some(m => m.user_id === u.id)) return
    try {
      await store.addGroupMember(convId(), u.id)
      groupMembers.value.push({ user_id: u.id, role: 'member', user: u as any })
    } catch { /* silent */ }
  }

  watch(convId, () => {
    groupMembers.value = []
    if (conv()?.is_group) fetchGroupMembers()
  })

  return {
    groupMembers, membersLoading, bannerCollage, memberSearchQuery, filteredGroupMembers,
    groupOnlineStatus, groupOnlineCount, fetchGroupMembers, fetchGroupOnlineStatus, kickMember, toggleMemberRole,
    showAddMember, addMemberSearch, addMemberResults, addMemberLoading, debouncedAddMemberSearch, doAddMember,
  }
}
