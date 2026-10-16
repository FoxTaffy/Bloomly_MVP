import prisma from '../../config/prisma.js';
import { deleteFileByUrl, isTrustedMediaUrl, assertOwnedMedia } from '../media/service.js';
import { getUserBadgeLevel } from '../../lib/badges.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { isBlockedBy, getBlockerIds } from '../../lib/blocks.js';
import { sanitizeFields, sanitizeDisplayText } from '../../lib/sanitizeText.js';
import { normalizeSafeLink, requireSafeLink } from '../../lib/safeLink.js';
import sharp from 'sharp';
import { freeDeletedUsername } from '../auth/unverifiedRelease.js';
import type { UpdateUserInput, UpsertFursonaInput, UpsertFursuitInput, UpsertReferenceImageInput } from './types.js';

const MUSIC_MAX_BYTES = 15 * 1024 * 1024;

// Соцсети профиля: значение со схемой (https:, javascript:, data:) проходит только безопасную проверку;
// голые ники (например Discord) остаются текстом. Фронтенд решает, делать ли из них ссылку.
function cleanSocialLinks(links: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(links)) {
    if (typeof value !== 'string') continue;
    const text = value.trim().slice(0, 500);
    if (!text) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
      const safe = normalizeSafeLink(text);
      if (!safe) throw Object.assign(new Error(`Недопустимая ссылка: ${key}`), { statusCode: 400 });
      out[key] = safe;
    } else {
      out[key] = text;
    }
  }
  return out;
}

// Sentinel year used to carry a day+month without revealing the real year.
// Must be a leap year so Feb 29 birthdays don't overflow into March.
const MONTH_DAY_SENTINEL_YEAR = 2000;

/** Best-effort card brand detection from the BIN prefix — cosmetic only, no real PSP behind this. */
function detectCardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01])/.test(digits)) return 'mastercard';
  if (/^220[0-4]/.test(digits)) return 'mir';
  return 'card';
}

/** Which card networks are usable per payment region (mirrors frontend/src/lib/paymentRegions.ts). */
const REGION_ALLOWED_BRANDS: Record<string, string[]> = {
  RU:     ['mir'],
  US:     ['visa', 'mastercard'],
  EU:     ['visa', 'mastercard'],
  CN:     ['visa', 'mastercard'],
  IN:     ['visa', 'mastercard'],
  BR:     ['visa', 'mastercard'],
  GLOBAL: ['visa', 'mastercard', 'mir'],
};

const CARD_BRAND_LABELS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', mir: 'МИР', card: 'эта карта' };

/** Null out a profile status bubble once its expiresAt timestamp has passed. */
function liveProfileStatus(status: unknown): unknown {
  const s = status as { expiresAt?: number } | null;
  if (!s || typeof s !== 'object') return null;
  if (s.expiresAt && s.expiresAt < Date.now()) return null;
  return s;
}

/** Reduce a birth_date down to whatever granularity its owner allows non-owners to see. */
/** Публичная карточка пользователя из списков (поиск, рекомендации): дата рождения — по настройке владельца */
export function withRedactedBirthDate<T extends { birth_date?: Date | null; birth_date_visibility?: string | null }>(user: T) {
  const { birth_date_visibility, ...rest } = user;
  return { ...rest, birth_date: redactBirthDate(user.birth_date ?? null, birth_date_visibility) };
}

export function redactBirthDate(birthDate: Date | null, visibility: string | null | undefined): Date | null {
  if (!birthDate) return null;
  switch (visibility) {
    case 'full':
      return birthDate;
    case 'month_day':
      return new Date(Date.UTC(MONTH_DAY_SENTINEL_YEAR, birthDate.getUTCMonth(), birthDate.getUTCDate()));
    case 'year':
      return new Date(Date.UTC(birthDate.getUTCFullYear(), 0, 1));
    case 'hidden':
    default:
      return null;
  }
}

// Fields exposed in public profile responses (never email, password, role)
const PUBLIC_SELECT = {
  id:              true,
  username:        true,
  display_name:    true,
  bio:             true,
  avatar_url:      true,
  avatar_video_url: true,
  banner_url:      true,
  status:          true,
  profile_status:  true,
  persona:         true,
  likes:           true,
  dislikes:        true,
  accent_color:    true,
  created_at:      true,
  badge_type:      true,
  website:         true,
  location:        true,
  pronouns:        true,
  job_title:            true,
  relationship_status:  true,
  relationship_with:    true,
  country:              true,
  fursona_name:         true,
  fursona_color:        true,
  fursona_gender:       true,
  fursona_description:  true,
  fursona_photo_url:    true,
  has_fursuit:          true,
  fursuit_photo_url:    true,
  fursuit_description:  true,
  fursuit_maker:        true,
  birth_date:           true,
  birth_date_visibility: true,
  relationship_since:   true,
  pinned_post_id:       true,
  role:                 true,
  social_links:         true,
  interests:            true,
  fav_food:             true,
  fav_animal:           true,
  fav_music:            true,
  fav_artist:           true,
  fav_film:             true,
  subscription_tier:    true,
  profile_theme:        true,
  profile_bg_url:       true,
  profile_frame:        true,
  profile_frame_id:     true,
  equippedFrame:        { select: { id: true, image_url: true, name: true } },
  is_verified:          true,
  is_sponsor:           true,
  verified_at:          true,
  verification_type:    true,
  deceased_at:          true,
  frozen_at:            true,
  artist_since:         true,
  onboarding_done:      true,
  donate_url:           true,
  messages_privacy:         true,
  forward_identity_privacy: true,
  comments_privacy:         true,
  mentions_privacy:         true,
  online_status_visibility: true,
  friends_list_visibility:  true,
  profile_visibility:       true,
  relationship_status_visibility: true,
  groups_visibility:        true,
  groups_pinned_only:       true,
  payment_region:           true,
} as const;

// ── updateUser steps ────────────────────────────────────────────────────────

/** "YYYY-MM-DD" (stored as midnight UTC) or a full ISO string; '' clears the field. */
function parseDateInput(raw: string): Date | null {
  if (!raw) return null;
  return new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
}

/** Strips Zalgo / zero-width / bidi-override tricks from the free-text profile fields. */
function sanitizeProfileText(d: Record<string, any>) {
  sanitizeFields(d, {
    display_name: 50, bio: 300, status: 100, website: 200, location: 100, pronouns: 30,
    job_title: 80, relationship_status: 50, country: 80,
    fursona_name: 80, fursona_color: 50, fursona_gender: 50,
    fav_food: 80, fav_animal: 80, fav_music: 80, fav_artist: 80, fav_film: 80,
  });
  const status = d.profile_status;
  if (status) {
    if (typeof status.text === 'string') status.text = sanitizeDisplayText(status.text, 60);
    if (status.music) {
      if (typeof status.music.title === 'string') status.music.title = sanitizeDisplayText(status.music.title, 200);
      if (typeof status.music.artist === 'string') status.music.artist = sanitizeDisplayText(status.music.artist, 200);
    }
  }
}

/**
 * New profile media must be the user's own uploads (only changed fields are checked, so saving
 * a profile never breaks on files already set). A replaced avatar (+ its animated WebM) or
 * banner is archived to the history gallery; the old files stay in storage for it.
 */
async function archiveReplacedMedia(id: string, d: Record<string, any>) {
  const current = await prisma.user.findUnique({
    where: { id, deleted_at: null },
    select: { avatar_url: true, avatar_video_url: true, banner_url: true, profile_bg_url: true },
  });
  for (const field of ['avatar_url', 'avatar_video_url', 'banner_url', 'profile_bg_url'] as const) {
    const next = d[field];
    if (typeof next === 'string' && next && next !== current?.[field]) await assertOwnedMedia(next, id);
  }
  if (!current) return;

  const changed = (field: 'avatar_url' | 'banner_url') =>
    typeof d[field] === 'string' && d[field] && d[field] !== current[field] && current[field];
  const historyEntries: { user_id: string; type: string; url: string; video_url?: string | null }[] = [];
  if (changed('avatar_url')) historyEntries.push({ user_id: id, type: 'avatar', url: current.avatar_url!, video_url: current.avatar_video_url });
  if (changed('banner_url')) historyEntries.push({ user_id: id, type: 'banner', url: current.banner_url! });
  if (historyEntries.length > 0) await prisma.mediaHistory.createMany({ data: historyEntries });
}

/**
 * Profile customization limits. Theme needs Lite+, preset frames and a custom background
 * need Pro+ — but clearing back to the default is always allowed (e.g. after a downgrade).
 * Image avatar frames come from the Dealers' Den, so equipping one only requires owning it.
 */
async function assertCustomizationAllowed(id: string, d: Record<string, any>) {
  const wantsTheme = typeof d.profile_theme === 'string' && !['', 'default'].includes(d.profile_theme);
  const wantsFrame = typeof d.profile_frame === 'string' && !['', 'none'].includes(d.profile_frame);
  const wantsBg    = typeof d.profile_bg_url === 'string' && d.profile_bg_url !== '';
  if (wantsTheme || wantsFrame || wantsBg) {
    const tierUser = await prisma.user.findUnique({ where: { id, deleted_at: null }, select: { subscription_tier: true } });
    const tier = tierUser?.subscription_tier ?? 'free';
    if (wantsTheme && tier === 'free') throw Object.assign(new Error('LITE_REQUIRED'), { statusCode: 402 });
    if ((wantsFrame || wantsBg) && !['pro', 'business'].includes(tier)) throw Object.assign(new Error('PRO_REQUIRED'), { statusCode: 402 });
  }
  if (d.profile_frame_id !== undefined && d.profile_frame_id !== null) {
    const owns = await prisma.userAvatarFrame.findFirst({
      where: { user_id: id, frame_id: d.profile_frame_id, frame: { deleted_at: null } },
    });
    if (!owns) throw new Error('FRAME_NOT_OWNED');
  }
}

export const usersService = {
  /** Return a public profile, redacting birth_date per the owner's chosen visibility unless the viewer is the owner. */
  async getUserById(id: string, viewerId?: string) {
    // Accept both UUID and username
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const PROFILE_SELECT = {
      select: {
        ...PUBLIC_SELECT,
        _count: { select: { followers: true, following: true, posts: true } },
        wallet: { select: { balance: true } },
        pinnedPost: {
          select: {
            id: true, content: true, media_urls: true, created_at: true, rating: true, is_nsfw: true, category: true,
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            tags: { include: { tag: true } },
            _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
          },
        },
      },
    }
    const raw = isUUID
      ? await prisma.user.findFirst({ where: { id, deleted_at: null }, ...PROFILE_SELECT })
      : await prisma.user.findFirst({ where: { username: id, deleted_at: null }, ...PROFILE_SELECT });

    if (!raw) return null;

    // The frame image lives on AvatarFrame, but positioning is per-owner (UserAvatarFrame) —
    // merge this profile's own calibration in so viewers render it exactly as this user set it.
    if (raw.equippedFrame) {
      const calibration = await prisma.userAvatarFrame.findUnique({
        where: { user_id_frame_id: { user_id: raw.id, frame_id: (raw as any).profile_frame_id } },
        select: { offset_x: true, offset_y: true, scale: true, rotation: true },
      });
      raw.equippedFrame = { ...raw.equippedFrame, ...(calibration ?? { offset_x: 0, offset_y: 0, scale: 1, rotation: 0 }) };
    }

    (raw as any).profile_status = liveProfileStatus((raw as any).profile_status);

    if (viewerId === raw.id) {
      return { ...raw, badge_level: getUserBadgeLevel(raw.artist_since) };
    }

    // Wallet balance is private financial data — never expose it to anyone but the owner.
    const { wallet: _wallet, ...rawWithoutWallet } = raw as any;

    // The profile owner blocked the viewer — they can't see this profile at all.
    if (await isBlockedBy(raw.id, viewerId)) {
      return {
        id: raw.id,
        username: raw.username,
        display_name: raw.display_name,
        avatar_url: raw.avatar_url,
        badge_type: raw.badge_type,
        is_blocked_by_user: true,
      };
    }

    // Whole-profile gate: return only an identity stub if the owner restricts who can view it
    if (!(await isAllowedByPrivacy(raw.profile_visibility, raw.id, viewerId))) {
      return {
        id: raw.id,
        username: raw.username,
        display_name: raw.display_name,
        avatar_url: raw.avatar_url,
        badge_type: raw.badge_type,
        is_private: true,
      };
    }

    // Attach computed badge_level
    const withBadge = { ...rawWithoutWallet, badge_level: getUserBadgeLevel(raw.artist_since) };

    const result = { ...withBadge, birth_date: redactBirthDate(raw.birth_date, raw.birth_date_visibility) };

    if (!(await isAllowedByPrivacy(raw.relationship_status_visibility, raw.id, viewerId))) {
      return { ...result, relationship_status: null, relationship_with: null };
    }

    return result;
  },

  async updateUser(id: string, data: UpdateUserInput) {
    // Fields are validated/normalised in place before the single update below.
    const d = data as Record<string, any>;
    sanitizeProfileText(d);
    await archiveReplacedMedia(id, d);

    // artist_since: a past date; locked once the profile is verified
    if (typeof d.artist_since === 'string') {
      const since = parseDateInput(d.artist_since);
      if (since && since.getTime() > Date.now()) throw new Error('artist_since cannot be in the future');
      d.artist_since = since;
    }
    if (d.artist_since !== undefined) {
      const user = await prisma.user.findUnique({ where: { id }, select: { is_verified: true } });
      if (user?.is_verified) throw new Error('Verified users cannot change artist_since');
    }

    await assertCustomizationAllowed(id, d);

    if (typeof d.birth_date === 'string') d.birth_date = parseDateInput(d.birth_date);
    if (typeof d.relationship_since === 'string') d.relationship_since = parseDateInput(d.relationship_since);
    if (d.social_links && typeof d.social_links === 'object') d.social_links = cleanSocialLinks(d.social_links);

    return prisma.user.update({
      where: { id, deleted_at: null },
      data: d,
      select: PUBLIC_SELECT,
    });
  },

  async updateUsername(id: string, username: string) {
    const existing = await prisma.user.findFirst({
      where: { username, deleted_at: null, NOT: { id } },
      select: { id: true },
    });
    if (existing) throw new Error('Этот никнейм уже занят');
    return prisma.$transaction(async (tx) => {
      // Ник удалённой записи (в том числе забаненной админом) освобождаем, иначе update упадёт на уникальном индексе
      await freeDeletedUsername(tx, username);
      return tx.user.update({
        where: { id, deleted_at: null },
        data: { username },
        select: { id: true, username: true },
      });
    });
  },

  async getMediaHistory(userId: string, type?: 'avatar' | 'banner', limit = 20) {
    return prisma.mediaHistory.findMany({
      where: { user_id: userId, ...(type ? { type } : {}) },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { id: true, type: true, url: true, video_url: true, created_at: true },
    });
  },

  async deleteAvatarHistoryItem(userId: string, historyId: string) {
    const item = await prisma.mediaHistory.findFirst({
      where: { id: historyId, user_id: userId, type: 'avatar' },
    });
    if (!item) throw Object.assign(new Error('History item not found'), { statusCode: 404 });

    await prisma.mediaHistory.delete({ where: { id: historyId } });
    deleteFileByUrl(item.url, userId).catch(() => {});
    if (item.video_url) deleteFileByUrl(item.video_url, userId).catch(() => {});
  },

  async restoreAvatarFromHistory(userId: string, historyId: string) {
    const item = await prisma.mediaHistory.findFirst({
      where: { id: historyId, user_id: userId, type: 'avatar' },
    });
    if (!item) throw Object.assign(new Error('History item not found'), { statusCode: 404 });

    const user = await prisma.user.findUnique({
      where: { id: userId, deleted_at: null },
      select: { avatar_url: true, avatar_video_url: true },
    });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    await prisma.$transaction(async (tx) => {
      // Archive current avatar (+ its WebM, if any) into history (keep files in MinIO)
      if (user.avatar_url && user.avatar_url !== item.url) {
        await tx.mediaHistory.create({
          data: { user_id: userId, type: 'avatar', url: user.avatar_url, video_url: user.avatar_video_url },
        });
      }
      // Promote historical avatar (+ its WebM, if any) to current
      await tx.user.update({
        where: { id: userId },
        data: { avatar_url: item.url, avatar_video_url: item.video_url },
      });
      // Remove from history since it's now the current avatar
      await tx.mediaHistory.delete({ where: { id: historyId } });
    });

    return prisma.user.findUnique({
      where: { id: userId },
      select: { avatar_url: true, avatar_video_url: true },
    });
  },

  async pinPost(userId: string, postId: string) {
    // Verify the post belongs to the user
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null }, select: { author_id: true } });
    if (!post) throw new Error('Post not found');
    if (post.author_id !== userId) throw new Error('Can only pin your own posts');
    return prisma.user.update({
      where: { id: userId },
      data: { pinned_post_id: postId },
      select: { pinned_post_id: true },
    });
  },

  async unpinPost(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { pinned_post_id: null },
      select: { pinned_post_id: true },
    });
  },

  async searchUsers(query: string, limit = 8, page = 1) {
    const q = query.trim();
    if (!q) return [];
    const skip = (Math.max(1, page) - 1) * limit;

    // Priority search (Lite+ perk): paid-tier profiles are ranked above free ones.
    // Prisma can't order by an arbitrary tier-rank expression, so we overfetch a
    // candidate page ordered by recency and re-sort by tier in application code;
    // Array#sort is stable, so ties keep their original (recency) order.
    const overfetch = Math.min(200, Math.max((skip + limit) * 5, limit * 5));
    const candidates = await prisma.user.findMany({
      where: {
        deleted_at: null,
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { display_name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: PUBLIC_SELECT,
      take: overfetch,
      orderBy: { created_at: 'desc' },
    });

    const tierRank: Record<string, number> = { business: 3, pro: 2, lite: 1, free: 0 };
    candidates.sort((a, b) => (tierRank[b.subscription_tier] ?? 0) - (tierRank[a.subscription_tier] ?? 0));

    return candidates.slice(skip, skip + limit);
  },

  async getRecommendedUsers(currentUserId: string, limit = 6) {
    // ── Build excluded set: self + already-following + blocked ───────────
    const [followingRows, blockedIds] = await Promise.all([
      prisma.follow.findMany({ where: { follower_id: currentUserId }, select: { following_id: true } }),
      getBlockerIds(currentUserId), // both directions: users I blocked + users who blocked me
    ]);
    const myFollowingSet = new Set(followingRows.map((r) => r.following_id));
    const excludeIds = new Set<string>([currentUserId, ...myFollowingSet, ...blockedIds]);

    // ── Find my friends (mutual follows = both follow each other) ────────
    const followerRows = await prisma.follow.findMany({
      where: { following_id: currentUserId },
      select: { follower_id: true },
    });
    const myFollowerSet = new Set(followerRows.map((r) => r.follower_id));
    const myFriendIds = Array.from(myFollowingSet).filter((id) => myFollowerSet.has(id));

    // Also include accepted friendship connections
    const friendshipRows = await prisma.friendship.findMany({
      where: { OR: [{ requester_id: currentUserId }, { addressee_id: currentUserId }], status: 'accepted' },
      select: { requester_id: true, addressee_id: true },
    });
    for (const f of friendshipRows) {
      const friendId = f.requester_id === currentUserId ? f.addressee_id : f.requester_id;
      if (!myFriendIds.includes(friendId)) myFriendIds.push(friendId);
    }

    if (myFriendIds.length > 0) {
      // ── Friends-of-friends scoring ──────────────────────────────────
      const friendFollowRows = await prisma.follow.findMany({
        where: {
          OR: [
            { follower_id:  { in: myFriendIds } },
            { following_id: { in: myFriendIds } },
          ],
        },
        select: { follower_id: true, following_id: true },
      });
      const mutualCount = new Map<string, number>();
      for (const row of friendFollowRows) {
        for (const candidateId of [row.follower_id, row.following_id]) {
          if (!excludeIds.has(candidateId)) {
            mutualCount.set(candidateId, (mutualCount.get(candidateId) ?? 0) + 1);
          }
        }
      }
      if (mutualCount.size > 0) {
        const sortedIds = Array.from(mutualCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([id]) => id);
        const users = await prisma.user.findMany({
          where: { id: { in: sortedIds }, deleted_at: null },
          select: PUBLIC_SELECT,
        });
        const sorted = users.sort((a, b) => (mutualCount.get(b.id) ?? 0) - (mutualCount.get(a.id) ?? 0));
        if (sorted.length >= limit) return sorted;
        // fill rest below
        const filled = new Set(sorted.map((u) => u.id));
        filled.forEach((id) => excludeIds.add(id));
        const extras = await prisma.post.findMany({
          where: { deleted_at: null, author: { deleted_at: null }, author_id: { notIn: Array.from(excludeIds) } },
          orderBy: { created_at: 'desc' },
          select: { author: { select: PUBLIC_SELECT } },
          distinct: ['author_id'],
          take: limit - sorted.length,
        });
        return [...sorted, ...extras.map((p) => p.author)];
      }
    }

    // ── Fallback: recently active users ──────────────────────────────────
    const active = await prisma.post.findMany({
      where: { deleted_at: null, author: { deleted_at: null }, author_id: { notIn: Array.from(excludeIds) } },
      orderBy: { created_at: 'desc' },
      select: { author: { select: PUBLIC_SELECT } },
      distinct: ['author_id'],
      take: limit,
    });
    const authors = active.map((p) => p.author);
    if (authors.length >= limit) return authors;
    const existingIds = new Set(authors.map((u) => u.id));
    excludeIds.forEach((id) => existingIds.add(id));
    const extras = await prisma.user.findMany({
      where: { id: { notIn: Array.from(existingIds) }, deleted_at: null },
      select: PUBLIC_SELECT,
      take: limit - authors.length,
      orderBy: { created_at: 'desc' },
    });
    return [...authors, ...extras];
  },

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new Error('Cannot block yourself');
    await prisma.$transaction([
      prisma.block.upsert({
        where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: blockedId } },
        create: { blocker_id: blockerId, blocked_id: blockedId },
        update: {},
      }),
      // A block should sever any existing follow tie in either direction — otherwise the
      // blocked person keeps showing up as a follower/following, and their content only
      // stays hidden through separate feed-level block filters rather than actually undoing
      // the relationship.
      prisma.follow.deleteMany({
        where: {
          OR: [
            { follower_id: blockerId, following_id: blockedId },
            { follower_id: blockedId, following_id: blockerId },
          ],
        },
      }),
    ]);
  },

  async unblockUser(blockerId: string, blockedId: string) {
    await prisma.block.deleteMany({
      where: { blocker_id: blockerId, blocked_id: blockedId },
    });
  },

  async getBlockStatus(viewerId: string, targetId: string) {
    const b = await prisma.block.findUnique({
      where: { blocker_id_blocked_id: { blocker_id: viewerId, blocked_id: targetId } },
    });
    return { blocked: !!b };
  },

  async setPublicKey(userId: string, publicKey: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { public_key: publicKey },
      select: { id: true },
    });
  },

  /**
   * Change subscription tier. Validated allowlist prevents SQL-injection / unexpected values.
   * There is no real payment processor wired up yet, so upgrading to a paid tier is gated on
   * having at least one saved card (`PaymentMethod`) — this is a placeholder barrier, not a
   * real charge, but it closes the trivial "any authenticated user can self-grant `business`
   * with zero card on file" hole. Downgrading to `free` is always allowed.
   * `skipPaymentCheck` is for staff-granted (comped) tiers from the admin panel, which are not purchases.
   */
  async updateSubscriptionTier(userId: string, tier: string, opts: { skipPaymentCheck?: boolean } = {}) {
    const ALLOWED_TIERS = ['free', 'lite', 'pro', 'business'] as const;
    if (!ALLOWED_TIERS.includes(tier as any)) {
      throw Object.assign(new Error(`Invalid tier: ${tier}`), { statusCode: 400 });
    }

    if (tier !== 'free' && !opts.skipPaymentCheck) {
      const hasPaymentMethod = await prisma.paymentMethod.findFirst({
        where: { user_id: userId },
        select: { id: true },
      });
      if (!hasPaymentMethod) {
        throw Object.assign(new Error('PAYMENT_METHOD_REQUIRED'), { statusCode: 402 });
      }
    }

    const [, user] = await prisma.$transaction([
      prisma.subscriptionPlan.updateMany({
        where: { user_id: userId, ends_at: null },
        data: { ends_at: new Date() },
      }),
      prisma.user.update({
        where: { id: userId, deleted_at: null },
        data: { subscription_tier: tier },
        select: { id: true, subscription_tier: true },
      }),
      prisma.subscriptionPlan.create({ data: { user_id: userId, tier } }),
    ]);
    return user;
  },

  /** Aggregated profile analytics (top post, friends growth, totals) — Lite+ subscribers only. */
  async getProfileStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deleted_at: null },
      select: { subscription_tier: true },
    });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (user.subscription_tier === 'free') {
      throw Object.assign(new Error('LITE_REQUIRED'), { statusCode: 402 });
    }

    const [followerRows, followingRows, topPost, postAgg] = await Promise.all([
      prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true, created_at: true } }),
      prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true, created_at: true } }),
      prisma.post.findFirst({
        where: { author_id: userId, deleted_at: null },
        orderBy: { rating: 'desc' },
        select: {
          id: true, content: true, media_urls: true, created_at: true, rating: true, views_count: true, is_nsfw: true, category: true,
          author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          tags: { include: { tag: true } },
          _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        },
      }),
      prisma.post.aggregate({
        where: { author_id: userId, deleted_at: null },
        _sum: { views_count: true },
        _count: { _all: true },
      }),
    ]);

    // Friends = mutual follows; the friendship's "since" date is whichever of the two follows came later.
    const followingSince = new Map(followingRows.map((r) => [r.following_id, r.created_at]));
    const mutualSince: Date[] = [];
    for (const r of followerRows) {
      const otherSide = followingSince.get(r.follower_id);
      if (otherSide) mutualSince.push(r.created_at > otherSide ? r.created_at : otherSide);
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newFriendsCount = mutualSince.filter((d) => d >= thirtyDaysAgo).length;

    return {
      totalFriends: mutualSince.length,
      newFriendsLast30Days: newFriendsCount,
      totalPosts: postAgg._count._all,
      totalViews: postAgg._sum.views_count ?? 0,
      topPost,
    };
  },

  async getPublicKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { public_key: true },
    });
    return user?.public_key ?? null;
  },

  async getNotifyStatus(viewerId: string, targetId: string) {
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: viewerId, following_id: targetId } },
      select: { notify_posts: true },
    });
    return { following: !!follow, notifyPosts: follow?.notify_posts ?? false };
  },

  async toggleNotifyPosts(viewerId: string, targetId: string) {
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: viewerId, following_id: targetId } },
    });
    if (!follow) throw Object.assign(new Error('Not following this user'), { statusCode: 404 });
    const updated = await prisma.follow.update({
      where: { id: follow.id },
      data: { notify_posts: !follow.notify_posts },
    });
    return { notifyPosts: updated.notify_posts };
  },

  /** Soft-delete account and revoke all refresh tokens */
  async deleteAccount(userId: string) {
    const now = new Date();
    await prisma.$transaction([
      // Revoke all refresh tokens
      prisma.refreshToken.updateMany({ where: { user_id: userId, revoked: false }, data: { revoked: true } }),
      // Soft-delete the user
      prisma.user.update({ where: { id: userId }, data: { deleted_at: now } }),
    ]);
  },

  // ── Fursona (1:N per user, up to 10 characters, one marked primary) ─────────

  /** List all of a user's characters. Strips likes/dislikes per-character for non-owners when marked private. */
  async getFursonas(userId: string, viewerId?: string) {
    const fursonas = await prisma.fursona.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      include: {
        referenceImages: {
          where: { deleted_at: null },
          orderBy: { created_at: 'asc' },
          take: 1,
          select: { image_url: true },
        },
      },
    });
    return fursonas.map(({ referenceImages, ...f }) => ({
      ...(!f.likes_dislikes_visible && viewerId !== userId ? { ...f, likes: [], dislikes: [] } : f),
      cover_image_url: referenceImages[0]?.image_url ?? null,
    }));
  },

  /** Create a new character. The first one a user creates becomes primary automatically. */
  async createFursona(userId: string, data: UpsertFursonaInput) {
    sanitizeFields(data as Record<string, any>, { name: 80, species_other: 50 });
    const count = await prisma.fursona.count({ where: { user_id: userId, deleted_at: null } });
    if (count >= 10) {
      throw Object.assign(new Error('You can create up to 10 characters'), { statusCode: 400 });
    }
    const makePrimary = count === 0;
    if (makePrimary) {
      await prisma.fursona.updateMany({ where: { user_id: userId, is_primary: true }, data: { is_primary: false } });
    }
    const created = await prisma.fursona.create({
      data: { user_id: userId, ...data, is_primary: makePrimary },
    });
    return { ...created, cover_image_url: null };
  },

  async updateFursona(userId: string, fursonaId: string, data: UpsertFursonaInput) {
    sanitizeFields(data as Record<string, any>, { name: 80, species_other: 50 });
    const existing = await prisma.fursona.findFirst({
      where: { id: fursonaId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursona not found'), { statusCode: 404 });

    const updated = await prisma.fursona.update({
      where: { id: fursonaId },
      data: { ...data, updated_at: new Date() },
      include: {
        referenceImages: {
          where: { deleted_at: null },
          orderBy: { created_at: 'asc' },
          take: 1,
          select: { image_url: true },
        },
      },
    });
    const { referenceImages, ...f } = updated;
    return { ...f, cover_image_url: referenceImages[0]?.image_url ?? null };
  },

  async deleteFursona(userId: string, fursonaId: string) {
    const existing = await prisma.fursona.findFirst({
      where: { id: fursonaId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursona not found'), { statusCode: 404 });

    await prisma.fursona.update({ where: { id: fursonaId }, data: { deleted_at: new Date() } });

    // Clean up this character's reference images so nothing is orphaned.
    const refs = await prisma.fursonaReferenceImage.findMany({
      where: { fursona_id: fursonaId, deleted_at: null },
      select: { id: true, image_url: true },
    });
    if (refs.length) {
      await prisma.fursonaReferenceImage.updateMany({
        where: { id: { in: refs.map((r) => r.id) } },
        data: { deleted_at: new Date() },
      });
      for (const r of refs) deleteFileByUrl(r.image_url, userId).catch(() => {});
    }

    let newPrimaryId: string | null = null;
    if (existing.is_primary) {
      const next = await prisma.fursona.findFirst({
        where: { user_id: userId, deleted_at: null, NOT: { id: fursonaId } },
        orderBy: { created_at: 'desc' },
      });
      if (next) {
        await prisma.fursona.update({ where: { id: next.id }, data: { is_primary: true } });
        newPrimaryId = next.id;
      }
    }
    return { id: fursonaId, newPrimaryId };
  },

  async setPrimaryFursona(userId: string, fursonaId: string) {
    const existing = await prisma.fursona.findFirst({
      where: { id: fursonaId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursona not found'), { statusCode: 404 });

    await prisma.$transaction([
      prisma.fursona.updateMany({ where: { user_id: userId, is_primary: true }, data: { is_primary: false } }),
      prisma.fursona.update({ where: { id: fursonaId }, data: { is_primary: true } }),
    ]);
    return { id: fursonaId };
  },

  // ── Fursona reference gallery (1:N per Fursona) ──────────────────────────────

  async getReferenceImages(userId: string, fursonaId: string) {
    return prisma.fursonaReferenceImage.findMany({
      where: { fursona_id: fursonaId, user_id: userId, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
  },

  async addReferenceImage(userId: string, fursonaId: string, data: UpsertReferenceImageInput) {
    if (!data.image_url) throw Object.assign(new Error('image_url is required'), { statusCode: 400 });
    await assertOwnedMedia(data.image_url, userId);

    const fursona = await prisma.fursona.findFirst({
      where: { id: fursonaId, user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!fursona) throw Object.assign(new Error('Fursona not found'), { statusCode: 404 });

    const count = await prisma.fursonaReferenceImage.count({ where: { fursona_id: fursonaId, deleted_at: null } });
    if (count >= 12) {
      throw Object.assign(new Error('You can add up to 12 reference images'), { statusCode: 400 });
    }

    return prisma.fursonaReferenceImage.create({
      data: { user_id: userId, fursona_id: fursonaId, ...data, image_url: data.image_url },
    });
  },

  async updateReferenceImage(userId: string, fursonaId: string, refId: string, data: UpsertReferenceImageInput) {
    const existing = await prisma.fursonaReferenceImage.findFirst({
      where: { id: refId, fursona_id: fursonaId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Reference image not found'), { statusCode: 404 });

    if (data.image_url && data.image_url !== existing.image_url) await assertOwnedMedia(data.image_url, userId);
    if (data.image_url !== undefined && existing.image_url && existing.image_url !== data.image_url) {
      await prisma.mediaHistory.create({
        data: { user_id: userId, type: 'fursona_reference', url: existing.image_url },
      });
      deleteFileByUrl(existing.image_url, userId).catch(() => {});
    }

    return prisma.fursonaReferenceImage.update({
      where: { id: refId },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deleteReferenceImage(userId: string, fursonaId: string, refId: string) {
    const existing = await prisma.fursonaReferenceImage.findFirst({
      where: { id: refId, fursona_id: fursonaId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Reference image not found'), { statusCode: 404 });

    await prisma.mediaHistory.create({
      data: { user_id: userId, type: 'fursona_reference', url: existing.image_url },
    });
    deleteFileByUrl(existing.image_url, userId).catch(() => {});

    return prisma.fursonaReferenceImage.update({
      where: { id: refId },
      data: { deleted_at: new Date() },
      select: { id: true },
    });
  },

  /**
   * Download a reference image from MinIO and composite a Bloomly watermark.
   * The original URL is never returned to the client — only this
   * protected stream is served through the authenticated endpoint.
   */
  async getWatermarkedReferenceImage(userId: string, fursonaId: string, refId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const ref = await prisma.fursonaReferenceImage.findFirst({
      where: { id: refId, fursona_id: fursonaId, user_id: userId, deleted_at: null },
      select: { image_url: true },
    });
    if (!ref?.image_url) return null;
    // Серверный fetch только по нашим файлам: иначе произвольный URL (169.254.169.254, внутренние сервисы) — SSRF
    if (!isTrustedMediaUrl(ref.image_url)) return null;

    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    const username = owner?.username ?? 'unknown';

    const response = await fetch(ref.image_url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const srcBuffer = Buffer.from(await response.arrayBuffer());

    const metadata = await sharp(srcBuffer).metadata();
    const w = metadata.width  ?? 800;
    const h = metadata.height ?? 600;
    const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.035));
    const padding  = fontSize + 4;
    const text     = `bloomly.fun · @${username}`;

    // SVG overlay: bottom-right corner with drop-shadow for readability
    const svgOverlay = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="sh">
            <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.55)" />
          </filter>
        </defs>
        <text x="${w - padding}" y="${h - padding}"
          text-anchor="end"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="rgba(255,255,255,0.78)"
          filter="url(#sh)"
        >${text}</text>
      </svg>`
    );

    const buffer = await sharp(srcBuffer)
      .composite([{ input: svgOverlay, gravity: 'southeast' }])
      .jpeg({ quality: 88 })
      .toBuffer();

    return { buffer, mimeType: 'image/jpeg' };
  },

  // ── Fursuit ────────────────────────────────────────────────────────────────

  async getFursuits(userId: string) {
    return prisma.fursuit.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
  },

  async getFursuit(userId: string, fursuitId: string) {
    return prisma.fursuit.findFirst({
      where: { id: fursuitId, user_id: userId, deleted_at: null },
    });
  },

  async createFursuit(userId: string, data: UpsertFursuitInput) {
    await assertOwnedMedia(data.image_url, userId);
    if (data.external_maker_links) data.external_maker_links = data.external_maker_links.map((l) => requireSafeLink(l, 'maker link')).filter((l): l is string => !!l);
    return prisma.fursuit.create({
      data: { user_id: userId, ...data },
    });
  },

  async updateFursuit(userId: string, fursuitId: string, data: UpsertFursuitInput) {
    if (data.external_maker_links) data.external_maker_links = data.external_maker_links.map((l) => requireSafeLink(l, 'maker link')).filter((l): l is string => !!l);
    const existing = await prisma.fursuit.findFirst({
      where: { id: fursuitId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursuit not found'), { statusCode: 404 });

    if (data.image_url && data.image_url !== existing.image_url) await assertOwnedMedia(data.image_url, userId);
    if (data.image_url !== undefined && existing.image_url && existing.image_url !== data.image_url) {
      await prisma.mediaHistory.create({
        data: { user_id: userId, type: 'fursuit_image', url: existing.image_url },
      });
      deleteFileByUrl(existing.image_url, userId).catch(() => {});
    }

    return prisma.fursuit.update({
      where: { id: fursuitId },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deleteFursuit(userId: string, fursuitId: string) {
    const existing = await prisma.fursuit.findFirst({
      where: { id: fursuitId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursuit not found'), { statusCode: 404 });

    return prisma.fursuit.update({
      where: { id: fursuitId },
      data: { deleted_at: new Date() },
      select: { id: true },
    });
  },

  // ── Saved payment methods (masked card info only — never store PAN/CVV) ──
  async listPaymentMethods(userId: string) {
    return prisma.paymentMethod.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });
  },

  async addPaymentMethod(userId: string, input: {
    cardNumber: string; expMonth: number; expYear: number; holderName: string; setDefault?: boolean;
  }) {
    const digits = input.cardNumber.replace(/\D/g, '');
    if (digits.length < 12 || digits.length > 19) {
      throw Object.assign(new Error('Invalid card number'), { statusCode: 400 });
    }
    const brand = detectCardBrand(digits);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { payment_region: true } });
    const allowedBrands = REGION_ALLOWED_BRANDS[user?.payment_region || 'GLOBAL'] ?? REGION_ALLOWED_BRANDS.GLOBAL;
    if (!allowedBrands.includes(brand)) {
      throw Object.assign(
        new Error(`Карты «${CARD_BRAND_LABELS[brand] ?? brand}» недоступны в вашем регионе`),
        { statusCode: 400 },
      );
    }
    const count = await prisma.paymentMethod.count({ where: { user_id: userId } });
    if (count >= 5) {
      throw Object.assign(new Error('You can save up to 5 cards'), { statusCode: 400 });
    }
    const makeDefault = input.setDefault ?? count === 0;
    if (makeDefault) {
      await prisma.paymentMethod.updateMany({ where: { user_id: userId, is_default: true }, data: { is_default: false } });
    }
    return prisma.paymentMethod.create({
      data: {
        user_id: userId,
        brand,
        last4: digits.slice(-4),
        exp_month: input.expMonth,
        exp_year: input.expYear,
        holder_name: input.holderName.trim().slice(0, 60),
        is_default: makeDefault,
      },
    });
  },

  async deletePaymentMethod(userId: string, id: string) {
    const existing = await prisma.paymentMethod.findFirst({ where: { id, user_id: userId } });
    if (!existing) throw Object.assign(new Error('Payment method not found'), { statusCode: 404 });

    await prisma.paymentMethod.delete({ where: { id } });

    if (existing.is_default) {
      const next = await prisma.paymentMethod.findFirst({ where: { user_id: userId }, orderBy: { created_at: 'desc' } });
      if (next) await prisma.paymentMethod.update({ where: { id: next.id }, data: { is_default: true } });
    }
    return { id };
  },

  async setDefaultPaymentMethod(userId: string, id: string) {
    const existing = await prisma.paymentMethod.findFirst({ where: { id, user_id: userId } });
    if (!existing) throw Object.assign(new Error('Payment method not found'), { statusCode: 404 });

    await prisma.$transaction([
      prisma.paymentMethod.updateMany({ where: { user_id: userId, is_default: true }, data: { is_default: false } }),
      prisma.paymentMethod.update({ where: { id }, data: { is_default: true } }),
    ]);
    return { id };
  },

  /**
   * Proxies track search to the iTunes Search API server-side so it isn't at the mercy
   * of a given user's browser being able to reach itunes.apple.com directly (frequently
   * blocked/unreachable from Russia/CIS). Tries the RU storefront first since that's
   * where most of our users are, then falls back to the US storefront (the default
   * iTunes catalog) if RU comes back empty — some tracks are only listed in one or the
   * other.
   */
  async searchMusic(term: string) {
    const q = encodeURIComponent(term.trim());
    const fetchCatalog = async (country: string) => {
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=8&country=${country}`);
      if (!res.ok) throw Object.assign(new Error('iTunes search failed'), { statusCode: 502 });
      const data = await res.json();
      return Array.isArray(data.results) ? data.results : [];
    };

    let results = await fetchCatalog('RU');
    if (results.length === 0) results = await fetchCatalog('US');

    // Route artwork/preview through our own proxy (see fetchMusicMedia below) —
    // Apple's CDN (mzstatic.com / itunes.apple.com) is frequently unreachable from
    // Russia/CIS even when the search API itself (proxied server-side, above) works,
    // which otherwise leaves every thumbnail broken and the preview button silently dead.
    const proxied = (raw: string) => raw ? `/api/users/music/proxy?url=${encodeURIComponent(raw)}` : '';

    return results.map((track: any) => ({
      title: track.trackName ?? '',
      artist: track.artistName ?? '',
      artworkUrl: proxied((track.artworkUrl100 ?? '').replace('100x100bb', '300x300bb')),
      previewUrl: proxied(track.previewUrl ?? ''),
    }));
  },

  /** Allowlisted passthrough for Apple's music CDN — see searchMusic above for why this exists. */
  async fetchMusicMedia(rawUrl: string): Promise<{ contentType: string; buffer: Buffer }> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw Object.assign(new Error('Invalid URL'), { statusCode: 400 });
    }
    const ALLOWED_HOST = /^([a-z0-9-]+\.)*(mzstatic\.com|apple\.com)$/i;
    if (parsed.protocol !== 'https:' || !ALLOWED_HOST.test(parsed.hostname)) {
      throw Object.assign(new Error('Host not allowed'), { statusCode: 400 });
    }
    // Редиректы запрещены: разрешённый хост не должен переводить запрос на произвольный адрес.
    const res = await fetch(parsed.toString(), { redirect: 'error' });
    if (!res.ok) throw Object.assign(new Error('Upstream fetch failed'), { statusCode: 502 });
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MUSIC_MAX_BYTES) throw Object.assign(new Error('Upstream file too large'), { statusCode: 502 });
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MUSIC_MAX_BYTES) throw Object.assign(new Error('Upstream file too large'), { statusCode: 502 });
    let contentType = res.headers.get('content-type') || 'application/octet-stream';
    // Apple serves 30s preview clips as legit playable AAC/M4A but mislabels the
    // response as audio/x-m4p (the FairPlay-DRM MIME type) — browsers refuse to play
    // that type via <audio>, so play() silently no-ops. Same bytes, correct label.
    if (contentType === 'audio/x-m4p') contentType = 'audio/mp4';
    return { contentType, buffer };
  },

};
