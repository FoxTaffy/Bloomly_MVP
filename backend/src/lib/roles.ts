// Platform-wide staff hierarchy for User.role: user < moderator < admin < owner.
// Each tier inherits everything the tiers below it can do.
export const ROLE_RANK = { user: 0, moderator: 1, admin: 2, owner: 3 } as const;
export type StaffRole = keyof typeof ROLE_RANK;

function rank(role: string | null | undefined): number {
  return ROLE_RANK[(role as StaffRole)] ?? 0;
}

/** Moderator, admin or owner — day-to-day moderation (users, posts, reports, AutoMod, verification). */
export const isModerator = (role: string | null | undefined) => rank(role) >= ROLE_RANK.moderator;

/** Admin or owner — full operational access (ads, banners, updates, statistics), excluding role management. */
export const isAdmin = (role: string | null | undefined) => rank(role) >= ROLE_RANK.admin;

/** Owner only — role management and other owner-exclusive actions. */
export const isOwner = (role: string | null | undefined) => role === 'owner';

/**
 * Can `actorRole` take a moderation action (ban/freeze/warn/etc.) against a user
 * who currently holds `targetRole`? Peers can't discipline each other (e.g. one
 * moderator freezing another), only strictly-higher-ranked staff can — except
 * the owner tier, which can act on anyone including other owners.
 */
export const canModerateTarget = (actorRole: string | null | undefined, targetRole: string | null | undefined) =>
  isOwner(actorRole) || rank(actorRole) > rank(targetRole);
