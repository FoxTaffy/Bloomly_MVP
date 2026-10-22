import prisma from '../../config/prisma.js';
import { errCode } from '../../lib/httpErrors.js';
import { dealersDenService } from '../dealers-den/service.js';

// Цвет идёт в style-строку на фронтенде: принимаем только #rrggbb, иначе лезут лишние CSS-свойства
const normalizeHexColor = (color?: string | null) => (color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#4C67CF');

const USER_SELECT = {
  id: true, username: true, display_name: true,
  avatar_url: true, banner_url: true, bio: true,
  location: true, is_verified: true, verification_type: true,
  badge_type: true, subscription_tier: true,
  _count: { select: { followers: true, following: true, posts: true } },
} as const;

const GROUP_SELECT = {
  id: true, slug: true, name: true, description: true,
  type: true, avatar_url: true, banner_url: true,
  accent_color: true, is_nsfw: true, is_verified: true,
  members_count: true, category: true,
  _count: { select: { members: true } },
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const bookmarksService = {
  // ── User bookmarks ────────────────────────────────────────────────────────

  async toggleUserBookmark(userId: string, targetId: string) {
    if (userId === targetId) throw new Error('Cannot bookmark yourself');
    const existing = await prisma.userBookmark.findUnique({
      where: { user_id_target_id: { user_id: userId, target_id: targetId } },
    });
    if (existing) {
      await prisma.userBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    try {
      await prisma.userBookmark.create({ data: { user_id: userId, target_id: targetId } });
    } catch (err) {
      // A racing duplicate click can slip past the findUnique check above and hit the
      // unique(user_id, target_id) constraint — that just means it's already bookmarked.
      if (errCode(err) !== 'P2002') throw err;
    }
    return { bookmarked: true };
  },

  async getBookmarkedUsers(userId: string) {
    const rows = await prisma.userBookmark.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: { target: { select: USER_SELECT } },
    });
    return rows.map(r => ({ ...r.target, bookmarked_at: r.created_at }));
  },

  async getUserBookmarkStatus(userId: string, targetIds: string[]) {
    if (!targetIds.length) return {};
    const rows = await prisma.userBookmark.findMany({
      where: { user_id: userId, target_id: { in: targetIds } },
      select: { target_id: true },
    });
    const set = new Set(rows.map(r => r.target_id));
    return Object.fromEntries(targetIds.map(id => [id, set.has(id)]));
  },

  // ── Group bookmarks ───────────────────────────────────────────────────────

  async toggleGroupBookmark(userId: string, groupId: string) {
    const existing = await prisma.groupBookmark.findUnique({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    if (existing) {
      await prisma.groupBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    try {
      await prisma.groupBookmark.create({ data: { user_id: userId, group_id: groupId } });
    } catch (err) {
      if (errCode(err) !== 'P2002') throw err;
    }
    return { bookmarked: true };
  },

  async getBookmarkedGroups(userId: string) {
    const rows = await prisma.groupBookmark.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: { group: { select: GROUP_SELECT } },
    });
    return rows.map(r => ({ ...r.group, bookmarked_at: r.created_at }));
  },

  async getGroupBookmarkStatus(userId: string, groupIds: string[]) {
    if (!groupIds.length) return {};
    const rows = await prisma.groupBookmark.findMany({
      where: { user_id: userId, group_id: { in: groupIds } },
      select: { group_id: true },
    });
    const set = new Set(rows.map(r => r.group_id));
    return Object.fromEntries(groupIds.map(id => [id, set.has(id)]));
  },

  // ── Dealers' Den listing bookmarks ────────────────────────────────────────
  // Хранятся в DenWishlist: сердечко в каталоге Dealers' Den и закладка в этом разделе — один и тот же список.

  async toggleListingBookmark(userId: string, listingId: string, viewerIsAdult: boolean) {
    if (!UUID_RE.test(listingId)) throw new Error('Listing not found');
    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, deleted_at: null, ...(viewerIsAdult ? {} : { is_nsfw: false }) },
      select: { id: true },
    });
    if (!listing) throw new Error('Listing not found');
    const existing = await prisma.denWishlist.findUnique({
      where: { user_id_listing_id: { user_id: userId, listing_id: listingId } },
    });
    if (existing) {
      await prisma.denWishlist.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    try {
      await prisma.denWishlist.create({ data: { user_id: userId, listing_id: listingId } });
    } catch (err) {
      if (errCode(err) !== 'P2002') throw err;
    }
    return { bookmarked: true };
  },

  async getBookmarkedListings(userId: string, viewerIsAdult: boolean) {
    return dealersDenService.getMyWishlist(userId, viewerIsAdult);
  },

  // ── Post bookmark labels ──────────────────────────────────────────────────

  async getLabels(userId: string) {
    const labels = await prisma.postBookmarkLabel.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      include: { _count: { select: { favourites: true } } },
    });
    return labels;
  },

  async createLabel(userId: string, name: string, color?: string) {
    return prisma.postBookmarkLabel.create({
      data: { user_id: userId, name: name.trim().slice(0, 60), color: normalizeHexColor(color) },
    });
  },

  async deleteLabel(userId: string, labelId: string) {
    const label = await prisma.postBookmarkLabel.findUnique({ where: { id: labelId } });
    if (!label || label.user_id !== userId) throw new Error('Not found');
    return prisma.postBookmarkLabel.delete({ where: { id: labelId } });
  },

  async assignLabel(userId: string, postId: string, labelId: string | null) {
    const fav = await prisma.favourite.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
    });
    if (!fav) throw new Error('Post not bookmarked');
    if (labelId) {
      const label = await prisma.postBookmarkLabel.findUnique({ where: { id: labelId } });
      if (!label || label.user_id !== userId) throw new Error('Label not found');
    }
    return prisma.favourite.update({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
      data: { label_id: labelId },
    });
  },
};
