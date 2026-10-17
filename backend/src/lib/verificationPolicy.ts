export interface VerificationIdentity {
  is_verified?: boolean;
  verification_type?: string | null;
}

export const ROLE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  artist: ['creative', 'shop'],
  master: ['creative', 'shop'],
  fursuiter: ['creative', 'shop'],
  organizer: ['event', 'brand'],
  event: ['event', 'brand'],
  popular: ['news', 'brand', 'creative'],
  writer: ['news', 'brand', 'creative'],
  photographer: ['news', 'brand', 'creative'],
  programmer: ['brand'],
};

export function canCreateGroup(user: VerificationIdentity | null | undefined, type: string): boolean {
  if (type === 'community' || type === 'static') return true;
  return user?.is_verified === true &&
    (ROLE_GROUPS[user.verification_type ?? ''] ?? []).includes(type);
}

export function canSellInDen(user: VerificationIdentity | null | undefined, ownsShop = false): boolean {
  return user?.is_verified === true &&
    (user.verification_type === 'artist' || user.verification_type === 'master' || ownsShop);
}
