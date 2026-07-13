import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'

const ADMIN_ROUTES = new Set([
  'group-detail', 'group-settings',
  'my-applications', 'my-tickets', 'my-todolist',
])

export interface AdminTool {
  key: string
  icon: string
  label: string
  action: () => void
}

/** Shared "admin tools" list — same group + tool set surfaced in AppSidebar and inside group settings. */
export function useGroupAdminTools() {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()
  const groupsStore = useGroupsStore()

  const adminGroup = computed(() => {
    if (!ADMIN_ROUTES.has(route.name as string) || !auth.user) return null

    let g = groupsStore.currentGroup

    if (!g && route.query.group) {
      const m = groupsStore.myGroups.find(m => m.group_id === route.query.group)
      g = m?.group ?? null
    }

    if (!g) return null

    const isOwner = g.owner_id === auth.user.id
    const isAdmin = groupsStore.myGroups.some(
      m => m.group_id === g!.id && ['owner', 'admin'].includes(m.role)
    )
    return (isOwner || isAdmin) ? g : null
  })

  const adminTools = computed<AdminTool[]>(() => {
    const g = adminGroup.value
    if (!g) return []
    const gid = g.id
    const slug = (g as any).slug ?? g.id
    const t = g.type

    const go = (name: string, query?: Record<string, string>) =>
      () => router.push({ name, ...(query ? { query } : {}), ...(name === 'group-settings' ? { params: { slugOrId: slug } } : {}) })

    if (t === 'event') return [
      { key: 'applications', icon: 'ClipboardList',  label: 'Заявки участников', action: go('my-applications', { group: gid }) },
      { key: 'tickets',      icon: 'Ticket',          label: 'Билеты',           action: go('my-tickets',      { group: gid }) },
      { key: 'status',       icon: 'CalendarCheck',   label: 'Статус события',   action: go('group-settings') },
      { key: 'schedule',     icon: 'Clock',           label: 'Программа',        action: go('group-settings') },
    ]

    if (t === 'artist') return [
      { key: 'orders',  icon: 'Palette',       label: 'Мои заказы',  action: go('my-applications', { group: gid }) },
      { key: 'queue',   icon: 'List',          label: 'Очередь',     action: go('my-applications', { group: gid }) },
      { key: 'todo',    icon: 'CheckSquare',   label: 'Todolist',    action: go('my-todolist',     { group: gid }) },
      { key: 'price',   icon: 'Tag',           label: 'Прайс',       action: go('group-settings') },
    ]

    if (t === 'creative') return [
      { key: 'orders', icon: 'Scissors',     label: 'Заказы',  action: go('my-applications', { group: gid }) },
      { key: 'todo',   icon: 'CheckSquare',  label: 'Todolist', action: go('my-todolist',     { group: gid }) },
      { key: 'price',  icon: 'Tag',          label: 'Прайс',   action: go('group-settings') },
    ]

    if (t === 'news') return [
      { key: 'posts', icon: 'Newspaper', label: 'Публикации', action: go('group-detail', { slugOrId: slug } as any) },
      { key: 'team',  icon: 'Users',     label: 'Редакция',   action: go('group-settings') },
    ]

    if (t === 'shop') return [
      { key: 'goods',  icon: 'ShoppingBag', label: 'Товары',  action: go('group-settings') },
      { key: 'orders', icon: 'Package',     label: 'Заказы',  action: go('my-applications', { group: gid }) },
    ]

    // community / static / brand
    return [
      { key: 'members', icon: 'Users',         label: 'Участники', action: go('group-detail') },
      { key: 'posts',   icon: 'Megaphone',     label: 'Посты',     action: go('group-detail') },
    ]
  })

  return { adminGroup, adminTools }
}
