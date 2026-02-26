import prisma from '../../config/prisma.js';

export const adminService = {
  // ── Overview stats ────────────────────────────────────────────────────────
  async getStats() {
    const now = new Date();
    const dayAgo   = new Date(now.getTime() - 86_400_000);
    const weekAgo  = new Date(now.getTime() - 7 * 86_400_000);
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [
      totalUsers, newUsersDay, newUsersWeek, newUsersMonth,
      totalPosts, newPostsDay, newPostsWeek,
      totalComments, totalRepaws, totalFollows,
      pendingReports, pendingAds,
      activeAds,
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
      prisma.report.count({ where: { status: 'pending' } }),
      prisma.advertisement.count({ where: { status: 'pending' } }),
      prisma.advertisement.count({ where: { status: 'active' } }),
    ]);

    // Posts per day for last 14 days
    type DayRow = { day: Date; count: bigint };
    const postsHistory = await prisma.$queryRaw<DayRow[]>`
      SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::bigint AS count
      FROM "Post"
      WHERE deleted_at IS NULL AND created_at >= ${new Date(now.getTime() - 14 * 86_400_000)}
      GROUP BY 1 ORDER BY 1
    `;

    // Count users by role
    type RoleRow = { role: string; count: bigint };
    const roleBreakdown = await prisma.$queryRaw<RoleRow[]>`
      SELECT role, COUNT(*)::bigint AS count FROM "User" WHERE deleted_at IS NULL GROUP BY role
    `;

    return {
      users:   { total: totalUsers, today: newUsersDay, week: newUsersWeek, month: newUsersMonth },
      posts:   { total: totalPosts, today: newPostsDay, week: newPostsWeek },
      comments: totalComments,
      repaws:   totalRepaws,
      follows:  totalFollows,
      moderation: { pendingReports, pendingAds },
      ads: { active: activeAds },
      postsHistory: postsHistory.map((r) => ({ day: r.day, count: Number(r.count) })),
      roleBreakdown: roleBreakdown.map((r) => ({ role: r.role, count: Number(r.count) })),
    };
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  async getUsers(page = 1, limit = 30, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: null };
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
          created_at: true, deleted_at: true,
          _count: { select: { posts: true, followers: true, following: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    return { users, total, page, pages: Math.ceil(total / limit) };
  },

  async updateUserRole(userId: string, role: string, badgeType: string | null) {
    return prisma.user.update({
      where: { id: userId },
      data:  { role, badge_type: badgeType },
      select: { id: true, username: true, role: true, badge_type: true },
    });
  },

  async deleteUser(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { deleted_at: new Date() } });
  },

  // ── Posts moderation ───────────────────────────────────────────────────────
  async getPosts(page = 1, limit = 30, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: null };
    if (search) where.content = { contains: search, mode: 'insensitive' };
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where, skip, take: limit, orderBy: { created_at: 'desc' },
        include: {
          author: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true } },
          _count: { select: { votes: true, comments: true, repaws: true } },
        },
      }),
      prisma.post.count({ where }),
    ]);
    return { posts, total, page, pages: Math.ceil(total / limit) };
  },

  async deletePost(postId: string) {
    return prisma.post.update({ where: { id: postId }, data: { deleted_at: new Date() } });
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  async getReports(status?: string, page = 1, limit = 30) {
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where, skip, take: limit, orderBy: { created_at: 'desc' },
        include: {
          reporter: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          resolver: { select: { id: true, username: true } },
        },
      }),
      prisma.report.count({ where }),
    ]);
    return { reports, total, page, pages: Math.ceil(total / limit) };
  },

  async createReport(input: { reporterId: string; targetType: string; targetId: string; reason: string }) {
    return prisma.report.create({ data: {
      reporter_id: input.reporterId, target_type: input.targetType,
      target_id: input.targetId, reason: input.reason,
    }});
  },

  async resolveReport(reportId: string, resolverId: string, status: 'reviewed' | 'dismissed', note?: string) {
    return prisma.report.update({
      where: { id: reportId },
      data:  { status, resolved_by: resolverId, note, updated_at: new Date() },
    });
  },

  // ── Advertisements ─────────────────────────────────────────────────────────
  async getAds(status?: string) {
    return prisma.advertisement.findMany({
      where:   status ? { status } : {},
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
        status: 'active',
        OR: [{ starts_at: null }, { starts_at: { lte: now } }],
        AND: [{ OR: [{ ends_at: null }, { ends_at: { gte: now } }] }],
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async submitAd(input: {
    requesterId?: string; title: string; description?: string;
    imageUrl?: string; linkUrl: string; contactInfo?: string;
  }) {
    return prisma.advertisement.create({ data: {
      requester_id: input.requesterId, title: input.title,
      description:  input.description, image_url: input.imageUrl,
      link_url: input.linkUrl, contact_info: input.contactInfo,
    }});
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

  async trackAdImpression(adId: string) {
    return prisma.advertisement.update({ where: { id: adId }, data: { impressions: { increment: 1 } } });
  },

  async trackAdClick(adId: string) {
    return prisma.advertisement.update({ where: { id: adId }, data: { clicks: { increment: 1 } } });
  },
};
