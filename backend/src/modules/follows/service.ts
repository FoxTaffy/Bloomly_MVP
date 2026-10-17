import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { getBlockerIds, isBlockedBy } from '../../lib/blocks.js';
import { nsfwWhere, type NsfwMode } from '../../lib/contentFilters.js';

/** Throws a 403 unless the viewer is allowed to see userId's friends/followers list. */
async function assertFriendsListVisible(userId: string, viewerId?: string) {
  if (viewerId === userId) return;
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { friends_list_visibility: true } });
  if (owner && !(await isAllowedByPrivacy(owner.friends_list_visibility, userId, viewerId))) {
    throw Object.assign(new Error('FRIENDS_LIST_PRIVATE'), { statusCode: 403 });
  }
}

/**
 * A new follow is allowed only if the follower may see the target's profile. The one exception
 * is following back someone who already follows you — otherwise a friends-only profile could
 * never become mutual (friends = mutual follow).
 */
async function canStartFollowing(followerId: string, followingId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: followingId }, select: { profile_visibility: true } });
  if (!target) return false;
  if (await isAllowedByPrivacy(target.profile_visibility, followingId, followerId)) return true;
  const followsBack = await prisma.follow.findUnique({
    where: { follower_id_following_id: { follower_id: followingId, following_id: followerId } },
  });
  return !!followsBack;
}

export const followsService = {
  canStartFollowing,


  async toggle(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Cannot follow yourself');

    const existing = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
    });

    if (existing) {
      await prisma.follow.delete({
        where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
      });
      await notificationService.deleteForAction({
        receiverId: followingId,
        senderId:   followerId,
        type:       'FOLLOW',
      });
      return { following: false };
    } else {
      // A block in either direction must prevent a new follow relationship from forming —
      // otherwise the feed/notification block filters elsewhere just hide the symptom
      // (posts, notifications) while the follow edge itself, and everything keyed off it
      // (follower counts, "follows you" badges), stays intact.
      if ((await isBlockedBy(followingId, followerId)) || (await isBlockedBy(followerId, followingId))) {
        throw new Error('Cannot follow a blocked user');
      }
      // The profile page already hides the follow button for hidden profiles; the mini-buttons
      // on person cards hit this endpoint directly, so the privacy rule has to live here.
      if (!(await canStartFollowing(followerId, followingId))) {
        throw Object.assign(new Error('PROFILE_PRIVATE'), { statusCode: 403 });
      }
      await prisma.follow.create({ data: { follower_id: followerId, following_id: followingId } });
      // Send notification
      await notificationService.create({
        receiverId: followingId,
        senderId:   followerId,
        type:       'FOLLOW',
      });

      // Auto-follow-back — best-effort, never let this break the follow itself.
      const followedPrefs = await prisma.user.findUnique({
        where:  { id: followingId },
        select: { auto_follow_back: true },
      });

      if (followedPrefs?.auto_follow_back) {
        const alreadyBack = await prisma.follow.findUnique({
          where: { follower_id_following_id: { follower_id: followingId, following_id: followerId } },
        });
        if (!alreadyBack) await this.toggle(followingId, followerId).catch(() => {});
      }

      return { following: true };
    }
  },

  async isFollowing(followerId: string, followingId: string) {
    const f = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
    });
    return !!f;
  },

  async checkBulk(followerId: string, targetIds: string[]) {
    if (!targetIds.length) return {};
    const rows = await prisma.follow.findMany({
      where: { follower_id: followerId, following_id: { in: targetIds } },
      select: { following_id: true },
    });
    const set = new Set(rows.map((r) => r.following_id));
    return Object.fromEntries(targetIds.map((id) => [id, set.has(id)]));
  },

  async getFollowers(userId: string, viewerId?: string) {
    await assertFriendsListVisible(userId, viewerId);
    const rows = await prisma.follow.findMany({
      where: { following_id: userId },
      include: {
        follower: {
          select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => r.follower);
  },

  async getFollowing(userId: string, viewerId?: string) {
    await assertFriendsListVisible(userId, viewerId);
    const rows = await prisma.follow.findMany({
      where: { follower_id: userId },
      include: {
        following: {
          select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => r.following);
  },

  async getCounts(userId: string) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({ where: { following_id: userId } }),
      prisma.follow.count({ where: { follower_id: userId } }),
    ]);
    return { followers, following };
  },

  /** Mutual follows: people who follow userId AND whom userId follows */
  async getFriends(userId: string, viewerId?: string) {
    await assertFriendsListVisible(userId, viewerId);
    const [followerRows, followingRows] = await Promise.all([
      prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true } }),
      prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true } }),
    ]);
    const followersSet = new Set(followerRows.map((r) => r.follower_id));
    const mutualIds = followingRows.map((r) => r.following_id).filter((id) => followersSet.has(id));
    if (!mutualIds.length) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: mutualIds }, deleted_at: null },
      select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true },
    });
    return users;
  },

  /** Check mutual follow status between two users */
  async isFriends(userA: string, userB: string) {
    const [aFollowsB, bFollowsA] = await Promise.all([
      prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: userA, following_id: userB } } }),
      prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: userB, following_id: userA } } }),
    ]);
    return { aFollowsB: !!aFollowsB, bFollowsA: !!bFollowsA, friends: !!aFollowsB && !!bFollowsA };
  },

  async getSubscriptionFeed(userId: string, nsfwMode: NsfwMode = 'hide', page = 1, limit = 30) {
    const followingRows = await prisma.follow.findMany({
      where: { follower_id: userId },
      select: { following_id: true },
    });
    let authorIds = followingRows.map((r) => r.following_id);
    if (!authorIds.length) return [];

    // Не показываем посты авторов, с которыми есть взаимная блокировка —
    // иначе заблокированный автор (или тот, кто заблокировал нас) всё равно
    // остаётся видимым в ленте подписок, хотя пропадает из общей ленты/поиска.
    const blockerIds = await getBlockerIds(userId);
    if (blockerIds.length) {
      const blockedSet = new Set(blockerIds);
      authorIds = authorIds.filter((id) => !blockedSet.has(id));
      if (!authorIds.length) return [];
    }

    const skip = (page - 1) * limit;
    return prisma.post.findMany({
      where: {
        deleted_at:  null,
        author_id:   { in: authorIds },
        ...nsfwWhere(nsfwMode),
      },
      orderBy: { created_at: 'desc' },
      skip,
      take:    limit,
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true, is_verified: true, verification_type: true } },
        tags:   { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
      },
    });
  },
};
