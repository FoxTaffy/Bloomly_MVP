// Shared visual identity for notification types: the icon and colour of the badge
// shown over the sender's avatar, used by both the toast and the notifications list.
import { DEN_NOTIFICATION_ICONS, isDenNotification } from './denNotifications'

export const NOTIF_BADGE_ICON: Record<string, string> = {
  LIKE:    'Heart',
  COMMENT: 'MessageSquare',
  REPAW:   'Repeat2',
  FOLLOW:  'UserPlus',
  MENTION: 'AtSign',
  RELATIONSHIP_REQUEST:  'HeartHandshake',
  RELATIONSHIP_ACCEPTED: 'Heart',
  FOLLOW_POST: 'FileText',
  GROUP_POST:  'FileText',
  GROUP_EVENT: 'Calendar',
  GROUP_JOIN:  'Users',
  MESSAGE:     'MessageCircle',
  GROUP_DM:    'Inbox',
  automod_warn: 'ShieldAlert',
}

export const NOTIF_BADGE_COLOR: Record<string, string> = {
  LIKE:    'bg-rose-500',
  COMMENT: 'bg-brand-accent',
  REPAW:   'bg-emerald-500',
  FOLLOW:  'bg-violet-500',
  MENTION: 'bg-amber-500',
  RELATIONSHIP_REQUEST:  'bg-pink-500',
  RELATIONSHIP_ACCEPTED: 'bg-pink-500',
  FOLLOW_POST: 'bg-violet-500',
  GROUP_POST:  'bg-brand-accent',
  GROUP_EVENT: 'bg-amber-500',
  GROUP_JOIN:  'bg-emerald-500',
  MESSAGE:     'bg-sky-500',
  GROUP_DM:    'bg-brand-accent',
  automod_warn: 'bg-amber-500',
}

const isAutomodType = (type: string) => type.startsWith('automod_') || type === 'admin_broadcast'

export function notifBadgeIcon(type: string): string {
  if (isDenNotification(type)) return DEN_NOTIFICATION_ICONS[type] ?? 'Sparkles'
  if (isAutomodType(type)) return NOTIF_BADGE_ICON.automod_warn
  return NOTIF_BADGE_ICON[type] ?? 'Bell'
}

export function notifBadgeColor(type: string): string {
  if (isDenNotification(type)) return 'bg-amber-500'
  if (isAutomodType(type)) return NOTIF_BADGE_COLOR.automod_warn
  return NOTIF_BADGE_COLOR[type] ?? 'bg-white/20'
}
