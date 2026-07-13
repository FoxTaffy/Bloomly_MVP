const KNOWN_TYPES = new Set([
  'artist', 'master', 'fursuiter', 'popular', 'writer', 'organizer', 'event',
])

// Temporary per-type badge icons (see backend verification module for the type list).
// Falls back to the generic "official paw" badge for legacy/unrecognized types.
export function verificationBadgeIcon(verificationType?: string | null): string {
  if (verificationType && KNOWN_TYPES.has(verificationType)) {
    return `/icons/badges/${verificationType}.svg`
  }
  return '/icons/badges/paw_offical.svg'
}
