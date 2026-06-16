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
  SubEventInput,
  UpdateSubEventInput,
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
  members_count: true,
  production_time: true,
  delivery_info: true,
  completed_works: true,
  guarantee_text: true,
  sponsors: true,
  is_verified: true,
  category: true,
  group_bg_url: true,
  group_frame: true,
  group_theme: true,
  hide_admins: true,
  hidden_member_ids: true,
  donations_enabled: true,
  bank_card_masked: true,
  support_tiers: true,
  _count: { select: { members: true, events: true, posts: { where: { post: { deleted_at: null } } } } },
  owner: { select: { id: true, username: true, display_name: true, avatar_url: true } },
  communityChat: { select: { id: true } },
};

// Minimal select for list / discover / my-groups (no heavy text fields)
const GROUP_LIST_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  owner_id: true,
  avatar_url: true,
  banner_url: true,
  accent_color: true,
  is_public: true,
  is_nsfw: true,
  is_verified: true,
  category: true,
  rating: true,
  rating_count: true,
  members_count: true,
  created_at: true,
  communityChat: { select: { id: true } },
  _count: { select: { members: true, events: true } },
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
  registration_url: true,
  subEvents: { orderBy: { starts_at: 'asc' as const } },
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
      prisma.group.findMany({ where, select: GROUP_LIST_SELECT, orderBy: { created_at: 'desc' }, skip, take: limit }),
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
        ...(isUuid
          ? { id: slugOrId }
          : { OR: [{ slug: slugOrId }, { slug_aliases: { has: slugOrId } }] }),
      },
      select: {
        ...GROUP_SELECT,
        events: {
          select: { ...EVENT_SELECT, tickets: { orderBy: { price: 'asc' }, select: { id: true, name: true, price: true, currency: true, total_count: true, sold_count: true, sale_starts_at: true, sale_ends_at: true, description: true, perks: true } } },
          orderBy: { starts_at: 'asc' },
        },
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
    if (input.guaranteeText !== undefined) data.guarantee_text = input.guaranteeText;
    if (input.slug !== undefined) {
      const newSlug = input.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      // Fetch current slug to save as alias
      const current = await prisma.group.findUnique({ where: { id: groupId }, select: { slug: true, slug_aliases: true } });
      if (current && current.slug !== newSlug) {
        // Append old slug to aliases (avoid duplicates and limit to 10)
        const aliases = [...new Set([...current.slug_aliases, current.slug])].slice(-10);
        data.slug_aliases = aliases;
      }
      data.slug = newSlug;
    }
    if (input.category !== undefined) data.category = input.category || null;
    if (input.isVerified !== undefined) data.is_verified = input.isVerified;
    if (input.groupBgUrl !== undefined) data.group_bg_url = input.groupBgUrl || null;
    if (input.groupFrame !== undefined) data.group_frame = input.groupFrame || null;
    if (input.groupTheme !== undefined) data.group_theme = input.groupTheme || null;
    if (input.hideAdmins !== undefined) data.hide_admins = input.hideAdmins;
    if (input.hiddenMemberIds !== undefined) data.hidden_member_ids = JSON.stringify(input.hiddenMemberIds);
    if (input.donationsEnabled !== undefined) data.donations_enabled = input.donationsEnabled;
    if (input.bankCardMasked !== undefined) data.bank_card_masked = input.bankCardMasked || null;
    if (input.supportTiers !== undefined) data.support_tiers = input.supportTiers;

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
      include: { group: { select: GROUP_LIST_SELECT } },
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
    // Allow owner to leave only if they are the LAST member (transfers to deletion)
    const totalMembers = await prisma.groupMember.count({ where: { group_id: groupId } });
    const membership = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });

    if (!membership) return { count: 0 };

    const isOwner = membership.role === 'owner';
    // Owner can only leave if they are the last member (group will be deleted)
    if (isOwner && totalMembers > 1) {
      throw new Error('Owner cannot leave while other members exist. Transfer ownership first.');
    }

    const result = await prisma.groupMember.deleteMany({
      where: { group_id: groupId, user_id: userId },
    });

    if (result.count > 0) {
      const updated = await prisma.group.update({
        where: { id: groupId },
        data: { members_count: { decrement: result.count } },
        select: { id: true, members_count: true },
      });
      // Auto-delete (soft) group if no members remain
      if (updated.members_count <= 0) {
        await prisma.group.update({ where: { id: groupId }, data: { deleted_at: new Date() } });
      }
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
    if (role === 'owner') throw new Error('Cannot assign owner role via this endpoint');
    // Cannot change the role of the current owner
    const current = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (current?.role === 'owner') throw new Error('Cannot change the role of the group owner');
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

  async removeMember(groupId: string, requesterId: string, targetUserId: string) {
    const target = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: targetUserId } },
    });
    if (!target) throw new Error('Member not found');
    if (target.role === 'owner') throw new Error('Cannot remove the group owner');
    const requester = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: requesterId } },
    });
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      throw new Error('Not authorized');
    }
    if (requester.role === 'admin' && target.role === 'admin') {
      throw new Error('Admins cannot remove other admins');
    }
    const result = await prisma.groupMember.delete({
      where: { group_id_user_id: { group_id: groupId, user_id: targetUserId } },
    });
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { members_count: { decrement: 1 } },
      select: { id: true, members_count: true },
    });
    // Auto-delete (soft) group if no members remain
    if (updated.members_count <= 0) {
      await prisma.group.update({ where: { id: groupId }, data: { deleted_at: new Date() } });
    }
    return result;
  },

  // ── Custom roles ──────────────────────────────────────────────────────────
  async getCustomRoles(groupId: string) {
    return prisma.groupCustomRole.findMany({
      where: { group_id: groupId },
      orderBy: { position: 'asc' },
    });
  },

  async createCustomRole(groupId: string, data: { name: string; color?: string; icon?: string; permissions?: string[] }) {
    const count = await prisma.groupCustomRole.count({ where: { group_id: groupId } });
    return prisma.groupCustomRole.create({
      data: {
        group_id: groupId,
        name: data.name,
        color: data.color ?? '#9ca3af',
        icon: data.icon ?? '🎖️',
        permissions: data.permissions ?? [],
        position: count,
      },
    });
  },

  async updateCustomRole(groupId: string, roleId: string, data: { name?: string; color?: string; icon?: string; permissions?: string[] }) {
    return prisma.groupCustomRole.update({
      where: { id: roleId, group_id: groupId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.permissions !== undefined && { permissions: data.permissions }),
      },
    });
  },

  async deleteCustomRole(groupId: string, roleId: string) {
    return prisma.groupCustomRole.delete({
      where: { id: roleId, group_id: groupId },
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
        registration_url: input.registrationUrl,
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
    if (input.registrationUrl !== undefined) data.registration_url = input.registrationUrl || null;
    if (input.shortCode !== undefined && input.shortCode.trim()) data.short_code = input.shortCode.trim().toUpperCase();

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

    const where: any = { group: { deleted_at: null } };
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

  async updateTicketTier(tierId: string, input: Partial<Omit<CreateTicketTierInput, 'eventId'>>) {
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.price !== undefined) data.price = input.price;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.totalCount !== undefined) data.total_count = input.totalCount;
    if (input.saleStartsAt !== undefined) data.sale_starts_at = input.saleStartsAt ? new Date(input.saleStartsAt) : null;
    if (input.saleEndsAt !== undefined) data.sale_ends_at = input.saleEndsAt ? new Date(input.saleEndsAt) : null;
    return prisma.ticketTier.update({ where: { id: tierId }, data });
  },

  async deleteTicketTier(tierId: string) {
    return prisma.ticketTier.delete({ where: { id: tierId } });
  },

  // ── SOON Badge ────────────────────────────────────────────────────────────
  async toggleSoonBadge(userId: string, eventId: string) {
    const existing = await prisma.soonBadge.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    });

    if (existing) {
      await Promise.all([
        prisma.soonBadge.delete({ where: { id: existing.id } }),
        prisma.event.update({ where: { id: eventId }, data: { attendee_count: { decrement: 1 } } }),
      ]);
      return { added: false };
    }

    await Promise.all([
      prisma.soonBadge.create({ data: { user_id: userId, event_id: eventId } }),
      prisma.event.update({ where: { id: eventId }, data: { attendee_count: { increment: 1 } } }),
    ]);
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
            location_name: true,
            attendee_count: true,
            group: { select: { id: true, slug: true, name: true, avatar_url: true, banner_url: true } },
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
  async getGroupPosts(groupId: string, page = 1, limit = 20, hasMedia = false) {
    const skip = (page - 1) * limit;
    return prisma.groupPost.findMany({
      where: {
        group_id: groupId,
        post: { deleted_at: null, ...(hasMedia ? { media_urls: { isEmpty: false } } : {}) },
      },
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

  // ── Creative Kanban ───────────────────────────────────────────────────────
  async getKanban(groupId: string) {
    const STAGES = ['скетч', 'линии', 'цвет', 'готово'] as const;

    const pivots = await prisma.groupPost.findMany({
      where: {
        group_id: groupId,
        post: { deleted_at: null, post_type: 'commission_update' },
      },
      include: {
        post: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            _count: { select: { votes: true, comments: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const columns: Record<string, any[]> = { скетч: [], линии: [], цвет: [], готово: [], unstaged: [] };
    for (const gp of pivots) {
      const stage = (gp.post.category || '').toLowerCase();
      if ((STAGES as readonly string[]).includes(stage)) columns[stage].push(gp.post);
      else columns.unstaged.push(gp.post);
    }
    return columns;
  },

  // ── My groups ─────────────────────────────────────────────────────────────
  async getUserGroups(userId: string) {
    return prisma.groupMember.findMany({
      where: { user_id: userId, group: { deleted_at: null } },
      include: {
        group: {
          select: GROUP_LIST_SELECT,
        },
      },
      orderBy: { joined_at: 'desc' },
    });
  },

  // ── Public groups of another user ─────────────────────────────────────────
  async getUserPublicGroups(userId: string) {
    const memberships = await prisma.groupMember.findMany({
      where: { user_id: userId, group: { deleted_at: null, is_public: true } },
      include: { group: { select: GROUP_LIST_SELECT } },
      orderBy: { joined_at: 'desc' },
    });
    return memberships.map((m) => ({ ...m.group, badge_level: getGroupBadgeLevel(m.group.members_count), role: m.role }));
  },

  // ── Groups shared between two users ──────────────────────────────────────
  async getCommonGroups(userId: string, currentUserId: string) {
    const [userGroupIds, myGroupIds] = await Promise.all([
      prisma.groupMember.findMany({
        where: { user_id: userId, group: { deleted_at: null, is_public: true } },
        select: { group_id: true },
      }),
      prisma.groupMember.findMany({
        where: { user_id: currentUserId, group: { deleted_at: null } },
        select: { group_id: true },
      }),
    ]);
    const theirSet = new Set(userGroupIds.map((m) => m.group_id));
    const commonIds = myGroupIds.map((m) => m.group_id).filter((id) => theirSet.has(id));
    if (!commonIds.length) return [];
    const groups = await prisma.group.findMany({
      where: { id: { in: commonIds }, deleted_at: null },
      select: GROUP_LIST_SELECT,
    });
    return groups.map((g) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count) }));
  },

  // ── Group Rating (Reddit-style: -1 / +1 toggle) ───────────────────────────
  async rateGroup(groupId: string, userId: string, value: number) {
    if (value !== 1 && value !== -1) throw new Error('value must be 1 or -1');
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { owner_id: true } });
    if (group?.owner_id === userId) throw new Error('You cannot vote on your own group');

    const existing = await prisma.groupRating.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });

    let delta = 0;
    let finalVote: number = value;

    if (existing) {
      if (existing.value === value) {
        // Toggle off — remove vote
        await prisma.groupRating.delete({ where: { group_id_user_id: { group_id: groupId, user_id: userId } } });
        delta = -value;
        finalVote = 0;
      } else {
        // Flip vote direction
        await prisma.groupRating.update({
          where: { group_id_user_id: { group_id: groupId, user_id: userId } },
          data: { value, updated_at: new Date() },
        });
        delta = value * 2; // e.g. was -1, now +1 → net +2
      }
    } else {
      await prisma.groupRating.create({ data: { group_id: groupId, user_id: userId, value } });
      delta = value;
    }

    const newCountDelta = existing ? (existing.value === value ? -1 : 0) : 1;
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: {
        rating: { increment: delta },
        rating_count: { increment: newCountDelta },
      },
      select: { rating: true, rating_count: true },
    });

    return { score: updated.rating, voteCount: updated.rating_count, myVote: finalVote };
  },

  async getMyRating(groupId: string, userId: string) {
    const r = await prisma.groupRating.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return r?.value ?? 0;
  },

  // ── Create post in group ──────────────────────────────────────────────────
  async createGroupPost(groupId: string, userId: string, input: { content: string; title?: string; postType?: string; isNsfw?: boolean; isAnnouncement?: boolean; mediaUrls?: string[]; tags?: string[]; visibility?: string; category?: string }) {
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
          is_announcement: input.isAnnouncement ?? false,
          media_urls: mediaUrls,
          title: input.title?.trim() || null,
          post_type: input.postType || 'general',
          category: input.category || null,
          subscriber_only: input.visibility === 'subscriber_only',
          is_paid: input.visibility === 'paid',
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
          groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
        },
      });
    });
  },

  // ── RSVP ──────────────────────────────────────────────────────────────────
  async rsvpEvent(eventId: string, userId: string, status: 'going' | 'maybe' | 'not_going') {
    const prev = await prisma.eventAttendee.findUnique({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
      select: { status: true },
    });
    const wasCountable = prev && (prev.status === 'going' || prev.status === 'maybe');
    const isCountable  = status === 'going' || status === 'maybe';
    const delta = (isCountable ? 1 : 0) - (wasCountable ? 1 : 0);

    const [attendee] = await Promise.all([
      prisma.eventAttendee.upsert({
        where: { event_id_user_id: { event_id: eventId, user_id: userId } },
        update: { status, confirmed_at: new Date() },
        create: { event_id: eventId, user_id: userId, status },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      }),
      delta !== 0
        ? prisma.event.update({ where: { id: eventId }, data: { attendee_count: { increment: delta } } })
        : Promise.resolve(null),
    ]);
    return attendee;
  },

  async cancelRsvp(eventId: string, userId: string) {
    const prev = await prisma.eventAttendee.findUnique({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
      select: { status: true },
    });
    const wasCountable = prev && (prev.status === 'going' || prev.status === 'maybe');
    await Promise.all([
      prisma.eventAttendee.delete({
        where: { event_id_user_id: { event_id: eventId, user_id: userId } },
      }).catch(() => null),
      wasCountable
        ? prisma.event.update({ where: { id: eventId }, data: { attendee_count: { decrement: 1 } } })
        : Promise.resolve(null),
    ]);
  },

  async getEventAttendees(eventId: string, page = 1, limit = 50) {
    const [attendees, total] = await Promise.all([
      prisma.eventAttendee.findMany({
        where: { event_id: eventId },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
        orderBy: [{ status: 'asc' }, { confirmed_at: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.eventAttendee.count({ where: { event_id: eventId } }),
    ]);
    return { attendees, total };
  },

  async getMyRsvp(eventId: string, userId: string) {
    return prisma.eventAttendee.findUnique({
      where: { event_id_user_id: { event_id: eventId, user_id: userId } },
    });
  },

  // ── Sub-events ────────────────────────────────────────────────────────────
  async listSubEvents(eventId: string) {
    return prisma.subEvent.findMany({
      where: { event_id: eventId },
      orderBy: { starts_at: 'asc' },
    });
  },

  async createSubEvent(eventId: string, input: SubEventInput) {
    return prisma.subEvent.create({
      data: {
        event_id: eventId,
        title: input.title,
        type: input.type ?? 'panel',
        speaker: input.speaker,
        location_name: input.locationName,
        starts_at: new Date(input.startsAt),
        ends_at: new Date(input.endsAt),
        description: input.description,
      },
    });
  },

  async updateSubEvent(subEventId: string, input: UpdateSubEventInput) {
    const data: any = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.type !== undefined) data.type = input.type;
    if (input.speaker !== undefined) data.speaker = input.speaker;
    if (input.locationName !== undefined) data.location_name = input.locationName;
    if (input.startsAt !== undefined) data.starts_at = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.ends_at = new Date(input.endsAt);
    if (input.description !== undefined) data.description = input.description;
    return prisma.subEvent.update({ where: { id: subEventId }, data });
  },

  async deleteSubEvent(subEventId: string) {
    return prisma.subEvent.delete({ where: { id: subEventId } });
  },

  // ── Group Messages ─────────────────────────────────────────────────────────
  async getGroupMessages(groupId: string, before?: string, limit = 50) {
    const where: any = { group_id: groupId, deleted_at: null };
    if (before) where.created_at = { lt: new Date(before) };
    const messages = await prisma.groupMessage.findMany({
      where,
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return messages.reverse();
  },

  async sendGroupMessage(groupId: string, userId: string, text: string) {
    const msg = await prisma.groupMessage.create({
      data: { group_id: groupId, user_id: userId, text },
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
    });
    return msg;
  },

  async deleteGroupMessage(messageId: string, userId: string) {
    const msg = await prisma.groupMessage.findUnique({ where: { id: messageId } });
    if (!msg) return;
    if (msg.user_id !== userId) throw new Error('Not the message author');
    await prisma.groupMessage.update({ where: { id: messageId }, data: { deleted_at: new Date() } });
  },

  // ── Search (for maker picker) ─────────────────────────────────────────────
  async searchGroups(q: string, limit = 8) {
    const query = q.trim();
    if (!query) return [];
    return prisma.group.findMany({
      where: {
        deleted_at: null,
        is_public: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, slug: true, avatar_url: true, type: true },
      orderBy: [{ is_verified: 'desc' }, { members_count: 'desc' }],
      take: limit,
    });
  },

  // ── Discover ──────────────────────────────────────────────────────────────
  async discoverGroups(userId: string | null, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: null, is_public: true };
    if (userId) {
      // Exclude groups where user is already a member
      where.members = { none: { user_id: userId } };
    }
    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        where,
        select: GROUP_LIST_SELECT,
        orderBy: [{ is_verified: 'desc' }, { members_count: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.group.count({ where }),
    ]);
    return { groups, total };
  },

  // ── Artist Queue (Todo) ───────────────────────────────────────────────────

  async getTodoItems(groupId: string) {
    return prisma.groupTodoItem.findMany({
      where: { group_id: groupId, deleted_at: null },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
  },

  async createTodoItem(groupId: string, data: { title: string; description?: string; status?: string; position?: number }) {
    // Auto-assign position = max + 1 if not provided
    if (data.position === undefined) {
      const last = await prisma.groupTodoItem.findFirst({
        where: { group_id: groupId, deleted_at: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      data.position = (last?.position ?? -1) + 1;
    }
    return prisma.groupTodoItem.create({
      data: {
        group_id: groupId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        status: (data.status as any) ?? 'WAITING',
        position: data.position,
      },
    });
  },

  async updateTodoItem(itemId: string, data: { title?: string; description?: string; status?: string; position?: number }) {
    const update: any = {};
    if (data.title !== undefined) update.title = data.title.trim();
    if (data.description !== undefined) update.description = data.description?.trim() || null;
    if (data.status !== undefined) update.status = data.status;
    if (data.position !== undefined) update.position = data.position;
    return prisma.groupTodoItem.update({ where: { id: itemId }, data: update });
  },

  async deleteTodoItem(itemId: string) {
    return prisma.groupTodoItem.update({
      where: { id: itemId },
      data: { deleted_at: new Date() },
    });
  },

  async reorderTodoItems(groupId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, idx) =>
        prisma.groupTodoItem.updateMany({
          where: { id, group_id: groupId },
          data: { position: idx },
        })
      )
    );
  },

  // ── Ticket tier helpers ──────────────────────────────────────────────────
  async getTicketTierWithGroupId(tierId: string) {
    return prisma.ticketTier.findUnique({
      where: { id: tierId },
      include: { event: { select: { group_id: true } } },
    });
  },
  // ── Ownership helper (used by sub-events + todo) ───────────────────────────
  async getGroupOwner(groupId: string) {
    return prisma.group.findUnique({
      where: { id: groupId },
      select: { owner_id: true },
    });
  },};
