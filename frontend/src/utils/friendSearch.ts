export function normalizeFriendSearchValue(value: string | null | undefined = ''): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[@\s_\-./]+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function matchesFriendSearch(
  user: { username?: string | null; display_name?: string | null; location?: string | null } | null | undefined,
  query: string
): boolean {
  const q = normalizeFriendSearchValue(query)
  if (!q) return true

  const candidates = [
    user?.username ?? '',
    user?.display_name ?? '',
    user?.location ?? '',
  ]

  return candidates.some((value) => {
    const normalized = normalizeFriendSearchValue(value)
    if (!normalized) return false

    return normalized.includes(q) || q.includes(normalized)
  })
}
