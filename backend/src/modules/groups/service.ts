import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { assertGroupReadable, readableGroupsWhere, readablePostsWhere, accessError } from '../../lib/contentAccess.js';
import { pagination } from '../../lib/pagination.js';
import { canCreateGroup } from '../../lib/verificationPolicy.js';
import { sanitizeDisplayText } from '../../lib/sanitizeText.js';
import { containsToxicLanguage } from '../automod/service.js';
import { getGroupBadgeLevel } from '../../lib/badges.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { isTrustedMediaUrl, deleteFileByUrl, assertOwnedMedia } from '../media/service.js';
import { notificationService } from '../notifications/service.js';
import { resolveCharacters } from '../../lib/orderCharacters.js';
import { ensureGroupThread } from '../../lib/groupThread.js';
import { linkOrderToQueue } from '../../lib/orderQueue.js';
import { messageService } from '../messages/service.js';
import { requireSafeLink, sanitizeLinkRecord } from '../../lib/safeLink.js';
import { normalizeTag } from '../../lib/tagRules.js';
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
import { logError } from '../../lib/logger.js';
import { debitWallet, creditWallet } from '../wallet/ledger.js';
import { parseSearchQuery, textScore, trigramAvailable } from '../../lib/searchQuery.js';
import { POST_LISTING_INCLUDE, assertListingAttachable, withPublicListing } from '../../lib/postListing.js';

// ── helpers ───────────────────────────────────────────────────────────────────
// Group role hierarchy: owner > admin > moderator > everyone else (member/dealer/volunteer/guest_of_honor).
const ROLE_WEIGHT: Record<string, number> = { owner: 3, admin: 2, moderator: 1 };
function roleWeight(role?: string | null): number {
  return role ? (ROLE_WEIGHT[role] ?? 0) : 0;
}

// ── permissions ───────────────────────────────────────────────────────────────
// Every capability that can be switched on for a custom role. Owner/admin always hold all of them;
// the system roles below get a fixed subset, and a custom role adds its own on top of the base role.
export const GROUP_PERMISSIONS = [
  'can_post',
  'can_moderate_posts',
  'can_manage_members',
  'can_manage_events',
  'can_manage_roles',
  'can_manage_settings',
] as const;
export type GroupPermission = typeof GROUP_PERMISSIONS[number];
export const isGroupPermission = (v: unknown): v is GroupPermission => (GROUP_PERMISSIONS as readonly unknown[]).includes(v);

const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly GroupPermission[]> = {
  owner: GROUP_PERMISSIONS,
  admin: GROUP_PERMISSIONS,
  moderator: ['can_post', 'can_moderate_posts'],
};

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const MAX_CUSTOM_ROLES = 20;

function permissionsOf(role: string | null | undefined, customPerms: unknown): Set<GroupPermission> {
  const set = new Set<GroupPermission>(SYSTEM_ROLE_PERMISSIONS[role ?? ''] ?? []);
  if (Array.isArray(customPerms)) for (const p of customPerms) if (isGroupPermission(p)) set.add(p);
  return set;
}

function cleanPermissions(raw: unknown): GroupPermission[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((p) => !isGroupPermission(p))) {
    throw Object.assign(new Error('Unknown permission in role'), { statusCode: 400 });
  }
  return [...new Set(raw as GroupPermission[])];
}

// One slug format for create and update: lowercase, dash-separated, no leading/trailing dashes.
function normalizeSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Rubrics are the type-specific sub-categories picked when creating news / brand groups.
// They live in their own column and never touch `category` (the general category with cooldown).
export const GROUP_TYPES: readonly string[] = ['event', 'creative', 'static', 'news', 'shop', 'community', 'brand'];

export const GROUP_RUBRICS: Partial<Record<string, readonly string[]>> = {
  news: ['general', 'fandom', 'tech', 'art', 'events', 'gaming'],
  brand: ['studio', 'convention', 'agency', 'publisher', 'service', 'other'],
};

// A slug must be unique among live slugs and among the redirect aliases of other groups.
async function assertSlugFree(slug: string, exceptGroupId?: string) {
  const clash = await prisma.group.findFirst({
    where: {
      id: exceptGroupId ? { not: exceptGroupId } : undefined,
      OR: [{ slug }, { slug_aliases: { has: slug } }],
    },
    select: { id: true },
  });
  if (clash) throw httpError('Этот адрес группы уже занят', 409);
}

function resolveRubric(type: string, rubric: string | null | undefined): string | null {
  const allowed = GROUP_RUBRICS[type];
  if (!allowed || !rubric) return null;
  if (!allowed.includes(rubric)) throw Object.assign(new Error('Unknown rubric for this group type'), { statusCode: 400 });
  return rubric;
}

// hidden_member_ids is stored as a JSON string array; tolerate malformed values.
// Role icon is stored in a short column: keep a handful of characters (an emoji can be several code units).
function cleanRoleIcon(icon: string | undefined): string | undefined {
  if (icon === undefined) return undefined;
  const trimmed = Array.from(icon.trim()).slice(0, 4).join('');
  return trimmed || undefined;
}

function parseHiddenIds(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type MaskableGroup = { id: string; owner_id?: string | null; owner?: unknown; hide_admins?: boolean; hidden_member_ids?: string | null };

/** Группы, где зритель — владелец или админ: им скрытая администрация видна. */
async function adminGroupIds(groupIds: string[], viewerId?: string | null): Promise<Set<string>> {
  if (!viewerId || !groupIds.length) return new Set();
  const rows = await prisma.groupMember.findMany({
    where: { user_id: viewerId, group_id: { in: groupIds }, role: { in: ['owner', 'admin'] } },
    select: { group_id: true },
  });
  return new Set(rows.map((r) => r.group_id));
}

/**
 * «Скрыть администрацию» и скрытые участники применяются на сервере, а не маской в браузере:
 * зрителю ниже админа не уходят owner_id/owner скрытого владельца и сам список скрытых id.
 */
export async function maskGroupsForViewer<T extends MaskableGroup>(groups: T[], viewerId?: string | null): Promise<T[]> {
  const admin = await adminGroupIds(groups.map((g) => g.id), viewerId);
  return groups.map((g) => {
    if (admin.has(g.id)) return g;
    const hidden = parseHiddenIds(g.hidden_member_ids);
    const ownerHidden = !!g.owner_id && g.owner_id !== viewerId && (!!g.hide_admins || hidden.includes(g.owner_id));
    return {
      ...g,
      hidden_member_ids: null,
      ...(ownerHidden ? { owner_id: null, owner: null } : {}),
    };
  });
}

/** Скрыт ли участник с этой ролью от посторонних (для списков групп чужого профиля). */
function memberHiddenInGroup(group: MaskableGroup, userId: string, role: string): boolean {
  return (!!group.hide_admins && (role === 'owner' || role === 'admin')) || parseHiddenIds(group.hidden_member_ids).includes(userId);
}

/**
 * Soft-deletes a group and its group-DM Conversation(s) together. Without this, a group going
 * away (auto-deleted once empty, or staff hard-delete) left its Conversation row(s) fully intact
 * — still listed, still readable/writable — since Conversation.group_id only gets SET NULL by
 * the DB's FK cascade, and nothing else ever re-checks the group's status.
 */
async function softDeleteGroupAndConversations(groupId: string) {
  await prisma.$transaction([
    prisma.group.update({ where: { id: groupId }, data: { deleted_at: new Date() } }),
    prisma.conversation.updateMany({ where: { group_id: groupId, deleted_at: null }, data: { deleted_at: new Date() } }),
  ]);
}

type Tx = Prisma.TransactionClient;

// members_count is a denormalised counter; recounting (instead of ±1) heals any past drift and
// can't be skewed by concurrent join/leave/kick.
async function syncMembersCount(tx: Tx, groupId: string): Promise<number> {
  const members_count = await tx.groupMember.count({ where: { group_id: groupId } });
  await tx.group.update({ where: { id: groupId }, data: { members_count } });
  return members_count;
}

function httpError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

const EVENT_STATUSES: readonly string[] = ['announced', 'tickets_open', 'sold_out', 'active', 'finished', 'teaser'];

function assertEventWindow(startsAt: string | Date | null, endsAt: string | Date | null) {
  if (!startsAt || !endsAt) throw httpError("Укажите начало и конец", 400);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw httpError('Некорректная дата мероприятия', 400);
  if (end <= start) throw httpError('Мероприятие должно заканчиваться после начала', 400);
}

function assertTierNumbers(price: number, total: number) {
  if (!Number.isFinite(price) || price < 0) throw httpError('Цена билета не может быть отрицательной', 400);
  if (total !== Infinity && (!Number.isInteger(total) || total < 1)) throw httpError('Количество билетов должно быть целым числом от 1', 400);
}

function assertCoords(lat?: number | null, lng?: number | null) {
  if (lat != null && !(lat >= -90 && lat <= 90)) throw httpError('Некорректная широта', 400);
  if (lng != null && !(lng >= -180 && lng <= 180)) throw httpError('Некорректная долгота', 400);
}

// Default Todolist kanban columns — used whenever a group hasn't customized its own.
export const DEFAULT_TODO_COLUMNS = [
  { key: 'WAITING', label: 'В ожидании', icon: 'Clock', color: '#94a3b8' },
  { key: 'SKETCH', label: 'Скетч', icon: 'Pencil', color: '#f59e0b' },
  { key: 'LINEART', label: 'Линии', icon: 'PenTool', color: '#3b82f6' },
  { key: 'COLORING', label: 'Цвет', icon: 'Palette', color: '#8b5cf6' },
  { key: 'FINISHED', label: 'Готово', icon: 'CheckCircle2', color: '#10b981' },
];
// A type alias (not an interface) so it is assignable to Prisma's JSON input type.
export type TodoColumn = { key: string; label: string; icon: string; color: string }

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
  rubric: true,
  event_date: true,
  event_expired_at: true,
  group_bg_url: true,
  group_frame: true,
  group_theme: true,
  hide_admins: true,
  hidden_member_ids: true,
  donations_enabled: true,
  bank_card_masked: true,
  support_tiers: true,
  business_enabled: true,
  den_enabled: true,
  welcome_msg_enabled: true,
  welcome_msg_text: true,
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
  hide_admins: true,
  hidden_member_ids: true,
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
      event_date: true, event_expired_at: true,
    },
  },
};

// ── Group CRUD ────────────────────────────────────────────────────────────────
const MIN_COMPLETION_SAMPLE = 5;

const formatDay = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

const ORDER_STAGES = ['WAITING', 'SKETCH', 'LINEART', 'COLORING', 'FINISHED'] as const;

const ORDER_STAGE_LABEL: Record<string, string> = { WAITING: 'Ожидание', SKETCH: 'Скетч', LINEART: 'Лайнарт', COLORING: 'Раскраска', FINISHED: 'Готово' };

/** Заказ + персонажи (с актуальными референсами из профилей) и референсы, добавленные художником. */
async function enrichOrder<T extends { form_data: unknown }>(o: T) {
  const fd = (o.form_data ?? {}) as { characters?: unknown; references?: string[] };
  return { ...o, characters: await resolveCharacters(fd.characters), references: Array.isArray(fd.references) ? fd.references : [] };
}

export const groupService = {
  // ── list groups ───────────────────────────────────────────────────────────
  async list(query: GetGroupsQuery, viewerId?: string) {
    const { page, limit, skip } = pagination(query.page, query.limit, 20, 50);

    // Closed groups are reachable by link only — they never appear in public listings
    const where: Prisma.GroupWhereInput = { deleted_at: null, is_public: true };
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
    const enriched = (await maskGroupsForViewer(groups, viewerId)).map((g) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count) }));

    return { groups: enriched, total, page, limit };
  },

  // ── get by slug or id ─────────────────────────────────────────────────────
  async getBySlugOrId(slugOrId: string, viewerId?: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const raw = await prisma.group.findFirst({
      // Закрытая группа открывается по ссылке (шапка и кнопка заявки); содержимое — только участникам
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
      },
    });
    if (!raw) return null;
    await this.ensureEventExpirySwept(raw.id);
    const visible = raw.is_public || (viewerId ? await this.canViewContent(raw.id, viewerId) : false);
    const [masked] = await maskGroupsForViewer([visible ? raw : { ...raw, events: [] }], viewerId);
    return { ...masked, badge_level: getGroupBadgeLevel(raw.members_count) };
  },

  // ── event lifecycle: expiring event_date, SOON clear, participant → subscriber demotion ──
  isEventExpired(group: { type: string; event_date: Date | null }) {
    return group.type === 'event' && !!group.event_date && group.event_date < new Date();
  },

  // Idempotent (guarded by event_expired_at) — safe to call on every read/write entry point.
  async ensureEventExpirySwept(groupId: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, type: true, event_date: true, event_expired_at: true, deleted_at: true },
    });
    if (!group) return null;
    if (this.isEventExpired(group) && !group.event_expired_at) {
      await this.sweepExpiredEvent(group.id);
      group.event_expired_at = new Date();
    }
    return group;
  },

  async sweepExpiredEvent(groupId: string) {
    await prisma.$transaction(async (tx) => {
      // Claim the sweep: of two concurrent readers only one gets count 1 and does the work,
      // so SOON badges / attendee counts are never decremented twice.
      const claimed = await tx.group.updateMany({
        where: { id: groupId, event_expired_at: null },
        data: { event_expired_at: new Date() },
      });
      if (claimed.count === 0) return;

      const soonBadges = await tx.soonBadge.findMany({
        where: { event: { group_id: groupId } },
        select: { event_id: true },
      });
      if (soonBadges.length > 0) {
        const perEvent = new Map<string, number>();
        for (const b of soonBadges) perEvent.set(b.event_id, (perEvent.get(b.event_id) ?? 0) + 1);
        await tx.soonBadge.deleteMany({ where: { event: { group_id: groupId } } });
        for (const [eventId, n] of perEvent) {
          await tx.event.updateMany({ where: { id: eventId, attendee_count: { gte: n } }, data: { attendee_count: { decrement: n } } });
          await tx.event.updateMany({ where: { id: eventId, attendee_count: { lt: n } }, data: { attendee_count: 0 } });
        }
      }

      const plainMembers = await tx.groupMember.findMany({
        where: { group_id: groupId, role: 'member', custom_role_id: null },
        select: { user_id: true },
      });
      if (plainMembers.length > 0) {
        await tx.groupSubscriber.createMany({
          data: plainMembers.map((m) => ({ group_id: groupId, user_id: m.user_id })),
          skipDuplicates: true,
        });
        await tx.groupMember.deleteMany({ where: { group_id: groupId, role: 'member', custom_role_id: null } });
        await syncMembersCount(tx, groupId);
      }
    });
  },

  async setEventDate(groupId: string, eventDate: Date | null) {
    return prisma.group.update({
      where: { id: groupId },
      data: { event_date: eventDate, event_expired_at: null },
      select: GROUP_SELECT,
    });
  },

  async subscribe(groupId: string, userId: string) {
    await assertGroupReadable(groupId, userId);
    await prisma.groupSubscriber.upsert({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      update: {},
      create: { group_id: groupId, user_id: userId },
    });
    return { subscribed: true };
  },

  async unsubscribe(groupId: string, userId: string) {
    await prisma.groupSubscriber.deleteMany({ where: { group_id: groupId, user_id: userId } });
    return { subscribed: false };
  },

  async getMySubscriptions(userId: string) {
    const rows = await prisma.groupSubscriber.findMany({
      where: { user_id: userId, group: readableGroupsWhere(userId) },
      select: { group_id: true },
    });
    return rows.map((r) => r.group_id);
  },

  // ── create ────────────────────────────────────────────────────────────────
  async create(ownerId: string, input: CreateGroupInput) {
    const name = sanitizeDisplayText(input.name ?? '', 120);
    if (!name) throw httpError('Group name is required', 400);
    if (!GROUP_TYPES.includes(input.type)) throw httpError('Unknown group type', 400);
    const slug = normalizeSlug(input.slug ?? '').slice(0, 60);
    if (!slug) throw httpError('Group slug is required', 400);
    await assertSlugFree(slug);
    return prisma.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({
        where: { id: ownerId },
        select: { is_verified: true, verification_type: true },
      });
      if (!canCreateGroup(owner, input.type)) {
        throw Object.assign(new Error('Для создания этого типа группы нужна одобренная верификация соответствующей роли'), { statusCode: 403 });
      }
      const group = await tx.group.create({
        data: {
          slug,
          name,
          type: input.type,
          rubric: resolveRubric(input.type, input.rubric),
          description: input.description,
          owner_id: ownerId,
          avatar_url: input.avatarUrl,
          banner_url: input.bannerUrl,
          accent_color: input.accentColor,
          social_links: sanitizeLinkRecord(input.socialLinks),
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
  async update(groupId: string, input: UpdateGroupInput, actorId?: string) {
    // Картинки группы — только файлы того, кто их ставит (изменённые поля)
    if (actorId) {
      const current = await prisma.group.findUnique({ where: { id: groupId }, select: { avatar_url: true, banner_url: true, group_bg_url: true } });
      const picked: [string | undefined, string | null | undefined][] = [
        [input.avatarUrl, current?.avatar_url],
        [input.bannerUrl, current?.banner_url],
        [input.groupBgUrl, current?.group_bg_url],
      ];
      for (const [next, prev] of picked) {
        if (typeof next === 'string' && next && next !== prev) await assertOwnedMedia(next, actorId);
      }
    }
    const prevMedia = (input.avatarUrl !== undefined || input.bannerUrl !== undefined || input.groupBgUrl !== undefined)
      ? await prisma.group.findUnique({ where: { id: groupId }, select: { avatar_url: true, banner_url: true, group_bg_url: true, owner_id: true } })
      : null;

    const data: Prisma.GroupUpdateInput = {};
    if (input.name !== undefined) {
      const name = sanitizeDisplayText(input.name ?? '', 120);
      if (!name) throw new Error('Group name is required');
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.avatarUrl !== undefined) data.avatar_url = input.avatarUrl;
    if (input.bannerUrl !== undefined) data.banner_url = input.bannerUrl;
    if (input.accentColor !== undefined) data.accent_color = input.accentColor;
    if (input.socialLinks !== undefined) data.social_links = sanitizeLinkRecord(input.socialLinks);
    if (input.isPublic !== undefined) data.is_public = input.isPublic;
    if (input.rulesText !== undefined) data.rules_text = input.rulesText;
    if (input.faq !== undefined) data.faq = input.faq;
    if (input.contactPhone !== undefined) data.contact_phone = input.contactPhone;
    if (input.contactEmail !== undefined) {
      if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
        throw httpError('Некорректный контактный email', 400);
      }
      data.contact_email = input.contactEmail;
    }
    if (input.aboutText !== undefined) data.about_text = input.aboutText;
    if (input.schedule !== undefined) data.schedule = input.schedule;
    if (input.whatToBring !== undefined) data.what_to_bring = input.whatToBring;
    if (input.isNsfw !== undefined) data.is_nsfw = input.isNsfw;
    if (input.productionTime !== undefined) data.production_time = input.productionTime;
    if (input.deliveryInfo !== undefined) data.delivery_info = input.deliveryInfo;
    if (input.completedWorks !== undefined) data.completed_works = input.completedWorks;
    if (input.guaranteeText !== undefined) data.guarantee_text = input.guaranteeText;
    if (input.slug !== undefined) {
      const newSlug = normalizeSlug(input.slug).slice(0, 60);
      if (!newSlug) throw httpError('Group slug is required', 400);
      // Fetch current slug to save as alias
      const current = await prisma.group.findUnique({ where: { id: groupId }, select: { slug: true, slug_aliases: true } });
      if (current && current.slug !== newSlug) {
        await assertSlugFree(newSlug, groupId);
        // Old slug becomes a redirect alias (limit 10); the slug we move to stops being an alias
        const aliases = [...new Set([...current.slug_aliases.filter((a) => a !== newSlug), current.slug])].slice(-10);
        data.slug_aliases = aliases;
        data.slug = newSlug;
      }
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
    if (input.rubric !== undefined) {
      const g = await prisma.group.findUnique({ where: { id: groupId }, select: { type: true } });
      if (g) data.rubric = resolveRubric(g.type, input.rubric);
    }
    if (input.isVerified !== undefined) data.is_verified = input.isVerified;
    if (input.groupBgUrl !== undefined) data.group_bg_url = input.groupBgUrl || null;
    if (input.groupFrame !== undefined) data.group_frame = input.groupFrame || null;
    if (input.groupTheme !== undefined) data.group_theme = input.groupTheme || null;
    if (input.hideAdmins !== undefined) data.hide_admins = input.hideAdmins;
    if (input.hiddenMemberIds !== undefined) data.hidden_member_ids = JSON.stringify(input.hiddenMemberIds);
    if (input.donationsEnabled !== undefined || input.bankCardMasked !== undefined) {
      // Пожертвования без карты для выплат принимались бы в никуда: проверяем на сервере, а не только в UI
      const current = await prisma.group.findUnique({ where: { id: groupId }, select: { bank_card_masked: true, donations_enabled: true } });
      const card = input.bankCardMasked !== undefined ? input.bankCardMasked : current?.bank_card_masked;
      const enabled = input.donationsEnabled !== undefined ? input.donationsEnabled : !!current?.donations_enabled;
      if (input.donationsEnabled === true && !card) {
        throw Object.assign(new Error('Чтобы принимать пожертвования, привяжите карту для выплат'), { statusCode: 400 });
      }
      // Removing the payout card switches donations off, even if the same request tried to keep them on
      data.donations_enabled = card ? enabled : false;
    }
    if (input.bankCardMasked !== undefined) data.bank_card_masked = input.bankCardMasked || null;
    if (input.supportTiers !== undefined) data.support_tiers = input.supportTiers;
    if (input.businessEnabled !== undefined) data.business_enabled = input.businessEnabled;
    if (input.welcomeMsgEnabled !== undefined) data.welcome_msg_enabled = input.welcomeMsgEnabled;
    if (input.welcomeMsgText !== undefined) {
      if (containsToxicLanguage(input.welcomeMsgText)) {
        throw Object.assign(new Error('Текст приветствия содержит недопустимый контент'), { statusCode: 400 });
      }
      data.welcome_msg_text = input.welcomeMsgText;
    }

    const updated = await prisma.group.update({ where: { id: groupId }, data, select: GROUP_SELECT });

    if (prevMedia) {
      const replaced = [
        input.avatarUrl !== undefined && prevMedia.avatar_url && prevMedia.avatar_url !== input.avatarUrl ? prevMedia.avatar_url : null,
        input.bannerUrl !== undefined && prevMedia.banner_url && prevMedia.banner_url !== input.bannerUrl ? prevMedia.banner_url : null,
        input.groupBgUrl !== undefined && prevMedia.group_bg_url && prevMedia.group_bg_url !== input.groupBgUrl ? prevMedia.group_bg_url : null,
      ].filter((url): url is string => !!url);
      Promise.all(replaced.map((url) => deleteFileByUrl(url, prevMedia!.owner_id)))
        .catch(logError('[group.update] media cleanup failed'));
    }

    return updated;
  },

  // ── hard delete ───────────────────────────────────────────────────────────
  /**
   * Permanently erases the group and everything in it — members, posts, messages, ratings,
   * todos, custom roles, subscribers, bookmarks — irreversible, no soft-delete/undo.
   *
   * Blocked entirely if the group has any donation/transaction history, orders, or a nonzero
   * balance: deleting a group must never be a way to erase money records (e.g. a scammer
   * collecting donations then wiping the evidence). Those groups can only be handled by support.
   */
  async delete(groupId: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        owner_id: true,
        avatar_url: true,
        banner_url: true,
        group_bg_url: true,
        sponsors: true,
        balance: true,
        _count: { select: { transactions: true, orders: true } },
      },
    });
    if (!group) throw Object.assign(new Error('Group not found'), { statusCode: 404 });

    if (group._count.transactions > 0 || group._count.orders > 0 || group.balance.toNumber() !== 0) {
      throw Object.assign(new Error('GROUP_HAS_FINANCIAL_HISTORY'), { statusCode: 409 });
    }

    const groupPosts = await prisma.groupPost.findMany({ where: { group_id: groupId }, select: { post_id: true } });
    const postIds = groupPosts.map((gp) => gp.post_id);
    const posts = postIds.length > 0
      ? await prisma.post.findMany({ where: { id: { in: postIds } }, select: { media_urls: true, media_original_urls: true } })
      : [];

    // Collect every file URL first: after the rows are gone the storage objects would be orphaned.
    const sponsors = Array.isArray(group.sponsors) ? (group.sponsors as Array<{ logo_url?: string | null } | null>) : [];
    const mediaUrls = [
      ...posts.flatMap((p) => [...p.media_urls, ...p.media_original_urls]),
      group.avatar_url,
      group.banner_url,
      group.group_bg_url,
      ...sponsors.map((s) => s?.logo_url),
    ].filter((url): url is string => !!url);
    await prisma.$transaction([
      prisma.post.deleteMany({ where: { id: { in: postIds } } }),
      // Conversation.group_id is only SET NULL by the FK cascade below — soft-delete it here
      // first so it stops being listed/readable instead of surviving as an orphaned thread.
      prisma.conversation.updateMany({ where: { group_id: groupId, deleted_at: null }, data: { deleted_at: new Date() } }),
      prisma.group.delete({ where: { id: groupId } }),
    ]);

    // Files go only after the rows are really gone: a failed transaction must not leave a live group with dead media
    await Promise.all(mediaUrls.map((url) => deleteFileByUrl(url, group.owner_id).catch(() => {})));

    return { deleted: true, postsDeleted: postIds.length };
  },

  // ── access / permissions ──────────────────────────────────────────────────
  /** Role + effective permissions of a user in a live (not deleted) group, or null for non-members. */
  async getAccess(groupId: string, userId: string) {
    const m = await prisma.groupMember.findFirst({
      where: { group_id: groupId, user_id: userId, group: { deleted_at: null } },
      select: { role: true, custom_role_id: true, customRole: { select: { permissions: true } } },
    });
    if (!m) return null;
    const permissions = permissionsOf(m.role, m.customRole?.permissions);
    // Rank decides who may act on whom: owner 3 > admin 2 > moderator 1; a plain member holding
    // a custom role with "manage members" counts as a moderator for that purpose only.
    const base = roleWeight(m.role);
    const rank = base >= 1 ? base : permissions.has('can_manage_members') ? 1 : 0;
    return { role: m.role, customRoleId: m.custom_role_id, permissions, rank };
  },

  async hasPermission(groupId: string, userId: string, permission: GroupPermission): Promise<boolean> {
    return !!(await groupService.getAccess(groupId, userId))?.permissions.has(permission);
  },

  /** Closed groups show their content (posts, members, queue) to members only. */
  async canViewContent(groupId: string, viewerId: string | null): Promise<boolean> {
    const group = await prisma.group.findFirst({ where: { id: groupId, deleted_at: null }, select: { is_public: true } });
    if (!group) return false;
    if (group.is_public) return true;
    if (!viewerId) return false;
    return !!(await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: viewerId } },
      select: { user_id: true },
    }));
  },

  // ── membership ────────────────────────────────────────────────────────────
  /**
   * Open group: the user becomes a member. Closed group: an application is filed instead
   * (`pending: true`) and the owner/admins approve it from the group tools.
   */
  async join(groupId: string, userId: string, message?: string) {
    const group = await this.ensureEventExpirySwept(groupId);
    if (!group || group.deleted_at) throw httpError('Group not found', 404);
    if (this.isEventExpired(group)) throw new Error('EVENT_EXPIRED');
    const info = await prisma.group.findUniqueOrThrow({ where: { id: groupId }, select: { is_public: true } });

    const existing = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      include: { group: { select: GROUP_LIST_SELECT } },
    });
    if (existing) return { membership: existing, pending: false };

    if (!info.is_public) {
      const text = message ? sanitizeDisplayText(message, 500) || null : null;
      await prisma.groupJoinRequest.upsert({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
        update: { message: text },
        create: { group_id: groupId, user_id: userId, message: text },
      });
      return { membership: null, pending: true };
    }

    const membership = await this.addMember(groupId, userId);
    const [maskedGroup] = await maskGroupsForViewer([membership.group], userId);
    return { membership: { ...membership, group: maskedGroup }, pending: false };
  },

  // The unique key is the single source of truth for "did this call create the member";
  // the counter is recounted so concurrent joins can never inflate it.
  async addMember(groupId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.groupMember.upsert({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
        update: {},
        create: { group_id: groupId, user_id: userId, role: 'member' },
      });
      // A full member doesn't need a separate notification-only subscription or a pending application
      await tx.groupSubscriber.deleteMany({ where: { group_id: groupId, user_id: userId } });
      await tx.groupJoinRequest.deleteMany({ where: { group_id: groupId, user_id: userId } });
      await syncMembersCount(tx, groupId);
      return tx.groupMember.findUniqueOrThrow({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
        include: { group: { select: GROUP_LIST_SELECT } },
      });
    });
  },

  async hasPendingJoinRequest(groupId: string, userId: string): Promise<boolean> {
    return !!(await prisma.groupJoinRequest.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      select: { id: true },
    }));
  },

  async cancelJoinRequest(groupId: string, userId: string) {
    await prisma.groupJoinRequest.deleteMany({ where: { group_id: groupId, user_id: userId } });
    return { pending: false };
  },

  async listJoinRequests(groupId: string) {
    return prisma.groupJoinRequest.findMany({
      where: { group_id: groupId },
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'asc' },
      take: 200,
    });
  },

  async resolveJoinRequest(groupId: string, requestId: string, approve: boolean) {
    const request = await prisma.groupJoinRequest.findFirst({ where: { id: requestId, group_id: groupId } });
    if (!request) throw httpError('Application not found', 404);
    if (!approve) {
      await prisma.groupJoinRequest.deleteMany({ where: { id: requestId } });
      return { approved: false };
    }
    await this.addMember(groupId, request.user_id);
    return { approved: true };
  },

  async leave(groupId: string, userId: string) {
    const outcome = await prisma.$transaction(async (tx) => {
      const membership = await tx.groupMember.findUnique({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      });
      if (!membership) return { count: 0, empty: false };
      // The owner may only leave as the very last member (the group then goes away)
      if (membership.role === 'owner' && (await tx.groupMember.count({ where: { group_id: groupId } })) > 1) {
        throw new Error('Owner cannot leave while other members exist. Transfer ownership first.');
      }
      await tx.groupMember.delete({ where: { group_id_user_id: { group_id: groupId, user_id: userId } } });
      const left = await syncMembersCount(tx, groupId);
      return { count: 1, empty: left <= 0 };
    });
    // Auto-delete (soft) group if no members remain
    if (outcome.empty) await softDeleteGroupAndConversations(groupId);
    return { count: outcome.count };
  },

  /** Owner hands the group over to another member; the previous owner stays on as admin. */
  async transferOwnership(groupId: string, currentOwnerId: string, newOwnerId: string) {
    if (newOwnerId === currentOwnerId) throw httpError('Вы уже владелец этой группы', 400);
    return prisma.$transaction(async (tx) => {
      const group = await tx.group.findFirst({ where: { id: groupId, deleted_at: null }, select: { owner_id: true } });
      if (!group) throw httpError('Group not found', 404);
      if (group.owner_id !== currentOwnerId) throw httpError('Only the group owner can transfer ownership', 403);
      const target = await tx.groupMember.findUnique({
        where: { group_id_user_id: { group_id: groupId, user_id: newOwnerId } },
      });
      if (!target) throw httpError('Новый владелец должен быть участником группы', 400);
      await tx.groupMember.update({
        where: { group_id_user_id: { group_id: groupId, user_id: currentOwnerId } },
        data: { role: 'admin' },
      });
      await tx.groupMember.update({
        where: { group_id_user_id: { group_id: groupId, user_id: newOwnerId } },
        data: { role: 'owner', custom_role_id: null },
      });
      await tx.group.update({ where: { id: groupId }, data: { owner_id: newOwnerId } });
      return { owner_id: newOwnerId };
    });
  },

  async getMembers(groupId: string, page = 1, limit = 30, viewerId: string | null = null, staffOnly = false) {
    const skip = (page - 1) * limit;
    const where: Prisma.GroupMemberWhereInput = { group_id: groupId };
    // Owner's "hide admins" / "hide members" settings apply to everyone below admin level.
    const viewerWeight = viewerId ? await groupService.getRoleWeight(groupId, viewerId) : 0;
    const andNot: Prisma.GroupMemberWhereInput[] = [];
    if (viewerWeight < 2) {
      const group = await prisma.group.findUnique({ where: { id: groupId }, select: { hide_admins: true, hidden_member_ids: true } });
      const hiddenIds = parseHiddenIds(group?.hidden_member_ids);
      if (hiddenIds.length) where.user_id = { notIn: hiddenIds };
      if (group?.hide_admins) andNot.push({ role: { in: ['owner', 'admin'] } });
    }
    if (andNot.length) where.NOT = andNot;
    if (staffOnly) where.OR = [{ role: { in: ['owner', 'admin', 'moderator'] } }, { custom_role_id: { not: null } }];
    return prisma.groupMember.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true, banner_url: true } },
        customRole: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: { joined_at: 'asc' },
      skip,
      take: limit,
    });
  },

  async setMemberRole(groupId: string, requesterId: string, userId: string, role: MemberRole) {
    if (role === 'owner') throw new Error('Cannot assign owner role via this endpoint');
    const requester = await groupService.getAccess(groupId, requesterId);
    if (!requester?.permissions.has('can_manage_members')) throw new Error('Not authorized');
    const current = await groupService.getAccess(groupId, userId);
    if (!current) throw httpError('Member not found', 404);
    if (current.role === 'owner') throw new Error('Cannot change the role of the group owner');
    // Admins (not owner) may only grant roles below admin — they cannot create peer admins.
    if (role === 'admin' && requester.rank < 3) throw new Error('Only the group owner can assign the admin role');
    // Same rule as removeMember: only members strictly below the requester can be changed,
    // and nobody can hand out a role as high as their own (unless they are the owner).
    if (current.rank >= requester.rank) {
      throw new Error('Not authorized to change the role of a member with an equal or higher role');
    }
    if (roleWeight(role) >= requester.rank && requester.rank < 3) {
      throw new Error('Not authorized to grant a role equal to your own');
    }

    return prisma.groupMember.update({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { role },
    });
  },

  /** Gives a member one of the group's custom roles (or takes it away with `roleId = null`). */
  async setMemberCustomRole(groupId: string, requesterId: string, userId: string, roleId: string | null) {
    const requester = await groupService.getAccess(groupId, requesterId);
    if (!requester?.permissions.has('can_manage_members')) throw httpError('Not authorized', 403);
    const target = await groupService.getAccess(groupId, userId);
    if (!target) throw httpError('Member not found', 404);
    if (target.rank >= requester.rank) throw httpError('Not authorized to change a member with an equal or higher role', 403);

    if (roleId) {
      const customRole = await prisma.groupCustomRole.findFirst({ where: { id: roleId, group_id: groupId } });
      if (!customRole) throw httpError('Custom role not found', 404);
      // Nobody can hand out powers they don't have themselves
      const missing = cleanPermissions(customRole.permissions).filter((p) => !requester.permissions.has(p));
      if (missing.length) throw httpError('Нельзя выдать роль с правами, которых нет у вас', 403);
    }
    return prisma.groupMember.update({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { custom_role_id: roleId },
      include: { customRole: { select: { id: true, name: true, color: true, icon: true } } },
    });
  },

  async getMembership(groupId: string, userId: string) {
    return prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
  },

  async removeMember(groupId: string, requesterId: string, targetUserId: string) {
    const target = await groupService.getAccess(groupId, targetUserId);
    if (!target) throw httpError('Member not found', 404);
    if (target.role === 'owner') throw new Error('Cannot remove the group owner');
    const requester = await groupService.getAccess(groupId, requesterId);
    if (!requester || requester.rank < 1) throw new Error('Not authorized'); // must be at least moderator
    // Can only remove members with a strictly lower rank (moderators can kick plain
    // members, admins can kick moderators/members but not other admins, etc).
    if (target.rank >= requester.rank) {
      throw new Error('Not authorized to remove a member with an equal or higher role');
    }
    const left = await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({ where: { group_id_user_id: { group_id: groupId, user_id: targetUserId } } });
      return syncMembersCount(tx, groupId);
    });
    // Auto-delete (soft) group if no members remain
    if (left <= 0) await softDeleteGroupAndConversations(groupId);
    return { removed: true };
  },

  // ── Custom roles ──────────────────────────────────────────────────────────
  async getCustomRoles(groupId: string) {
    return prisma.groupCustomRole.findMany({
      where: { group_id: groupId },
      include: { _count: { select: { members: true } } },
      orderBy: { position: 'asc' },
    });
  },

  // Nobody can put powers into a role that they don't hold themselves.
  async assertCanGrant(groupId: string, actorId: string, permissions: GroupPermission[]) {
    const access = await groupService.getAccess(groupId, actorId);
    if (!access?.permissions.has('can_manage_roles')) throw httpError('Not authorized', 403);
    if (permissions.some((p) => !access.permissions.has(p))) {
      throw httpError('Нельзя выдать роли права, которых нет у вас', 403);
    }
  },

  async createCustomRole(groupId: string, actorId: string, data: { name: string; color?: string; icon?: string; permissions?: string[] }) {
    const name = sanitizeDisplayText(data.name ?? '', 50);
    if (!name) throw httpError('Role name is required', 400);
    const permissions = cleanPermissions(data.permissions);
    await groupService.assertCanGrant(groupId, actorId, permissions);
    if (data.color !== undefined && !HEX_COLOR_RE.test(data.color)) throw httpError('Invalid role color', 400);
    const count = await prisma.groupCustomRole.count({ where: { group_id: groupId } });
    if (count >= MAX_CUSTOM_ROLES) throw httpError(`Не больше ${MAX_CUSTOM_ROLES} ролей в группе`, 400);
    return prisma.groupCustomRole.create({
      data: {
        group_id: groupId,
        name,
        color: data.color ?? '#9ca3af',
        icon: cleanRoleIcon(data.icon) ?? '🎖️',
        permissions,
        position: count,
      },
    });
  },

  async updateCustomRole(groupId: string, actorId: string, roleId: string, data: { name?: string; color?: string; icon?: string; permissions?: string[] }) {
    const role = await prisma.groupCustomRole.findFirst({ where: { id: roleId, group_id: groupId } });
    if (!role) throw httpError('Custom role not found', 404);
    let name: string | undefined;
    if (data.name !== undefined) {
      name = sanitizeDisplayText(data.name ?? '', 50);
      if (!name) throw httpError('Role name is required', 400);
    }
    if (data.color !== undefined && !HEX_COLOR_RE.test(data.color)) throw httpError('Invalid role color', 400);
    const permissions = data.permissions !== undefined ? cleanPermissions(data.permissions) : undefined;
    // The role may already hold powers the editor lacks — only newly added ones must be covered.
    const added = (permissions ?? []).filter((p) => !cleanPermissions(role.permissions).includes(p));
    await groupService.assertCanGrant(groupId, actorId, added);
    return prisma.groupCustomRole.update({
      where: { id: roleId },
      data: {
        ...(name !== undefined && { name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: cleanRoleIcon(data.icon) ?? role.icon }),
        ...(permissions !== undefined && { permissions }),
      },
    });
  },

  async deleteCustomRole(groupId: string, roleId: string) {
    const removed = await prisma.groupCustomRole.deleteMany({ where: { id: roleId, group_id: groupId } });
    if (removed.count === 0) throw httpError('Custom role not found', 404);
    return { deleted: true };
  },

  // ── events ────────────────────────────────────────────────────────────────
  async createEvent(input: CreateEventInput) {
    const title = sanitizeDisplayText(input.title ?? '', 200);
    if (!title) throw httpError('Event title is required', 400);
    const shortCode = String(input.shortCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (!shortCode) throw httpError('Event short code is required', 400);
    assertEventWindow(input.startsAt, input.endsAt);
    assertCoords(input.locationLat, input.locationLng);
    return prisma.event.create({
      data: {
        group_id: input.groupId,
        title,
        short_code: shortCode,
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
        registration_url: requireSafeLink(input.registrationUrl, 'регистрация'),
      },
      select: EVENT_SELECT,
    });
  },

  async updateEvent(eventId: string, input: UpdateEventInput) {
    const data: Prisma.EventUpdateInput = {};
    if (input.title !== undefined) {
      const title = sanitizeDisplayText(input.title ?? '', 200);
      if (!title) throw httpError('Event title is required', 400);
      data.title = title;
    }
    if (input.status !== undefined && !EVENT_STATUSES.includes(input.status)) throw httpError('Unknown event status', 400);
    assertCoords(input.locationLat, input.locationLng);
    if (input.startsAt !== undefined || input.endsAt !== undefined) {
      const current = await prisma.event.findUnique({ where: { id: eventId }, select: { starts_at: true, ends_at: true } });
      if (!current) throw httpError('Event not found', 404);
      assertEventWindow(input.startsAt ?? current.starts_at, input.endsAt ?? current.ends_at);
    }
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
    if (input.registrationUrl !== undefined) data.registration_url = requireSafeLink(input.registrationUrl, 'регистрация');
    if (input.shortCode !== undefined) {
      const code = input.shortCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (code) data.short_code = code;
    }

    return prisma.event.update({ where: { id: eventId }, data, select: EVENT_SELECT });
  },

  async getEvent(eventId: string, viewerId?: string) {
    return prisma.event.findFirst({
      where: { id: eventId, group: readableGroupsWhere(viewerId) },
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

  async listEvents(query: { groupId?: string; status?: string; upcoming?: boolean; page?: string; limit?: string; sort?: string; location?: string }, viewerId?: string) {
    const { page, limit, skip } = pagination(query.page, query.limit, 20, 50);

    const where: Prisma.EventWhereInput = { group: readableGroupsWhere(viewerId) };
    if (query.groupId) where.group_id = query.groupId;
    if (query.status) where.status = query.status;
    if (query.upcoming) where.starts_at = { gt: new Date() };
    if (query.location) {
      where.location_name = { contains: query.location, mode: 'insensitive' };
    }

    // Sort: 'popular' = by attendee_count desc then nearest date, default = starts_at asc
    const orderBy: Prisma.EventOrderByWithRelationInput[] = query.sort === 'popular'
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
    const name = sanitizeDisplayText(input.name ?? '', 100);
    if (!name) throw httpError('Ticket name is required', 400);
    assertTierNumbers(input.price, input.totalCount);
    return prisma.ticketTier.create({
      data: {
        event_id: input.eventId,
        name,
        price: input.price,
        currency: input.currency ?? 'USD',
        total_count: input.totalCount,
        sale_starts_at: input.saleStartsAt ? new Date(input.saleStartsAt) : null,
        sale_ends_at: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
      },
    });
  },

  async updateTicketTier(tierId: string, input: Partial<Omit<CreateTicketTierInput, 'eventId'>>) {
    const data: Prisma.TicketTierUpdateInput = {};
    if (input.name !== undefined) {
      const name = sanitizeDisplayText(input.name ?? '', 100);
      if (!name) throw httpError('Ticket name is required', 400);
      data.name = name;
    }
    if (input.price !== undefined || input.totalCount !== undefined) {
      const tier = await prisma.ticketTier.findUnique({ where: { id: tierId }, select: { price: true, sold_count: true } });
      if (!tier) throw httpError('Ticket tier not found', 404);
      assertTierNumbers(input.price ?? Number(tier.price), input.totalCount ?? Infinity);
      if (input.totalCount !== undefined && input.totalCount < tier.sold_count) {
        throw httpError('Нельзя поставить количество меньше уже проданных билетов', 400);
      }
    }
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
    const event = await prisma.event.findFirst({ where: { id: eventId, group: { deleted_at: null } }, select: { group_id: true } });
    if (!event) throw httpError('Event not found', 404);
    await assertGroupReadable(event.group_id, userId);
    const group = await this.ensureEventExpirySwept(event.group_id);

    return prisma.$transaction(async (tx) => {
      // Same row lock as RSVP: parallel toggles must not double-count attendees
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`;
      const existing = await tx.soonBadge.findUnique({
        where: { user_id_event_id: { user_id: userId, event_id: eventId } },
      });
      if (existing) {
        await tx.soonBadge.delete({ where: { id: existing.id } });
        await tx.event.updateMany({ where: { id: eventId, attendee_count: { gt: 0 } }, data: { attendee_count: { decrement: 1 } } });
        return { added: false };
      }
      if (group && this.isEventExpired(group)) throw new Error('EVENT_EXPIRED');
      await tx.soonBadge.create({ data: { user_id: userId, event_id: eventId } });
      await tx.event.update({ where: { id: eventId }, data: { attendee_count: { increment: 1 } } });
      return { added: true };
    });
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

  async getUserSoonBadges(userId: string, viewerId?: string) {
    return prisma.soonBadge.findMany({
      where: { user_id: userId, show_badge: true, event: { group: readableGroupsWhere(viewerId) } },
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
    const data: Omit<Prisma.CommissionInfoUncheckedCreateInput, 'group_id'> = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.basePrices !== undefined) {
      if (!input.basePrices || typeof input.basePrices !== 'object' || Array.isArray(input.basePrices) ||
        Object.entries(input.basePrices).some(([name, price]) => !name.trim() || name.length > 120 || typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
        throw new Error('Базовые цены должны быть неотрицательными числами');
      }
      data.base_prices = input.basePrices;
    }
    if (input.currency !== undefined) {
      if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) throw new Error('Укажите трёхбуквенный код валюты');
      data.currency = input.currency;
    }
    if (input.tosText !== undefined) data.tos_text = input.tosText;
    if (input.maxQueue !== undefined) data.max_queue = input.maxQueue;
    if (input.rushSlots !== undefined) data.rush_slots = input.rushSlots;
    if (input.rushMax !== undefined) data.rush_max = input.rushMax;
    if (input.turnaroundDays !== undefined) data.turnaround_days = input.turnaroundDays;
    if (input.priceList !== undefined) {
      if (!Array.isArray(input.priceList) || input.priceList.length > 200 || input.priceList.some(item =>
        !item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120 ||
        typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0 ||
        (item.description !== undefined && (typeof item.description !== 'string' || item.description.length > 2000))
      )) throw new Error('Прайс должен содержать название и неотрицательную цену для каждой позиции');
      data.price_list = input.priceList.map(item => ({
        name: item.name.trim(), price: item.price, description: item.description?.trim() ?? '',
      }));
    }

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

  // Members and subscribers can read subscriber_only posts; everyone else cannot.
  async hasSubscriberAccess(groupId: string, userId: string): Promise<boolean> {
    // Any membership counts (plain members have role weight 0), so check the row, not the weight.
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId }, group: { deleted_at: null } },
      select: { role: true },
    });
    if (member) return true;
    const sub = await prisma.groupSubscriber.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      select: { group_id: true },
    });
    return !!sub;
  },

  // Moderation (delete others' posts/comments, view the archive): owner/admin/moderator or a custom role with the right.
  async isAtLeastModerator(groupId: string, userId: string): Promise<boolean> {
    return groupService.hasPermission(groupId, userId, 'can_moderate_posts');
  },

  // Publishing on behalf of the group.
  async canPost(groupId: string, userId: string): Promise<boolean> {
    return groupService.hasPermission(groupId, userId, 'can_post');
  },

  // ── Group posts ──────────────────────────────────────────────────────────
  async getGroupPosts(groupId: string, page = 1, limit = 20, hasMedia = false, viewerId: string | null = null, archived = false) {
    await assertGroupReadable(groupId, viewerId);
    const bounds = pagination(page, limit);
    page = bounds.page; limit = bounds.limit;
    const skip = bounds.skip;
    const hasSubscriberAccess = viewerId ? await groupService.hasSubscriberAccess(groupId, viewerId) : false;
    const rows = await prisma.groupPost.findMany({
      where: {
        group_id: groupId,
        group: { deleted_at: null },
        post: {
          AND: [await readablePostsWhere(viewerId, archived)],
          deleted_at: null,
          // Архивные посты раньше не отфильтровывались и возвращались в ленту после обновления страницы
          is_archived: archived,
          ...(hasSubscriberAccess ? {} : { subscriber_only: false }),
          ...(hasMedia ? { media_urls: { isEmpty: false } } : {}),
        },
      },
      include: {
        post: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            tags: { include: { tag: true } },
            listing: POST_LISTING_INCLUDE,
            _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
          },
        },
      },
      orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
      skip,
      take: limit,
    });
    return rows.map(row => ({ ...row, post: withPublicListing({ ...row.post, can_view_content: true }) }));
  },

  // ── Creative Kanban ───────────────────────────────────────────────────────
  async getKanban(groupId: string, viewerId?: string) {
    await assertGroupReadable(groupId, viewerId);
    const STAGES = ['скетч', 'линии', 'цвет', 'готово'] as const;

    const pivots = await prisma.groupPost.findMany({
      where: {
        group_id: groupId,
        post: { deleted_at: null, post_type: 'commission_update', is_archived: false, AND: [await readablePostsWhere(viewerId)] },
      },
      include: {
        post: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            _count: { select: { votes: true, comments: { where: { deleted_at: null } } } },
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
    const visible = memberships.filter((m) => !memberHiddenInGroup(m.group, userId, m.role));
    const masked = await maskGroupsForViewer(visible.map((m) => m.group), null);
    return masked.map((g, i) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count), role: visible[i].role }));
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
        group: readableGroupsWhere(requesterId),
        ...(pinnedOnly ? { is_pinned: true } : {}),
      },
      include: { group: { select: GROUP_LIST_SELECT } },
      orderBy: [{ is_pinned: 'desc' }, { joined_at: 'desc' }],
    });

    // Скрытый админ/участник не раскрывается через список групп своего профиля
    const viewerAdminOf = isOwn ? new Set<string>() : await adminGroupIds(memberships.map((m) => m.group_id), requesterId);
    const visible = isOwn ? memberships : memberships.filter((m) => viewerAdminOf.has(m.group_id) || !memberHiddenInGroup(m.group, userId, m.role));
    const masked = await maskGroupsForViewer(visible.map((m) => m.group), requesterId);
    const groups = masked.map((g, i) => ({
      ...g,
      badge_level: getGroupBadgeLevel(g.members_count),
      role: visible[i].role,
      is_pinned: visible[i].is_pinned,
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
    if (userId !== currentUserId) {
      const owner = await prisma.user.findUnique({ where: { id: userId }, select: { groups_visibility: true } });
      if (!owner) return [];
      if (!(await isAllowedByPrivacy(owner.groups_visibility, userId, currentUserId))) return [];
    }
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
    return (await maskGroupsForViewer(groups, currentUserId)).map((g) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count) }));
  },

  // ── Group Rating (Reddit-style: -1 / +1 toggle) ───────────────────────────
  async rateGroup(groupId: string, userId: string, value: number) {
    if (value !== 1 && value !== -1) throw httpError('value must be 1 or -1', 400);
    await assertGroupReadable(groupId, userId);
    const group = await prisma.group.findFirst({ where: { id: groupId, deleted_at: null }, select: { owner_id: true } });
    if (!group) throw httpError('Group not found', 404);
    if (group.owner_id === userId) throw httpError('You cannot vote on your own group', 400);

    return prisma.$transaction(async (tx) => {
      // Serialise votes per group so score/count stay consistent with the rows
      await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupId}::uuid FOR UPDATE`;
      const key = { group_id_user_id: { group_id: groupId, user_id: userId } };
      const existing = await tx.groupRating.findUnique({ where: key });
      let finalVote: number = value;
      if (existing && existing.value === value) {
        await tx.groupRating.delete({ where: key }); // toggle off
        finalVote = 0;
      } else if (existing) {
        await tx.groupRating.update({ where: key, data: { value, updated_at: new Date() } });
      } else {
        await tx.groupRating.create({ data: { group_id: groupId, user_id: userId, value } });
      }
      const agg = await tx.groupRating.aggregate({ where: { group_id: groupId }, _sum: { value: true }, _count: true });
      const updated = await tx.group.update({
        where: { id: groupId },
        data: { rating: agg._sum.value ?? 0, rating_count: agg._count },
        select: { rating: true, rating_count: true },
      });
      return { score: updated.rating, voteCount: updated.rating_count, myVote: finalVote };
    });
  },

  async getMyRating(groupId: string, userId: string) {
    const r = await prisma.groupRating.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return r?.value ?? 0;
  },

  // ── Reviews (1..5 stars + text) ────────────────────────────────────────────
  async listReviews(groupId: string, page = 1, limit = 20) {
    const [reviews, agg] = await Promise.all([
      prisma.groupReview.findMany({
        where: { group_id: groupId },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
        orderBy: { created_at: 'desc' },
        skip: (Math.max(1, page) - 1) * limit,
        take: limit,
      }),
      prisma.groupReview.aggregate({ where: { group_id: groupId }, _avg: { rating: true }, _count: true }),
    ]);
    return {
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, text: r.text, created_at: r.created_at, author: r.user })),
      average: agg._avg.rating ?? 0,
      total: agg._count,
    };
  },

  /** Почему пользователь не может оставить отзыв (null — может). В группах с заказами отзыв — только по итогам сделки: заказ выполнен или закрыт. */
  async reviewBlock(groupId: string, userId: string): Promise<{ status: number; message: string } | null> {
    const group = await prisma.group.findFirst({ where: { id: groupId, deleted_at: null }, select: { owner_id: true, type: true } });
    if (!group) return { status: 404, message: 'Group not found' };
    if (group.owner_id === userId) return { status: 400, message: 'Нельзя оставить отзыв на свою группу' };
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      select: { user_id: true },
    });
    if (!member) return { status: 403, message: 'Отзывы могут оставлять только участники группы' };
    if (group.type === 'creative' || group.type === 'shop') {
      const deal = await prisma.order.findFirst({
        where: { group_id: groupId, customer_id: userId, OR: [{ status: 'FINISHED' }, { deleted_at: { not: null } }] },
        select: { id: true },
      });
      if (!deal) return { status: 403, message: 'Отзыв можно оставить только после выполненного или закрытого заказа' };
    }
    return null;
  },

  async canReview(groupId: string, userId: string) {
    const block = await groupService.reviewBlock(groupId, userId);
    return { canReview: !block, reason: block?.message ?? null };
  },

  async upsertReview(groupId: string, userId: string, rating: number, text: string) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError('Оценка — от 1 до 5', 400);
    const clean = sanitizeDisplayText(text ?? '', 2000);
    if (!clean) throw httpError('Напишите текст отзыва', 400);
    if (containsToxicLanguage(clean)) throw httpError('Отзыв содержит недопустимый контент', 400);
    const block = await groupService.reviewBlock(groupId, userId);
    if (block) throw httpError(block.message, block.status);
    return prisma.groupReview.upsert({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      update: { rating, text: clean },
      create: { group_id: groupId, user_id: userId, rating, text: clean },
    });
  },

  async deleteReview(groupId: string, reviewId: string, actorId: string) {
    const review = await prisma.groupReview.findFirst({ where: { id: reviewId, group_id: groupId } });
    if (!review) throw httpError('Review not found', 404);
    if (review.user_id !== actorId && !(await groupService.isAtLeastModerator(groupId, actorId))) {
      throw httpError('Not authorized', 403);
    }
    await prisma.groupReview.delete({ where: { id: reviewId } });
    return { deleted: true };
  },

  // ── News digest / categories (derived from the group's own posts) ──────────
  async getDigest(groupId: string, viewerId: string | null, limit = 10) {
    const hasSubscriberAccess = viewerId ? await groupService.hasSubscriberAccess(groupId, viewerId) : false;
    const rows = await prisma.groupPost.findMany({
      where: {
        group_id: groupId,
        post: { deleted_at: null, is_archived: false, ...(hasSubscriberAccess ? {} : { subscriber_only: false }) },
      },
      select: { post: { select: { id: true, title: true, content: true, category: true, media_urls: true, created_at: true } } },
      orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
      take: limit,
    });
    return rows.map(({ post }) => ({
      id: post.id,
      title: post.title?.trim() || post.content.trim().split('\n')[0].slice(0, 120),
      category: post.category,
      image: post.media_urls[0] ?? null,
      created_at: post.created_at,
    }));
  },

  async getCategories(groupId: string) {
    const grouped = await prisma.post.groupBy({
      by: ['category'],
      where: { deleted_at: null, is_archived: false, subscriber_only: false, category: { not: null }, groupPosts: { some: { group_id: groupId } } },
      _count: true,
      orderBy: { _count: { category: 'desc' } },
    });
    return grouped.filter((g) => g.category).map((g) => ({ name: g.category as string, post_count: g._count }));
  },

  // ── Create post in group ──────────────────────────────────────────────────
  async createGroupPost(groupId: string, userId: string, input: { content: string; title?: string; postType?: string; isNsfw?: boolean; isAiGenerated?: boolean; isAnnouncement?: boolean; mediaUrls?: string[]; mediaOriginalUrls?: string[]; tags?: string[]; visibility?: string; category?: string; listingId?: string | null }) {
    if (!(await groupService.canPost(groupId, userId))) {
      throw httpError('You are not allowed to post in this group', 403);
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
          .map(normalizeTag)
          .filter(Boolean),
      ),
    );

    // Прикреплённый лот Dealers' Den (карточка внизу поста «Обновление заказа»)
    const listingId = input.listingId || null;
    if (listingId) await assertListingAttachable(prisma, listingId, groupId);

    return prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          content,
          author_id: userId,
          listing_id: listingId,
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
          _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
          groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
          listing: POST_LISTING_INCLUDE,
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
            receiverId:    s.user_id,
            senderId:      userId,
            senderGroupId: groupId,
            type:          'GROUP_POST',
            postId:        created!.id,
            refId:         groupId,
          }).catch(() => {})
        ),
      );
      return created ? withPublicListing(created) : created;
    });
  },

  // ── RSVP ──────────────────────────────────────────────────────────────────
  async rsvpEvent(eventId: string, userId: string, status: 'going' | 'maybe' | 'not_going') {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { group_id: true } });
    if (!event) throw accessError('Event not found', 404);
    await assertGroupReadable(event.group_id, userId);
    return prisma.$transaction(async (tx) => {
      // Блокируем событие: два параллельных «иду» раньше оба читали старый статус и оба прибавляли +1
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`;
      const prev = await tx.eventAttendee.findUnique({
        where: { event_id_user_id: { event_id: eventId, user_id: userId } },
        select: { status: true },
      });
      const wasCountable = prev && (prev.status === 'going' || prev.status === 'maybe');
      const isCountable  = status === 'going' || status === 'maybe';
      const delta = (isCountable ? 1 : 0) - (wasCountable ? 1 : 0);

      const attendee = await tx.eventAttendee.upsert({
        where: { event_id_user_id: { event_id: eventId, user_id: userId } },
        update: { status, confirmed_at: new Date() },
        create: { event_id: eventId, user_id: userId, status },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      });
      if (delta !== 0) {
        await tx.event.update({ where: { id: eventId }, data: { attendee_count: { increment: delta } } });
      }
      return attendee;
    });
  },

  async cancelRsvp(eventId: string, userId: string) {
    // Same row lock as rsvpEvent: two parallel cancels must not both decrement attendee_count.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId}::uuid FOR UPDATE`;
      const prev = await tx.eventAttendee.findUnique({
        where: { event_id_user_id: { event_id: eventId, user_id: userId } },
        select: { status: true },
      });
      if (!prev) return;
      await tx.eventAttendee.delete({
        where: { event_id_user_id: { event_id: eventId, user_id: userId } },
      });
      if (prev.status === 'going' || prev.status === 'maybe') {
        await tx.event.update({ where: { id: eventId }, data: { attendee_count: { decrement: 1 } } });
      }
    });
  },

  async getEventAttendees(eventId: string, page = 1, limit = 50, viewerId?: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { group_id: true } });
    if (!event) throw accessError('Event not found', 404);
    await assertGroupReadable(event.group_id, viewerId);
    const bounds = pagination(page, limit, 50, 100);
    page = bounds.page; limit = bounds.limit;
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
  async listSubEvents(eventId: string, viewerId?: string) {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { group_id: true } });
    if (!event) throw accessError('Event not found', 404);
    await assertGroupReadable(event.group_id, viewerId);
    return prisma.subEvent.findMany({
      where: { event_id: eventId },
      orderBy: { starts_at: 'asc' },
    });
  },

  async createSubEvent(eventId: string, input: SubEventInput) {
    const title = sanitizeDisplayText(input.title ?? '', 200);
    if (!title) throw httpError('Sub-event title is required', 400);
    assertEventWindow(input.startsAt, input.endsAt);
    return prisma.subEvent.create({
      data: {
        event_id: eventId,
        title,
        type: input.type ?? 'panel',
        speaker: input.speaker,
        location_name: input.locationName,
        starts_at: new Date(input.startsAt),
        ends_at: new Date(input.endsAt),
        description: input.description,
      },
    });
  },

  async updateSubEvent(eventId: string, subEventId: string, input: UpdateSubEventInput) {
    // The sub-event must belong to the event whose group the caller was authorised for
    const current = await prisma.subEvent.findFirst({ where: { id: subEventId, event_id: eventId }, select: { starts_at: true, ends_at: true } });
    if (!current) throw httpError('Sub-event not found', 404);
    const data: Prisma.SubEventUpdateInput = {};
    if (input.startsAt !== undefined || input.endsAt !== undefined) {
      assertEventWindow(input.startsAt ?? current.starts_at, input.endsAt ?? current.ends_at);
    }
    if (input.title !== undefined) {
      const title = sanitizeDisplayText(input.title ?? '', 200);
      if (!title) throw httpError('Sub-event title is required', 400);
      data.title = title;
    }
    if (input.type !== undefined) data.type = input.type;
    if (input.speaker !== undefined) data.speaker = input.speaker;
    if (input.locationName !== undefined) data.location_name = input.locationName;
    if (input.startsAt !== undefined) data.starts_at = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.ends_at = new Date(input.endsAt);
    if (input.description !== undefined) data.description = input.description;
    return prisma.subEvent.update({ where: { id: subEventId, event_id: eventId }, data });
  },

  async deleteSubEvent(eventId: string, subEventId: string) {
    const removed = await prisma.subEvent.deleteMany({ where: { id: subEventId, event_id: eventId } });
    if (removed.count === 0) throw httpError('Sub-event not found', 404);
    return { deleted: true };
  },

  // ── Group Messages ─────────────────────────────────────────────────────────
  /** Чат группы видят и пишут только её участники (is_public на чат не влияет). */
  async assertGroupMember(groupId: string, userId: string) {
    const member = await prisma.groupMember.findFirst({
      where: { group_id: groupId, user_id: userId, group: { deleted_at: null } },
      select: { role: true },
    });
    if (!member) throw Object.assign(new Error('Чат доступен только участникам группы'), { statusCode: 403 });
  },

  async getGroupMessages(groupId: string, before?: string, limit = 50) {
    const where: Prisma.GroupMessageWhereInput = { group_id: groupId, deleted_at: null };
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
    if (text.length > 4000) throw Object.assign(new Error('Text too long'), { statusCode: 400 });
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
    const parsed = parseSearchQuery(q);
    if (!parsed.terms.length) return [];
    const skip = (Math.max(1, page) - 1) * limit;
    const overfetch = Math.min(200, Math.max((skip + limit) * 5, limit * 5));

    let fuzzyIds: string[] = [];
    if (parsed.phrase.length >= 3 && (await trigramAvailable())) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM "Group"
        WHERE deleted_at IS NULL AND is_public = true AND similarity(name, ${parsed.phrase}) >= 0.35
        ORDER BY similarity(name, ${parsed.phrase}) DESC
        LIMIT 30
      `.catch(() => []);
      fuzzyIds = rows.map((r) => r.id);
    }

    const candidates = await prisma.group.findMany({
      where: {
        deleted_at: null,
        is_public: true,
        OR: [
          {
            AND: parsed.terms.map((t) => ({
              OR: [t.text, ...t.variants].flatMap((w) => [
                { name: { contains: w, mode: 'insensitive' as const } },
                { slug: { contains: w, mode: 'insensitive' as const } },
              ]),
            })),
          },
          ...(fuzzyIds.length ? [{ id: { in: fuzzyIds } }] : []),
        ],
      },
      select: { id: true, name: true, slug: true, avatar_url: true, type: true, members_count: true, is_verified: true },
      orderBy: [{ is_verified: 'desc' }, { members_count: 'desc' }],
      take: overfetch,
    });

    const fuzzySet = new Set(fuzzyIds);
    const scored = candidates.map((g) => {
      let score = 0;
      for (const t of parsed.terms) {
        let best = 0;
        for (const w of [t.text, ...t.variants]) best = Math.max(best, textScore(g.name, w), textScore(g.slug, w) * 0.8);
        score += best;
      }
      if (score === 0 && fuzzySet.has(g.id)) score = 3;
      score += (g.is_verified ? 2 : 0) + Math.log1p(Math.max(0, g.members_count ?? 0)) * 0.4;
      return { g, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(skip, skip + limit).map((x) => x.g);
  },

  // ── Discover ──────────────────────────────────────────────────────────────
  async discoverGroups(userId: string | null, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: Prisma.GroupWhereInput = { deleted_at: null, is_public: true };
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
    return { groups: await maskGroupsForViewer(groups, userId), total };
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
      prisma.group.update({ where: { id: groupId }, data: { todo_columns: clean } }),
      prisma.groupTodoItem.updateMany({
        where: { group_id: groupId, deleted_at: null, status: { notIn: validKeys } },
        data: { status: fallbackKey },
      }),
    ]);
    return clean;
  },

  async getTodoItems(groupId: string, viewerId?: string) {
    // Очередь видна всем, у кого есть доступ к группе, а оплата и ход работы — только персоналу и самому заказчику
    const isStaff = viewerId ? await groupService.isOwnerOrAdmin(groupId, viewerId) : false;
    const items = await prisma.groupTodoItem.findMany({
      where: { group_id: groupId, deleted_at: null },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      include: {
        order: { select: { id: true, deadline_at: true, started_at: true, payment_status: true, escrow_status: true, customer_id: true, customer: { select: ORDER_CUSTOMER_SELECT } } },
      },
    });
    const canSee = (i: (typeof items)[number]) => !!i.order && (isStaff || i.order.customer_id === viewerId);
    // Блок прогресса в карточке заказа: сколько этапов выложено и что последнее (полная лента — по запросу)
    const orderIds = items.filter(canSee).map(i => i.order_id).filter((id): id is string => !!id);
    const entries = orderIds.length
      ? await prisma.orderProgress.findMany({
        where: { order_id: { in: orderIds }, deleted_at: null },
        orderBy: { created_at: 'desc' },
        select: { id: true, order_id: true, stage: true, text: true, image_urls: true, created_at: true },
      })
      : [];
    const byOrder = new Map<string, typeof entries>();
    for (const e of entries) byOrder.set(e.order_id, [...(byOrder.get(e.order_id) ?? []), e]);
    return items.map(i => {
      if (!i.order) return { ...i, progress: null };
      const { payment_status, escrow_status, customer_id: _c, ...publicOrder } = i.order;
      if (!canSee(i)) return { ...i, order: publicOrder, progress: null };
      const list = byOrder.get(i.order.id) ?? [];
      return { ...i, order: { ...publicOrder, payment_status, escrow_status }, progress: { count: list.length, latest: list[0] ?? null } };
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
    const cols = await groupService.getTodoColumns(groupId);
    const status = data.status ?? cols[0]?.key ?? 'WAITING';
    if (!cols.some((c) => c.key === status)) throw Object.assign(new Error('Unknown todo column'), { statusCode: 400 });
    return prisma.groupTodoItem.create({
      data: {
        group_id: groupId,
        title: sanitizeDisplayText(data.title ?? '', 200),
        description: data.description?.trim() || null,
        status,
        position: data.position,
      },
    });
  },

  async updateTodoItem(groupId: string, itemId: string, data: { title?: string; description?: string; status?: string; position?: number }, actorId?: string) {
    // Пункт ищем только внутри своей группы: владелец группы A не должен править пункты группы B
    const owned = await prisma.groupTodoItem.findFirst({ where: { id: itemId, group_id: groupId, deleted_at: null }, select: { id: true, status: true, order_id: true } });
    if (!owned) throw Object.assign(new Error('Todo item not found'), { statusCode: 404 });

    // Пункт заказа: смена колонки = смена этапа заказа (сам заказ синхронизирует пункт и пишет заказчику)
    if (owned.order_id && data.status && data.status !== owned.status && (ORDER_STAGES as readonly string[]).includes(data.status) && actorId) {
      await groupService.updateOrderStatus(owned.order_id, actorId, data.status as OrderStatus);
    }
    const update: Prisma.GroupTodoItemUpdateInput = {};
    if (data.title !== undefined) {
      const title = sanitizeDisplayText(data.title ?? '', 200);
      if (!title) throw httpError('Title is required', 400);
      update.title = title;
    }
    if (data.description !== undefined) update.description = data.description?.trim() || null;
    if (data.status !== undefined) {
      const cols = await groupService.getTodoColumns(groupId);
      if (!cols.some((c) => c.key === data.status)) throw Object.assign(new Error('Unknown todo column'), { statusCode: 400 });
      update.status = data.status;
    }
    if (data.position !== undefined) update.position = data.position;
    return prisma.groupTodoItem.update({ where: { id: itemId }, data: update });
  },

  async deleteTodoItem(groupId: string, itemId: string) {
    // Пункт заказа нельзя удалить отдельно: иначе заказ и очередь разойдутся. Удаление заказа убирает пункт само.
    const linked = await prisma.groupTodoItem.findFirst({ where: { id: itemId, group_id: groupId, order_id: { not: null }, deleted_at: null }, select: { id: true } });
    if (linked) throw Object.assign(new Error('Пункт связан с заказом — его можно убрать только удалив заказ'), { statusCode: 400 });
    const result = await prisma.groupTodoItem.updateMany({
      where: { id: itemId, group_id: groupId, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (result.count === 0) throw Object.assign(new Error('Todo item not found'), { statusCode: 404 });
    return { id: itemId };
  },

  async reorderTodoItems(groupId: string, orderedIds: string[]) {
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
      throw httpError('orderedIds must be a list of ids', 400);
    }
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.groupTodoItem.updateMany({
          where: { id, group_id: groupId, deleted_at: null },
          data: { position: idx },
        })
      )
    );
  },

  // ── Orders (Business tab) ──────────────────────────────────────────────────
  async getOrders(groupId: string, requesterId: string) {
    const isAdmin = await groupService.isOwnerOrAdmin(groupId, requesterId);
    const orders = await prisma.order.findMany({
      where: {
        group_id: groupId,
        deleted_at: null,
        ...(isAdmin ? {} : { customer_id: requesterId }),
      },
      include: { customer: { select: ORDER_CUSTOMER_SELECT } },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
    });
    // Персонажи заказа (из принятой заявки) достраиваем актуальными профилями и референсами
    return Promise.all(orders.map(enrichOrder));
  },

  /** Страница заказа: видят персонал группы и сам заказчик (даже если он не участник группы). */
  async getOrderDetail(groupId: string, orderId: string, requesterId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, group_id: groupId, deleted_at: null },
      include: { customer: { select: ORDER_CUSTOMER_SELECT } },
    });
    if (!order) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    const isStaff = await groupService.isOwnerOrAdmin(groupId, requesterId);
    if (!isStaff && order.customer_id !== requesterId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });

    const fd = (order.form_data ?? {}) as { source?: string; listingId?: string; applicationId?: string; characters?: unknown; references?: string[] };
    const [group, listing, application, characters] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, select: { id: true, slug: true, name: true, avatar_url: true } }),
      fd.listingId
        ? prisma.dealerListing.findFirst({
          where: { id: fd.listingId },
          select: { id: true, title: true, price: true, currency: true, discount_percent: true, images: true, is_nsfw: true, status: true },
        })
        : null,
      fd.applicationId
        ? prisma.listingApplication.findUnique({ where: { id: fd.applicationId }, select: { message: true, created_at: true } })
        : null,
      resolveCharacters(fd.characters),
    ]);
    const progress = await groupService.listOrderProgress(orderId);
    const { form_data: _fd, ...rest } = order;
    return {
      ...rest,
      group,
      listing,
      application,
      progress,
      characters,
      references: Array.isArray(fd.references) ? fd.references : [],
      fromApplication: fd.source === 'listing_application',
      canManage: isStaff,
    };
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
    if (customerId === group.owner_id) throw Object.assign(new Error('Владелец не может оформить заказ в своей группе'), { statusCode: 400 });
    if (!input.title?.trim()) throw Object.assign(new Error('Title is required'), { statusCode: 400 });

    return prisma.$transaction(async (tx) => {
      const last = await tx.order.findFirst({
        where: { group_id: groupId, deleted_at: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      // Чат по заказу — переписка заказчика с группой (вкладка «Группы»), а не личка с владельцем
      const conversationId = await ensureGroupThread(groupId, customerId, tx);
      const created = await tx.order.create({
        data: {
          group_id: groupId,
          customer_id: customerId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          form_data: (input.formData ?? undefined) as Prisma.InputJsonValue | undefined,
          deadline_at: input.deadlineAt ? new Date(input.deadlineAt) : null,
          position: (last?.position ?? -1) + 1,
          conversation_id: conversationId,
        },
        include: { customer: { select: ORDER_CUSTOMER_SELECT } },
      });
      // Заказ сразу встаёт в очередь работ группы
      await linkOrderToQueue(tx, created);
      return created;
    });
  },

  /**
   * Сообщение заказчику от лица группы о любом изменении заказа: что поменялось и текущий этап.
   * Без изменений ничего не отправляем.
   */
  async announceOrderChange(order: { id: string; title: string; status: OrderStatus; conversation_id: string | null; group_id: string }, changes: string[]) {
    if (!changes.length || !order.conversation_id) return;
    const owner = await prisma.group.findUnique({ where: { id: order.group_id }, select: { owner_id: true } });
    // Карточка от лица группы с кнопкой «Подробнее»; текст — запасной вариант для превью и push
    const fallback = [`📝 Заказ «${order.title}» обновлён`, ...changes.map(c => `• ${c}`), `Текущий этап: ${ORDER_STAGE_LABEL[order.status]}`].join('\n');
    await messageService.sendMessage({
      conversationId: order.conversation_id,
      senderId: owner!.owner_id,
      type: 'order_update',
      metadata: { orderId: order.id, groupId: order.group_id, headline: 'Заказ обновлён', title: order.title, changes, stage: order.status },
      content: fallback,
    }).catch(logError('[order] change message'));
  },

  async updateOrderStatus(orderId: string, requesterId: string, status: OrderStatus, deadlineAt?: string | null, opts: { paymentConfirmed?: boolean } = {}) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!(await groupService.isOwnerOrAdmin(order.group_id, requesterId))) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }

    // Работа по оплачиваемому заказу начинается только после подтверждения оплаты художником
    if (!order.started_at && status !== 'WAITING' && ['unpaid', 'reported'].includes(order.payment_status) && !opts.paymentConfirmed) {
      throw Object.assign(new Error('Сначала подтвердите оплату заказа — после этого работа начнётся'), { statusCode: 400 });
    }

    const data: Prisma.OrderUpdateInput = { status };
    if (status === 'WAITING') {
      data.started_at = null;
      data.finished_at = null;
    } else if (!order.started_at) {
      // Старт работы: дедлайн исполнитель ставит сам (или подтверждает пожелание заказчика)
      const deadline = deadlineAt ? new Date(deadlineAt) : order.deadline_at;
      if (!deadline || Number.isNaN(deadline.getTime())) {
        throw Object.assign(new Error('Укажите дедлайн, чтобы начать работу'), { statusCode: 400 });
      }
      if (deadline.getTime() < Date.now() - 60_000) {
        throw Object.assign(new Error('Дедлайн не может быть в прошлом'), { statusCode: 400 });
      }
      data.deadline_at = deadline;
      data.started_at = new Date();
    }
    // Дедлайн можно уточнить и в процессе работы
    if (status !== 'WAITING' && order.started_at && deadlineAt) {
      const d = new Date(deadlineAt);
      if (!Number.isNaN(d.getTime())) data.deadline_at = d;
    }
    if (status === 'FINISHED') data.finished_at = order.finished_at ?? new Date();
    else if (status !== 'WAITING') data.finished_at = null;

    const updated = await prisma.order.update({
      where: { id: orderId },
      data,
      include: { customer: { select: ORDER_CUSTOMER_SELECT } },
    });

    const changes: string[] = [];
    if (opts.paymentConfirmed) changes.push('Оплата подтверждена, работа началась');
    if (status !== order.status) changes.push(`Этап: ${ORDER_STAGE_LABEL[order.status]} → ${ORDER_STAGE_LABEL[status]}`);
    if (!order.started_at && data.started_at) changes.push('Взято в работу');
    if (status === 'FINISHED' && order.status !== 'FINISHED' && order.escrow_status === 'held') {
      changes.push('Заказчику: проверьте работу и подтвердите получение — тогда оплата перейдёт художнику');
    }
    if (data.deadline_at && (!order.deadline_at || (data.deadline_at as Date).getTime() !== order.deadline_at.getTime())) {
      changes.push(`Срок: ${formatDay(data.deadline_at as Date)}`);
    }
    await this.announceOrderChange(updated, changes);

    // Заказчик получает уведомление о каждом этапе работы
    if (status !== order.status && status !== 'WAITING') {
      const group = await prisma.group.findUnique({ where: { id: order.group_id }, select: { slug: true } });
      const fd = (order.form_data ?? {}) as { listingId?: string };
      await notificationService.create({
        receiverId: order.customer_id,
        senderId: requesterId,
        senderGroupId: order.group_id,
        type: `den_order_${status.toLowerCase()}`,
        refId: order.id,
        meta: { groupSlug: group?.slug, listingId: fd.listingId, orderId: order.id, orderTitle: order.title },
      });
    }
    // Очередь работ отражает тот же этап
    if (status !== order.status) {
      await prisma.groupTodoItem.updateMany({ where: { order_id: orderId, deleted_at: null }, data: { status } });
    }
    return enrichOrder(updated);
  },

  /**
   * Художник видит оплату и подтверждает начало работы: заказ сразу уходит из «Ожидания» в работу («В процессе»),
   * срок задаётся здесь же. Подтвердить можно и пока заказчик не отметил оплату сам — если деньги пришли иначе.
   */
  async confirmOrderPayment(orderId: string, requesterId: string, deadlineAt?: string | null) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!(await groupService.isOwnerOrAdmin(order.group_id, requesterId))) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }
    if (!['unpaid', 'reported'].includes(order.payment_status)) {
      throw Object.assign(new Error('Оплата по заказу уже подтверждена или счёта нет'), { statusCode: 400 });
    }
    // Старт (со сроком) проверяется внутри: без срока ничего не меняется
    await groupService.updateOrderStatus(orderId, requesterId, order.status === 'WAITING' ? 'SKETCH' : order.status, deadlineAt, { paymentConfirmed: true });
    await prisma.order.update({
      where: { id: orderId },
      data: { payment_status: 'confirmed', payment_confirmed_at: new Date(), paid_reported_at: order.paid_reported_at ?? new Date() },
    });
    if (order.invoice_message_id) {
      await messageService.patchCardMetadata(order.invoice_message_id, { status: 'paid', confirmed: true }).catch(logError('[order] invoice patch'));
    }
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: { select: ORDER_CUSTOMER_SELECT } } });
    return enrichOrder(fresh);
  },

  /** Художник правит заказ: срок, описание и референсы (в том числе добавляет свои). */
  async updateOrder(orderId: string, requesterId: string, input: { deadlineAt?: string | null; description?: string | null; references?: string[] }) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!(await groupService.isOwnerOrAdmin(order.group_id, requesterId))) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }
    const data: Prisma.OrderUpdateInput = {};
    if (input.deadlineAt !== undefined) {
      if (input.deadlineAt === null) {
        if (order.started_at) throw Object.assign(new Error('У заказа в работе должен быть дедлайн'), { statusCode: 400 });
        data.deadline_at = null;
      } else {
        const d = new Date(input.deadlineAt);
        if (Number.isNaN(d.getTime())) throw Object.assign(new Error('Некорректный дедлайн'), { statusCode: 400 });
        data.deadline_at = d;
      }
    }
    if (input.description !== undefined) {
      data.description = input.description ? sanitizeDisplayText(input.description, 2000) || null : null;
    }
    if (input.references !== undefined) {
      if (!Array.isArray(input.references) || input.references.length > 20) {
        throw Object.assign(new Error('Не больше 20 референсов'), { statusCode: 400 });
      }
      const current = new Set(((order.form_data as { references?: string[] } | null)?.references) ?? []);
      for (const url of input.references) if (!current.has(url)) await assertOwnedMedia(url, requesterId);
      data.form_data = { ...((order.form_data as object | null) ?? {}), references: input.references } as Prisma.InputJsonValue;
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data, include: { customer: { select: ORDER_CUSTOMER_SELECT } } });

    const changes: string[] = [];
    if (data.deadline_at !== undefined) {
      const before = order.deadline_at?.getTime() ?? null;
      const after = (data.deadline_at as Date | null)?.getTime() ?? null;
      if (before !== after) changes.push(after ? `Срок: ${formatDay(new Date(after))}` : 'Срок снят');
    }
    if (data.description !== undefined && (order.description ?? null) !== (updated.description ?? null)) {
      changes.push('Описание изменено');
    }
    if (input.references !== undefined) {
      const before = new Set(((order.form_data as { references?: string[] } | null)?.references) ?? []);
      const after = new Set(input.references);
      const added = [...after].filter(u => !before.has(u)).length;
      const removed = [...before].filter(u => !after.has(u)).length;
      if (added) changes.push(`Добавлено референсов: ${added}`);
      if (removed) changes.push(`Убрано референсов: ${removed}`);
    }
    await this.announceOrderChange(updated, changes);
    return enrichOrder(updated);
  },

  async deleteOrder(orderId: string, requesterId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.deleted_at) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    if (!(await groupService.isOwnerOrAdmin(order.group_id, requesterId))) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }
    // Удалённый заказ уходит и из очереди работ; удержанные деньги возвращаются заказчику в той же транзакции —
    // иначе они навсегда останутся «в удержании» у несуществующего заказа
    const refunded = await prisma.$transaction(async (tx) => {
      let refund = 0;
      if (order.escrow_status === 'held' && order.escrow_blm) {
        const claimed = await tx.order.updateMany({ where: { id: orderId, escrow_status: 'held' }, data: { escrow_status: 'refunded', escrow_released_at: new Date() } });
        if (claimed.count > 0) {
          refund = Number(order.escrow_blm);
          await creditWallet(tx, order.customer_id, refund, { kind: 'order_refund', refId: orderId });
        }
      }
      await tx.groupTodoItem.updateMany({ where: { order_id: orderId, deleted_at: null }, data: { deleted_at: new Date() } });
      await tx.order.update({ where: { id: orderId }, data: { deleted_at: new Date() } });
      return refund;
    });
    if (refunded > 0 && order.conversation_id) {
      const owner = await prisma.group.findUnique({ where: { id: order.group_id }, select: { owner_id: true } });
      await messageService.sendMessage({
        conversationId: order.conversation_id,
        senderId: owner!.owner_id,
        content: `Заказ «${order.title}» отменён — оплата (${refunded} BLM) возвращена на ваш кошелёк`,
      }).catch(logError('[order] refund message'));
    }
    return { ...order, deleted_at: new Date() };
  },

  /**
   * Заказчик подтверждает готовую работу — только теперь удержанная оплата уходит художнику (владельцу группы).
   * Перевод атомарный: статус удержания меняется условным UPDATE, поэтому двойной клик не заплатит дважды.
   */
  async confirmOrderCompletion(orderId: string, requesterId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { group: { select: { owner_id: true, slug: true } } } });
    if (!order || order.deleted_at) throw httpError('Order not found', 404);
    if (order.customer_id !== requesterId) throw httpError('Подтвердить получение может только заказчик', 403);
    if (order.status !== 'FINISHED') throw httpError('Работа ещё не отмечена готовой', 400);
    if (order.escrow_status !== 'held' || !order.escrow_blm) throw httpError('По заказу нет удержанной оплаты', 400);
    const amount = Number(order.escrow_blm);

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: orderId, escrow_status: 'held' }, data: { escrow_status: 'released', escrow_released_at: new Date() } });
      if (claimed.count === 0) throw httpError('Оплата по заказу уже переведена', 400);
      await creditWallet(tx, order.group.owner_id, amount, { kind: 'order_payout', refId: orderId });
    });

    if (order.invoice_message_id) {
      await messageService.patchCardMetadata(order.invoice_message_id, { released: true }).catch(logError('[order] invoice patch'));
    }
    await groupService.announceOrderChange(order, ['Заказчик подтвердил получение работы — оплата переведена художнику']);
    await notificationService.create({
      receiverId: order.group.owner_id,
      senderId: requesterId,
      type: 'den_order_released',
      refId: order.id,
      meta: { groupSlug: order.group.slug, orderId: order.id, orderTitle: order.title, amount },
    });
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: { select: ORDER_CUSTOMER_SELECT } } });
    return enrichOrder(fresh);
  },

  // ── Прогресс заказа: скетчи, WIP и комментарии художника ───────────────────
  async listOrderProgress(orderId: string) {
    return prisma.orderProgress.findMany({
      where: { order_id: orderId, deleted_at: null },
      orderBy: { created_at: 'asc' },
      select: {
        id: true, stage: true, text: true, image_urls: true, created_at: true,
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });
  },

  /** Лента этапов: видят художник (персонал группы) и сам заказчик. */
  async getOrderProgress(groupId: string, orderId: string, requesterId: string) {
    const order = await prisma.order.findFirst({ where: { id: orderId, group_id: groupId, deleted_at: null }, select: { customer_id: true } });
    if (!order) throw httpError('Order not found', 404);
    if (order.customer_id !== requesterId && !(await groupService.isOwnerOrAdmin(groupId, requesterId))) throw httpError('Forbidden', 403);
    return groupService.listOrderProgress(orderId);
  },

  /** Художник выкладывает этап работы; заказчик получает одно уведомление, пока предыдущее не прочитано. */
  async addOrderProgress(groupId: string, orderId: string, requesterId: string, input: { text?: string; imageUrls?: string[]; stage?: string }) {
    const order = await prisma.order.findFirst({ where: { id: orderId, group_id: groupId, deleted_at: null }, include: { group: { select: { slug: true } } } });
    if (!order) throw httpError('Order not found', 404);
    if (!(await groupService.isOwnerOrAdmin(groupId, requesterId))) throw httpError('Admin access required', 403);

    const text = input.text ? sanitizeDisplayText(input.text, 1000) : '';
    const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls.filter((u): u is string => typeof u === 'string' && !!u) : [];
    if (!text && imageUrls.length === 0) throw httpError('Добавьте картинку или комментарий', 400);
    if (imageUrls.length > 6) throw httpError('Не больше 6 картинок в одном этапе', 400);
    for (const url of imageUrls) await assertOwnedMedia(url, requesterId);
    const stage = input.stage && (ORDER_STAGES as readonly string[]).includes(input.stage) ? (input.stage as OrderStatus) : order.status;

    const created = await prisma.orderProgress.create({
      data: { order_id: orderId, author_id: requesterId, stage, text: text || null, image_urls: imageUrls },
      select: {
        id: true, stage: true, text: true, image_urls: true, created_at: true,
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });
    await notificationService.create({
      receiverId: order.customer_id,
      senderId: requesterId,
      senderGroupId: groupId,
      type: 'den_order_progress',
      refId: order.id,
      meta: { groupSlug: order.group.slug, orderId: order.id, orderTitle: order.title },
    });
    return created;
  },

  async deleteOrderProgress(groupId: string, orderId: string, progressId: string, requesterId: string) {
    if (!(await groupService.isOwnerOrAdmin(groupId, requesterId))) throw httpError('Admin access required', 403);
    const result = await prisma.orderProgress.updateMany({
      where: { id: progressId, order_id: orderId, deleted_at: null, order: { group_id: groupId } },
      data: { deleted_at: new Date() },
    });
    if (result.count === 0) throw httpError('Progress entry not found', 404);
    return { id: progressId };
  },

  /**
   * Реальная скорость работы: среднее время от старта до «Готово» по завершённым заказам.
   * Показывается только после MIN_COMPLETION_SAMPLE работ и пересчитывается с каждой новой готовой.
   */
  async getCompletionStats(groupId: string) {
    const finished = await prisma.order.findMany({
      where: { group_id: groupId, deleted_at: null, status: 'FINISHED', started_at: { not: null }, finished_at: { not: null } },
      select: { started_at: true, finished_at: true, deadline_at: true },
      orderBy: { finished_at: 'desc' },
      take: 200,
    });
    const count = finished.length;
    if (count < MIN_COMPLETION_SAMPLE) return { count, required: MIN_COMPLETION_SAMPLE, avgDays: null, onTimePercent: null };
    const durations = finished.map(o => Math.max(0, o.finished_at!.getTime() - o.started_at!.getTime()));
    const avgMs = durations.reduce((a, b) => a + b, 0) / count;
    const withDeadline = finished.filter(o => o.deadline_at);
    const onTime = withDeadline.filter(o => o.finished_at!.getTime() <= o.deadline_at!.getTime()).length;
    return {
      count,
      required: MIN_COMPLETION_SAMPLE,
      avgDays: Math.round((avgMs / 86_400_000) * 10) / 10,
      onTimePercent: withDeadline.length ? Math.round((onTime / withDeadline.length) * 100) : null,
    };
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
    return { postsCount, messagesCount, ordersByStatus, completion: await groupService.getCompletionStats(groupId) };
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

    // Debit + credit + ledger entry all happen inside one interactive transaction so a
    // failure partway through can't debit the wallet without crediting the group (or
    // vice versa). The WHERE clause on the debit re-checks the balance at update time,
    // so two concurrent donations can't both pass a stale check and drive the wallet negative.
    return prisma.$transaction(async (tx) => {
      await debitWallet(tx, userId, clean, { kind: 'group_donation', refId: groupId }, 'Insufficient wallet balance');

      const updatedGroup = await tx.group.update({ where: { id: groupId }, data: { balance: { increment: clean } } });
      const transaction = await tx.groupTransaction.create({
        data: { group_id: groupId, user_id: userId, type: 'DONATION', amount: clean, message: message?.trim().slice(0, 280) || null },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      });
      return { balance: updatedGroup.balance, transaction };
    });
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
    return { groups: (await maskGroupsForViewer(groups, null)).map((g) => ({ ...g, badge_level: getGroupBadgeLevel(g.members_count) })), total };
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
