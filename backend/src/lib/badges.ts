/**
 * Badge-level calculation utilities.
 *
 * - User artist badge: based on years since `artist_since`.
 * - Group tier badge:  based on denormalized `members_count`.
 */

// ── User Artist Badge ─────────────────────────────────────────────────────────

export type UserBadgeLevel = 'none' | 'beginner' | 'green' | 'blue' | 'gold' | 'platinum';

/**
 * Calculate the artist badge level from the `artist_since` date.
 * Returns `'none'` when `artist_since` is null / undefined.
 */
export function getUserBadgeLevel(artistSince: Date | string | null | undefined): UserBadgeLevel {
  if (!artistSince) return 'none';

  const since = typeof artistSince === 'string' ? new Date(artistSince) : artistSince;
  const now = new Date();
  const years = (now.getTime() - since.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (years >= 10) return 'platinum';
  if (years >= 5) return 'gold';
  if (years >= 3) return 'blue';
  if (years >= 1) return 'green';
  return 'beginner';
}

// ── Group Tier Badge ──────────────────────────────────────────────────────────

export type GroupBadgeLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';

/**
 * Calculate the group tier badge from `members_count`.
 * Returns `'none'` when the group has fewer than 100 members.
 */
export function getGroupBadgeLevel(membersCount: number): GroupBadgeLevel {
  if (membersCount > 50_000) return 'diamond';
  if (membersCount > 10_000) return 'gold';
  if (membersCount > 1_000) return 'silver';
  if (membersCount > 100) return 'bronze';
  return 'none';
}
