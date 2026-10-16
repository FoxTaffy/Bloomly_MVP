import prisma from '../../config/prisma.js';

// Small single-field lookups other modules need about a user (tier, seller status).

export const userLookup = {
  /** 'free' | 'lite' | 'pro' | 'business', or null if the user doesn't exist. */
  async subscriptionTier(userId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true } });
    return u?.subscription_tier ?? null;
  },

  /** Verification and Den status deciding whether the user may sell in the Dealers' Den. */
  denSellerStatus(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { is_verified: true, verification_type: true, den_frozen: true } });
  },

  /** Online-status privacy setting and last-seen time of several users. */
  presenceSettings(userIds: string[]) {
    return prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, online_status_visibility: true, last_seen_at: true },
    });
  },
};
