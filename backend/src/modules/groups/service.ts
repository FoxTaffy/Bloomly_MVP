import prisma from '../../config/prisma.js';
import { getGroupBadgeLevel } from '../../lib/badges.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { isTrustedMediaUrl } from '../media/service.js';
import { notificationService } from '../notifications/service.js';
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
  CreateOrderInput,
  OrderStatus,
} from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────
// Group role hierarchy: owner > admin > moderator > everyone else (member/dealer/volunteer/guest_of_honor).
const ROLE_WEIGHT: Record<string, number> = { owner: 3, admin: 2, moderator: 1 };
function roleWeight(role?: string | null): number {
  return role ? (ROLE_WEIGHT[role] ?? 0) : 0;
}

// Default Todolist kanban columns — used whenever a group hasn't customized its own.
export const DEFAULT_TODO_COLUMNS = [
  { key: 'WAITING', label: 'В ожидании', icon: 'Clock', color: '#94a3b8' },
  { key: 'SKETCH', label: 'Скетч', icon: 'Pencil', color: '#f59e0b' },
  { key: 'LINEART', label: 'Линии', icon: 'PenTool', color: '#3b82f6' },
  { key: 'COLORING', label: 'Цвет', icon: 'Palette', color: '#8b5cf6' },
  { key: 'FINISHED', label: 'Готово', icon: 'CheckCircle2', color: '#10b981' },
];
export interface TodoColumn { key: string; label: string; icon: string; color: string }

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
  category_changed_at: true,
  group_bg_url: true,
  group_frame: true,
  group_theme: true,
  hide_admins: true,
  hidden_member_ids: true,
  donations_enabled: true,
  bank_card_masked: true,
  support_tiers: true,
  business_enabled: true,
  _count: { select: { members: true, events: true, posts: { where: { post: { deleted_at: null } } } } },
  owner: { select: { id: true, username: true, display_name: true, avatar_url: true } },
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
  business_enabled: true,
  _count: { select: { members: true, events: true } },
  owner: { select: { id: true, username: true, display_name: true, avatar_url: true } },
};

const ORDER_CUSTOMER_SELECT = {
  id: true,
  username: true,
  display_name: true,
  avatar_url: true,
} as const;

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
    if (input.category !== undefined) {
      const newCategory = input.category || null;
      const current = await prisma.group.findUnique({
        where: { id: groupId },
        select: { category: true, category_changed_at: true },
      });
      if (current && current.category !== newCategory) {
        const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
        if (current.category_changed_at && Date.now() - current.category_changed_at.getTime() < COOLDOWN_MS) {
          throw new Error('CATEGORY_CHANGE_COOLDOWN');
        }
        data.category_changed_at = new Date();
      }
      data.category = newCategory;
    }
    if (input.isVerified !== undefined) data.is_verified = input.isVerified;
    if (input.groupBgUrl !== undefined) data.group_bg_url = input.groupBgUrl || null;
    if (input.groupFrame !== undefined) data.group_frame = input.groupFrame || null;
    if (input.groupTheme !== undefined) data.group_theme = input.groupTheme || null;
    if (input.hideAdmins !== undefined) data.hide_admins = input.hideAdmins;
    if (input.hiddenMemberIds !== undefined) data.hidden_member_ids = JSON.stringify(input.hiddenMemberIds);
    if (input.donationsEnabled !== undefined) data.donations_enabled = input.donationsEnabled;
    if (input.bankCardMasked !== undefined) data.bank_card_masked = input.bankCardMasked || null;
    if (input.supportTiers !== undefined) data.support_tiers = input.supportTiers;
    if (input.businessEnabled !== undefined) data.business_enabled = input.businessEnabled;

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

  async setMemberRole(groupId: string, requesterId: string, userId: string, role: MemberRole) {
    if (role === 'owner') throw new Error('Cannot assign owner role via this endpoint');
    // Cannot change the role of the current owner
    const current = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (current?.role === 'owner') throw new Error('Cannot change the role of the group owner');

    const requester = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: requesterId } },
    });
    const requesterWeight = roleWeight(requester?.role);
    if (requesterWeight < 2) throw new Error('Not authorized'); // must be admin or owner
    // Admins (not owner) may only grant roles below admin — they cannot create peer admins.
    if (requesterWeight < 3 && role === 'admin') {
      throw new Error('Only the group owner can assign the admin role');
    }

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
    const requesterWeight = roleWeight(requester?.role);
    const targetWeight = roleWeight(target.role);
    if (requesterWeight < 1) throw new Error('Not authorized'); // must be at least moderator
    // Can only remove members with a strictly lower role weight (moderators can kick plain
    // members, admins can kick moderators/members but not other admins, etc).
    if (targetWeight >= requesterWeight) {
      throw new Error('Not authorized to remove a member with an equal or higher role');
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

  async isOwner(groupId: string, userId: string): Promise<boolean> {
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return member?.role === 'owner';
  },

  // Weight of the requester's role in this group: owner=3, admin=2, moderator=1, else 0.
  async getRoleWeight(groupId: string, userId: string): Promise<number> {
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return roleWeight(member?.role);
  },

  // owner/admin/moderator can moderate content (delete others' posts/comments) in this group.
  async isAtLeastModerator(groupId: string, userId: string): Promise<boolean> {
    return (await groupService.getRoleWeight(groupId, userId)) >= 1;
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
      select: {
        group_id: true, role: true, joined_at: true, is_pinned: true, notify_posts: true,
        group: { select: GROUP_LIST_SELECT },
      },
      orderBy: [{ is_pinned: 'desc' }, { joined_at: 'desc' }],
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

  // ── Groups visible to viewer (privacy-gated) ──────────────────────────────
  async getUserGroupsForViewer(userId: string, requesterId: string | null) {
    const isOwn = requesterId === userId;

    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { groups_visibility: true, groups_pinned_only: true },
    });
    if (!owner) return { groups: [], count: 0, pinned_only: false, hidden: false };

    if (!isOwn) {
      const visible = await isAllowedByPrivacy(owner.groups_visibility, userId, requesterId ?? undefined);
      if (!visible) return { groups: [], count: 0, pinned_only: false, hidden: true };
    }

    const pinnedOnly = !isOwn && owner.groups_pinned_only;

    const memberships = await prisma.groupMember.findMany({
      where: {
        user_id: userId,
        group: { deleted_at: null },
        ...(pinnedOnly ? { is_pinned: true } : {}),
      },
      include: { group: { select: GROUP_LIST_SELECT } },
      orderBy: [{ is_pinned: 'desc' }, { joined_at: 'desc' }],
    });

    const groups = memberships.map((m) => ({
      ...m.group,
      badge_level: getGroupBadgeLevel(m.group.members_count),
      role: m.role,
      is_pinned: m.is_pinned,
    }));

    return { groups, count: groups.length, pinned_only: pinnedOnly, hidden: false };
  },

  // ── Toggle pin for own membership ─────────────────────────────────────────
  async togglePinGroup(userId: string, groupId: string) {
    const membership = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (!membership) throw new Error('Not a member');
    return prisma.groupMember.update({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { is_pinned: !membership.is_pinned },
      select: { is_pinned: true },
    });
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
  async createGroupPost(groupId: string, userId: string, input: { content: string; title?: string; postType?: string; isNsfw?: boolean; isAiGenerated?: boolean; isAnnouncement?: boolean; mediaUrls?: string[]; mediaOriginalUrls?: string[]; tags?: string[]; visibility?: string; category?: string }) {
    // Check user is admin/owner
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (roleWeight(member?.role) < 1) {
      throw new Error('Only owners, admins and moderators can post in the group');
    }

    const content = (input.content ?? '').trim();
    const mediaUrls = (input.mediaUrls ?? []).filter(Boolean);
    if (!content && mediaUrls.length === 0) throw new Error('Content is required');
    if (mediaUrls.some((url) => !isTrustedMediaUrl(url))) {
      throw Object.assign(new Error('INVALID_MEDIA_URL'), { statusCode: 422 });
    }
    const mediaOriginalUrls = input.mediaOriginalUrls?.length === mediaUrls.length
      ? input.mediaOriginalUrls
      : [];
    if (mediaOriginalUrls.some((url) => !isTrustedMediaUrl(url))) {
      throw Object.assign(new Error('INVALID_MEDIA_URL'), { statusCode: 422 });
    }

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
          is_ai_generated: input.isAiGenerated ?? false,
          is_announcement: input.isAnnouncement ?? false,
          media_urls: mediaUrls,
          media_original_urls: mediaOriginalUrls,
          title: input.title?.trim() || null,
          post_type: input.postType || 'general',
          category: input.category || null,
          subscriber_only: input.visibility === 'subscriber_only',
          is_paid: false, // Paid posts are temporarily disabled
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
    }).then(async (created) => {
      // Notify group members who opted into post notifications for this group.
      const subscribers = await prisma.groupMember.findMany({
        where: { group_id: groupId, notify_posts: true, user_id: { not: userId } },
        select: { user_id: true },
      });
      await Promise.all(
        subscribers.map((s) =>
          notificationService.create({
            receiverId: s.user_id,
            senderId:   userId,
            type:       'GROUP_POST',
            postId:     created!.id,
            refId:      groupId,
          }).catch(() => {})
        ),
      );
      return created;
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

  // ── Search (for maker picker + global search) ──────────────────────────────
  async searchGroups(q: string, limit = 8, page = 1) {
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
      select: { id: true, name: true, slug: true, avatar_url: true, type: true, members_count: true, is_verified: true },
      orderBy: [{ is_verified: 'desc' }, { members_count: 'desc' }],
      skip: (Math.max(1, page) - 1) * limit,
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

  async getTodoColumns(groupId: string): Promise<TodoColumn[]> {
    const g = await prisma.group.findUnique({ where: { id: groupId }, select: { todo_columns: true } });
    const cols = Array.isArray(g?.todo_columns) ? (g!.todo_columns as unknown as TodoColumn[]) : [];
    return cols.length ? cols : DEFAULT_TODO_COLUMNS;
  },

  async updateTodoColumns(groupId: string, columns: Array<{ key?: string; label?: string; icon?: string; color?: string }>): Promise<TodoColumn[]> {
    const seen = new Set<string>();
    const clean: TodoColumn[] = columns.slice(0, 8).map((c, i) => {
      let key = String(c.key || c.label || `col${i}`).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24) || `COL${i}`;
      while (seen.has(key)) key = `${key}_${i}`;
      seen.add(key);
      return {
        key,
        label: String(c.label ?? key).trim().slice(0, 40) || key,
        color: /^#[0-9a-f]{6}$/i.test(c.color ?? '') ? (c.color as string) : '#94a3b8',
        icon: String(c.icon || 'Circle').trim().slice(0, 40),
      };
    }).filter(c => c.label);
    if (!clean.length) throw new Error('At least one column is required');

    const validKeys = clean.map(c => c.key);
    const fallbackKey = clean[0].key;

    await prisma.$transaction([
      prisma.group.update({ where: { id: groupId }, data: { todo_columns: clean as any } }),
      prisma.groupTodoItem.updateMany({
        where: { group_id: groupId, deleted_at: null, status: { notIn: validKeys } },
        data: { status: fallbackKey },
      }),
    ]);
    return clean;
  },

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
    let status = data.status;
    if (!status) {
      const cols = await groupService.getTodoColumns(groupId);
      status = cols[0]?.key ?? 'WAITING';
    }
    return prisma.groupTodoItem.create({
      data: {
        group_id: groupId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        status,
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

  // ── Orders (Business tab) ──────────────────────────────────────────────────
  async getOrders(groupId: string, requesterId: string) {
    const isAdmin = await groupService.isOwnerOrAdmin(groupId, requesterId);
    return prisma.order.findMany({
      where: {
        group_id: groupId,
        deleted_at: null,
        ...(isAdmin ? {} : { customer_id: requesterId }),
      },
      include: { customer: { select: ORDER_CUSTOMER_SELECT } },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
  },

  async createOrder(groupId: string, customerId: string, input: CreateOrderInput) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { deleted_at: true, business_enabled: true, owner_id: true },
    });
    if (!group || group.deleted_at) throw Object.assign(new Error('Group not found'), { statusCode: 404 });
    if (!group.business_enabled) throw Object.assign(new Error('Business mode is not enabled for this group'), { statusCode: 400 });
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: customerId } },
    });
    if (!member) throw Object.assign(new Error('Not a group member'), { statusCode: 403 });
    if (!input.title?.trim()) throw Object.assign(new Error('Title is required'), { statusCode: 400 });

    return prisma.$transaction(async (tx) => {
      const last = await tx.order.findFirst({
        where: { group_id: groupId, deleted_at: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const conversation = await tx.conversation.create({
        data: {
          type: 'direct',
          participants: {
            create: [
              { user_id: customerId, label: 'customer' },
              { user_id: group.owner_id },
            ],
          },
        },
      });
      return tx.order.create({
        data: {
          group_id: groupId,
          customer_id: customerId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          form_data: (input.formData ?? undefined) as any,
          deadline_at: input.deadlineAt ? new Date(input.deadlineAt) : null,
          position: (last?.position ?? -1) + 1,
          conversation_id: conversation.id,
        },
        include: { customer: { select: ORDER_CUSTOMER_SELECT } },
      });
    });
  },

  async updateOrderStatus(orderId: string, requesterId: string, status: OrderStatus) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!(await groupService.isOwnerOrAdmin(order.group_id, requesterId))) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }
    return prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { customer: { select: ORDER_CUSTOMER_SELECT } },
    });
  },

  async deleteOrder(orderId: string, requesterId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!(await groupService.isOwnerOrAdmin(order.group_id, requesterId))) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }
    return prisma.order.update({ where: { id: orderId }, data: { deleted_at: new Date() } });
  },

  async getBusinessStats(groupId: string) {
    const [postsCount, messagesCount, statusCounts] = await Promise.all([
      prisma.groupPost.count({ where: { group_id: groupId, post: { deleted_at: null } } }),
      prisma.groupMessage.count({ where: { group_id: groupId, deleted_at: null } }),
      prisma.order.groupBy({ by: ['status'], where: { group_id: groupId, deleted_at: null }, _count: true }),
    ]);
    const ordersByStatus: Record<OrderStatus, number> = { WAITING: 0, SKETCH: 0, LINEART: 0, COLORING: 0, FINISHED: 0 };
    for (const row of statusCounts as unknown as { status: OrderStatus; _count: number }[]) {
      ordersByStatus[row.status] = row._count;
    }
    return { postsCount, messagesCount, ordersByStatus };
  },

  // ── Group balance (funded by member donations from their Wallet) ──────────
  async donateToGroup(groupId: string, userId: string, amount: number, message?: string) {
    const clean = Math.round(amount * 100) / 100;
    if (!Number.isFinite(clean) || clean < 1) {
      throw Object.assign(new Error('Amount must be at least 1'), { statusCode: 400 });
    }
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { deleted_at: true, donations_enabled: true } });
    if (!group || group.deleted_at) throw Object.assign(new Error('Group not found'), { statusCode: 404 });
    if (!group.donations_enabled) throw Object.assign(new Error('Donations are not enabled for this group'), { statusCode: 400 });

    const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } });
    if (!wallet || Number(wallet.balance) < clean) {
      throw Object.assign(new Error('Insufficient wallet balance'), { statusCode: 402 });
    }

    const [, updatedGroup, transaction] = await prisma.$transaction([
      prisma.wallet.update({ where: { user_id: userId }, data: { balance: { decrement: clean } } }),
      prisma.group.update({ where: { id: groupId }, data: { balance: { increment: clean } } }),
      prisma.groupTransaction.create({
        data: { group_id: groupId, user_id: userId, type: 'DONATION', amount: clean, message: message?.trim().slice(0, 280) || null },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      }),
    ]);
    return { balance: updatedGroup.balance, transaction };
  },

  async getGroupBalance(groupId: string) {
    const [group, transactions] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, select: { balance: true } }),
      prisma.groupTransaction.findMany({
        where: { group_id: groupId },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);
    return { balance: group?.balance ?? 0, transactions };
  },

  async getOrderConversation(orderId: string, requesterId: string): Promise<string> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const isAdmin = await groupService.isOwnerOrAdmin(order.group_id, requesterId);
    if (order.customer_id !== requesterId && !isAdmin) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    if (!order.conversation_id) throw Object.assign(new Error('No conversation for this order'), { statusCode: 404 });
    return order.conversation_id;
  },

  // ── Trending groups (by member count + recent activity) ──────────────────
  async getTrending(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        where: { deleted_at: null, is_public: true },
        select: GROUP_LIST_SELECT,
        orderBy: [{ members_count: 'desc' }, { rating: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.group.count({ where: { deleted_at: null, is_public: true } }),
    ]);
    return { groups: groups.map((g) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count) })), total };
  },

  // ── Toggle notification preference ───────────────────────────────────────
  async toggleNotification(groupId: string, userId: string) {
    const membership = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (!membership) throw new Error('Not a member');
    const updated = await prisma.groupMember.update({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { notify_posts: !membership.notify_posts },
      select: { notify_posts: true },
    });
    return { notify_posts: updated.notify_posts };
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
