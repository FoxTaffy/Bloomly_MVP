import prisma from '../../config/prisma.js';
import { Prisma } from '@prisma/client';
import { notificationService } from '../notifications/service.js';
import { getStorageStats } from '../media/service.js';
import { applyAction, type TargetSnapshot } from '../automod/service.js';
import { normalizeSafeLink } from '../../lib/safeLink.js';

/** Одобренная реклама в текущем окне показа (для счётчиков показов и кликов). */
function liveAdWhere(adId: string) {
  const now = new Date();
  return {
    id: adId,
    status: 'active',
    deleted_at: null,
    AND: [
      { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
      { OR: [{ ends_at: null }, { ends_at: { gte: now } }] },
    ],
  };
}

// ── Stats helpers ────────────────────────────────────────────────────────────

type PeriodRow = { bucket: Date; count: bigint };
type CountedTable = 'User' | 'Post' | 'Vote' | 'Comment';

/** Live (not soft-deleted) rows created since `since`, counted per day or per calendar month. */
function countByPeriod(table: CountedTable, unit: 'day' | 'month', since: Date) {
  // Table names can't be bind parameters — only the fixed CountedTable values ever reach Prisma.raw.
  return prisma.$queryRaw<PeriodRow[]>(Prisma.sql`
    SELECT DATE_TRUNC(${unit}, created_at) AS bucket, COUNT(*)::bigint AS count
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE deleted_at IS NULL AND created_at >= ${since}
    GROUP BY 1 ORDER BY 1
  `);
}

/**
 * 12 monthly points starting at `firstMonth`, zero-filled, so the frontend can turn them into
 * a cumulative "total" curve; `month` is the first day, as YYYY-MM-DD.
 */
function fillMonths(rows: PeriodRow[], firstMonth: Date) {
  const byMonth = new Map(rows.map(r => [new Date(r.bucket).toISOString().slice(0, 7), Number(r.count)]));
  return Array.from({ length: 12 }, (_, i) => {
    const key = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + i, 1)).toISOString().slice(0, 10);
    return { month: key, count: byMonth.get(key.slice(0, 7)) ?? 0 };
  });
}

/** The last `days` days up to `now` as YYYY-MM-DD points, zero-filled. */
function fillDays(rows: PeriodRow[], days: number, now: Date) {
  const byDay = new Map(rows.map(r => [new Date(r.bucket).toISOString().slice(0, 10), Number(r.count)]));
  return Array.from({ length: days }, (_, i) => {
    const key = new Date(now.getTime() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day: key, count: byDay.get(key) ?? 0 };
  });
}

export const adminService = {
  // ── Overview stats ────────────────────────────────────────────────────────
  async getStats() {
    const now = new Date();
    const dayAgo   = new Date(now.getTime() - 86_400_000);
    // Начало суток 6 дней назад (UTC): то же окно, что у недельного графика (fillDays), чтобы итоги сходились
    const weekAgo  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [
      totalUsers, newUsersDay, newUsersWeek, newUsersMonth,
      totalPosts, newPostsDay, newPostsWeek,
      totalComments, totalRepaws, totalFollows,
      pendingReports, pendingAds,
      activeAds,
      frozenUsers, pendingVerification, autoModFlags24h,
      premiumSubscribers,
    ] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.user.count({ where: { deleted_at: null, created_at: { gte: dayAgo } } }),
      prisma.user.count({ where: { deleted_at: null, created_at: { gte: weekAgo } } }),
      prisma.user.count({ where: { deleted_at: null, created_at: { gte: monthAgo } } }),
      prisma.post.count({ where: { deleted_at: null } }),
      prisma.post.count({ where: { deleted_at: null, created_at: { gte: dayAgo } } }),
      prisma.post.count({ where: { deleted_at: null, created_at: { gte: weekAgo } } }),
      prisma.comment.count({ where: { deleted_at: null } }),
      prisma.repaw.count(),
      prisma.follow.count(),
      prisma.report.count({ where: { status: 'pending', deleted_at: null } }),
      prisma.advertisement.count({ where: { status: 'pending', deleted_at: null } }),
      prisma.advertisement.count({ where: { status: 'active',  deleted_at: null } }),
      prisma.user.count({ where: { deleted_at: null, frozen_at: { not: null } } }),
      prisma.verificationRequest.count({ where: { status: 'pending' } }),
      prisma.autoModLog.count({ where: { created_at: { gte: dayAgo } } }),
      prisma.user.count({ where: { deleted_at: null, subscription_tier: { not: 'free' } } }),
    ]);

    // Posts per day for last 14 days
    const postsHistory = await countByPeriod('Post', 'day', new Date(now.getTime() - 14 * 86_400_000));

    // Count users by role
    type RoleRow = { role: string; count: bigint };
    const roleBreakdown = await prisma.$queryRaw<RoleRow[]>`
      SELECT role, COUNT(*)::bigint AS count FROM "User" WHERE deleted_at IS NULL GROUP BY role
    `;

    // Registrations / posts per month for the last 12 calendar months (current one included).
    // Months with no rows are zero-filled so the frontend always gets 12 ordered points and
    // can turn them into a cumulative "total" curve; `month` is the first day, as YYYY-MM-DD.
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const sevenDaysAgo = weekAgo;
    const [usersByMonth, postsByMonth, postsPerDay, votesPerDay, commentsPerDay] = await Promise.all([
      countByPeriod('User', 'month', firstMonth),
      countByPeriod('Post', 'month', firstMonth),
      // Posts / likes / comments per day for the last 7 days
      countByPeriod('Post', 'day', sevenDaysAgo),
      countByPeriod('Vote', 'day', sevenDaysAgo),
      countByPeriod('Comment', 'day', sevenDaysAgo),
    ]);

    // Reports grouped by AutoMod-assigned category (falls back to "other" for
    // manually-filed reports the AI never scored)
    type CategoryRow = { category: string; count: bigint };
    const reportsByCategory = await prisma.$queryRaw<CategoryRow[]>`
      SELECT COALESCE(ai_category, 'other') AS category, COUNT(*)::bigint AS count
      FROM "Report" WHERE deleted_at IS NULL
      GROUP BY 1 ORDER BY 2 DESC
    `;

    return {
      users:   { total: totalUsers, today: newUsersDay, week: newUsersWeek, month: newUsersMonth },
      posts:   { total: totalPosts, today: newPostsDay, week: newPostsWeek },
      comments: totalComments,
      repaws:   totalRepaws,
      follows:  totalFollows,
      moderation: { pendingReports, pendingAds, frozenUsers, pendingVerification, autoModFlags24h },
      ads: { active: activeAds },
      premiumSubscribers,
      postsHistory: postsHistory.map((r) => ({ day: r.bucket, count: Number(r.count) })),
      roleBreakdown: roleBreakdown.map((r) => ({ role: r.role, count: Number(r.count) })),
      userGrowth: fillMonths(usersByMonth, firstMonth),
      postGrowth: fillMonths(postsByMonth, firstMonth),
      weeklyActivity: {
        posts: fillDays(postsPerDay, 7, now),
        likes: fillDays(votesPerDay, 7, now),
        comments: fillDays(commentsPerDay, 7, now),
      },
      reportsByCategory: reportsByCategory.map((r) => ({ category: r.category, count: Number(r.count) })),
    };
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  // Default sort ("privilege") ranks owner > admin > moderator > user, since role
  // is a plain string column and its alphabetical order doesn't match rank order.
  async getUsers(page = 1, limit = 30, search?: string, sortBy = 'privilege') {
    const skip = (page - 1) * limit;

    const searchClause = search
      ? Prisma.sql`AND (u.username ILIKE ${'%' + search + '%'} OR u.display_name ILIKE ${'%' + search + '%'} OR u.email ILIKE ${'%' + search + '%'})`
      : Prisma.empty;

    const roleRankSql = Prisma.sql`CASE u.role WHEN 'owner' THEN 3 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 1 ELSE 0 END`;
    const tierRankSql = Prisma.sql`CASE u.subscription_tier WHEN 'business' THEN 3 WHEN 'pro' THEN 2 WHEN 'lite' THEN 1 ELSE 0 END`;
    const statusRankSql = Prisma.sql`CASE WHEN u.deceased_at IS NOT NULL THEN 2 WHEN u.frozen_at IS NOT NULL THEN 1 ELSE 0 END`;
    const verifiedRankSql = Prisma.sql`CASE WHEN u.badge_type IS NOT NULL THEN 1 ELSE 0 END`;

    const orderClauses: Record<string, Prisma.Sql> = {
      privilege:    Prisma.sql`${roleRankSql} DESC, u.created_at DESC`,
      newest:       Prisma.sql`u.created_at DESC`,
      oldest:       Prisma.sql`u.created_at ASC`,
      posts:        Prisma.sql`post_count DESC, u.created_at DESC`,
      posts_asc:    Prisma.sql`post_count ASC, u.created_at DESC`,
      followers:    Prisma.sql`follower_count DESC, u.created_at DESC`,
      followers_asc: Prisma.sql`follower_count ASC, u.created_at DESC`,
      subscription: Prisma.sql`${tierRankSql} DESC, u.created_at DESC`,
      username:     Prisma.sql`u.username ASC`,
      username_desc: Prisma.sql`u.username DESC`,
      email_asc:    Prisma.sql`u.email ASC`,
      email_desc:   Prisma.sql`u.email DESC`,
      status_asc:   Prisma.sql`${statusRankSql} ASC, u.created_at DESC`,
      status_desc:  Prisma.sql`${statusRankSql} DESC, u.created_at DESC`,
      verification_asc:  Prisma.sql`${verifiedRankSql} ASC, u.created_at DESC`,
      verification_desc: Prisma.sql`${verifiedRankSql} DESC, u.created_at DESC`,
    };
    const orderClause = orderClauses[sortBy] ?? orderClauses.privilege;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT u.id, u.username, u.display_name, u.email, u.role, u.badge_type, u.is_sponsor, u.avatar_url,
             u.subscription_tier, u.created_at, u.deleted_at, u.frozen_at, u.warn_count,
             u.deceased_at, u.deceased_note,
             COALESCE(p.post_count, 0)::int AS post_count,
             COALESCE(f.follower_count, 0)::int AS follower_count,
             COUNT(*) OVER()::int AS total_count
      FROM "User" u
      LEFT JOIN (SELECT author_id, COUNT(*) AS post_count FROM "Post" WHERE deleted_at IS NULL GROUP BY author_id) p ON p.author_id = u.id
      LEFT JOIN (SELECT following_id, COUNT(*) AS follower_count FROM "Follow" GROUP BY following_id) f ON f.following_id = u.id
      WHERE u.deleted_at IS NULL
      ${searchClause}
      ORDER BY ${orderClause}
      LIMIT ${limit} OFFSET ${skip}
    `;

    const total = rows[0]?.total_count ?? 0;

    const [newToday, subscribers, frozen] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null, created_at: { gte: new Date(Date.now() - 86_400_000) } } }),
      prisma.user.count({ where: { deleted_at: null, subscription_tier: { not: 'free' } } }),
      prisma.user.count({ where: { deleted_at: null, frozen_at: { not: null } } }),
    ]);

    const users = rows.map(({ post_count, follower_count, total_count, ...u }) => ({
      ...u,
      _count: { posts: post_count, followers: follower_count },
    }));

    return {
      users, total, page, pages: Math.ceil(total / limit),
      stats: { newToday, subscribers, frozen },
    };
  },

  async updateUserRole(userId: string, role: string, badgeType?: string | null) {
    return prisma.user.update({
      where: { id: userId },
      data:  { role, ...(badgeType !== undefined ? { badge_type: badgeType } : {}) },
      select: { id: true, username: true, role: true, badge_type: true },
    });
  },

  async setUserSponsor(userId: string, isSponsor: boolean) {
    return prisma.user.update({
      where: { id: userId },
      data:  { is_sponsor: isSponsor },
      select: { id: true, username: true, is_sponsor: true },
    });
  },

  // ── Team & roles ─────────────────────────────────────────────────────────
  async getStaff() {
    const staff = await prisma.user.findMany({
      where: { deleted_at: null, role: { not: 'user' } },
      select: { id: true, username: true, display_name: true, email: true, avatar_url: true, role: true, frozen_at: true, last_seen_at: true, created_at: true },
    });
    const rank: Record<string, number> = { owner: 3, admin: 2, moderator: 1 };
    return staff.sort((a, b) => (rank[b.role] ?? 0) - (rank[a.role] ?? 0));
  },

  async promoteToStaff(identifier: string, role: string) {
    const isEmail = identifier.includes('@');
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: { equals: identifier, mode: 'insensitive' } } : { username: { equals: identifier, mode: 'insensitive' } },
    });
    if (!user) throw Object.assign(new Error('Пользователь не найден'), { code: 'NOT_FOUND' });
    return prisma.user.update({
      where: { id: user.id }, data: { role },
      select: { id: true, username: true, display_name: true, email: true, avatar_url: true, role: true, frozen_at: true, last_seen_at: true, created_at: true },
    });
  },

  // ── Broadcast notifications ──────────────────────────────────────────────
  async sendBroadcast(actorId: string, title: string, body: string, audience: 'all' | 'premium' | 'new' | 'staff') {
    const where: any = { deleted_at: null };
    if (audience === 'premium') where.subscription_tier = { not: 'free' };
    if (audience === 'new')     where.created_at = { gte: new Date(Date.now() - 7 * 86_400_000) };
    if (audience === 'staff')   where.role = { not: 'user' };

    const targets = (await prisma.user.findMany({ where, select: { id: true } })).filter(t => t.id !== actorId);

    const broadcast = await prisma.adminBroadcast.create({
      data: { actor_id: actorId, title, body, audience, recipient_count: targets.length },
    });

    // refId links each fan-out Notification back to this broadcast so real
    // "opens" (Notification.read) can be counted per-broadcast later.
    await Promise.all(
      targets.map(t => notificationService.create({ receiverId: t.id, type: 'admin_broadcast', refId: broadcast.id, meta: { title, body } })),
    );

    return broadcast;
  },

  async getBroadcasts() {
    const broadcasts = await prisma.adminBroadcast.findMany({
      orderBy: { created_at: 'desc' },
      take: 30,
      include: { actor: { select: { username: true, display_name: true } } },
    });
    const opensByBroadcast = await prisma.notification.groupBy({
      by: ['ref_id'],
      where: { type: 'admin_broadcast', read: true, ref_id: { in: broadcasts.map(b => b.id) } },
      _count: true,
    });
    const opensMap = new Map(opensByBroadcast.map(o => [o.ref_id, o._count]));
    return broadcasts.map(b => ({ ...b, opens: opensMap.get(b.id) ?? 0 }));
  },

  async deleteUser(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { deleted_at: new Date(), is_banned: true } });
  },

  async restoreUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { deleted_at: null, is_banned: false },
      select: { id: true, username: true, display_name: true, email: true, role: true, badge_type: true, avatar_url: true, created_at: true, deleted_at: true },
    });
  },

  async getArchivedUsers(page = 1, limit = 30, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: { not: null } };
    if (search) where.OR = [
      { username:     { contains: search, mode: 'insensitive' } },
      { display_name: { contains: search, mode: 'insensitive' } },
      { email:        { contains: search, mode: 'insensitive' } },
    ];
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deleted_at: 'desc' },
        select: {
          id: true, username: true, display_name: true, email: true,
          role: true, badge_type: true, avatar_url: true, is_banned: true,
          created_at: true, deleted_at: true, frozen_reason: true,
          _count: { select: { posts: true, followers: true, following: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return { users, total, page, pages: Math.ceil(total / limit) };
  },

  // ── Frozen users (reversible, awaiting review / email unfreeze) ─────────────
  async getFrozenUsers(page = 1, limit = 30, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: null, frozen_at: { not: null } };
    if (search) where.OR = [
      { username:     { contains: search, mode: 'insensitive' } },
      { display_name: { contains: search, mode: 'insensitive' } },
      { email:        { contains: search, mode: 'insensitive' } },
    ];
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { frozen_at: 'desc' },
        select: {
          id: true, username: true, display_name: true, email: true,
          role: true, badge_type: true, avatar_url: true,
          created_at: true, frozen_at: true, frozen_reason: true, warn_count: true,
          _count: { select: { posts: true, followers: true, following: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return { users, total, page, pages: Math.ceil(total / limit) };
  },

  async getSponsors(page = 1, limit = 30, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { is_sponsor: true, deleted_at: null };
    if (search) where.OR = [
      { username:     { contains: search, mode: 'insensitive' } },
      { display_name: { contains: search, mode: 'insensitive' } },
      { email:        { contains: search, mode: 'insensitive' } },
    ];
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true, username: true, display_name: true, email: true,
          role: true, badge_type: true, avatar_url: true,
          created_at: true, deleted_at: true, frozen_at: true, frozen_reason: true,
          _count: { select: { posts: true, followers: true, following: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return { users, total, page, pages: Math.ceil(total / limit) };
  },

  // ── Posts moderation ───────────────────────────────────────────────────────
  async getPosts(page = 1, limit = 30, search?: string, filter?: 'media' | 'nsfw' | 'announcement') {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: null };
    if (search) where.content = { contains: search, mode: 'insensitive' };
    if (filter === 'media')        where.media_urls = { isEmpty: false };
    if (filter === 'nsfw')         where.is_nsfw = true;
    if (filter === 'announcement') where.is_announcement = true;
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where, skip, take: limit, orderBy: { created_at: 'desc' },
        include: {
          author: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true } },
          groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
          _count: { select: { comments: true, repaws: true } },
        },
      }),
      prisma.post.count({ where }),
    ]);

    // Votes are Reddit-style (+1/-1) in one table — split into likes/dislikes per post
    const postIds = posts.map(p => p.id);
    type VoteRow = { post_id: string; likes: bigint; dislikes: bigint };
    const voteRows = postIds.length
      ? await prisma.$queryRaw<VoteRow[]>`
          SELECT post_id,
            COUNT(*) FILTER (WHERE value > 0)::bigint AS likes,
            COUNT(*) FILTER (WHERE value < 0)::bigint AS dislikes
          FROM "Vote"
          WHERE deleted_at IS NULL AND post_id = ANY(${postIds}::uuid[])
          GROUP BY post_id
        `
      : [];
    const voteMap = new Map(voteRows.map(r => [r.post_id, { likes: Number(r.likes), dislikes: Number(r.dislikes) }]));
    const postsWithVotes = posts.map(p => ({
      ...p,
      likes_count: voteMap.get(p.id)?.likes ?? 0,
      dislikes_count: voteMap.get(p.id)?.dislikes ?? 0,
    }));

    return { posts: postsWithVotes, total, page, pages: Math.ceil(total / limit) };
  },

  async deletePost(postId: string) {
    return prisma.post.update({ where: { id: postId }, data: { deleted_at: new Date() } });
  },

  // Reuses the existing `is_announcement` flag as the admin "pin/feature" toggle —
  // it's already surfaced on posts (badge + feed filter), so no new column needed.
  async togglePostPin(postId: string) {
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, select: { is_announcement: true } });
    return prisma.post.update({ where: { id: postId }, data: { is_announcement: !post.is_announcement } });
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  // Reports are grouped into "folders" by (target_type, target_id): repeated
  // complaints about the same post/entity collapse into a single tile instead
  // of flooding the queue with duplicates.
  async getReports(status?: string, page = 1, limit = 30) {
    const where: any = { deleted_at: null };
    if (status) where.status = status;

    const all = await prisma.report.findMany({
      where, orderBy: { created_at: 'desc' },
      include: {
        reporter: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        resolver: { select: { id: true, username: true } },
      },
    });

    const groups = new Map<string, typeof all>();
    for (const r of all) {
      const key = `${r.target_type}:${r.target_id}`;
      const arr = groups.get(key);
      if (arr) arr.push(r); else groups.set(key, [r]);
    }

    const postIds = [...groups.values()]
      .filter(g => g[0].target_type === 'post')
      .map(g => g[0].target_id);
    const posts = postIds.length
      ? await prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true, content: true, media_urls: true, is_nsfw: true, deleted_at: true,
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          },
        })
      : [];
    const postMap = new Map(posts.map(p => [p.id, p]));

    const userIds = [...groups.values()]
      .filter(g => g[0].target_type === 'user')
      .map(g => g[0].target_id);
    const reportedUsers = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, display_name: true, avatar_url: true, deleted_at: true },
        })
      : [];
    const userMap = new Map(reportedUsers.map(u => [u.id, u]));

    const groupIds = [...groups.values()]
      .filter(g => g[0].target_type === 'group')
      .map(g => g[0].target_id);
    const reportedGroups = groupIds.length
      ? await prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, slug: true, name: true, avatar_url: true, deleted_at: true, owner_id: true },
        })
      : [];
    const groupMap = new Map(reportedGroups.map(g => [g.id, g]));

    const folders = [...groups.values()]
      .map(group => ({
        target_type: group[0].target_type,
        target_id:   group[0].target_id,
        count:       group.length,
        status:      group.some(r => r.status === 'pending') ? 'pending' : group[0].status,
        created_at:  group[0].created_at,
        reports:     group,
        post:        group[0].target_type === 'post' ? (postMap.get(group[0].target_id) ?? null) : null,
        reportedUser: group[0].target_type === 'user' ? (userMap.get(group[0].target_id) ?? null) : null,
        reportedGroup: group[0].target_type === 'group' ? (groupMap.get(group[0].target_id) ?? null) : null,
      }))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    const total = folders.length;
    const skip  = (page - 1) * limit;
    const reports = folders.slice(skip, skip + limit);

    return { reports, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  },

  async createReport(input: { reporterId: string; targetType: string; targetId: string; reason: string; evidenceUrls?: string[] }) {
    // One pending report per (reporter, target) — prevents a single user from
    // flooding the moderation queue / report-count-based auto-escalation with
    // repeated complaints about the same profile, group or post.
    const existing = await prisma.report.findFirst({
      where: {
        reporter_id: input.reporterId,
        target_type: input.targetType,
        target_id: input.targetId,
        status: 'pending',
        deleted_at: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw Object.assign(new Error('Report already submitted'), { statusCode: 409, code: 'ALREADY_REPORTED' });
    }
    return prisma.report.create({ data: {
      reporter_id: input.reporterId, target_type: input.targetType,
      target_id: input.targetId, reason: input.reason,
      evidence_urls: input.evidenceUrls ?? [],
    }});
  },

  async deleteGroup(groupId: string) {
    return prisma.group.update({ where: { id: groupId }, data: { deleted_at: new Date() } });
  },

  async resolveReport(reportId: string, resolverId: string, status: 'reviewed' | 'dismissed', note?: string) {
    return prisma.report.update({
      where: { id: reportId },
      data:  { status, resolved_by: resolverId, note, updated_at: new Date() },
    });
  },

  // Resolve every report in a folder at once (repeated complaints on the same post)
  async resolveReportsBatch(reportIds: string[], resolverId: string, status: 'reviewed' | 'dismissed', note?: string) {
    return prisma.report.updateMany({
      where: { id: { in: reportIds } },
      data:  { status, resolved_by: resolverId, note, updated_at: new Date() },
    });
  },

  // The single "Решить проблему" action: optionally removes the reported content,
  // always issues a warning with a moderator-written reason (and optional evidence
  // photo) to whoever authored it, then resolves every report in the folder. This is
  // the only path that creates a warning from the reports queue, so a warning is
  // never sent without a recorded reason.
  async resolveReportIssue(params: {
    reportIds: string[];
    targetType: string;
    targetId: string;
    deleteContent: boolean;
    reason: string;
    category: string;
    imageUrl?: string;
    resolverId: string;
  }) {
    const { reportIds, targetType, targetId, deleteContent, reason, category, imageUrl, resolverId } = params;

    let warnUserId: string | null = null;
    let postId: string | undefined;
    let snapshot: TargetSnapshot = {};

    if (targetType === 'post') {
      const post = await prisma.post.findUnique({
        where: { id: targetId },
        select: { author_id: true, content: true, media_urls: true, created_at: true },
      });
      if (post) {
        warnUserId = post.author_id;
        postId = targetId;
        snapshot = {
          label: post.content ? post.content.slice(0, 80) : 'Публикация',
          thumbnail: Array.isArray(post.media_urls) && post.media_urls.length ? String(post.media_urls[0]) : undefined,
          date: post.created_at.toISOString(),
        };
      }
      if (deleteContent) await this.deletePost(targetId);
    } else if (targetType === 'user') {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { display_name: true, username: true, avatar_url: true, created_at: true },
      });
      if (target) {
        warnUserId = targetId;
        snapshot = { label: target.display_name || target.username, thumbnail: target.avatar_url ?? undefined, date: target.created_at.toISOString() };
      }
      if (deleteContent) await this.deleteUser(targetId);
    } else if (targetType === 'group') {
      const group = await prisma.group.findUnique({
        where: { id: targetId },
        select: { name: true, avatar_url: true, owner_id: true, created_at: true },
      });
      if (group) {
        warnUserId = group.owner_id;
        snapshot = { label: group.name, thumbnail: group.avatar_url ?? undefined, date: group.created_at.toISOString() };
      }
      if (deleteContent) await this.deleteGroup(targetId);
    }

    if (warnUserId) {
      await applyAction(warnUserId, 'warn', category, reason, undefined, postId, resolverId, imageUrl, snapshot);
    }

    return this.resolveReportsBatch(reportIds, resolverId, 'resolved' as any, reason);
  },

  // ── Advertisements ─────────────────────────────────────────────────────────
  async getAds(status?: string) {
    return prisma.advertisement.findMany({
      where:   status ? { status, deleted_at: null } : { deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        requester: { select: { id: true, username: true, display_name: true } },
        reviewer:  { select: { id: true, username: true } },
      },
    });
  },

  async getActiveAds() {
    const now = new Date();
    return prisma.advertisement.findMany({
      where: {
        status:     'active',
        deleted_at: null,
        OR: [{ starts_at: null }, { starts_at: { lte: now } }],
        AND: [{ OR: [{ ends_at: null }, { ends_at: { gte: now } }] }],
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async submitAd(input: {
    requesterId?: string; title: string; description?: string;
    imageUrl?: string; linkUrl: string; contactInfo?: string; priceLabel?: string;
  }) {
    // Ссылка рекламы показывается всем посетителям — javascript:-схему отсекаем на записи
    const linkUrl = normalizeSafeLink(input.linkUrl);
    if (!linkUrl) throw new Error('Недопустимая ссылка рекламы: разрешены только http(s), mailto и tel');
    return prisma.advertisement.create({ data: {
      requester_id: input.requesterId, title: input.title,
      description:  input.description, image_url: input.imageUrl,
      link_url: linkUrl, contact_info: input.contactInfo,
      price_label: input.priceLabel,
    }});
  },

  async deleteAd(adId: string) {
    return prisma.advertisement.update({ where: { id: adId }, data: { deleted_at: new Date() } });
  },

  async reviewAd(
    adId: string, reviewerId: string,
    status: 'active' | 'rejected',
    options?: { startsAt?: Date; endsAt?: Date },
  ) {
    return prisma.advertisement.update({
      where: { id: adId },
      data:  {
        status, reviewed_by: reviewerId,
        starts_at: options?.startsAt, ends_at: options?.endsAt,
        updated_at: new Date(),
      },
    });
  },

  // Счётчики растут только у активной рекламы в её окне показа: без этого любой мог накручивать
  // показы и клики на неодобренные объявления и портить отчёты рекламодателям.
  async trackAdImpression(adId: string) {
    return prisma.advertisement.updateMany({ where: liveAdWhere(adId), data: { impressions: { increment: 1 } } });
  },

  async trackAdClick(adId: string) {
    return prisma.advertisement.updateMany({ where: liveAdWhere(adId), data: { clicks: { increment: 1 } } });
  },

  // ──  Sticker Banners  ──────────────────────────────────────────────────
  async getBanners() {
    return prisma.stickerBanner.findMany({ orderBy: { sort_order: 'asc' } });
  },

  async getActiveBanners() {
    return prisma.stickerBanner.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' }, take: 7 });
  },

  async createBanner(data: {
    title: string; subtitle?: string; tag_label?: string;
    image_url: string; link_url?: string; price_label?: string;
    gradient?: string; sort_order?: number; is_active?: boolean;
  }) {
    const count = await prisma.stickerBanner.count();
    if (count >= 7) throw Object.assign(new Error('Maximum 7 banners allowed'), { code: 'LIMIT' });
    return prisma.stickerBanner.create({ data: { ...data, sort_order: data.sort_order ?? count } });
  },

  async updateBanner(id: string, data: Partial<{
    title: string; subtitle: string; tag_label: string;
    image_url: string; link_url: string; price_label: string;
    gradient: string; sort_order: number; is_active: boolean;
  }>) {
    return prisma.stickerBanner.update({ where: { id }, data });
  },

  async deleteBanner(id: string) {
    return prisma.stickerBanner.delete({ where: { id } });
  },

  // ── Infrastructure overview ──────────────────────────────────────────────────
  // No server/CPU/uptime metrics — deliberately not wiring Docker socket access
  // into this container (see conversation decision). Only real, safely-obtained
  // signals: sticker system size, Dealers' Den marketplace activity, real S3 usage.
  async getInfraOverview() {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [packCount, fileCountAgg, activeListings, soldThisMonthAgg, storage] = await Promise.all([
      prisma.stickerPack.count({ where: { deleted_at: null, status: 'published' } }),
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COALESCE(SUM(cardinality(stickers)), 0)::bigint AS total
        FROM "StickerPack" WHERE deleted_at IS NULL AND status = 'published'
      `,
      prisma.dealerListing.count({ where: { status: 'active', deleted_at: null } }),
      prisma.dealerListing.aggregate({
        where: { status: 'sold', deleted_at: null, updated_at: { gte: monthAgo } },
        _sum: { price: true }, _count: true,
      }),
      getStorageStats(),
    ]);

    return {
      stickers: { packCount, fileCount: Number(fileCountAgg[0]?.total ?? 0) },
      dealersDen: { activeListings, soldThisMonthCount: soldThisMonthAgg._count, soldThisMonthValue: Number(soldThisMonthAgg._sum.price ?? 0) },
      storage,
    };
  },

  // ── Groups & Events overview ────────────────────────────────────────────────
  // Сводка + постраничный список групп и список событий. Все счётчики считаются по живым группам (deleted_at IS NULL).
  async getGroupsOverview(opts: { search?: string; type?: string; sort?: string; page?: number; limit?: number; events?: string } = {}) {
    const now = new Date();
    const weekAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(60, Math.max(1, opts.limit ?? 12));
    const skip = (page - 1) * limit;

    const searchClause = opts.search
      ? Prisma.sql`AND (g.name ILIKE ${'%' + opts.search + '%'} OR g.slug ILIKE ${'%' + opts.search + '%'} OR o.username ILIKE ${'%' + opts.search + '%'})`
      : Prisma.empty;
    const typeClause = opts.type ? Prisma.sql`AND g.type = ${opts.type}` : Prisma.empty;

    const orderMap: Record<string, Prisma.Sql> = {
      members:   Prisma.sql`members DESC, g.created_at DESC`,
      growth:    Prisma.sql`new_members DESC, members DESC`,
      posts:     Prisma.sql`posts DESC, members DESC`,
      events:    Prisma.sql`events_total DESC, members DESC`,
      rating:    Prisma.sql`g.rating DESC, g.rating_count DESC`,
      newest:    Prisma.sql`g.created_at DESC`,
      requests:  Prisma.sql`pending_requests DESC, members DESC`,
    };
    const orderSql = orderMap[opts.sort ?? 'members'] ?? orderMap.members;

    type GroupRow = {
      id: string; slug: string; name: string; type: string; category: string | null; description: string | null;
      avatar_url: string | null; banner_url: string | null; accent_color: string | null;
      is_public: boolean; is_nsfw: boolean; is_verified: boolean; den_enabled: boolean; donations_enabled: boolean; business_enabled: boolean;
      rating: number; rating_count: number; created_at: Date;
      owner_id: string; owner_username: string; owner_display_name: string | null; owner_avatar_url: string | null;
      members: bigint; new_members: bigint; subscribers: bigint; pending_requests: bigint; posts: bigint; posts_week: bigint;
      events_total: bigint; events_upcoming: bigint; next_event_at: Date | null; next_event_title: string | null; attendees_total: bigint;
    };

    const [rows, totalRow] = await Promise.all([
      prisma.$queryRaw<GroupRow[]>`
        SELECT g.id, g.slug, g.name, g.type, g.category, g.description, g.avatar_url, g.banner_url, g.accent_color,
               g.is_public, g.is_nsfw, g.is_verified, g.den_enabled, g.donations_enabled, g.business_enabled,
               g.rating, g.rating_count, g.created_at,
               o.id AS owner_id, o.username AS owner_username, o.display_name AS owner_display_name, o.avatar_url AS owner_avatar_url,
               (SELECT COUNT(*) FROM "GroupMember" m WHERE m.group_id = g.id)::bigint AS members,
               (SELECT COUNT(*) FROM "GroupMember" m WHERE m.group_id = g.id AND m.joined_at >= ${weekAgo})::bigint AS new_members,
               (SELECT COUNT(*) FROM "GroupSubscriber" s WHERE s.group_id = g.id)::bigint AS subscribers,
               (SELECT COUNT(*) FROM "GroupJoinRequest" r WHERE r.group_id = g.id)::bigint AS pending_requests,
               (SELECT COUNT(*) FROM "GroupPost" gp JOIN "Post" p ON p.id = gp.post_id WHERE gp.group_id = g.id AND p.deleted_at IS NULL)::bigint AS posts,
               (SELECT COUNT(*) FROM "GroupPost" gp JOIN "Post" p ON p.id = gp.post_id WHERE gp.group_id = g.id AND p.deleted_at IS NULL AND gp.created_at >= ${weekAgo})::bigint AS posts_week,
               (SELECT COUNT(*) FROM "Event" e WHERE e.group_id = g.id)::bigint AS events_total,
               (SELECT COUNT(*) FROM "Event" e WHERE e.group_id = g.id AND e.starts_at >= ${now})::bigint AS events_upcoming,
               (SELECT e.starts_at FROM "Event" e WHERE e.group_id = g.id AND e.starts_at >= ${now} ORDER BY e.starts_at ASC LIMIT 1) AS next_event_at,
               (SELECT e.title FROM "Event" e WHERE e.group_id = g.id AND e.starts_at >= ${now} ORDER BY e.starts_at ASC LIMIT 1) AS next_event_title,
               (SELECT COALESCE(SUM(e.attendee_count), 0) FROM "Event" e WHERE e.group_id = g.id)::bigint AS attendees_total
        FROM "Group" g
        JOIN "User" o ON o.id = g.owner_id
        WHERE g.deleted_at IS NULL ${typeClause} ${searchClause}
        ORDER BY ${orderSql}
        LIMIT ${limit} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total FROM "Group" g JOIN "User" o ON o.id = g.owner_id
        WHERE g.deleted_at IS NULL ${typeClause} ${searchClause}
      `,
    ]);
    const total = Number(totalRow[0]?.total ?? 0);

    // ── Сводка по всей платформе (не зависит от поиска и фильтра) ──
    const liveGroup = { deleted_at: null } as const;
    const [
      totalGroups, newGroupsWeek, publicGroups, verifiedGroups, nsfwGroups, denGroups, byType,
      totalMembers, newMembersWeek, pendingRequests, groupPosts,
      totalEvents, upcomingEvents, attendeesAgg, topEvents,
    ] = await Promise.all([
      prisma.group.count({ where: liveGroup }),
      prisma.group.count({ where: { ...liveGroup, created_at: { gte: weekAgo } } }),
      prisma.group.count({ where: { ...liveGroup, is_public: true } }),
      prisma.group.count({ where: { ...liveGroup, is_verified: true } }),
      prisma.group.count({ where: { ...liveGroup, is_nsfw: true } }),
      prisma.group.count({ where: { ...liveGroup, den_enabled: true } }),
      prisma.group.groupBy({ by: ['type'], where: liveGroup, _count: { _all: true } }),
      prisma.groupMember.count({ where: { group: liveGroup } }),
      prisma.groupMember.count({ where: { group: liveGroup, joined_at: { gte: weekAgo } } }),
      prisma.groupJoinRequest.count({ where: { group: liveGroup } }),
      prisma.groupPost.count({ where: { group: liveGroup, post: { deleted_at: null } } }),
      prisma.event.count({ where: { group: liveGroup } }),
      prisma.event.count({ where: { group: liveGroup, starts_at: { gte: now } } }),
      prisma.event.aggregate({ where: { group: liveGroup }, _sum: { attendee_count: true } }),
      prisma.event.count({ where: { group: liveGroup, is_top: true } }),
    ]);

    // ── События: ближайшие по возрастанию, прошедшие — свежие сверху ──
    const evFilter = opts.events === 'past' ? 'past' : opts.events === 'upcoming' ? 'upcoming' : 'all';
    const evSelect = {
      id: true, title: true, short_code: true, banner_url: true, location_name: true, starts_at: true, ends_at: true,
      status: true, is_top: true, is_recurring: true, attendee_count: true,
      group: { select: { name: true, slug: true, avatar_url: true } },
      _count: { select: { subEvents: true, tickets: true } },
    } as const;
    const evBase = { group: liveGroup };
    const [upcoming, past] = await Promise.all([
      evFilter === 'past' ? [] : prisma.event.findMany({ where: { ...evBase, starts_at: { gte: now } }, orderBy: { starts_at: 'asc' }, take: 24, select: evSelect }),
      evFilter === 'upcoming' ? [] : prisma.event.findMany({ where: { ...evBase, starts_at: { lt: now } }, orderBy: { starts_at: 'desc' }, take: evFilter === 'past' ? 24 : 12, select: evSelect }),
    ]);
    const eventList = [...upcoming, ...past];
    const attendeeRows = eventList.length
      ? await prisma.eventAttendee.groupBy({ by: ['event_id', 'status'], where: { event_id: { in: eventList.map(e => e.id) } }, _count: { _all: true } })
      : [];
    const attendeeMap = new Map<string, { going: number; maybe: number }>();
    for (const a of attendeeRows) {
      const cur = attendeeMap.get(a.event_id) ?? { going: 0, maybe: 0 };
      if (a.status === 'going') cur.going = a._count._all;
      else if (a.status === 'maybe') cur.maybe = a._count._all;
      attendeeMap.set(a.event_id, cur);
    }

    return {
      stats: {
        groups: { total: totalGroups, newWeek: newGroupsWeek, public: publicGroups, private: totalGroups - publicGroups, verified: verifiedGroups, nsfw: nsfwGroups, dealersDen: denGroups },
        byType: byType.map(t => ({ type: t.type, count: t._count._all })).sort((a, b) => b.count - a.count),
        members: { total: totalMembers, newWeek: newMembersWeek, avgPerGroup: totalGroups ? Math.round((totalMembers / totalGroups) * 10) / 10 : 0, pendingRequests },
        posts: { total: groupPosts },
        events: { total: totalEvents, upcoming: upcomingEvents, past: totalEvents - upcomingEvents, top: topEvents, attendees: attendeesAgg._sum.attendee_count ?? 0 },
      },
      groups: rows.map(g => ({
        id: g.id, slug: g.slug, name: g.name, type: g.type, category: g.category, description: g.description,
        avatarUrl: g.avatar_url, bannerUrl: g.banner_url, accentColor: g.accent_color,
        isPublic: g.is_public, isNsfw: g.is_nsfw, isVerified: g.is_verified, dealersDen: g.den_enabled, donations: g.donations_enabled, business: g.business_enabled,
        rating: Math.round(g.rating * 10) / 10, ratingCount: g.rating_count, createdAt: g.created_at,
        owner: { id: g.owner_id, username: g.owner_username, displayName: g.owner_display_name, avatarUrl: g.owner_avatar_url },
        memberCount: Number(g.members), newMembers: Number(g.new_members), subscribers: Number(g.subscribers), pendingRequests: Number(g.pending_requests),
        posts: Number(g.posts), postsWeek: Number(g.posts_week),
        eventsTotal: Number(g.events_total), eventsUpcoming: Number(g.events_upcoming), attendeesTotal: Number(g.attendees_total),
        nextEvent: g.next_event_at ? { title: g.next_event_title, startsAt: g.next_event_at } : null,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
      events: eventList.map(e => ({
        id: e.id, title: e.title, shortCode: e.short_code, bannerUrl: e.banner_url, location: e.location_name,
        startsAt: e.starts_at, endsAt: e.ends_at, status: e.status, isTop: e.is_top, isRecurring: e.is_recurring,
        attendeeCount: e.attendee_count, going: attendeeMap.get(e.id)?.going ?? 0, maybe: attendeeMap.get(e.id)?.maybe ?? 0,
        subEvents: e._count.subEvents, tickets: e._count.tickets,
        groupName: e.group.name, groupSlug: e.group.slug, groupAvatar: e.group.avatar_url,
        isUpcoming: e.starts_at.getTime() >= now.getTime(),
      })),
    };
  },

  // ── Premium/subscription overview ───────────────────────────────────────────
  async getPremiumOverview() {
    type TierRow = { subscription_tier: string; count: bigint };
    const byTier = await prisma.$queryRaw<TierRow[]>`
      SELECT subscription_tier, COUNT(*)::bigint AS count FROM "User"
      WHERE deleted_at IS NULL GROUP BY subscription_tier
    `;
    const totalUsers = await prisma.user.count({ where: { deleted_at: null } });

    const tierRank: Record<string, number> = { business: 3, pro: 2, lite: 1 };
    const topSubscribersRaw = await prisma.user.findMany({
      where: { deleted_at: null, subscription_tier: { not: 'free' } },
      orderBy: { created_at: 'desc' },
      take: 30,
      select: { id: true, username: true, display_name: true, avatar_url: true, subscription_tier: true },
    });
    const topSubscribers = topSubscribersRaw
      .sort((a, b) => (tierRank[b.subscription_tier] ?? 0) - (tierRank[a.subscription_tier] ?? 0))
      .slice(0, 8);

    // Dealers' Den turnover (GMV) — NOT platform revenue: the marketplace takes
    // no commission today, money moves buyer→seller directly. Surfaced honestly
    // as marketplace turnover, not "income". Sale time approximated by
    // `updated_at` since listings have no dedicated `sold_at` column.
    const yearAgo = new Date(Date.now() - 365 * 86_400_000);
    type GmvRow = { month: Date; total: string; count: bigint };
    const gmvByMonth = await prisma.$queryRaw<GmvRow[]>`
      SELECT DATE_TRUNC('month', updated_at) AS month, SUM(price)::text AS total, COUNT(*)::bigint AS count
      FROM "DealerListing"
      WHERE status = 'sold' AND deleted_at IS NULL AND updated_at >= ${yearAgo}
      GROUP BY 1 ORDER BY 1
    `;
    const [gmvTotalAgg, soldCount] = await Promise.all([
      prisma.dealerListing.aggregate({ where: { status: 'sold', deleted_at: null }, _sum: { price: true } }),
      prisma.dealerListing.count({ where: { status: 'sold', deleted_at: null } }),
    ]);

    return {
      total: totalUsers,
      byTier: byTier.map(r => ({ tier: r.subscription_tier, count: Number(r.count) })),
      topSubscribers,
      dealersDen: {
        currency: 'USD',
        totalGmv: Number(gmvTotalAgg._sum.price ?? 0),
        soldCount,
        gmvByMonth: gmvByMonth.map(r => ({ month: r.month, total: Number(r.total), count: Number(r.count) })),
      },
    };
  },

  // ── Statistics ─────────────────────────────────────────────────────────────

  async getStickerStats(filter?: { groupBy?: string; country?: string; ageGroup?: string; species?: string }) {
    // Top 20 sticker packs by use_count
    const topPacks = await prisma.stickerPack.findMany({
      where: { deleted_at: null, status: 'published' },
      orderBy: { use_count: 'desc' },
      take: 20,
      select: {
        id: true, name: true, cover_url: true, cover_bg_color: true, cover_sticker_idx: true, stickers: true,
        use_count: true, downloads_count: true, tags: true, is_nsfw: true,
        author: { select: { username: true, display_name: true, avatar_url: true } },
        _count: { select: { userCollections: true, stickerFavorites: true } },
      },
    });

    // Real totals across all published packs (topPacks is capped at 20)
    const totals = await prisma.stickerPack.aggregate({
      where: { deleted_at: null, status: 'published' },
      _count: { _all: true },
      _sum: { use_count: true, downloads_count: true },
    });
    const totalFavorites = await prisma.stickerFavorite.count();

    // Usage by age group — join StickerUsage with User birth_date
    type AgeRow = { age_group: string; total: bigint };
    const byAge = await prisma.$queryRaw<AgeRow[]>`
      SELECT
        CASE
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 13 AND 17 THEN '13–17'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 18 AND 24 THEN '18–24'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 25 AND 34 THEN '25–34'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 35 AND 44 THEN '35–44'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) >= 45 THEN '45+'
          ELSE 'Не указан'
        END AS age_group,
        SUM(su.use_count)::bigint AS total
      FROM "StickerUsage" su
      JOIN "User" u ON u.id = su.user_id
      WHERE u.deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    // Usage by country
    type CountryRow = { country: string; total: bigint };
    const byCountry = await prisma.$queryRaw<CountryRow[]>`
      SELECT
        COALESCE(NULLIF(u.country, ''), 'Не указана') AS country,
        SUM(su.use_count)::bigint AS total
      FROM "StickerUsage" su
      JOIN "User" u ON u.id = su.user_id
      WHERE u.deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 20
    `;

    // Usage by fursona species
    type SpeciesRow = { species: string; total: bigint };
    const bySpecies = await prisma.$queryRaw<SpeciesRow[]>`
      SELECT
        COALESCE(fs.species_name, 'Не указан') AS species,
        SUM(su.use_count)::bigint AS total
      FROM "StickerUsage" su
      JOIN "User" u ON u.id = su.user_id
      LEFT JOIN LATERAL (
        SELECT UNNEST(f.species) AS species_name
        FROM "Fursona" f
        WHERE f.user_id = u.id AND f.deleted_at IS NULL
        LIMIT 1
      ) fs ON TRUE
      WHERE u.deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 20
    `;

    // Top individual stickers by global use_count
    type StickerRow = { sticker_url: string; pack_id: string | null; pack_name: string | null; total: bigint };
    const topStickers = await prisma.$queryRaw<StickerRow[]>`
      SELECT su.sticker_url, su.pack_id, sp.name AS pack_name, SUM(su.use_count)::bigint AS total
      FROM "StickerUsage" su
      LEFT JOIN "StickerPack" sp ON sp.id = su.pack_id
      GROUP BY su.sticker_url, su.pack_id, sp.name
      ORDER BY total DESC
      LIMIT 30
    `;

    // Sticker sends per day — last 30 days
    type DayStickerRow = { day: Date; total: bigint };
    const dailyUsage = await prisma.$queryRaw<DayStickerRow[]>`
      SELECT DATE_TRUNC('day', last_used_at) AS day, SUM(use_count)::bigint AS total
      FROM "StickerUsage"
      WHERE last_used_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `;

    const uniqueStickersAgg = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT sticker_url)::bigint AS cnt FROM "StickerUsage"
    `;

    return {
      topPacks,
      totals: {
        totalPacks: totals._count._all,
        totalUses: totals._sum.use_count ?? 0,
        totalDownloads: totals._sum.downloads_count ?? 0,
        totalFavorites,
        uniqueStickers: Number(uniqueStickersAgg[0]?.cnt ?? 0),
      },
      topStickers: topStickers.map(r => ({ url: r.sticker_url, packId: r.pack_id, packName: r.pack_name, total: Number(r.total) })),
      byAge:     byAge.map(r => ({ label: r.age_group, value: Number(r.total) })),
      byCountry: byCountry.map(r => ({ label: r.country, value: Number(r.total) })),
      bySpecies: bySpecies.map(r => ({ label: r.species, value: Number(r.total) })),
      dailyUsage: dailyUsage.map(r => ({ day: r.day, value: Number(r.total) })),
    };
  },

  async getStickerPackDetail(packId: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, deleted_at: null },
      select: {
        id: true, name: true, description: true, cover_url: true, cover_bg_color: true, cover_sticker_idx: true,
        stickers: true, price: true, currency: true, tags: true, is_nsfw: true, status: true,
        use_count: true, downloads_count: true, created_at: true,
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        _count: { select: { userCollections: true, stickerFavorites: true } },
      },
    });
    if (!pack) return null;

    type StickerRow = { sticker_url: string; total: bigint };
    const topStickersInPack = await prisma.$queryRaw<StickerRow[]>`
      SELECT sticker_url, SUM(use_count)::bigint AS total
      FROM "StickerUsage"
      WHERE pack_id = ${packId}::uuid
      GROUP BY sticker_url
      ORDER BY total DESC
      LIMIT 30
    `;

    type DayRow = { day: Date; total: bigint };
    const dailyUsage = await prisma.$queryRaw<DayRow[]>`
      SELECT DATE_TRUNC('day', last_used_at) AS day, SUM(use_count)::bigint AS total
      FROM "StickerUsage"
      WHERE pack_id = ${packId}::uuid AND last_used_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `;

    type AgeRow = { age_group: string; total: bigint };
    const byAge = await prisma.$queryRaw<AgeRow[]>`
      SELECT
        CASE
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 13 AND 17 THEN '13–17'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 18 AND 24 THEN '18–24'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 25 AND 34 THEN '25–34'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) BETWEEN 35 AND 44 THEN '35–44'
          WHEN EXTRACT(YEAR FROM AGE(u.birth_date)) >= 45 THEN '45+'
          ELSE 'Не указан'
        END AS age_group,
        SUM(su.use_count)::bigint AS total
      FROM "StickerUsage" su
      JOIN "User" u ON u.id = su.user_id
      WHERE su.pack_id = ${packId}::uuid AND u.deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    type CountryRow = { country: string; total: bigint };
    const byCountry = await prisma.$queryRaw<CountryRow[]>`
      SELECT
        COALESCE(NULLIF(u.country, ''), 'Не указана') AS country,
        SUM(su.use_count)::bigint AS total
      FROM "StickerUsage" su
      JOIN "User" u ON u.id = su.user_id
      WHERE su.pack_id = ${packId}::uuid AND u.deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 10
    `;

    return {
      pack,
      collectors: pack._count.userCollections,
      favorites: pack._count.stickerFavorites,
      topStickersInPack: topStickersInPack.map(r => ({ url: r.sticker_url, total: Number(r.total) })),
      dailyUsage: dailyUsage.map(r => ({ day: r.day, value: Number(r.total) })),
      byAge: byAge.map(r => ({ label: r.age_group, value: Number(r.total) })),
      byCountry: byCountry.map(r => ({ label: r.country, value: Number(r.total) })),
    };
  },

  async getNetworkStats() {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    type LabelRow = { label: string; cnt: bigint };
    type TopUserRow = { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; cnt: bigint };
    type GroupRow = { id: string; name: string; avatar_url: string | null; member_count: bigint };

    const [
      usersBySpecies, usersByCountry, usersByAge, usersByPronoun,
      registrationsHistory, postsHistory,
      topPosters, mostFollowed, topGroups,
      totalUsers, totalGroups,
    ] = await Promise.all([
      // Users by species (Fursona.species array)
      prisma.$queryRaw<LabelRow[]>`
        SELECT UNNEST(f.species) AS label, COUNT(*)::bigint AS cnt
        FROM "Fursona" f
        JOIN "User" u ON u.id = f.user_id
        WHERE u.deleted_at IS NULL AND f.deleted_at IS NULL AND array_length(f.species, 1) > 0
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      `,
      prisma.$queryRaw<LabelRow[]>`
        SELECT COALESCE(NULLIF(country, ''), 'Не указана') AS label, COUNT(*)::bigint AS cnt
        FROM "User" WHERE deleted_at IS NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20
      `,
      prisma.$queryRaw<LabelRow[]>`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 13 AND 17 THEN '13–17'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 18 AND 24 THEN '18–24'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 25 AND 34 THEN '25–34'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 35 AND 44 THEN '35–44'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) >= 45            THEN '45+'
            ELSE 'Не указан'
          END AS label,
          COUNT(*)::bigint AS cnt
        FROM "User" WHERE deleted_at IS NULL
        GROUP BY 1 ORDER BY 2 DESC
      `,
      prisma.$queryRaw<LabelRow[]>`
        SELECT COALESCE(pronouns, 'Не указаны') AS label, COUNT(*)::bigint AS cnt
        FROM "User" WHERE deleted_at IS NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      `,
      countByPeriod('User', 'day', since30d),
      countByPeriod('Post', 'day', since30d),
      prisma.$queryRaw<TopUserRow[]>`
        SELECT p.author_id AS user_id, u.username, u.display_name, u.avatar_url, COUNT(*)::bigint AS cnt
        FROM "Post" p
        JOIN "User" u ON u.id = p.author_id
        WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
        GROUP BY p.author_id, u.username, u.display_name, u.avatar_url
        ORDER BY cnt DESC LIMIT 10
      `,
      prisma.$queryRaw<TopUserRow[]>`
        SELECT f.following_id AS user_id, u.username, u.display_name, u.avatar_url, COUNT(*)::bigint AS cnt
        FROM "Follow" f
        JOIN "User" u ON u.id = f.following_id
        WHERE u.deleted_at IS NULL
        GROUP BY f.following_id, u.username, u.display_name, u.avatar_url
        ORDER BY cnt DESC LIMIT 10
      `,
      prisma.$queryRaw<GroupRow[]>`
        SELECT g.id, g.name, g.avatar_url, COUNT(gm.user_id)::bigint AS member_count
        FROM "Group" g
        LEFT JOIN "GroupMember" gm ON gm.group_id = g.id
        WHERE g.deleted_at IS NULL
        GROUP BY g.id, g.name, g.avatar_url
        ORDER BY member_count DESC LIMIT 10
      `,
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.group.count({ where: { deleted_at: null } }),
    ]);

    const labelled = (rows: LabelRow[]) => rows.map(r => ({ label: r.label, value: Number(r.cnt) }));
    const daily = (rows: PeriodRow[]) => rows.map(r => ({ day: r.bucket, value: Number(r.count) }));
    const userCard = (r: TopUserRow) => ({ userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, count: Number(r.cnt) });

    return {
      totalUsers,
      totalGroups,
      usersBySpecies: labelled(usersBySpecies),
      usersByCountry: labelled(usersByCountry),
      usersByAge:     labelled(usersByAge),
      usersByPronoun: labelled(usersByPronoun),
      registrationsHistory: daily(registrationsHistory),
      postsHistory: daily(postsHistory),
      topPosters: topPosters.map(userCard),
      mostFollowed: mostFollowed.map(userCard),
      topGroups: topGroups.map(r => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url, memberCount: Number(r.member_count) })),
    };
  },
};
