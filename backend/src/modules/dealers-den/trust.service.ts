import prisma from '../../config/prisma.js';

export function computeDenScore(data: {
  totalDeals: number;
  completedDeals: number;
  disputesLost: number;
  avgRating: number;
}): number {
  if (data.totalDeals === 0) return 0;
  const completionRate = data.completedDeals / data.totalDeals;
  const ratingNorm = (data.avgRating - 1) / 4;
  const disputePenalty = Math.min(data.disputesLost * 10, 40);
  const raw = (completionRate * 50 + ratingNorm * 50) - disputePenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function computeTier(score: number, totalDeals: number): string {
  if (totalDeals === 0) return 'new';
  if (totalDeals >= 200 && score >= 95) return 'elite';
  if (totalDeals >= 50  && score >= 90) return 'master';
  if (totalDeals >= 11  && score >= 80) return 'verified';
  if (totalDeals >= 1   && score >= 70) return 'reliable';
  return 'new';
}

export async function recalcDenTrust(userId: string): Promise<void> {
  const [soldListings, reviews, trust] = await Promise.all([
    prisma.dealerListing.count({ where: { seller_id: userId, status: 'sold', deleted_at: null } }),
    prisma.denReview.findMany({ where: { seller_id: userId, deleted_at: null }, select: { rating: true } }),
    prisma.denTrustScore.findUnique({ where: { user_id: userId } }),
  ]);

  const disputesLost = trust?.disputes_lost ?? 0;
  const totalDeals   = soldListings;
  const completedDeals = soldListings;
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const score = computeDenScore({ totalDeals, completedDeals, disputesLost, avgRating });
  const tier  = computeTier(score, totalDeals);

  await prisma.denTrustScore.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      score,
      tier,
      total_deals:     totalDeals,
      completed_deals: completedDeals,
      disputes_lost:   disputesLost,
      avg_rating:      avgRating,
    },
    update: {
      score,
      tier,
      total_deals:     totalDeals,
      completed_deals: completedDeals,
      avg_rating:      avgRating,
    },
  });

  // Freeze seller if 3+ disputes lost
  const currentTrust = await prisma.denTrustScore.findUnique({ where: { user_id: userId } });
  if ((currentTrust?.disputes_lost ?? 0) >= 3) {
    await prisma.user.update({ where: { id: userId }, data: { den_frozen: true } });
  }
}
