import type { Translation as T } from '@/locales/translations'
import { verTypeIconUrl, VERIFICATION_ICON_TYPES } from '@/lib/verificationIcons'

/** PNG badge icon URL for a verification type; null for generic/unknown types (falls back to a checkmark). */
export function verificationBadgeIconUrl(verificationType?: string | null): string | null {
  if (verificationType && (VERIFICATION_ICON_TYPES as readonly string[]).includes(verificationType)) {
    return verTypeIconUrl(verificationType)
  }
  return null
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
