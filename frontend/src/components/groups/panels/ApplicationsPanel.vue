<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type GroupMember, type MemberRole } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'

const props = withDefaults(defineProps<{
  groupId?: string
  groupType?: string
  showBack?: boolean
}>(), { showBack: false })

const emit = defineEmits<{ back: [] }>()

const groupsStore = useGroupsStore()
const auth = useAuthStore()
const { confirmDialog } = useConfirm()

const members = ref<GroupMember[]>([])
const loading = ref(false)
const error = ref('')
const removing = ref<string | null>(null)
const changingRole = ref<string | null>(null)
const roleDropdown = ref<string | null>(null)

const isOwner = computed(() => {
  const m = groupsStore.myGroups.find(m => m.group_id === props.groupId)
  return m?.group?.owner_id === auth.user?.id
})

const ROLES: { value: MemberRole; label: string }[] = [
  { value: 'admin', label: 'Администратор' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'member', label: 'Участник' },
  { value: 'dealer', label: 'Дилер' },
  { value: 'volunteer', label: 'Волонтёр' },
]

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  moderator: 'Модератор',
  member: 'Участник',
  dealer: 'Дилер',
  volunteer: 'Волонтёр',
  guest_of_honor: 'Почётный гость',
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  admin: 'text-brand-purple bg-brand-purple/10 border-brand-purple/20',
  moderator: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  member: 'text-white/50 bg-white/5 border-white/10',
  dealer: 'text-brand-accent bg-brand-accent/10 border-brand-accent/20',
  volunteer: 'text-green-400 bg-green-400/10 border-green-400/20',
  guest_of_honor: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
}

const filterRole = ref<string>('all')

const filteredMembers = computed(() => {
  if (filterRole.value === 'all') return members.value
  return members.value.filter(m => m.role === filterRole.value)
})

const pageTitle = computed(() => {
  const t = props.groupType
  if (t === 'event') return 'Заявки участников'
  if (t === 'artist' || t === 'creative') return 'Очередь / Заказы'
  if (t === 'shop') return 'Покупатели'
  return 'Участники'
})

const pageDesc = computed(() => {
  const t = props.groupType
  if (t === 'event') return 'Участники мероприятия'
  if (t === 'artist' || t === 'creative') return 'Участники студии'
  return 'Управление участниками группы'
})

async function loadMembers() {
  if (!props.groupId) return
  loading.value = true
  error.value = ''
  try {
    members.value = await groupsStore.fetchMembers(props.groupId)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function changeRole(member: GroupMember, newRole: MemberRole) {
  if (!props.groupId) return
  changingRole.value = member.user_id
  roleDropdown.value = null
  try {
    const updated = await groupsStore.changeMemberRole(props.groupId, member.user_id, newRole)
    const idx = members.value.findIndex(m => m.user_id === member.user_id)
    if (idx !== -1) members.value[idx] = { ...members.value[idx], role: (updated as any).role ?? newRole }
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    changingRole.value = null
  }
}

async function kickMember(member: GroupMember) {
  if (!props.groupId) return
  const name = member.user.display_name || member.user.username
  if (!(await confirmDialog(`Удалить ${name} из группы?`, { danger: true }))) return
  removing.value = member.user_id
  try {
    await groupsStore.removeMember(props.groupId, member.user_id)
    members.value = members.value.filter(m => m.user_id !== member.user_id)
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    removing.value = null
  }
}

function toggleDropdown(userId: string) {
  roleDropdown.value = roleDropdown.value === userId ? null : userId
}

watch(() => props.groupId, () => {
  members.value = []
  loadMembers()
})

onMounted(async () => {
  if (!groupsStore.myGroups.length) await groupsStore.loadMyGroups()
  await loadMembers()
})

defineExpose({ loadMembers })
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">

    <!-- Header -->
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-brand-purple/15 border border-brand-purple/25 flex items-center justify-center flex-shrink-0">
        <BIcon name="Users" class="w-5 h-5 text-brand-purple" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">{{ pageTitle }}</h1>
        <p class="text-xs text-white/40">{{ pageDesc }}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 rounded-xl bg-white/5 border border-brand-border text-xs font-bold text-white/50">
          {{ members.length }}
        </span>
        <button
          v-if="showBack && groupId"
          @click="emit('back')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border text-xs font-semibold text-white/55 hover:text-white hover:border-brand-accent/50 transition-all">
          <BIcon name="ArrowLeft" class="w-3.5 h-3.5" /> Назад
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="px-6 pt-4 pb-2 flex items-center gap-2 flex-wrap">
      <button
        v-for="f in [{ key: 'all', label: 'Все' }, { key: 'admin', label: 'Администраторы' }, { key: 'moderator', label: 'Модераторы' }, { key: 'member', label: 'Участники' }]"
        :key="f.key"
        @click="filterRole = f.key"
        :class="[
          'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border',
          filterRole === f.key
            ? 'bg-brand-purple/20 border-brand-purple/40 text-brand-purple'
            : 'bg-white/4 border-brand-border text-white/50 hover:text-white hover:border-white/20'
        ]">
        {{ f.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-6 py-10 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-purple/30 border-t-brand-purple rounded-full animate-spin" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-6 py-10 text-center text-brand-error text-sm">{{ error }}</div>

    <!-- No group -->
    <div v-else-if="!groupId" class="px-6 py-16 flex flex-col items-center gap-3">
      <BIcon name="AlertCircle" class="w-10 h-10 text-white/20" />
      <p class="text-white/40 text-sm">Группа не выбрана</p>
    </div>

    <!-- Members list -->
    <div v-else class="divide-y divide-brand-border/50">
      <div
        v-for="member in filteredMembers"
        :key="member.user_id"
        class="px-6 py-4 flex items-center gap-3 hover:bg-white/2 transition-colors relative">

        <!-- Avatar -->
        <div class="relative flex-shrink-0">
          <img
            v-if="member.user.avatar_url"
            :src="member.user.avatar_url"
            class="w-11 h-11 rounded-2xl object-cover border border-brand-border" />
          <div
            v-else
            class="w-11 h-11 rounded-2xl bg-brand-accent/20 border border-brand-border flex items-center justify-center text-sm font-extrabold text-brand-accent">
            {{ (member.user.display_name || member.user.username || '?')[0].toUpperCase() }}
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <p class="font-bold text-white text-sm truncate">
            {{ member.user.display_name || member.user.username }}
          </p>
          <p class="text-xs text-white/40 truncate">@{{ member.user.username }}</p>
        </div>

        <!-- Role badge -->
        <span :class="['px-2.5 py-1 rounded-xl border text-[11px] font-bold', ROLE_COLORS[member.role] ?? ROLE_COLORS.member]">
          {{ ROLE_LABELS[member.role] ?? member.role }}
        </span>

        <!-- Actions (owner only, skip owner row) -->
        <div v-if="isOwner && member.role !== 'owner'" class="flex items-center gap-1.5 ml-1">

          <!-- Role selector -->
          <div class="relative">
            <button
              @click.stop="toggleDropdown(member.user_id)"
              :disabled="changingRole === member.user_id"
              class="p-1.5 rounded-xl border border-brand-border text-white/40 hover:text-white hover:border-brand-accent/50 transition-all disabled:opacity-40">
              <BIcon name="ChevronDown" class="w-3.5 h-3.5" />
            </button>

            <!-- Dropdown -->
            <div
              v-if="roleDropdown === member.user_id"
              class="absolute right-0 top-full mt-1 z-50 bg-brand-card border border-brand-border rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
              <button
                v-for="r in ROLES"
                :key="r.value"
                @click="changeRole(member, r.value)"
                :class="[
                  'w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-white/5 transition-colors',
                  member.role === r.value ? 'text-brand-purple' : 'text-white/70'
                ]">
                {{ r.label }}
              </button>
            </div>
          </div>

          <!-- Kick button -->
          <button
            @click="kickMember(member)"
            :disabled="removing === member.user_id"
            class="p-1.5 rounded-xl border border-brand-border text-white/30 hover:text-red-400 hover:border-red-400/40 transition-all disabled:opacity-40">
            <BIcon name="UserMinus" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Loading spinner -->
        <div v-if="changingRole === member.user_id || removing === member.user_id" class="ml-1">
          <div class="w-4 h-4 border-2 border-brand-purple/30 border-t-brand-purple rounded-full animate-spin" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="!filteredMembers.length" class="px-6 py-16 flex flex-col items-center gap-3">
        <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center">
          <BIcon name="Users" class="w-7 h-7 text-white/20" />
        </div>
        <p class="text-white/40 text-sm font-semibold">Участников не найдено</p>
      </div>
    </div>

  </div>
</template>
