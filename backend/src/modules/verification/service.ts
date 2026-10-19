import prisma from '../../config/prisma.js';
import { assertOwnedMedia } from '../media/service.js';
import { normalizeSafeLink } from '../../lib/safeLink.js';

/**
 * «Честная верификация» — Anti-AI verification system.
 *
 * Verification types:
 *   - artist:     Screenshot of layers or video of art process
 *   - master:     Photo of craft with "signa" (paper with "Bloomly", date, user ID)
 *   - fursuiter:  Photo/video of fursuit with "signa"
 *   - popular:    Links to social media accounts with sizable following
 *   - writer:     Screenshot of drafts/manuscript with "signa"
 *   - organizer:  Photo of event material with "signa"
 *   - event:      Photo of ticket or selfie at event location
 *   - photographer: Screenshot of RAW/EXIF data or photoshoot proof with "signa"
 *   - programmer: Screenshot of source code/repo or project demo with "signa"
 *
 * Rules:
 *   - NO auto-approve. All requests go to manual admin review.
 *   - Verification is bound to user UUID, non-transferable.
 *   - Profile must be ≥ 80% complete to submit (avatar, fursona tab filled, email).
 */

export const VERIFICATION_TYPES = [
  'artist', 'master', 'fursuiter', 'popular', 'writer', 'organizer', 'event',
  'photographer', 'programmer',
] as const;

export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export interface ProfileCompleteness {
  hasAvatar: boolean;
  hasEmail: boolean;
  hasFursonaName: boolean;
  hasFursonaSpecies: boolean;
  hasFursonaGender: boolean;
  hasFursonaDescription: boolean;
  hasBio: boolean;
  percentage: number;
  canSubmit: boolean;
}

export interface VerificationCriteria {
  accountAgeDays: number;
  postCount: number;
  hasAvatar: boolean;
  hasBio: boolean;
  hasEmail: boolean;
  followerCount: number;
  profileCompleteness: ProfileCompleteness;
  meetsAll: boolean;
}

/**
 * Calculate profile completeness percentage.
 * Fields checked (each worth ~16.7%):
 *   1. Avatar, 2. Email, 3. Bio, 4. Fursona name, 5. Fursona species,
 *   6. Fursona likes/dislikes
 * Gender is reported but not counted: the settings UI has no way to fill it.
 * 80% = at least 5 out of 6 filled.
 */
export async function getProfileCompleteness(userId: string): Promise<ProfileCompleteness> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatar_url: true,
      email: true,
      bio: true,
      fursona_name: true,
      persona: true,
      fursona_gender: true,
      fursona_description: true,
    },
  });
  if (!user) throw new Error('User not found');

  const fursona = await prisma.fursona.findFirst({
    where: { user_id: userId, deleted_at: null },
    orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    select: { name: true, species: true, likes: true, dislikes: true },
  });

  const hasAvatar = !!user.avatar_url;
  const hasEmail = !!user.email && user.email.trim().length > 0;
  const hasBio = !!user.bio && user.bio.trim().length > 0;
  const hasFursonaName = (!!fursona?.name && fursona.name.trim().length > 0) || (!!user.fursona_name && user.fursona_name.trim().length > 0);
  const hasFursonaSpecies = (fursona?.species?.length ?? 0) > 0 || (!!user.persona && user.persona.trim().length > 0);
  const hasFursonaGender = !!user.fursona_gender && user.fursona_gender.trim().length > 0;
  const hasFursonaDescription = ((fursona?.likes?.length ?? 0) + (fursona?.dislikes?.length ?? 0)) > 0 || (!!user.fursona_description && user.fursona_description.trim().length > 0);

  const filledCount = [hasAvatar, hasEmail, hasBio, hasFursonaName, hasFursonaSpecies, hasFursonaDescription].filter(Boolean).length;
  const percentage = Math.round((filledCount / 6) * 100);
  const canSubmit = percentage >= 80;

  return { hasAvatar, hasEmail, hasFursonaName, hasFursonaSpecies, hasFursonaGender, hasFursonaDescription, hasBio, percentage, canSubmit };
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

  const profileCompleteness = await getProfileCompleteness(userId);

  const meetsAll =
    accountAgeDays >= MIN_ACCOUNT_AGE &&
    postCount >= MIN_POSTS &&
    hasAvatar &&
    hasBio &&
    hasEmail &&
    followerCount >= MIN_FOLLOWERS &&
    profileCompleteness.canSubmit;

  return { accountAgeDays, postCount, hasAvatar, hasBio, hasEmail, followerCount, profileCompleteness, meetsAll };
}

export async function getVerificationStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_verified: true, verified_at: true, verification_type: true },
  });
  const latestRequest = await prisma.verificationRequest.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });
  return {
    isVerified: user?.is_verified ?? false,
    verifiedAt: user?.verified_at,
    verificationType: user?.verification_type,
    latestRequest,
  };
}

export async function requestVerification(
  userId: string,
  verificationType: VerificationType,
  evidenceUrls: string[],
  socialLinks?: string[],
  evidenceText?: string,
) {
  // Check if already verified
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { is_verified: true, id: true },
  });
  if (user?.is_verified) throw new Error('Already verified');

  // Check for pending request
  const pending = await prisma.verificationRequest.findFirst({
    where: { user_id: userId, status: 'pending' },
  });
  if (pending) throw new Error('Already have pending request');

  // Check profile completeness (≥ 80%)
  const completeness = await getProfileCompleteness(userId);
  if (!completeness.canSubmit) {
    throw new Error('Profile must be at least 80% complete to request verification');
  }

  // Validate verification type
  if (!VERIFICATION_TYPES.includes(verificationType)) {
    throw new Error(`Invalid verification type. Must be one of: ${VERIFICATION_TYPES.join(', ')}`);
  }

  // "popular" is backed by social links instead of uploaded evidence files. Links end up as <a href>
  // in the admin review panel, so only safe schemes pass (javascript:/data: are dropped).
  // Для остальных типов доказательство — только файлы, которые загрузил сам пользователь:
  // домен бакета не доказывает владение (раньше можно было приложить чужой пост как «доказательство»).
  let finalEvidenceUrls: string[];
  if (verificationType === 'popular') {
    finalEvidenceUrls = (socialLinks ?? []).map((l) => normalizeSafeLink(l)).filter((l): l is string => !!l);
  } else {
    const urls = (evidenceUrls ?? []).filter((u) => typeof u === 'string' && u.length > 0);
    for (const url of urls) await assertOwnedMedia(url, userId);
    finalEvidenceUrls = urls;
  }
  const finalEvidenceText = evidenceText?.trim() ? evidenceText.trim().slice(0, 2000) : null;

  // Text can stand in for (or supplement) uploaded evidence, except for "popular" which always needs a link.
  const hasEvidence = (finalEvidenceUrls && finalEvidenceUrls.length > 0) || !!finalEvidenceText;
  if (verificationType === 'popular' ? !finalEvidenceUrls?.length : !hasEvidence) {
    throw new Error(
      verificationType === 'popular'
        ? 'At least one social link is required for verification'
        : 'Evidence (photo or text) is required for verification',
    );
  }

  // Collect criteria snapshot
  const criteria = await checkCriteria(userId);

  // Determine badge type based on verification type
  const badgeType = verificationType;

  // Create the request — ALWAYS pending, NO auto-approve
  const request = await prisma.verificationRequest.create({
    data: {
      user_id: userId,
      verification_type: verificationType,
      evidence_urls: finalEvidenceUrls,
      evidence_text: finalEvidenceText,
      badge_type: badgeType,
      account_age_days: criteria.accountAgeDays,
      post_count: criteria.postCount,
      has_avatar: criteria.hasAvatar,
      has_bio: criteria.hasBio,
      has_email: criteria.hasEmail,
      follower_count: criteria.followerCount,
      status: 'pending', // NEVER auto-approve
    },
  });

  return { request, criteria, autoApproved: false };
}

export async function adminGetRequests(status?: string, page = 1, limit = 20) {
  const where = status ? { status } : {};
  // Pending requests are a queue waiting on a moderator — surface the longest-waiting
  // ones first (oldest first) so nothing sits forgotten. Already-decided requests
  // (approved/rejected, or the unfiltered "all" view mixing everything) read more like
  // an activity log, so those stay newest-first.
  const orderBy = status === 'pending' ? { created_at: 'asc' as const } : { created_at: 'desc' as const };
  const [rawRequests, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, username: true, display_name: true,
            avatar_url: true, email: true, created_at: true,
            groupMemberships: {
              where: { role: { in: ['owner', 'admin', 'moderator'] } },
              select: { role: true, group: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.verificationRequest.count({ where }),
  ]);

  // The snapshot columns (account_age_days, post_count, ...) freeze the user's stats at
  // the moment they submitted the request — if review happens later, those go stale
  // (e.g. showing "0 posts" for someone who has since posted a lot). Recompute live
  // criteria so moderators see the user's *current* standing instead.
  const requests = await Promise.all(rawRequests.map(async (req) => {
    try {
      const live = await checkCriteria(req.user_id);
      return {
        ...req,
        account_age_days: live.accountAgeDays,
        post_count: live.postCount,
        has_avatar: live.hasAvatar,
        has_bio: live.hasBio,
        has_email: live.hasEmail,
        follower_count: live.followerCount,
      };
    } catch {
      return req; // user may have been deleted since — fall back to the snapshot
    }
  }));

  return { requests, total, page, limit };
}

export async function adminReviewRequest(
  requestId: string,
  action: 'approve' | 'reject',
  reviewerId: string,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.verificationRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('Request not found');
    const reviewedAt = new Date();
    const updated = await tx.verificationRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: reviewedAt,
        reviewed_by: reviewerId,
        reason: reason?.trim().slice(0, 500) || null,
      },
    });
    if (updated.count !== 1) throw new Error('Request already reviewed');
    if (action === 'approve') {
      await tx.user.update({
        where: { id: req.user_id },
        data: {
          is_verified: true,
          verified_at: reviewedAt,
          verification_type: req.verification_type,
          badge_type: req.badge_type || 'verified',
        },
      });
    }
    return { success: true, user_id: req.user_id };
  });
}
