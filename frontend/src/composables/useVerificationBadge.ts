import type { translations } from '@/locales/translations'

type T = (typeof translations)['RU']

// Single source of truth for verification badge icon + color per type.
// Matches the icon choices made in the verification type selector
// (SettingsProfileView.vue's VER_TYPES) — keep both in sync.
const VERIFICATION_TYPE_META: Record<string, { icon: string; colorClass: string }> = {
  artist:       { icon: 'Palette',       colorClass: 'text-purple-400' },
  master:       { icon: 'Hammer',        colorClass: 'text-amber-400' },
  fursuiter:    { icon: 'Shirt',         colorClass: 'text-cyan-400' },
  popular:      { icon: 'TrendingUp',    colorClass: 'text-blue-400' },
  writer:       { icon: 'PenLine',       colorClass: 'text-rose-400' },
  organizer:    { icon: 'CalendarCheck', colorClass: 'text-indigo-400' },
  event:        { icon: 'Ticket',        colorClass: 'text-emerald-400' },
  photographer: { icon: 'Camera',        colorClass: 'text-teal-400' },
  programmer:   { icon: 'Code2',         colorClass: 'text-fuchsia-400' },
}

/** Lucide icon name (for use with <BIcon>) for a verification type; falls back to the generic checkmark. */
export function verificationBadgeIconName(verificationType?: string | null): string {
  return (verificationType && VERIFICATION_TYPE_META[verificationType]?.icon) || 'BadgeCheck'
}

/** Text color class matching a verification type's icon; falls back to the brand accent color. */
export function verificationBadgeColorClass(verificationType?: string | null): string {
  return (verificationType && VERIFICATION_TYPE_META[verificationType]?.colorClass) || 'text-brand-accent'
}

/** Builds { label, desc } for a verification type from the active-language dictionary `t` (langStore.t). */
export function verificationTypeInfo(t: T, verificationType?: string | null) {
  switch (verificationType) {
    case 'artist':       return { label: t.verTypeArtist,       desc: t.verBadgeDescArtist }
    case 'master':       return { label: t.verTypeMaster,       desc: t.verBadgeDescMaster }
    case 'fursuiter':    return { label: t.verTypeFursuiter,    desc: t.verBadgeDescFursuiter }
    case 'popular':      return { label: t.verTypePopular,      desc: t.verBadgeDescPopular }
    case 'writer':       return { label: t.verTypeWriter,       desc: t.verBadgeDescWriter }
    case 'organizer':    return { label: t.verTypeOrganizer,    desc: t.verBadgeDescOrganizer }
    case 'event':        return { label: t.verTypeEvent,        desc: t.verBadgeDescEvent }
    case 'photographer': return { label: t.verTypePhotographer, desc: t.verBadgeDescPhotographer }
    case 'programmer':   return { label: t.verTypeProgrammer,   desc: t.verBadgeDescProgrammer }
    default:             return { label: t.verBadgeGenericLabel, desc: t.verBadgeGenericDesc }
  }
}
