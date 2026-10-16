// Stateless helpers shared by the admin panel tabs.
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import * as fmt from '@/lib/format'

export { ROLE_RANK } from '@/lib/roles'

export const roleLabel = (role: string) => {
  const t = useLangStore().t
  return ({ owner: t.roleOwner, admin: t.roleAdmin, moderator: t.roleModerator, user: t.roleUser } as Record<string, string>)[role] ?? role
}
export const roleColor = (role: string) => ({ owner: '#eab308', admin: '#f97316', moderator: '#4C67CF', user: '#64748b' } as Record<string, string>)[role] ?? '#64748b'

export const tierLabel = (tier?: string) => ({ lite: 'Lite', pro: 'Pro', business: 'Business' } as Record<string, string>)[tier ?? ''] ?? null
export const tierColor = (tier?: string) => ({ lite: '#4C67CF', pro: '#a78bfa', business: '#f59e0b' } as Record<string, string>)[tier ?? ''] ?? '#64748b'

const locale = () => LANG_TO_LOCALE[useLangStore().currentLang]

export const formatNum = fmt.formatCompactNumber
export const formatDate = (d: string) => fmt.formatDate(d, 'numericShort', locale())
export const formatMonthShort = (d: string | Date) => new Date(d).toLocaleDateString(locale(), { month: 'short' })

export const barMax = (arr: { value: number }[]) => Math.max(...arr.map(x => x.value), 1)
