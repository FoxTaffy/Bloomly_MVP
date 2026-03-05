import prisma from '../../config/prisma.js';
import { getGroupBadgeLevel } from '../../lib/badges.js';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  CreateEventInput,
  UpdateEventInput,
  CreateTicketTierInput,
  UpdateCommissionInput,
  GetGroupsQuery,
  MemberRole,
} from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────
const GROUP_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  owner_id: true,
  avatar_url: true,
  banner_url: true,
  accent_color: true,
  mascot_url: true,
  social_links: true,
  is_public: true,
  created_at: true,
  rules_text: true,
  faq: true,
  contact_phone: true,
  contact_email: true,
  about_text: true,
  schedule: true,
  what_to_bring: true,
  is_nsfw: true,
  rating: true,
  rating_count: true,
  subscriber_count: true,
  members_count: true,
  production_time: true,
  delivery_info: true,
  completed_works: true,
  recent_works: true,
  guarantee_text: true,
  _count: { select: { members: true, events: true, posts: true } },
  owner: { select: { id: true, username: true, display_name: true, avatar_url: true } },
};

const EVENT_SELECT = {
  id: true,
  group_id: true,
  title: true,
  short_code: true,
  description: true,
  banner_url: true,
  location_name: true,
  location_lat: true,
  location_lng: true,
  starts_at: true,
  ends_at: true,
  status: true,
  is_recurring: true,
  theme: true,
  attendee_count: true,
  is_top: true,
  created_at: true,
  schedule: true,
  what_to_bring: true,
  rules_text: true,
  faq: true,
  _count: { select: { tickets: true, soonBadges: true } },
  group: {
    select: {
      id: true, slug: true, name: true, type: true,
      avatar_url: true, banner_url: true, accent_color: true,
    },
  },
};

// ── Group CRUD ────────────────────────────────────────────────────────────────
export const groupService = {
  // ── list groups ───────────────────────────────────────────────────────────
  async list(query: GetGroupsQuery) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = { deleted_at: null };
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [groups, total] = await Promise.all([
      prisma.group.findMany({ where, select: GROUP_SELECT, orderBy: { created_at: 'desc' }, skip, take: limit }),
      prisma.group.count({ where }),
    ]);

    // Attach computed badge_level
    const enriched = groups.map((g: any) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count) }));

    return { groups: enriched, total, page, limit };
  },

  // ── get by slug or id ─────────────────────────────────────────────────────
  async getBySlugOrId(slugOrId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const raw = await prisma.group.findFirst({
      where: {
        deleted_at: null,
        ...(isUuid ? { id: slugOrId } : { slug: slugOrId }),
      },
      select: {
        ...GROUP_SELECT,
        events: { select: EVENT_SELECT, orderBy: { starts_at: 'asc' } },
        commissionInfo: true,
        achievements: { orderBy: { earned_at: 'desc' } },
      },
    });
    if (!raw) return null;
    return { ...raw, badge_level: getGroupBadgeLevel(raw.members_count) };
  },

  // ── create ────────────────────────────────────────────────────────────────
  async create(ownerId: string, input: CreateGroupInput) {
    return prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          slug: input.slug.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
          name: input.name,
          type: input.type,
          description: input.description,
          owner_id: ownerId,
          avatar_url: input.avatarUrl,
          banner_url: input.bannerUrl,
          accent_color: input.accentColor,
          mascot_url: input.mascotUrl,
          social_links: input.socialLinks ?? {},
          is_public: input.isPublic ?? true,
          members_count: 1, // owner is the first member
        },
      });

      await tx.groupMember.create({
        data: { group_id: group.id, user_id: ownerId, role: 'owner' },
      });

      return tx.group.findUnique({ where: { id: group.id }, select: GROUP_SELECT });
    });
  },

  // ── update ────────────────────────────────────────────────────────────────
  async update(groupId: string, input: UpdateGroupInput) {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.avatarUrl !== undefined) data.avatar_url = input.avatarUrl;
    if (input.bannerUrl !== undefined) data.banner_url = input.bannerUrl;
    if (input.accentColor !== undefined) data.accent_color = input.accentColor;
    if (input.mascotUrl !== undefined) data.mascot_url = input.mascotUrl;
    if (input.socialLinks !== undefined) data.social_links = input.socialLinks;
    if (input.isPublic !== undefined) data.is_public = input.isPublic;
    if (input.rulesText !== undefined) data.rules_text = input.rulesText;
    if (input.faq !== undefined) data.faq = input.faq;
    if (input.contactPhone !== undefined) data.contact_phone = input.contactPhone;
    if (input.contactEmail !== undefined) data.contact_email = input.contactEmail;
    if (input.aboutText !== undefined) data.about_text = input.aboutText;
    if (input.schedule !== undefined) data.schedule = input.schedule;
    if (input.whatToBring !== undefined) data.what_to_bring = input.whatToBring;
    if (input.isNsfw !== undefined) data.is_nsfw = input.isNsfw;
    if (input.productionTime !== undefined) data.production_time = input.productionTime;
    if (input.deliveryInfo !== undefined) data.delivery_info = input.deliveryInfo;
    if (input.completedWorks !== undefined) data.completed_works = input.completedWorks;
    if (input.recentWorks !== undefined) data.recent_works = input.recentWorks;
    if (input.guaranteeText !== undefined) data.guarantee_text = input.guaranteeText;

    return prisma.group.update({ where: { id: groupId }, data, select: GROUP_SELECT });
  },

  // ── soft delete ──────────────────────────────────────────────────────────
  async delete(groupId: string) {
    return prisma.group.update({ where: { id: groupId }, data: { deleted_at: new Date() } });
  },

  // ── membership ────────────────────────────────────────────────────────────
  async join(groupId: string, userId: string) {
    // Check if already a member
    const existing = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    const membership = await prisma.groupMember.upsert({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      update: {},
      create: { group_id: groupId, user_id: userId, role: 'member' },
    });
    // Increment members_count only if the user was NOT already a member
    if (!existing) {
      await prisma.group.update({
        where: { id: groupId },
        data: { members_count: { increment: 1 } },
      });
    }
    return membership;
  },

  async leave(groupId: string, userId: string) {
    const result = await prisma.groupMember.deleteMany({
      where: { group_id: groupId, user_id: userId, role: { not: 'owner' } },
    });
    // Decrement members_count only if a row was actually deleted
    if (result.count > 0) {
      await prisma.group.update({
        where: { id: groupId },
        data: { members_count: { decrement: result.count } },
      });
    }
    return result;
  },

  async getMembers(groupId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    return prisma.groupMember.findMany({
      where: { group_id: groupId },
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { joined_at: 'asc' },
      skip,
      take: limit,
    });
  },

  async setMemberRole(groupId: string, userId: string, role: MemberRole) {
    return prisma.groupMember.update({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { role },
    });
  },

  async getMembership(groupId: string, userId: string) {
    return prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
  },

  // ── events ────────────────────────────────────────────────────────────────
  async createEvent(input: CreateEventInput) {
    return prisma.event.create({
      data: {
        group_id: input.groupId,
        title: input.title,
        short_code: input.shortCode.toUpperCase(),
        description: input.description,
        banner_url: input.bannerUrl,
        location_name: input.locationName,
        location_lat: input.locationLat,
        location_lng: input.locationLng,
        starts_at: new Date(input.startsAt),
        ends_at: new Date(input.endsAt),
        is_recurring: input.isRecurring ?? false,
        theme: input.theme ?? {},
        is_top: input.isTop ?? false,
      },
      select: EVENT_SELECT,
    });
  },

  async updateEvent(eventId: string, input: UpdateEventInput) {
    const data: any = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.bannerUrl !== undefined) data.banner_url = input.bannerUrl;
    if (input.locationName !== undefined) data.location_name = input.locationName;
    if (input.locationLat !== undefined) data.location_lat = input.locationLat;
    if (input.locationLng !== undefined) data.location_lng = input.locationLng;
    if (input.startsAt !== undefined) data.starts_at = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.ends_at = new Date(input.endsAt);
    if (input.status !== undefined) data.status = input.status;
    if (input.theme !== undefined) data.theme = input.theme;
    if (input.isTop !== undefined) data.is_top = input.isTop;

    return prisma.event.update({ where: { id: eventId }, data, select: EVENT_SELECT });
  },

  async getEvent(eventId: string) {
    return prisma.event.findUnique({
      where: { id: eventId },
      select: {
        ...EVENT_SELECT,
        tickets: { orderBy: { price: 'asc' } },
        soonBadges: {
          select: {
            id: true,
            user_id: true,
            show_badge: true,
            user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          },
          take: 50,
        },
        group: { select: { id: true, slug: true, name: true, type: true, avatar_url: true, accent_color: true } },
      },
    });
  },

  async listEvents(query: { groupId?: string; status?: string; upcoming?: boolean; page?: string; limit?: string; sort?: string; location?: string }) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.groupId) where.group_id = query.groupId;
    if (query.status) where.status = query.status;
    if (query.upcoming) where.starts_at = { gt: new Date() };
    if (query.location) {
      where.location_name = { contains: query.location, mode: 'insensitive' };
    }

    // Sort: 'popular' = by attendee_count desc then nearest date, default = starts_at asc
    const orderBy: any[] = query.sort === 'popular'
      ? [{ attendee_count: 'desc' }, { starts_at: 'asc' }]
      : [{ starts_at: 'asc' }];

    const [events, total] = await Promise.all([
      prisma.event.findMany({ where, select: EVENT_SELECT, orderBy, skip, take: limit }),
      prisma.event.count({ where }),
    ]);

    return { events, total, page, limit };
  },

  // ── Ticket tiers ──────────────────────────────────────────────────────────
  async createTicketTier(input: CreateTicketTierInput) {
    return prisma.ticketTier.create({
      data: {
        event_id: input.eventId,
        name: input.name,
        price: input.price,
        currency: input.currency ?? 'USD',
        total_count: input.totalCount,
        sale_starts_at: input.saleStartsAt ? new Date(input.saleStartsAt) : null,
        sale_ends_at: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
      },
    });
  },

  // ── SOON Badge ────────────────────────────────────────────────────────────
  async toggleSoonBadge(userId: string, eventId: string) {
    const existing = await prisma.soonBadge.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    });

    if (existing) {
      await prisma.soonBadge.delete({ where: { id: existing.id } });
      await prisma.event.update({ where: { id: eventId }, data: { attendee_count: { decrement: 1 } } });
      return { added: false };
    }

    await prisma.soonBadge.create({ data: { user_id: userId, event_id: eventId } });
    await prisma.event.update({ where: { id: eventId }, data: { attendee_count: { increment: 1 } } });
    return { added: true };
  },

  async toggleSoonBadgeVisibility(userId: string, eventId: string) {
    const badge = await prisma.soonBadge.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    });
    if (!badge) throw new Error('You do not have a Soon badge for this event');
    return prisma.soonBadge.update({
      where: { id: badge.id },
      data: { show_badge: !badge.show_badge },
    });
  },

  async getUserSoonBadges(userId: string) {
    return prisma.soonBadge.findMany({
      where: { user_id: userId, show_badge: true },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            short_code: true,
            starts_at: true,
            ends_at: true,
            status: true,
            banner_url: true,
            group: { select: { id: true, slug: true, name: true, avatar_url: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  // ── Commission Info (Creative groups) ──────────────────────────────────────
  async upsertCommission(groupId: string, input: UpdateCommissionInput) {
    const data: any = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.basePrices !== undefined) data.base_prices = input.basePrices;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.tosText !== undefined) data.tos_text = input.tosText;
    if (input.maxQueue !== undefined) data.max_queue = input.maxQueue;
    if (input.rushSlots !== undefined) data.rush_slots = input.rushSlots;
    if (input.rushMax !== undefined) data.rush_max = input.rushMax;
    if (input.turnaroundDays !== undefined) data.turnaround_days = input.turnaroundDays;
    if (input.priceList !== undefined) data.price_list = input.priceList;

    return prisma.commissionInfo.upsert({
      where: { group_id: groupId },
      update: data,
      create: { group_id: groupId, ...data },
    });
  },

  // ── Group user check ──────────────────────────────────────────────────────
  async isOwnerOrAdmin(groupId: string, userId: string): Promise<boolean> {
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return member ? ['owner', 'admin'].includes(member.role) : false;
  },

  // ── Group posts ──────────────────────────────────────────────────────────
  async getGroupPosts(groupId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return prisma.groupPost.findMany({
      where: { group_id: groupId },
      include: {
        post: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            tags: { include: { tag: true } },
            _count: { select: { votes: true, repaws: true, comments: true } },
          },
        },
      },
      orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
      skip,
      take: limit,
    });
  },

  // ── My groups ─────────────────────────────────────────────────────────────
  async getUserGroups(userId: string) {
    return prisma.groupMember.findMany({
      where: { user_id: userId },
      include: {
        group: {
          select: GROUP_SELECT,
        },
      },
      orderBy: { joined_at: 'desc' },
    });
  },

  // ── Group Rating ──────────────────────────────────────────────────────────
  async rateGroup(groupId: string, userId: string, value: number) {
    if (value < 1 || value > 5) throw new Error('Rating must be between 1 and 5');

    await prisma.groupRating.upsert({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      update: { value, updated_at: new Date() },
      create: { group_id: groupId, user_id: userId, value },
    });

    // Recalculate average
    const agg = await prisma.groupRating.aggregate({
      where: { group_id: groupId },
      _avg: { value: true },
      _count: { value: true },
    });

    const avg = agg._avg.value ?? 0;
    const count = agg._count.value ?? 0;

    await prisma.group.update({
      where: { id: groupId },
      data: { rating: Math.round(avg * 10) / 10, rating_count: count },
    });

    return { rating: Math.round(avg * 10) / 10, ratingCount: count, myRating: value };
  },

  async getMyRating(groupId: string, userId: string) {
    const r = await prisma.groupRating.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return r?.value ?? 0;
  },

  // ── Create post in group ──────────────────────────────────────────────────
  async createGroupPost(groupId: string, userId: string, input: { content: string; isNsfw?: boolean; mediaUrls?: string[]; tags?: string[] }) {
    // Check user is admin/owner
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new Error('Only admins and owners can post in the group');
    }

    const content = (input.content ?? '').trim();
    if (!content) throw new Error('Content is required');

    const mediaUrls = (input.mediaUrls ?? []).filter(Boolean);
    const tags = Array.from(
      new Set(
        (input.tags ?? [])
          .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean),
      ),
    );

    return prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          content,
          author_id: userId,
          is_nsfw: input.isNsfw ?? false,
          media_urls: mediaUrls,
        },
      });

      if (tags.length > 0) {
        const tagRecords = await Promise.all(
          tags.map((tagName) =>
            tx.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            })
          ),
        );
        await Promise.all(
          tagRecords.map((tag) =>
            tx.postTag.create({ data: { post_id: post.id, tag_id: tag.id } })
          ),
        );
      }

      await tx.groupPost.create({
        data: { group_id: groupId, post_id: post.id },
      });

      return tx.post.findUnique({
        where: { id: post.id },
        include: {
          author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          tags: { include: { tag: true } },
          _count: { select: { votes: true, repaws: true, comments: true } },
        },
      });
    });
  },
};
