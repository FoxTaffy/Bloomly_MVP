import prisma from '../../config/prisma.js';

/**
 * Verification criteria:
 * 1. Account age ≥ 14 days
 * 2. At least 3 posts published
 * 3. Avatar uploaded (has_avatar)
 * 4. Bio filled (has_bio)
 * 5. Email verified (has_email – we use email existence)
 * 6. At least 5 followers
 *
 * All criteria must be met for auto-approval.
 * If not all met, request goes to manual admin review.
 */

export interface VerificationCriteria {
  accountAgeDays: number;
  postCount: number;
  hasAvatar: boolean;
  hasBio: boolean;
  hasEmail: boolean;
  followerCount: number;
  meetsAll: boolean;
}

const MIN_ACCOUNT_AGE = 14;
const MIN_POSTS = 3;
const MIN_FOLLOWERS = 5;

export async function checkCriteria(userId: string): Promise<VerificationCriteria> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      created_at: true,
      avatar_url: true,
      bio: true,
      email: true,
    },
  });
  if (!user) throw new Error('User not found');

  const accountAgeDays = Math.floor((Date.now() - user.created_at.getTime()) / (1000 * 60 * 60 * 24));
  const postCount = await prisma.post.count({ where: { author_id: userId, deleted_at: null } });
  const followerCount = await prisma.follow.count({ where: { following_id: userId } });
  const hasAvatar = !!user.avatar_url;
  const hasBio = !!user.bio && user.bio.trim().length > 0;
  const hasEmail = !!user.email && user.email.trim().length > 0;

  const meetsAll =
    accountAgeDays >= MIN_ACCOUNT_AGE &&
    postCount >= MIN_POSTS &&
    hasAvatar &&
    hasBio &&
    hasEmail &&
    followerCount >= MIN_FOLLOWERS;

  return { accountAgeDays, postCount, hasAvatar, hasBio, hasEmail, followerCount, meetsAll };
}

export async function getVerificationStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_verified: true, verified_at: true },
  });
  const latestRequest = await prisma.verificationRequest.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });
  return {
    isVerified: user?.is_verified ?? false,
    verifiedAt: user?.verified_at,
    latestRequest,
  };
}

export async function requestVerification(userId: string) {
  // Check if already verified
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_verified: true },
  });
  if (user?.is_verified) throw new Error('Already verified');

  // Check for pending request
  const pending = await prisma.verificationRequest.findFirst({
    where: { user_id: userId, status: 'pending' },
  });
  if (pending) throw new Error('Already have pending request');

  // Collect criteria
  const criteria = await checkCriteria(userId);

  // Create the request
  const request = await prisma.verificationRequest.create({
    data: {
      user_id: userId,
      account_age_days: criteria.accountAgeDays,
      post_count: criteria.postCount,
      has_avatar: criteria.hasAvatar,
      has_bio: criteria.hasBio,
      has_email: criteria.hasEmail,
      follower_count: criteria.followerCount,
      status: criteria.meetsAll ? 'approved' : 'pending',
      reviewed_at: criteria.meetsAll ? new Date() : null,
    },
  });

  // Auto-approve if all criteria met
  if (criteria.meetsAll) {
    await prisma.user.update({
      where: { id: userId },
      data: { is_verified: true, verified_at: new Date() },
    });
  }

  return { request, criteria, autoApproved: criteria.meetsAll };
}

export async function adminGetRequests(status?: string, page = 1, limit = 20) {
  const where = status ? { status } : {};
  const [requests, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, username: true, display_name: true,
            avatar_url: true, email: true, created_at: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.verificationRequest.count({ where }),
  ]);
  return { requests, total, page, limit };
}

export async function adminReviewRequest(requestId: string, action: 'approve' | 'reject', reviewerId: string, reason?: string) {
  const req = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new Error('Request not found');
  if (req.status !== 'pending') throw new Error('Request already reviewed');

  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: {
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date(),
      reviewed_by: reviewerId,
      reason: reason || null,
    },
  });

  if (action === 'approve') {
    await prisma.user.update({
      where: { id: req.user_id },
      data: { is_verified: true, verified_at: new Date() },
    });
  }

  return { success: true };
}
