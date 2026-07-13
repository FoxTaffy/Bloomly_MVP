export type DeviceKind = 'mobile' | 'tablet' | 'desktop'

/** Buckets a "Chrome · iPhone" style backend label into an icon kind. */
export function deviceKind(label: string | null | undefined): DeviceKind | null {
  if (!label) return null
  if (/iPad/i.test(label)) return 'tablet'
  if (/iPhone|Android/i.test(label)) return 'mobile'
  if (/Windows|macOS|Linux/i.test(label)) return 'desktop'
  return null
}
