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
      frozenUsers, pendingVerification, autoModFlags24h,
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
      moderation: { pendingReports, pendingAds, frozenUsers, pendingVerification, autoModFlags24h },
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

  async restoreUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { deleted_at: null },
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
          role: true, badge_type: true, avatar_url: true,
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
    const where: any = { deleted_at: null };
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

  // ── Statistics ─────────────────────────────────────────────────────────────

  async getStickerStats(filter?: { groupBy?: string; country?: string; ageGroup?: string; species?: string }) {
    // Top 20 sticker packs by use_count
    const topPacks = await prisma.stickerPack.findMany({
      where: { deleted_at: null, status: 'published' },
      orderBy: { use_count: 'desc' },
      take: 20,
      select: {
        id: true, name: true, cover_url: true, cover_bg_color: true,
        use_count: true, downloads_count: true, tags: true, is_nsfw: true,
        author: { select: { username: true, display_name: true, avatar_url: true } },
        _count: { select: { userCollections: true } },
      },
    });

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
        COALESCE(u.country, 'Не указана') AS country,
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
    type StickerRow = { sticker_url: string; pack_id: string | null; total: bigint };
    const topStickers = await prisma.$queryRaw<StickerRow[]>`
      SELECT sticker_url, pack_id, SUM(use_count)::bigint AS total
      FROM "StickerUsage"
      GROUP BY sticker_url, pack_id
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

    return {
      topPacks,
      topStickers: topStickers.map(r => ({ url: r.sticker_url, packId: r.pack_id, total: Number(r.total) })),
      byAge:     byAge.map(r => ({ label: r.age_group, value: Number(r.total) })),
      byCountry: byCountry.map(r => ({ label: r.country, value: Number(r.total) })),
      bySpecies: bySpecies.map(r => ({ label: r.species, value: Number(r.total) })),
      dailyUsage: dailyUsage.map(r => ({ day: r.day, value: Number(r.total) })),
    };
  },

  async getNetworkStats() {
    // Users by species (Fursona.species array)
    type SpeciesRow = { species: string; cnt: bigint };
    const usersBySpecies = await prisma.$queryRaw<SpeciesRow[]>`
      SELECT UNNEST(f.species) AS species, COUNT(*)::bigint AS cnt
      FROM "Fursona" f
      JOIN "User" u ON u.id = f.user_id
      WHERE u.deleted_at IS NULL AND f.deleted_at IS NULL AND array_length(f.species, 1) > 0
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 20
    `;

    // Users by country
    type CountryRow = { country: string; cnt: bigint };
    const usersByCountry = await prisma.$queryRaw<CountryRow[]>`
      SELECT COALESCE(country, 'Не указана') AS country, COUNT(*)::bigint AS cnt
      FROM "User"
      WHERE deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 20
    `;

    // Users by age group
    type AgeRow = { age_group: string; cnt: bigint };
    const usersByAge = await prisma.$queryRaw<AgeRow[]>`
      SELECT
        CASE
          WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 13 AND 17 THEN '13–17'
          WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 18 AND 24 THEN '18–24'
          WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 25 AND 34 THEN '25–34'
          WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 35 AND 44 THEN '35–44'
          WHEN EXTRACT(YEAR FROM AGE(birth_date)) >= 45            THEN '45+'
          ELSE 'Не указан'
        END AS age_group,
        COUNT(*)::bigint AS cnt
      FROM "User"
      WHERE deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    // Users by pronouns
    type PronounRow = { pronouns: string; cnt: bigint };
    const usersByPronoun = await prisma.$queryRaw<PronounRow[]>`
      SELECT COALESCE(pronouns, 'Не указаны') AS pronouns, COUNT(*)::bigint AS cnt
      FROM "User"
      WHERE deleted_at IS NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 10
    `;

    // New user registrations per day — last 30 days
    type DayRow = { day: Date; cnt: bigint };
    const registrationsHistory = await prisma.$queryRaw<DayRow[]>`
      SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::bigint AS cnt
      FROM "User"
      WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `;

    // Posts per day — last 30 days
    const postsHistory = await prisma.$queryRaw<DayRow[]>`
      SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*)::bigint AS cnt
      FROM "Post"
      WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `;

    // Top posting users
    type TopUserRow = { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; cnt: bigint };
    const topPosters = await prisma.$queryRaw<TopUserRow[]>`
      SELECT p.author_id AS user_id, u.username, u.display_name, u.avatar_url, COUNT(*)::bigint AS cnt
      FROM "Post" p
      JOIN "User" u ON u.id = p.author_id
      WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
      GROUP BY p.author_id, u.username, u.display_name, u.avatar_url
      ORDER BY cnt DESC
      LIMIT 10
    `;

    // Most followed users
    type FollowRow = { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null; cnt: bigint };
    const mostFollowed = await prisma.$queryRaw<FollowRow[]>`
      SELECT f.following_id AS user_id, u.username, u.display_name, u.avatar_url, COUNT(*)::bigint AS cnt
      FROM "Follow" f
      JOIN "User" u ON u.id = f.following_id
      WHERE u.deleted_at IS NULL
      GROUP BY f.following_id, u.username, u.display_name, u.avatar_url
      ORDER BY cnt DESC
      LIMIT 10
    `;

    // Groups by member count
    type GroupRow = { id: string; name: string; avatar_url: string | null; member_count: bigint };
    const topGroups = await prisma.$queryRaw<GroupRow[]>`
      SELECT g.id, g.name, g.avatar_url, COUNT(gm.user_id)::bigint AS member_count
      FROM "Group" g
      LEFT JOIN "GroupMember" gm ON gm.group_id = g.id
      WHERE g.deleted_at IS NULL
      GROUP BY g.id, g.name, g.avatar_url
      ORDER BY member_count DESC
      LIMIT 10
    `;

    // Sticker pack count + total usage
    const [packCount, totalStickerUses] = await Promise.all([
      prisma.stickerPack.count({ where: { deleted_at: null, status: 'published' } }),
      prisma.stickerUsage.aggregate({ _sum: { use_count: true } }),
    ]);

    return {
      usersBySpecies: usersBySpecies.map(r => ({ label: r.species, value: Number(r.cnt) })),
      usersByCountry: usersByCountry.map(r => ({ label: r.country, value: Number(r.cnt) })),
      usersByAge:     usersByAge.map(r => ({ label: r.age_group, value: Number(r.cnt) })),
      usersByPronoun: usersByPronoun.map(r => ({ label: r.pronouns, value: Number(r.cnt) })),
      registrationsHistory: registrationsHistory.map(r => ({ day: r.day, value: Number(r.cnt) })),
      postsHistory: postsHistory.map(r => ({ day: r.day, value: Number(r.cnt) })),
      topPosters: topPosters.map(r => ({ userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, count: Number(r.cnt) })),
      mostFollowed: mostFollowed.map(r => ({ userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, count: Number(r.cnt) })),
      topGroups: topGroups.map(r => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url, memberCount: Number(r.member_count) })),
      stickers: { packCount, totalUses: totalStickerUses._sum.use_count ?? 0 },
    };
  },
};
