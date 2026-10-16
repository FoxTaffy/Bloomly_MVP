// Platform staff roles: user < moderator < admin < owner (mirrors backend lib/roles.ts).
export const ROLE_RANK: Record<string, number> = { user: 0, moderator: 1, admin: 2, owner: 3 }

const rank = (role: string | null | undefined) => ROLE_RANK[role ?? 'user'] ?? 0

export const isModerator = (role: string | null | undefined) => rank(role) >= ROLE_RANK.moderator
export const isAdmin = (role: string | null | undefined) => rank(role) >= ROLE_RANK.admin
