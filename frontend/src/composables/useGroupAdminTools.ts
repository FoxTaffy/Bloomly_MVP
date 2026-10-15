import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'

const ADMIN_ROUTES = new Set([
  'group-detail', 'group-settings', 'group-admin-tools',
  'my-applications', 'my-tickets', 'my-todolist',
])

export interface AdminTool {
  key: string
  icon: string
  label: string
  /** Matching tab key on GroupAdminToolsView — lets this button re-sync that page's tab instead of navigating away when already there. */
  pageTab?: string
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

  // Already on this group's admin-tools page — clicking a tool should switch its tab
  // in place rather than navigating to a different route.
  const onAdminToolsPage = computed(() => {
    if (route.name !== 'group-admin-tools') return false
    const g = adminGroup.value
    if (!g) return false
    const slugOrId = route.params.slugOrId as string
    return slugOrId === g.id || slugOrId === (g as any).slug
  })

  const adminTools = computed<AdminTool[]>(() => {
    const g = adminGroup.value
    if (!g) return []
    const gid = g.id
    const slug = (g as any).slug ?? g.id
    const t: string = g.type

    const go = (name: string, pageTab: string | undefined, query?: Record<string, string>) =>
      () => {
        if (pageTab && onAdminToolsPage.value) {
          router.replace({ name: 'group-admin-tools', params: { slugOrId: slug }, query: { tab: pageTab } })
          return
        }
        router.push({ name, ...(query ? { query } : {}), ...(name === 'group-settings' || name === 'group-admin-tools' ? { params: { slugOrId: slug } } : {}) })
      }

    if (t === 'event') return [
      { key: 'applications', icon: 'ClipboardList',  label: 'Заявки участников', pageTab: 'applications', action: go('my-applications', 'applications', { group: gid }) },
      { key: 'tickets',      icon: 'Ticket',          label: 'Билеты',           pageTab: 'tickets',      action: go('my-tickets',      'tickets',      { group: gid }) },
      { key: 'status',       icon: 'CalendarCheck',   label: 'Статус события',   pageTab: 'status',       action: go('group-settings',  'status') },
      { key: 'schedule',     icon: 'Clock',           label: 'Программа',        pageTab: 'schedule',     action: go('group-settings',  'schedule') },
    ]

    if (t === 'artist') return [
      { key: 'orders',  icon: 'Palette',       label: 'Мои заказы',  pageTab: 'orders', action: go('my-applications', 'orders', { group: gid }) },
      { key: 'queue',   icon: 'List',          label: 'Очередь',     pageTab: 'orders', action: go('my-applications', 'orders', { group: gid }) },
      { key: 'todo',    icon: 'CheckSquare',   label: 'Todolist',    pageTab: 'todo',   action: go('my-todolist',     'todo',   { group: gid }) },
      { key: 'price',   icon: 'Tag',           label: 'Прайс',       pageTab: 'price',  action: go('group-settings',  'price') },
    ]

    if (t === 'creative') return [
      { key: 'orders', icon: 'Scissors',     label: 'Заказы',   pageTab: 'orders', action: go('my-applications', 'orders', { group: gid }) },
      { key: 'todo',   icon: 'CheckSquare',  label: 'Todolist', pageTab: 'todo',   action: go('my-todolist',     'todo',   { group: gid }) },
      { key: 'price',  icon: 'Tag',          label: 'Прайс',    pageTab: 'price',  action: go('group-settings',  'price') },
    ]

    if (t === 'news') return [
      { key: 'posts', icon: 'Newspaper', label: 'Публикации', action: go('group-detail', undefined, { slugOrId: slug } as any) },
      { key: 'team',  icon: 'Users',     label: 'Редакция',   pageTab: 'team', action: go('group-settings', 'team') },
    ]

    if (t === 'shop') return [
      { key: 'goods',  icon: 'ShoppingBag', label: 'Товары',  pageTab: 'goods',  action: go('group-settings',  'goods') },
      { key: 'orders', icon: 'Package',     label: 'Заказы',  pageTab: 'orders', action: go('my-applications', 'orders', { group: gid }) },
    ]

    // community / static / brand
    return [
      { key: 'members', icon: 'Users',     label: 'Участники', pageTab: 'members', action: go('group-detail', 'members') },
      { key: 'posts',   icon: 'Megaphone', label: 'Посты',     action: go('group-detail', undefined) },
    ]
  })

  function isToolActive(tool: AdminTool): boolean {
    return !!tool.pageTab && onAdminToolsPage.value && route.query.tab === tool.pageTab
  }

  return { adminGroup, adminTools, onAdminToolsPage, isToolActive }
}
