import prisma from '../../config/prisma.js';
import { Prisma } from '@prisma/client';

// Админка Bloomly Shop и Dealers' Den: сводки, списки и модерация.
// Споры, ярмарки и заявки на рамки используют уже существующие эндпоинты своих модулей —
// здесь только то, чего там не хватало (списки с именами, статусы лотов, каталог магазина).

const USER = { id: true, username: true, display_name: true, avatar_url: true } as const;
const startOfWeek = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - 6));
};
const num = (v: unknown) => Number(v ?? 0);

// ── Bloomly Shop ─────────────────────────────────────────────────────────────

const SHOP_TYPES = ['sticker_pack', 'theme', 'background', 'frame'];
const SHOP_STATUSES = ['published', 'hidden', 'draft'];

export interface ShopItemInput {
  type?: string; name?: string; description?: string | null; preview_url?: string | null;
  price?: number; is_free?: boolean; is_official?: boolean; is_nsfw?: boolean;
  tags?: string[]; status?: string; content_data?: Record<string, unknown>;
}

function cleanShopInput(input: ShopItemInput, partial: boolean) {
  const data: Prisma.ShopItemUncheckedUpdateInput = {};
  if (input.type !== undefined) {
    if (!SHOP_TYPES.includes(input.type)) throw Object.assign(new Error('Неизвестный тип товара'), { statusCode: 400 });
    data.type = input.type;
  } else if (!partial) throw Object.assign(new Error('Не указан тип товара'), { statusCode: 400 });
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 120) throw Object.assign(new Error('Название: от 1 до 120 символов'), { statusCode: 400 });
    data.name = name;
  } else if (!partial) throw Object.assign(new Error('Не указано название'), { statusCode: 400 });
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.preview_url !== undefined) data.preview_url = input.preview_url?.trim() || null;
  if (input.price !== undefined) {
    if (!Number.isFinite(input.price) || input.price < 0 || input.price > 1_000_000) throw Object.assign(new Error('Некорректная цена'), { statusCode: 400 });
    data.price = input.price;
  }
  if (input.is_free !== undefined) data.is_free = input.is_free;
  if (input.is_official !== undefined) data.is_official = input.is_official;
  if (input.is_nsfw !== undefined) data.is_nsfw = input.is_nsfw;
  if (input.tags !== undefined) data.tags = input.tags.map(t => t.trim()).filter(Boolean).slice(0, 20);
  if (input.status !== undefined) {
    if (!SHOP_STATUSES.includes(input.status)) throw Object.assign(new Error('Неизвестный статус'), { statusCode: 400 });
    data.status = input.status;
  }
  if (input.content_data !== undefined) data.content_data = input.content_data as Prisma.InputJsonValue;
  if (data.is_free === true) data.price = 0;
  return data;
}

export const shopAdminService = {
  async overview() {
    const week = startOfWeek();
    const live = { deleted_at: null } as const;
    const [byType, byStatus, downloads, purchases, purchasesWeek, turnover, freeItems, packs, paidPacks, pendingAccess, topItems, recent] = await Promise.all([
      prisma.shopItem.groupBy({ by: ['type'], where: live, _count: { _all: true } }),
      prisma.shopItem.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      prisma.shopItem.aggregate({ where: live, _sum: { downloads_count: true } }),
      prisma.userShopItem.count({ where: { item: live } }),
      prisma.userShopItem.count({ where: { item: live, purchased_at: { gte: week } } }),
      prisma.$queryRaw<{ sum: number }[]>`
        SELECT COALESCE(SUM(i.price), 0)::float8 AS sum FROM "UserShopItem" u JOIN "ShopItem" i ON i.id = u.item_id
        WHERE i.deleted_at IS NULL AND i.is_free = false`,
      prisma.shopItem.count({ where: { ...live, is_free: true } }),
      prisma.stickerPack.count({ where: { ...live, status: 'published' } }),
      prisma.stickerPack.count({ where: { ...live, status: 'published', price: { gt: 0 } } }),
      prisma.stickerAccessRequest.count({ where: { status: 'pending' } }),
      prisma.shopItem.findMany({ where: live, orderBy: { downloads_count: 'desc' }, take: 5, select: { id: true, name: true, type: true, preview_url: true, downloads_count: true, price: true, is_free: true } }),
      prisma.userShopItem.findMany({ orderBy: { purchased_at: 'desc' }, take: 8, select: { purchased_at: true, user: { select: USER }, item: { select: { id: true, name: true, type: true, price: true, is_free: true } } } }),
    ]);
    const total = byType.reduce((s, t) => s + t._count._all, 0);
    return {
      stats: {
        items: total, free: freeItems, paid: total - freeItems,
        downloads: downloads._sum.downloads_count ?? 0,
        purchases, purchasesWeek, turnover: Math.round(num(turnover[0]?.sum) * 100) / 100,
        packs: { published: packs, paid: paidPacks, pendingAccess },
      },
      byType: byType.map(t => ({ type: t.type, count: t._count._all })),
      byStatus: byStatus.map(t => ({ status: t.status, count: t._count._all })),
      topItems: topItems.map(i => ({ ...i, price: num(i.price) })),
      recentPurchases: recent.map(r => ({ purchasedAt: r.purchased_at, user: r.user, item: { ...r.item, price: num(r.item.price) } })),
    };
  },

  /** Статистика по одному виду товаров магазина: рамки, фоны, темы. */
  async typeStats(type: string) {
    if (!['frame', 'background', 'theme'].includes(type)) throw Object.assign(new Error('Неизвестный тип'), { statusCode: 400 });
    const week = startOfWeek();
    const live = { deleted_at: null, type } as const;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [byStatus, free, downloads, owners, ownersWeek, turnover, top, daily, recent] = await Promise.all([
      prisma.shopItem.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      prisma.shopItem.count({ where: { ...live, is_free: true } }),
      prisma.shopItem.aggregate({ where: live, _sum: { downloads_count: true } }),
      prisma.userShopItem.count({ where: { item: live } }),
      prisma.userShopItem.count({ where: { item: live, purchased_at: { gte: week } } }),
      prisma.$queryRaw<{ sum: number }[]>`
        SELECT COALESCE(SUM(i.price), 0)::float8 AS sum FROM "UserShopItem" u JOIN "ShopItem" i ON i.id = u.item_id
        WHERE i.deleted_at IS NULL AND i.type = ${type} AND i.is_free = false`,
      prisma.shopItem.findMany({
        where: live, orderBy: [{ owners: { _count: 'desc' } }, { downloads_count: 'desc' }], take: 10,
        select: { id: true, name: true, preview_url: true, price: true, is_free: true, status: true, downloads_count: true, _count: { select: { owners: true } } },
      }),
      prisma.$queryRaw<{ day: string; value: number }[]>`
        SELECT to_char(date_trunc('day', u.purchased_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS value
        FROM "UserShopItem" u JOIN "ShopItem" i ON i.id = u.item_id
        WHERE i.deleted_at IS NULL AND i.type = ${type} AND u.purchased_at >= ${since}
        GROUP BY 1 ORDER BY 1`,
      prisma.userShopItem.findMany({
        where: { item: live }, orderBy: { purchased_at: 'desc' }, take: 8,
        select: { purchased_at: true, user: { select: USER }, item: { select: { id: true, name: true, price: true, is_free: true } } },
      }),
    ]);
    const total = byStatus.reduce((n, r) => n + r._count._all, 0);
    const published = byStatus.find(r => r.status === 'published')?._count._all ?? 0;

    // Рамки аватара живут ещё и отдельной таблицей (пользовательские, с модерацией)
    let avatarFrames = null;
    if (type === 'frame') {
      const [approved, pending, acquired, equipped, topFrames] = await Promise.all([
        prisma.avatarFrame.count({ where: { deleted_at: null, status: 'approved' } }),
        prisma.avatarFrame.count({ where: { deleted_at: null, status: 'pending' } }),
        prisma.userAvatarFrame.count({ where: { frame: { deleted_at: null } } }),
        prisma.user.count({ where: { deleted_at: null, profile_frame_id: { not: null } } }),
        prisma.avatarFrame.findMany({
          where: { deleted_at: null, status: 'approved' }, orderBy: { owners: { _count: 'desc' } }, take: 10,
          select: { id: true, name: true, image_url: true, price: true, _count: { select: { owners: true, equippedBy: true } } },
        }),
      ]);
      avatarFrames = {
        approved, pending, acquired, equipped,
        top: topFrames.map(f => ({ id: f.id, name: f.name, imageUrl: f.image_url, price: num(f.price), owners: f._count.owners, equipped: f._count.equippedBy })),
      };
    }
    return {
      type,
      totals: {
        items: total, published, hidden: total - published, free, paid: total - free,
        downloads: downloads._sum.downloads_count ?? 0, owners, ownersWeek, turnover: Math.round(num(turnover[0]?.sum) * 100) / 100,
      },
      top: top.map(i => ({ id: i.id, name: i.name, previewUrl: i.preview_url, price: num(i.price), isFree: i.is_free, status: i.status, downloads: i.downloads_count, owners: i._count.owners })),
      daily,
      recent: recent.map(r => ({ purchasedAt: r.purchased_at, user: r.user, item: { ...r.item, price: num(r.item.price) } })),
      avatarFrames,
    };
  },

  async listItems(opts: { type?: string; status?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 18));
    const where: Prisma.ShopItemWhereInput = { deleted_at: null };
    if (opts.type) where.type = opts.type;
    if (opts.status) where.status = opts.status;
    if (opts.search) where.name = { contains: opts.search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      prisma.shopItem.findMany({
        where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { owners: true } } },
      }),
      prisma.shopItem.count({ where }),
    ]);
    return {
      items: items.map(i => ({
        id: i.id, type: i.type, name: i.name, description: i.description, previewUrl: i.preview_url,
        price: num(i.price), currency: i.currency, isFree: i.is_free, isOfficial: i.is_official, isNsfw: i.is_nsfw,
        tags: i.tags, status: i.status, downloads: i.downloads_count, owners: i._count.owners, createdAt: i.created_at,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  createItem(input: ShopItemInput) {
    return prisma.shopItem.create({ data: cleanShopInput(input, false) as Prisma.ShopItemUncheckedCreateInput });
  },

  async updateItem(id: string, input: ShopItemInput) {
    const exists = await prisma.shopItem.findFirst({ where: { id, deleted_at: null }, select: { id: true } });
    if (!exists) throw Object.assign(new Error('Товар не найден'), { statusCode: 404 });
    return prisma.shopItem.update({ where: { id }, data: cleanShopInput(input, true) });
  },

  async deleteItem(id: string) {
    const r = await prisma.shopItem.updateMany({ where: { id, deleted_at: null }, data: { deleted_at: new Date(), status: 'hidden' } });
    if (!r.count) throw Object.assign(new Error('Товар не найден'), { statusCode: 404 });
  },

  async listPacks(opts: { search?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 18));
    const where: Prisma.StickerPackWhereInput = { deleted_at: null };
    if (opts.status) where.status = opts.status;
    if (opts.search) where.OR = [{ name: { contains: opts.search, mode: 'insensitive' } }, { author: { username: { contains: opts.search, mode: 'insensitive' } } }];
    const [packs, total] = await Promise.all([
      prisma.stickerPack.findMany({
        where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true, name: true, cover_url: true, stickers: true, price: true, is_nsfw: true, status: true, visibility: true,
          downloads_count: true, use_count: true, created_at: true, author: { select: USER },
          _count: { select: { userCollections: true, accessRequests: true } },
        },
      }),
      prisma.stickerPack.count({ where }),
    ]);
    return {
      packs: packs.map(p => ({
        id: p.id, name: p.name, coverUrl: p.cover_url ?? p.stickers[0] ?? null, stickerCount: p.stickers.length, price: num(p.price),
        isNsfw: p.is_nsfw, status: p.status, visibility: p.visibility, downloads: p.downloads_count, uses: p.use_count,
        collections: p._count.userCollections, accessRequests: p._count.accessRequests, createdAt: p.created_at, author: p.author,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async setPackStatus(id: string, status: 'published' | 'draft') {
    const r = await prisma.stickerPack.updateMany({ where: { id, deleted_at: null }, data: { status } });
    if (!r.count) throw Object.assign(new Error('Пак не найден'), { statusCode: 404 });
  },

  async listAccessRequests() {
    const rows = await prisma.stickerAccessRequest.findMany({
      where: { status: 'pending' }, orderBy: { created_at: 'asc' }, take: 50,
      select: { id: true, created_at: true, pack: { select: { id: true, name: true, author: { select: USER } } }, user: { select: USER } },
    });
    return rows.map(r => ({ id: r.id, createdAt: r.created_at, pack: r.pack, user: r.user }));
  },
};

// ── Dealers' Den ─────────────────────────────────────────────────────────────

const LISTING_STATUSES = ['active', 'archived', 'draft', 'sold'];

export const denAdminService = {
  async overview() {
    const week = startOfWeek();
    const live = { deleted_at: null } as const;
    const [byStatus, byKind, byCategory, newWeek, agg, bids, groups, disputes, fairs, fairPending, framesByStatus, trust, topSellers, reviews] = await Promise.all([
      prisma.dealerListing.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      prisma.dealerListing.groupBy({ by: ['listing_kind'], where: { ...live, status: 'active' }, _count: { _all: true } }),
      prisma.dealerListing.groupBy({ by: ['category'], where: { ...live, status: 'active' }, _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 8 }),
      prisma.dealerListing.count({ where: { ...live, created_at: { gte: week } } }),
      prisma.dealerListing.aggregate({ where: live, _sum: { views_count: true, quantity_sold: true } }),
      prisma.dealerBid.count(),
      prisma.group.count({ where: { deleted_at: null, den_enabled: true } }),
      prisma.denDispute.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      prisma.denFair.count({ where: live }),
      prisma.denFairParticipant.count({ where: { status: 'pending', fair: live } }),
      prisma.avatarFrame.groupBy({ by: ['status'], where: live, _count: { _all: true } }),
      prisma.denTrustScore.groupBy({ by: ['tier'], _count: { _all: true } }),
      prisma.denTrustScore.findMany({ orderBy: [{ score: 'desc' }, { completed_deals: 'desc' }], take: 6, select: { score: true, tier: true, total_deals: true, completed_deals: true, disputes_lost: true, avg_rating: true, user: { select: USER } } }),
      prisma.denReview.count({ where: { deleted_at: null } }),
    ]);
    const cnt = (rows: { status: string; _count: { _all: number } }[], s: string) => rows.find(r => r.status === s)?._count._all ?? 0;
    return {
      stats: {
        listings: byStatus.reduce((s, r) => s + r._count._all, 0), active: cnt(byStatus, 'active'), sold: cnt(byStatus, 'sold'),
        draft: cnt(byStatus, 'draft'), archived: cnt(byStatus, 'archived'), newWeek,
        views: agg._sum.views_count ?? 0, unitsSold: agg._sum.quantity_sold ?? 0, bids, reviews,
        groups, fairs, fairApplications: fairPending,
        disputesOpen: cnt(disputes, 'open'), disputesTotal: disputes.reduce((s, r) => s + r._count._all, 0),
        framesPending: cnt(framesByStatus, 'pending'),
      },
      byKind: byKind.map(r => ({ kind: r.listing_kind, count: r._count._all })),
      byCategory: byCategory.map(r => ({ category: r.category, count: r._count._all })),
      trustTiers: trust.map(r => ({ tier: r.tier, count: r._count._all })),
      topSellers: topSellers.map(s => ({ ...s, avg_rating: num(s.avg_rating) })),
    };
  },

  async listListings(opts: { status?: string; kind?: string; category?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 18));
    const where: Prisma.DealerListingWhereInput = { deleted_at: null };
    if (opts.status) where.status = opts.status;
    if (opts.kind) where.listing_kind = opts.kind;
    if (opts.category) where.category = opts.category;
    if (opts.search) where.OR = [
      { title: { contains: opts.search, mode: 'insensitive' } },
      { seller: { username: { contains: opts.search, mode: 'insensitive' } } },
      { group: { name: { contains: opts.search, mode: 'insensitive' } } },
    ];
    const [rows, total] = await Promise.all([
      prisma.dealerListing.findMany({
        where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true, title: true, price: true, currency: true, category: true, listing_kind: true, type: true, status: true, images: true,
          quantity: true, quantity_sold: true, is_nsfw: true, views_count: true, bid_count: true, current_bid: true, auction_ends_at: true,
          raffle_tickets_sold: true, created_at: true, seller: { select: USER }, group: { select: { id: true, name: true, slug: true } },
          _count: { select: { disputes: true, reviews: true, wishlistItems: true } },
        },
      }),
      prisma.dealerListing.count({ where }),
    ]);
    return {
      listings: rows.map(l => ({
        id: l.id, title: l.title, price: num(l.price), currency: l.currency, category: l.category, kind: l.listing_kind, type: l.type,
        status: l.status, image: l.images[0] ?? null, images: l.images.length, quantity: l.quantity, sold: l.quantity_sold, isNsfw: l.is_nsfw,
        views: l.views_count, bids: l.bid_count, currentBid: l.current_bid === null ? null : num(l.current_bid), auctionEndsAt: l.auction_ends_at,
        tickets: l.raffle_tickets_sold, createdAt: l.created_at, seller: l.seller, group: l.group,
        disputes: l._count.disputes, reviews: l._count.reviews, wishlists: l._count.wishlistItems,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async setListingStatus(id: string, status: string) {
    if (!LISTING_STATUSES.includes(status)) throw Object.assign(new Error('Неизвестный статус'), { statusCode: 400 });
    const r = await prisma.dealerListing.updateMany({ where: { id, deleted_at: null }, data: { status } });
    if (!r.count) throw Object.assign(new Error('Лот не найден'), { statusCode: 404 });
  },

  async deleteListing(id: string) {
    const r = await prisma.dealerListing.updateMany({ where: { id, deleted_at: null }, data: { deleted_at: new Date(), status: 'archived' } });
    if (!r.count) throw Object.assign(new Error('Лот не найден'), { statusCode: 404 });
  },

  async listDisputes(status?: string) {
    const where: Prisma.DenDisputeWhereInput = { deleted_at: null };
    if (status === 'open') where.status = 'open';
    else if (status === 'resolved') where.status = { in: ['resolved_buyer', 'resolved_seller'] };
    const rows = await prisma.denDispute.findMany({
      where, orderBy: status === 'open' ? { opened_at: 'asc' } : { opened_at: 'desc' }, take: 60,
      select: {
        id: true, reason: true, status: true, seller_reply: true, resolution: true, opened_at: true, replied_at: true, resolved_at: true,
        listing: { select: { id: true, title: true, price: true, currency: true, images: true } },
        buyer: { select: USER }, seller: { select: USER },
      },
    });
    return rows.map(d => ({ ...d, listing: { ...d.listing, price: num(d.listing.price), image: d.listing.images[0] ?? null } }));
  },

  async listFairs() {
    const fairs = await prisma.denFair.findMany({
      where: { deleted_at: null }, orderBy: { starts_at: 'desc' }, take: 30,
      select: {
        id: true, title: true, description: true, theme: true, banner_url: true, starts_at: true, ends_at: true, status: true,
        participants: {
          orderBy: { created_at: 'desc' },
          select: { id: true, user_id: true, status: true, created_at: true, user: { select: USER }, listing: { select: { id: true, title: true, images: true } } },
        },
      },
    });
    return fairs.map(f => ({
      ...f,
      participants: f.participants.map(p => ({ ...p, listing: p.listing ? { id: p.listing.id, title: p.listing.title, image: p.listing.images[0] ?? null } : null })),
    }));
  },

  async setFairStatus(id: string, status: string) {
    if (!['upcoming', 'open', 'closed'].includes(status)) throw Object.assign(new Error('Неизвестный статус'), { statusCode: 400 });
    const r = await prisma.denFair.updateMany({ where: { id, deleted_at: null }, data: { status } });
    if (!r.count) throw Object.assign(new Error('Ярмарка не найдена'), { statusCode: 404 });
  },

  async listDenGroups() {
    const groups = await prisma.group.findMany({
      where: { deleted_at: null, den_enabled: true }, orderBy: { den_agreed_at: 'desc' },
      select: {
        id: true, name: true, slug: true, avatar_url: true, den_agreed_at: true, is_verified: true,
        owner: { select: USER }, _count: { select: { members: true } },
      },
    });
    const counts = groups.length
      ? await prisma.dealerListing.groupBy({ by: ['group_id'], where: { group_id: { in: groups.map(g => g.id) }, deleted_at: null, status: 'active' }, _count: { _all: true } })
      : [];
    const map = new Map(counts.map(c => [c.group_id, c._count._all]));
    return groups.map(g => ({
      id: g.id, name: g.name, slug: g.slug, avatarUrl: g.avatar_url, agreedAt: g.den_agreed_at, isVerified: g.is_verified,
      owner: g.owner, members: g._count.members, activeListings: map.get(g.id) ?? 0,
    }));
  },

  async disconnectGroup(id: string) {
    const r = await prisma.group.updateMany({ where: { id, deleted_at: null, den_enabled: true }, data: { den_enabled: false } });
    if (!r.count) throw Object.assign(new Error('Группа не найдена или уже отключена'), { statusCode: 404 });
  },
};
