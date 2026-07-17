import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';

const FRIEND_USER_SELECT = {
  id:           true,
  username:     true,
  display_name: true,
  avatar_url:   true,
  banner_url:   true,
  badge_type:   true,
  location:     true,
  birth_date:   true,
  deceased_at:  true,
} as const;

export const friendsService = {
  /** Send a friend request from currentUserId to targetId */
  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) throw new Error('Cannot send friend request to yourself');

    // Check if a friendship record already exists in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requester_id: requesterId, addressee_id: addresseeId },
          { requester_id: addresseeId, addressee_id: requesterId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') throw new Error('Already friends');
      if (existing.status === 'pending') throw new Error('Friend request already sent');
    }

    const friendship = await prisma.friendship.create({
      data: {
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: 'pending',
      },
    });

    await notificationService.create({
      receiverId: addresseeId,
      senderId:   requesterId,
      type:       'FRIEND_REQUEST',
      refId:      friendship.id,
    });

    return friendship;
  },

  /** Accept an incoming friend request */
  async acceptRequest(friendshipId: string, addresseeId: string) {
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new Error('Friend request not found');
    if (friendship.addressee_id !== addresseeId) throw new Error('Forbidden');
    if (friendship.status !== 'pending') throw new Error('Request is not pending');

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data:  { status: 'accepted' },
    });

    await notificationService.create({
      receiverId: friendship.requester_id,
      senderId:   addresseeId,
      type:       'FRIEND_ACCEPT',
      refId:      friendshipId,
    });

    return updated;
  },

  /** Reject an incoming friend request (deletes the record) */
  async rejectRequest(friendshipId: string, addresseeId: string) {
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new Error('Friend request not found');
    if (friendship.addressee_id !== addresseeId) throw new Error('Forbidden');

    await prisma.friendship.delete({ where: { id: friendshipId } });
    return { rejected: true };
  },

  /** Cancel own outgoing request */
  async cancelRequest(friendshipId: string, requesterId: string) {
    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new Error('Friend request not found');
    if (friendship.requester_id !== requesterId) throw new Error('Forbidden');

    await prisma.friendship.delete({ where: { id: friendshipId } });
    return { cancelled: true };
  },

  /** Remove a friend (delete accepted friendship in either direction) */
  async removeFriend(userId: string, friendId: string) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requester_id: userId, addressee_id: friendId, status: 'accepted' },
          { requester_id: friendId, addressee_id: userId, status: 'accepted' },
        ],
      },
    });
    if (!friendship) throw new Error('Friendship not found');
    await prisma.friendship.delete({ where: { id: friendship.id } });
    return { removed: true };
  },

  /** Get incoming pending requests for a user */
  async getIncomingRequests(addresseeId: string) {
    const rows = await prisma.friendship.findMany({
      where:   { addressee_id: addresseeId, status: 'pending' },
      include: {
        requester: { select: FRIEND_USER_SELECT },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({
      id:        r.id,
      status:    r.status,
      createdAt: r.created_at,
      user:      r.requester,
    }));
  },

  /** Get outgoing pending requests sent by a user */
  async getOutgoingRequests(requesterId: string) {
    const rows = await prisma.friendship.findMany({
      where:   { requester_id: requesterId, status: 'pending' },
      include: {
        addressee: { select: FRIEND_USER_SELECT },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => ({
      id:        r.id,
      status:    r.status,
      createdAt: r.created_at,
      user:      r.addressee,
    }));
  },

  /** Get friends list = mutual follows */
  async getFriends(userId: string, onlineIds?: Set<string>, deviceById?: Map<string, string>) {
    const [followerRows, followingRows] = await Promise.all([
      prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true } }),
      prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true } }),
    ]);
    const followersSet = new Set(followerRows.map((r) => r.follower_id));
    const mutualIds = followingRows.map((r) => r.following_id).filter((id) => followersSet.has(id));
    if (!mutualIds.length) return [];
    const users = await prisma.user.findMany({
      where:   { id: { in: mutualIds }, deleted_at: null },
      select:  FRIEND_USER_SELECT,
    });
    return users
      .map((u) => ({
        ...u,
        online: onlineIds ? onlineIds.has(u.id) : false,
        device: onlineIds?.has(u.id) ? (deviceById?.get(u.id) ?? null) : null,
      }))
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return (a.display_name || a.username).localeCompare(b.display_name || b.username);
      });
  },

  /** Helpers: get mutual friend id set for userId */
  async _getMutualIds(userId: string): Promise<Set<string>> {
    const [followerRows, followingRows] = await Promise.all([
      prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true } }),
      prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true } }),
    ]);
    const followingSet = new Set(followingRows.map((r) => r.following_id));
    return new Set(followerRows.filter((r) => followingSet.has(r.follower_id)).map((r) => r.follower_id));
  },

  /** Followers: people who follow userId, excluding mutual friends */
  async getFollowers(userId: string) {
    const mutualIds = await this._getMutualIds(userId);
    const rows = await prisma.follow.findMany({
      where:   { following_id: userId, follower_id: { notIn: Array.from(mutualIds) } },
      include: { follower: { select: FRIEND_USER_SELECT } },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => r.follower);
  },

  /** Following: people userId follows, excluding mutual friends */
  async getFollowing(userId: string) {
    const mutualIds = await this._getMutualIds(userId);
    const rows = await prisma.follow.findMany({
      where:   { follower_id: userId, following_id: { notIn: Array.from(mutualIds) } },
      include: { following: { select: FRIEND_USER_SELECT } },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => r.following);
  },

  /** Get friendship status between two users */
  async getStatus(userA: string, userB: string) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requester_id: userA, addressee_id: userB },
          { requester_id: userB, addressee_id: userA },
        ],
      },
    });

    if (!friendship) return { status: 'none' };
    return {
      status:       friendship.status,
      friendshipId: friendship.id,
      isSentByMe:   friendship.requester_id === userA,
    };
  },

  /** Friends with upcoming birthdays in the next 30 days */
  async getUpcomingBirthdays(userId: string) {
    const friends = await this.getFriends(userId);
    const now = new Date();
    const currentYear = now.getFullYear();

    return friends
      .filter((f) => f.birth_date)
      .map((f) => {
        const bd = new Date(f.birth_date as Date);
        // Birthday this year (or next year if already passed)
        let upcoming = new Date(currentYear, bd.getMonth(), bd.getDate());
        if (upcoming < now) upcoming = new Date(currentYear + 1, bd.getMonth(), bd.getDate());
        const daysUntil = Math.round((upcoming.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...f, daysUntil, nextBirthday: upcoming.toISOString() };
      })
      .filter((f) => f.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  },

  /** Friends whose birthday is yesterday, today, or tomorrow (for the messages banner) */
  async getNearbyBirthdays(userId: string) {
    const friends = await this.getFriends(userId);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentYear = now.getFullYear();

    return friends
      .filter((f) => f.birth_date)
      .map((f) => {
        const bd = new Date(f.birth_date as Date);
        let occurrence = new Date(currentYear, bd.getMonth(), bd.getDate());
        let daysOffset = Math.round((occurrence.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
        // Birthday already passed by more than a day this year — check next year's occurrence instead
        if (daysOffset < -1) {
          occurrence = new Date(currentYear + 1, bd.getMonth(), bd.getDate());
          daysOffset = Math.round((occurrence.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
        }
        const age = occurrence.getFullYear() - bd.getFullYear();
        return { ...f, daysOffset, age, occurredAt: occurrence.toISOString() };
      })
      .filter((f) => f.daysOffset >= -1 && f.daysOffset <= 1)
      .sort((a, b) => a.daysOffset - b.daysOffset);
  },

  /** Suggested users = friends of friends (people my friends follow/are followed by) */
  async getSuggestions(userId: string, limit = 20) {
    // Collect all follow relationships for current user
    const [myFollowerRows, myFollowingRows] = await Promise.all([
      prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true } }),
      prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true } }),
    ]);
    const myFollowingSet  = new Set(myFollowingRows.map((r) => r.following_id));
    const myFollowerSet   = new Set(myFollowerRows.map((r) => r.follower_id));
    const myFriendIds     = Array.from(myFollowingSet).filter((id) => myFollowerSet.has(id));

    // Exclude: me, all my friends, all follows in either direction, existing friendship requests
    const excludedIds = new Set<string>([userId, ...myFriendIds, ...myFollowingSet, ...myFollowerSet]);

    const existing = await prisma.friendship.findMany({
      where: { OR: [{ requester_id: userId }, { addressee_id: userId }] },
      select: { requester_id: true, addressee_id: true },
    });
    for (const row of existing) {
      excludedIds.add(row.requester_id);
      excludedIds.add(row.addressee_id);
    }

    if (myFriendIds.length === 0) {
      // No friends yet — fallback: random recent users
      return prisma.user.findMany({
        where:   { id: { notIn: Array.from(excludedIds) }, deleted_at: null },
        select:  FRIEND_USER_SELECT,
        take:    limit,
        orderBy: { created_at: 'desc' },
      });
    }

    // Get who my friends follow / who follows my friends
    const friendFollowRows = await prisma.follow.findMany({
      where: {
        OR: [
          { follower_id:  { in: myFriendIds } },
          { following_id: { in: myFriendIds } },
        ],
      },
      select: { follower_id: true, following_id: true },
    });

    // Count mutual-connection score
    const mutualCount = new Map<string, number>();
    for (const row of friendFollowRows) {
      for (const candidateId of [row.follower_id, row.following_id]) {
        if (!excludedIds.has(candidateId)) {
          mutualCount.set(candidateId, (mutualCount.get(candidateId) ?? 0) + 1);
        }
      }
    }

    if (mutualCount.size === 0) {
      return prisma.user.findMany({
        where:   { id: { notIn: Array.from(excludedIds) }, deleted_at: null },
        select:  FRIEND_USER_SELECT,
        take:    limit,
        orderBy: { created_at: 'desc' },
      });
    }

    const sortedCandidateIds = Array.from(mutualCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    const users = await prisma.user.findMany({
      where:  { id: { in: sortedCandidateIds }, deleted_at: null },
      select: FRIEND_USER_SELECT,
    });

    return users.sort((a, b) => (mutualCount.get(b.id) ?? 0) - (mutualCount.get(a.id) ?? 0));
  },
};
