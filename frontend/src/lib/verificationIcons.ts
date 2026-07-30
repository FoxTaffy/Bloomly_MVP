export const VERIFICATION_ICON_TYPES = [
  'artist', 'master', 'fursuiter', 'popular', 'writer', 'organizer', 'event',
  'photographer', 'programmer',
] as const

export type VerificationIconType = (typeof VERIFICATION_ICON_TYPES)[number]

export function verTypeIconUrl(type: string): string {
  return `/icons/verification/${type}.png`
}
