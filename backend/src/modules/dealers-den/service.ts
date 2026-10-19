import { randomInt } from 'crypto';
import prisma from '../../config/prisma.js';
import { Prisma } from '@prisma/client';
import type { CreateListingInput, UpdateListingInput, GetListingsQuery, PlaceBidInput, CreateReviewInput, CreateBookingInput, UpdateBookingInput, CreateDisputeInput, ReplyDisputeInput } from './types.js';
import { REVIEW_TAGS } from './types.js';
import { recalcDenTrust } from './trust.service.js';
import { notificationService } from '../notifications/service.js';
import { deleteFileByUrl, assertOwnedMedia } from '../media/service.js';
import { errCode } from '../../lib/httpErrors.js';
import { logError } from '../../lib/logger.js';

// Tags are matched case-insensitively (search lowercases its query), so store them lowercased.
function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean))];
}

const LISTING_SELECT = {
  id: true,
  seller_id: true,
  group_id: true,
  title: true,
  description: true,
  price: true,
  discount_percent: true,
  currency: true,
  category: true,
  type: true,
  listing_kind: true,
  images: true,
  status: true,
  quantity: true,
  quantity_sold: true,
  is_nsfw: true,
  tags: true,
  // auction
  auction_ends_at: true,
  current_bid: true,
  bid_count: true,
  bid_increment: true,
  auto_buy_price: true,
  raffle_max_tickets: true,
  raffle_tickets_sold: true,
  winner_id: true,
  // commission
  commission_slots_total: true,
  commission_slots_taken: true,
  commission_eta_days: true,
  commission_form_fields: true,
  commission_details: true,
  views_count: true,
  created_at: true,
  updated_at: true,
  seller: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
      is_verified: true,
      verification_type: true,
    },
  },
  group: { select: { id: true, slug: true, name: true, avatar_url: true } },
  avatarFrame: {
    select: {
      id: true, status: true, rejection_reason: true,
      default_offset_x: true, default_offset_y: true, default_scale: true, default_rotation: true,
    },
  },
};

// A viewer counts once per listing per 30 min (in-memory, per process: good enough for a vanity counter).
const VIEW_TTL_MS = 30 * 60 * 1000;
const recentViews = new Map<string, number>();
function shouldCountView(key: string): boolean {
  const now = Date.now();
  if (recentViews.size > 5000) for (const [k, t] of recentViews) if (now - t > VIEW_TTL_MS) recentViews.delete(k);
  const last = recentViews.get(key);
  if (last !== undefined && now - last < VIEW_TTL_MS) return false;
  recentViews.set(key, now);
  return true;
}

export const dealersDenService = {
  // ── list listings ─────────────────────────────────────────────────────────
  async list(query: GetListingsQuery, viewerId?: string) {
    const page  = Math.max(1, parseInt(query.page  ?? '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    const where: any = { deleted_at: null };

    // Drafts and archived listings are private to their seller. Other viewers may only see
    // active listings in the catalogue, and active+sold on a seller's own page.
    const isOwnList = !!viewerId && query.sellerId === viewerId;
    if (!isOwnList) {
      const allowed = query.sellerId ? ['active', 'sold'] : ['active'];
      where.status = query.status && allowed.includes(query.status) ? query.status : { in: allowed };
    } else if (query.status) {
      where.status = query.status;
    }

    // Рамки аватара — только в магазине
    where.category = query.category && query.category !== 'avatar_frame' ? query.category : { not: 'avatar_frame' };
    if (query.type)        where.type        = query.type;
    if (query.listingKind) where.listing_kind = query.listingKind;
    if (query.sellerId)    where.seller_id   = query.sellerId;
    if (query.groupId)     where.group_id    = query.groupId;
    if (query.excludeNsfw === '1') where.is_nsfw = false;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) where.price.gte = parseFloat(query.minPrice);
      if (query.maxPrice !== undefined) where.price.lte = parseFloat(query.maxPrice);
    }

    if (query.search) {
      where.OR = [
        { title:       { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { tags:        { has: query.search.toLowerCase() } },
      ];
    }

    const orderBy: any =
      query.sort === 'price_asc'  ? { price: 'asc' } :
      query.sort === 'price_desc' ? { price: 'desc' } :
      query.sort === 'popular'    ? [{ bid_count: 'desc' }, { created_at: 'desc' }] :
                                    { created_at: 'desc' };

    const [listings, total] = await Promise.all([
      prisma.dealerListing.findMany({ where, select: LISTING_SELECT, orderBy, skip, take: limit }),
      prisma.dealerListing.count({ where }),
    ]);

    return { listings, total, page, limit };
  },

  // ── trending tags ──────────────────────────────────────────────────────────
  // Aggregated in SQL (no full scan into memory). NSFW listings only feed the tag cloud
  // for viewers who passed the age gate, so their tag names don't leak to minors.
  async getTrendingTags(viewerIsAdult = false, limit = 12) {
    return prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT t AS tag, COUNT(*)::int AS count
      FROM "DealerListing", unnest("tags") AS t
      WHERE "status" = 'active' AND "deleted_at" IS NULL
        AND (${viewerIsAdult}::boolean OR "is_nsfw" = false)
      GROUP BY t
      ORDER BY count DESC, t ASC
      LIMIT ${limit}`;
  },

  // ── get single with extended info ─────────────────────────────────────────
  async getById(id: string, currentUserId?: string, viewerIsAdult = false, viewerKey?: string) {
    const listing = await prisma.dealerListing.findFirst({
      where: { id, deleted_at: null },
      select: {
        ...LISTING_SELECT,
        seller: {
          select: {
            id: true, username: true, display_name: true, avatar_url: true,
            is_verified: true, verification_type: true, updated_at: true,
            denTrustScore: true,
          },
        },
      },
    });
    if (!listing) return null;

    // Same visibility rules as the catalogue: the seller always sees their own listing,
    // everyone else gets 404 for drafts/archived and for NSFW lots when not age-verified.
    const isOwner = !!currentUserId && listing.seller_id === currentUserId;
    if (!isOwner) {
      if (!['active', 'sold'].includes(listing.status)) return null;
      if (listing.is_nsfw && !viewerIsAdult) return null;
    }

    let viewsCount = listing.views_count;
    if (!isOwner && viewerKey && shouldCountView(`${id}:${viewerKey}`)) {
      viewsCount += 1;
      prisma.dealerListing.update({ where: { id }, data: { views_count: { increment: 1 } } }).catch(logError('[dealerListing.view] count failed'));
    }

    const [wishlistCount, isWishlisted, reviews] = await Promise.all([
      prisma.denWishlist.count({ where: { listing_id: id } }),
      currentUserId ? prisma.denWishlist.findUnique({ where: { user_id_listing_id: { user_id: currentUserId, listing_id: id } } }).then(Boolean) : false,
      prisma.denReview.findMany({ where: { listing_id: id, deleted_at: null }, select: { rating: true, tags: true } }),
    ]);

    const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const tagCounts: Record<string, number> = {};
    for (const r of reviews) for (const t of r.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    const tags = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);

    const myRaffleTickets = currentUserId && listing.listing_kind === 'raffle'
      ? await prisma.denRaffleTicket.count({ where: { listing_id: id, buyer_id: currentUserId } })
      : 0;

    const { seller, ...rest } = listing as any;
    return {
      ...rest,
      views_count: viewsCount,
      seller: {
        ...seller,
        last_active_at: seller.updated_at ?? null,
        avg_response_hours: null,
      },
      wishlist_count: wishlistCount,
      is_wishlisted: isWishlisted,
      my_raffle_tickets: myRaffleTickets,
      review_summary: { avg_rating: avgRating, total: reviews.length, tags },
    };
  },

  // ── create ─────────────────────────────────────────────────────────────────
  async create(sellerId: string, input: CreateListingInput) {
    if (input.price !== undefined && input.price < 0) throw new Error('INVALID_PRICE');
    if (input.quantity !== undefined && input.quantity < 1) throw new Error('INVALID_QUANTITY');
    if (input.bidIncrement !== undefined && input.bidIncrement <= 0) throw new Error('INVALID_BID_INCREMENT');
    const kind = input.listingKind ?? 'fixed';
    for (const url of input.images ?? []) await assertOwnedMedia(url, sellerId);
    return prisma.dealerListing.create({
      data: {
        seller_id:    sellerId,
        group_id:     input.groupId,
        title:        input.title,
        description:  input.description,
        price:        input.price,
        discount_percent: input.discountPercent ?? 0,
        currency:     input.currency        ?? 'USD',
        category:     input.category        ?? 'other',
        type:         input.type            ?? 'physical',
        listing_kind: kind,
        images:       input.images          ?? [],
        quantity:     input.quantity        ?? 1,
        is_nsfw:      input.isNsfw          ?? false,
        tags:         normalizeTags(input.tags),
        status:       input.status          ?? 'active',
        // auction fields
        auction_ends_at:    input.auctionEndsAt ? new Date(input.auctionEndsAt) : undefined,
        bid_increment:      input.bidIncrement  ?? 1,
        auto_buy_price:     input.autoBuyPrice  ?? undefined,
        raffle_max_tickets: input.raffleMaxTickets ?? undefined,
        // commission fields
        commission_slots_total: input.commissionSlotsTotal,
        commission_eta_days:    input.commissionEtaDays,
        commission_form_fields: (input.commissionFormFields as any) ?? [],
        commission_details:     (input.commissionDetails as any) ?? undefined,
      },
      select: LISTING_SELECT,
    });
  },

  // ── update ──────────────────────────────────────────────────────────────────
  async update(id: string, sellerId: string, input: UpdateListingInput) {
    if (input.price !== undefined && input.price < 0) throw new Error('INVALID_PRICE');
    if (input.quantity !== undefined && input.quantity < 1) throw new Error('INVALID_QUANTITY');
    const existing = await prisma.dealerListing.findFirst({ where: { id, seller_id: sellerId, deleted_at: null } });
    if (!existing) return null;

    const prevPrice = existing.price;
    const data: any = {};
    if (input.title       !== undefined) data.title       = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.price       !== undefined) data.price       = input.price;
    if (input.discountPercent !== undefined) data.discount_percent = input.discountPercent;
    if (input.currency    !== undefined) data.currency    = input.currency;
    if (input.category    !== undefined) data.category    = input.category;
    if (input.type        !== undefined) data.type        = input.type;
    if (input.images      !== undefined) {
      for (const url of input.images) if (!existing.images.includes(url)) await assertOwnedMedia(url, sellerId);
      data.images = input.images;
    }
    if (input.quantity    !== undefined) data.quantity    = input.quantity;
    if (input.isNsfw      !== undefined) data.is_nsfw     = input.isNsfw;
    if (input.tags        !== undefined) data.tags        = normalizeTags(input.tags);
    // Avatar frame listings can only go active/archived via the admin approval flow
    // (avatarFramesService.adminReview) — otherwise a seller could self-publish a
    // never-reviewed frame by just PATCHing status through this generic endpoint.
    if (input.status !== undefined && existing.category !== 'avatar_frame') data.status = input.status;
    if (input.commissionSlotsTotal !== undefined) data.commission_slots_total = input.commissionSlotsTotal;
    if (input.commissionEtaDays    !== undefined) data.commission_eta_days    = input.commissionEtaDays;
    if (input.commissionFormFields !== undefined) data.commission_form_fields = input.commissionFormFields;
    if (input.commissionDetails    !== undefined) data.commission_details     = (input.commissionDetails as any) ?? Prisma.DbNull;

    const updated = await prisma.dealerListing.update({ where: { id }, data, select: LISTING_SELECT });

    if (input.images !== undefined) {
      const removed = existing.images.filter((url) => !input.images!.includes(url));
      Promise.all(removed.map((url) => deleteFileByUrl(url, existing.seller_id)))
        .catch(logError('[dealerListing.update] media cleanup failed'));
    }

    // Notify wishlist users on price drop, unless they already have an unread price-drop
    // notification for this listing — otherwise repeatedly nudging the price down floods them.
    if (input.price !== undefined && parseFloat(input.price.toString()) < parseFloat(prevPrice.toString())) {
      const wishers = await prisma.denWishlist.findMany({ where: { listing_id: id }, select: { user_id: true } });
      await Promise.all(wishers.map(async (w) => {
        const alreadyNotified = await prisma.notification.findFirst({
          where: { receiver_id: w.user_id, type: 'den_price_drop', ref_id: id, read: false, deleted_at: null },
          select: { id: true },
        });
        if (!alreadyNotified) {
          await notificationService.create({ receiverId: w.user_id, senderId: sellerId, type: 'den_price_drop', refId: id });
        }
      }));
    }

    // Notify wishlist users on new commission slots, same dedup rationale as above.
    if (input.commissionSlotsTotal !== undefined && existing.listing_kind === 'commission_queue') {
      const wishers = await prisma.denWishlist.findMany({ where: { listing_id: id }, select: { user_id: true } });
      await Promise.all(wishers.map(async (w) => {
        const alreadyNotified = await prisma.notification.findFirst({
          where: { receiver_id: w.user_id, type: 'den_slots_available', ref_id: id, read: false, deleted_at: null },
          select: { id: true },
        });
        if (!alreadyNotified) {
          await notificationService.create({ receiverId: w.user_id, senderId: sellerId, type: 'den_slots_available', refId: id });
        }
      }));
    }

    return updated;
  },

  // ── soft delete ─────────────────────────────────────────────────────────────
  async delete(id: string, sellerId: string) {
    const existing = await prisma.dealerListing.findFirst({ where: { id, seller_id: sellerId, deleted_at: null } });
    if (!existing) return null;
    const updated = await prisma.dealerListing.update({ where: { id }, data: { deleted_at: new Date() } });
    // Listings have no restore path, so images can be purged now instead of
    // leaking in S3 forever (there's no hard-delete cron for listings either).
    Promise.all(existing.images.map((url) => deleteFileByUrl(url, sellerId)))
      .catch(logError('[dealerListing.delete] media cleanup failed'));

    // Avatar frames are a special case: once the artist deletes the listing, the source
    // art is gone (image gets purged above), so anyone still displaying it on their
    // profile would just show a broken image. Unequip it everywhere and retire the frame.
    if (existing.category === 'avatar_frame') {
      const frame = await prisma.avatarFrame.findUnique({ where: { listing_id: id } });
      if (frame) {
        await prisma.$transaction([
          prisma.user.updateMany({ where: { profile_frame_id: frame.id }, data: { profile_frame_id: null } }),
          prisma.avatarFrame.update({ where: { id: frame.id }, data: { deleted_at: new Date() } }),
        ]);
      }
    }

    return updated;
  },

  async getMyListings(sellerId: string) {
    return prisma.dealerListing.findMany({
      where: { seller_id: sellerId, deleted_at: null },
      select: LISTING_SELECT,
      orderBy: { created_at: 'desc' },
    });
  },

  // ── place bid ───────────────────────────────────────────────────────────────
  // Wrapped in a transaction with an optimistic-concurrency guard (updateMany where
  // current_bid still matches what we last read) to close a TOCTOU race: two concurrent
  // bids reading the same current_bid could otherwise both pass the min-amount check and
  // both "win", corrupting current_bid/bid_count and possibly double-triggering auto-buy.
  async placeBid(listingId: string, bidderId: string, input: PlaceBidInput) {
    if (input.amount <= 0) throw new Error('INVALID_BID_AMOUNT');

    for (let attempt = 0; attempt < 3; attempt++) {
      const listing = await prisma.dealerListing.findFirst({
        where: { id: listingId, deleted_at: null, listing_kind: { in: ['auction', 'ych'] } },
      });
      if (!listing) throw new Error('LISTING_NOT_FOUND');
      if (listing.seller_id === bidderId) throw new Error('CANNOT_BID_OWN');
      if (listing.status !== 'active') throw new Error('LISTING_INACTIVE');
      if (listing.auction_ends_at && new Date() > listing.auction_ends_at) throw new Error('AUCTION_ENDED');

      const seller = await prisma.user.findUnique({ where: { id: listing.seller_id }, select: { den_frozen: true } });
      if (seller?.den_frozen) throw new Error('SELLER_FROZEN');

      const minAmount = listing.current_bid
        ? parseFloat(listing.current_bid.toString()) + parseFloat(listing.bid_increment.toString())
        : parseFloat(listing.price.toString());

      if (input.amount < minAmount) throw new Error(`MIN_BID:${minAmount}`);

      const result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.dealerListing.updateMany({
          where: {
            id: listingId,
            status: 'active',
            current_bid: listing.current_bid ?? null,
          },
          data: {
            current_bid: input.amount,
            bid_count: { increment: 1 },
            ...(listing.auto_buy_price && input.amount >= parseFloat(listing.auto_buy_price.toString())
              ? { status: 'sold', winner_id: bidderId }
              : {}),
          },
        });
        if (updateResult.count === 0) return null;

        const bid = await tx.dealerBid.create({
          data: { listing_id: listingId, bidder_id: bidderId, amount: input.amount, message: input.message },
          include: { bidder: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
        });
        const updatedListing = await tx.dealerListing.findUniqueOrThrow({ where: { id: listingId }, select: LISTING_SELECT });
        return { bid, listing: updatedListing };
      });

      if (!result) continue; // current_bid changed under us — re-read and retry

      if (result.listing.status === 'sold') {
        await recalcDenTrust(listing.seller_id);
      }
      return result;
    }

    throw new Error('BID_CONFLICT');
  },

  async getBids(listingId: string, limit = 20) {
    return prisma.dealerBid.findMany({
      where: { listing_id: listingId },
      include: { bidder: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  },

  // ── raffle ────────────────────────────────────────────────────────────────
  // Each purchase writes one DenRaffleTicket row and bumps the counter in the same transaction.
  // The guarded updateMany stops two racing buyers from overselling the last ticket.
  // Selling out draws the winner straight away; otherwise the seller draws when they choose.
  async buyRaffleTicket(listingId: string, buyerId: string) {
    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, listing_kind: 'raffle', status: 'active', deleted_at: null },
    });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (listing.seller_id === buyerId) throw new Error('CANNOT_BUY_OWN');
    if (listing.raffle_max_tickets && listing.raffle_tickets_sold >= listing.raffle_max_tickets)
      throw new Error('RAFFLE_FULL');

    const seller = await prisma.user.findUnique({ where: { id: listing.seller_id }, select: { den_frozen: true } });
    if (seller?.den_frozen) throw new Error('SELLER_FROZEN');

    const sold = await prisma.$transaction(async (tx) => {
      const r = await tx.dealerListing.updateMany({
        where: {
          id: listingId,
          status: 'active',
          winner_id: null,
          ...(listing.raffle_max_tickets ? { raffle_tickets_sold: { lt: listing.raffle_max_tickets } } : {}),
        },
        data: { raffle_tickets_sold: { increment: 1 } },
      });
      if (r.count === 0) return false;
      try {
        await tx.denRaffleTicket.create({ data: { listing_id: listingId, buyer_id: buyerId } });
      } catch (err) {
        if (errCode(err) === 'P2002') throw new Error('ALREADY_HAS_TICKET'); // unique(listing_id, buyer_id); rolls back the counter bump
        throw err;
      }
      return true;
    });
    if (!sold) throw new Error('RAFFLE_FULL');

    const updated = await prisma.dealerListing.findUniqueOrThrow({ where: { id: listingId }, select: LISTING_SELECT });
    if (listing.raffle_max_tickets && updated.raffle_tickets_sold >= listing.raffle_max_tickets) {
      try {
        return await dealersDenService.drawRaffle(listingId);
      } catch {
        return updated; // someone else drew it first; the listing is already settled
      }
    }
    return updated;
  },

  // Picks a winner uniformly among ticket rows. Only the seller may draw when called with sellerId;
  // the automatic draw on sell-out passes no sellerId.
  async drawRaffle(listingId: string, sellerId?: string) {
    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, listing_kind: 'raffle', deleted_at: null },
    });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (sellerId && listing.seller_id !== sellerId) throw new Error('NOT_SELLER');
    if (listing.status !== 'active') throw new Error('LISTING_INACTIVE');

    const count = await prisma.denRaffleTicket.count({ where: { listing_id: listingId } });
    if (count === 0) throw new Error('NO_TICKETS');

    const ticket = await prisma.denRaffleTicket.findFirst({
      where: { listing_id: listingId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      skip: randomInt(count),
      select: { buyer_id: true },
    });
    if (!ticket) throw new Error('NO_TICKETS');

    const r = await prisma.dealerListing.updateMany({
      where: { id: listingId, status: 'active' },
      data: { status: 'sold', winner_id: ticket.buyer_id },
    });
    if (r.count !== 1) throw new Error('LISTING_INACTIVE');

    await recalcDenTrust(listing.seller_id);
    await notificationService.create({
      receiverId: ticket.buyer_id, senderId: listing.seller_id, type: 'den_raffle_won', refId: listingId,
    });
    return prisma.dealerListing.findUniqueOrThrow({ where: { id: listingId }, select: LISTING_SELECT });
  },

  // ── comments ──────────────────────────────────────────────────────────────
  async getComments(listingId: string) {
    return prisma.dealerListingComment.findMany({
      where: { listing_id: listingId, parent_id: null, deleted_at: null },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
        replies: {
          where: { deleted_at: null },
          include: { author: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } } },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async addComment(listingId: string, authorId: string, body: string, parentId?: string) {
    return prisma.dealerListingComment.create({
      data: { listing_id: listingId, author_id: authorId, body, parent_id: parentId ?? null },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
        replies: { where: { deleted_at: null }, include: { author: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } } }, orderBy: { created_at: 'asc' } },
      },
    });
  },

  async deleteComment(commentId: string, userId: string) {
    const c = await prisma.dealerListingComment.findUnique({ where: { id: commentId } });
    if (!c || c.author_id !== userId) throw new Error('FORBIDDEN');
    return prisma.dealerListingComment.update({ where: { id: commentId }, data: { deleted_at: new Date() } });
  },

  // ── trust ──────────────────────────────────────────────────────────────────
  async getTrust(userId: string) {
    return prisma.denTrustScore.findUnique({ where: { user_id: userId } });
  },

  // ── reviews ────────────────────────────────────────────────────────────────
  async createReview(listingId: string, reviewerId: string, input: CreateReviewInput) {
    const listing = await prisma.dealerListing.findFirst({ where: { id: listingId, deleted_at: null } });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (listing.status !== 'sold') throw new Error('NOT_SOLD');
    if (listing.seller_id === reviewerId) throw new Error('CANNOT_REVIEW_OWN');
    if (input.rating < 1 || input.rating > 5) throw new Error('INVALID_RATING');

    // Where a buyer is actually identifiable on-platform (auction/YCH winner, commission
    // booking), require it — otherwise any logged-in user could leave a review on someone
    // else's sold listing they never bought, polluting the seller's public rating.
    if (listing.listing_kind === 'auction' || listing.listing_kind === 'ych') {
      if (listing.winner_id !== reviewerId) throw new Error('NOT_BUYER');
    } else if (listing.listing_kind === 'commission_queue') {
      const booking = await prisma.commissionBooking.findFirst({ where: { listing_id: listingId, buyer_id: reviewerId, deleted_at: null } });
      if (!booking) throw new Error('NOT_BUYER');
    }

    const validTags = (input.tags ?? []).filter(t => (REVIEW_TAGS as readonly string[]).includes(t));

    const review = await prisma.denReview.create({
      data: {
        listing_id:  listingId,
        reviewer_id: reviewerId,
        seller_id:   listing.seller_id,
        rating:      input.rating,
        tags:        validTags,
        text:        input.text,
        photo_url:   input.photoUrl,
      },
      include: {
        reviewer: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });

    await recalcDenTrust(listing.seller_id);
    await notificationService.create({ receiverId: listing.seller_id, senderId: reviewerId, type: 'den_review', refId: listingId });

    return review;
  },

  async getListingReviews(listingId: string) {
    return prisma.denReview.findMany({
      where: { listing_id: listingId, deleted_at: null },
      include: { reviewer: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
    });
  },

  async getSellerReviews(sellerId: string) {
    const reviews = await prisma.denReview.findMany({
      where: { seller_id: sellerId, deleted_at: null },
      include: { reviewer: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
    });
    const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return { reviews, avgRating, totalCount: reviews.length };
  },

  async deleteReview(reviewId: string, userId: string, isAdmin: boolean) {
    const review = await prisma.denReview.findUnique({ where: { id: reviewId } });
    if (!review || review.deleted_at) throw new Error('NOT_FOUND');
    if (!isAdmin && review.reviewer_id !== userId) throw new Error('FORBIDDEN');

    await prisma.denReview.update({ where: { id: reviewId }, data: { deleted_at: new Date() } });
    await recalcDenTrust(review.seller_id);
  },

  // ── weekly top ────────────────────────────────────────────────────────────
  async getWeeklyTop() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1);
    weekStart.setUTCHours(0, 0, 0, 0);

    const top = await prisma.denWeeklyTop.findMany({
      where: { week_start: weekStart },
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true } } },
      orderBy: { rank: 'asc' },
    });

    return { top, weekStart: weekStart.toISOString().slice(0, 10) };
  },

  async recalcWeeklyTop() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekAgo = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate stats per seller for last 7 days
    const soldListings = await prisma.dealerListing.findMany({
      where: { status: 'sold', updated_at: { gte: weekAgo }, deleted_at: null },
      select: { seller_id: true },
    });

    const salesByUser: Record<string, number> = {};
    for (const l of soldListings) salesByUser[l.seller_id] = (salesByUser[l.seller_id] ?? 0) + 1;

    const reviews = await prisma.denReview.findMany({
      where: { created_at: { gte: weekAgo }, deleted_at: null },
      select: { seller_id: true, rating: true },
    });

    const reviewsByUser: Record<string, { count: number; totalRating: number }> = {};
    for (const r of reviews) {
      if (!reviewsByUser[r.seller_id]) reviewsByUser[r.seller_id] = { count: 0, totalRating: 0 };
      reviewsByUser[r.seller_id].count++;
      reviewsByUser[r.seller_id].totalRating += r.rating;
    }

    const userIds = [...new Set([...Object.keys(salesByUser), ...Object.keys(reviewsByUser)])];
    if (userIds.length === 0) return { top: [], weekStart: weekStart.toISOString().slice(0, 10) };

    const scored = userIds.map(uid => {
      const sales = salesByUser[uid] ?? 0;
      const rv = reviewsByUser[uid] ?? { count: 0, totalRating: 0 };
      const avgRating = rv.count > 0 ? rv.totalRating / rv.count : 0;
      const score = sales * 1.0 + avgRating * 2.0 + rv.count * 0.5;
      return { user_id: uid, sales_count: sales, avg_rating: avgRating, new_reviews: rv.count, score };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    // Remove old top-week badges from previous top-3, restoring whatever badge they had before
    const prevTop = await prisma.denWeeklyTop.findMany({
      where: { week_start: { lt: weekStart }, rank: { lte: 3 } },
      select: { user_id: true },
    });
    for (const p of prevTop) {
      const u = await prisma.user.findUnique({ where: { id: p.user_id }, select: { badge_type: true, prev_badge_type: true } });
      if (u?.badge_type === 'den_top_week') {
        await prisma.user.update({ where: { id: p.user_id }, data: { badge_type: u.prev_badge_type, prev_badge_type: null } });
      }
    }

    // Upsert new top entries
    for (let i = 0; i < scored.length; i++) {
      const s = scored[i];
      await prisma.denWeeklyTop.upsert({
        where: { user_id_week_start: { user_id: s.user_id, week_start: weekStart } },
        create: { user_id: s.user_id, rank: i + 1, week_start: weekStart, sales_count: s.sales_count, avg_rating: s.avg_rating, new_reviews: s.new_reviews, score: s.score },
        update: { rank: i + 1, sales_count: s.sales_count, avg_rating: s.avg_rating, new_reviews: s.new_reviews, score: s.score },
      });

      if (i < 3) {
        const s2 = await prisma.user.findUnique({ where: { id: s.user_id }, select: { badge_type: true } });
        if (s2?.badge_type !== 'den_top_week') {
          await prisma.user.update({ where: { id: s.user_id }, data: { prev_badge_type: s2?.badge_type ?? null, badge_type: 'den_top_week' } });
        }
      }
    }

    return this.getWeeklyTop();
  },

  // ── wishlist ──────────────────────────────────────────────────────────────
  async addToWishlist(listingId: string, userId: string) {
    const existing = await prisma.denWishlist.findUnique({
      where: { user_id_listing_id: { user_id: userId, listing_id: listingId } },
    });
    if (existing) return { added: false };

    await prisma.denWishlist.create({ data: { user_id: userId, listing_id: listingId } });
    return { added: true };
  },

  async removeFromWishlist(listingId: string, userId: string) {
    await prisma.denWishlist.deleteMany({ where: { user_id: userId, listing_id: listingId } });
  },

  async getMyWishlist(userId: string) {
    const items = await prisma.denWishlist.findMany({
      where: { user_id: userId },
      include: { listing: { select: LISTING_SELECT } },
      orderBy: { created_at: 'desc' },
    });
    return items.map(i => i.listing);
  },

  // ── commission bookings ────────────────────────────────────────────────────
  async createBooking(listingId: string, buyerId: string, input: CreateBookingInput) {
    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, listing_kind: 'commission_queue', status: 'active', deleted_at: null },
    });
    if (!listing) throw new Error('LISTING_NOT_FOUND');

    const denUser = await prisma.user.findUnique({ where: { id: buyerId }, select: { den_frozen: true } });
    if (denUser?.den_frozen) throw new Error('DEN_FROZEN');

    const seller = await prisma.user.findUnique({ where: { id: listing.seller_id }, select: { den_frozen: true } });
    if (seller?.den_frozen) throw new Error('SELLER_FROZEN');

    if (listing.commission_slots_total !== null && listing.commission_slots_taken >= listing.commission_slots_total)
      throw new Error('SLOTS_FULL');

    const { booking, queuePosition } = await prisma.$transaction(async (tx) => {
      // Re-check-and-reserve a slot atomically inside the transaction: the plain "check
      // then increment" above happens *before* the transaction starts, so it isn't
      // protected by Serializable isolation and two concurrent bookings could both pass
      // it and both increment commission_slots_taken, overbooking past the seller's
      // configured limit. Guarding the increment's WHERE with the same condition makes
      // only one of two racing requests able to claim the last slot.
      if (listing.commission_slots_total !== null) {
        const reserved = await tx.dealerListing.updateMany({
          where: { id: listingId, commission_slots_taken: { lt: listing.commission_slots_total } },
          data: { commission_slots_taken: { increment: 1 } },
        });
        if (reserved.count === 0) throw new Error('SLOTS_FULL');
      } else {
        await tx.dealerListing.update({ where: { id: listingId }, data: { commission_slots_taken: { increment: 1 } } });
      }

      const lastBooking = await tx.commissionBooking.findFirst({
        where: { listing_id: listingId, deleted_at: null },
        orderBy: { queue_position: 'desc' },
        select: { queue_position: true },
      });
      const pos = (lastBooking?.queue_position ?? 0) + 1;
      const created = await tx.commissionBooking.create({
        data: { listing_id: listingId, buyer_id: buyerId, queue_position: pos, form_data: input.formData as any },
        include: { buyer: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      });
      return { booking: created, queuePosition: pos };
    }, { isolationLevel: 'Serializable' });

    await notificationService.create({ receiverId: listing.seller_id, senderId: buyerId, type: 'den_commission_booked', refId: listingId });

    return { booking, queuePosition };
  },

  async getBookings(listingId: string, sellerId: string) {
    const listing = await prisma.dealerListing.findFirst({ where: { id: listingId, seller_id: sellerId, deleted_at: null } });
    if (!listing) throw new Error('FORBIDDEN');

    return prisma.commissionBooking.findMany({
      where: { listing_id: listingId, deleted_at: null },
      include: { buyer: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { queue_position: 'asc' },
    });
  },

  async updateBooking(bookingId: string, sellerId: string, input: UpdateBookingInput) {
    const booking = await prisma.commissionBooking.findFirst({
      where: { id: bookingId, deleted_at: null },
      include: { listing: { select: { seller_id: true } } },
    });
    if (!booking || booking.listing.seller_id !== sellerId) throw new Error('FORBIDDEN');

    return prisma.commissionBooking.update({
      where: { id: bookingId },
      data: { status: input.status, notes: input.notes },
    });
  },

  async cancelBooking(bookingId: string, buyerId: string) {
    const booking = await prisma.commissionBooking.findFirst({
      where: { id: bookingId, buyer_id: buyerId, deleted_at: null },
    });
    if (!booking) throw new Error('NOT_FOUND');
    if (booking.status !== 'pending') throw new Error('CANNOT_CANCEL');

    await prisma.$transaction([
      prisma.commissionBooking.update({ where: { id: bookingId }, data: { deleted_at: new Date() } }),
      prisma.dealerListing.update({ where: { id: booking.listing_id }, data: { commission_slots_taken: { decrement: 1 } } }),
    ]);

    // Notify next in queue
    const next = await prisma.commissionBooking.findFirst({
      where: { listing_id: booking.listing_id, queue_position: { gt: booking.queue_position }, deleted_at: null },
      orderBy: { queue_position: 'asc' },
    });
    if (next) {
      const listing = await prisma.dealerListing.findUnique({ where: { id: booking.listing_id }, select: { seller_id: true } });
      await notificationService.create({ receiverId: next.buyer_id, senderId: listing?.seller_id, type: 'den_queue_moved', refId: booking.listing_id });
    }
  },

  // ── disputes ──────────────────────────────────────────────────────────────
  async createDispute(listingId: string, buyerId: string, input: CreateDisputeInput) {
    const listing = await prisma.dealerListing.findFirst({ where: { id: listingId, status: 'sold', deleted_at: null } });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (listing.seller_id === buyerId) throw new Error('CANNOT_DISPUTE_OWN');

    // Same buyer-identity check as reviews, but higher stakes: an unresolved dispute
    // auto-resolves in the "buyer"'s favor after 48h of seller silence, and 3 lost
    // disputes freezes the seller's Den account — without this, any user could file
    // fake disputes against listings they never bought to get a seller frozen.
    if (listing.listing_kind === 'auction' || listing.listing_kind === 'ych') {
      if (listing.winner_id !== buyerId) throw new Error('NOT_BUYER');
    } else if (listing.listing_kind === 'commission_queue') {
      const booking = await prisma.commissionBooking.findFirst({ where: { listing_id: listingId, buyer_id: buyerId, deleted_at: null } });
      if (!booking) throw new Error('NOT_BUYER');
    }

    const alreadyOpen = await prisma.denDispute.findFirst({ where: { listing_id: listingId, buyer_id: buyerId, deleted_at: null } });
    if (alreadyOpen) throw new Error('ALREADY_DISPUTED');

    return prisma.denDispute.create({
      data: { listing_id: listingId, buyer_id: buyerId, seller_id: listing.seller_id, reason: input.reason },
    });
  },

  async replyDispute(disputeId: string, sellerId: string, input: ReplyDisputeInput) {
    const dispute = await prisma.denDispute.findFirst({ where: { id: disputeId, seller_id: sellerId, deleted_at: null } });
    if (!dispute) throw new Error('NOT_FOUND');
    if (dispute.status !== 'open') throw new Error('DISPUTE_CLOSED');

    return prisma.denDispute.update({
      where: { id: disputeId },
      data: { seller_reply: input.reply, replied_at: new Date(), status: 'seller_replied' },
    });
  },

  async getMyDisputes(userId: string) {
    return prisma.denDispute.findMany({
      where: { deleted_at: null, OR: [{ buyer_id: userId }, { seller_id: userId }] },
      orderBy: { created_at: 'desc' },
    });
  },

  async getAllDisputes() {
    return prisma.denDispute.findMany({
      where: { status: 'open', deleted_at: null },
      orderBy: { opened_at: 'asc' },
    });
  },

  async resolveDispute(disputeId: string, adminId: string, winner: 'buyer' | 'seller', resolution: string) {
    const dispute = await prisma.denDispute.findFirst({ where: { id: disputeId, deleted_at: null } });
    if (!dispute) throw new Error('NOT_FOUND');

    const status = winner === 'buyer' ? 'resolved_buyer' : 'resolved_seller';

    // Условный переход из open: повторный клик или второй админ не засчитывают спор повторно
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.denDispute.updateMany({
        where: { id: disputeId, status: 'open' },
        data: { status, resolved_by: adminId, resolution, resolved_at: new Date() },
      });
      if (claimed.count !== 1) throw new Error('DISPUTE_CLOSED');
      if (winner === 'buyer') {
        await tx.denTrustScore.upsert({
          where: { user_id: dispute.seller_id },
          create: { user_id: dispute.seller_id, disputes_lost: 1 },
          update: { disputes_lost: { increment: 1 } },
        });
      }
    });

    if (winner === 'buyer') {
      await recalcDenTrust(dispute.seller_id);
    }

    await Promise.all([
      notificationService.create({ receiverId: dispute.buyer_id, senderId: adminId, type: 'den_dispute_resolved', refId: disputeId }),
      notificationService.create({ receiverId: dispute.seller_id, senderId: adminId, type: 'den_dispute_resolved', refId: disputeId }),
    ]);
  },

  // ── auto-resolve disputes (call via cron) ─────────────────────────────────
  async autoResolveDisputes() {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const stale = await prisma.denDispute.findMany({
      where: { status: 'open', opened_at: { lt: cutoff }, seller_reply: null, deleted_at: null },
    });

    for (const d of stale) {
      const claimed = await prisma.$transaction(async (tx) => {
        const r = await tx.denDispute.updateMany({
          where: { id: d.id, status: 'open' },
          data: { status: 'auto_resolved', resolution: 'Продавец не ответил в течение 48 часов', resolved_at: new Date() },
        });
        if (r.count !== 1) return false; // уже закрыт админом или другим запуском
        await tx.denTrustScore.upsert({
          where: { user_id: d.seller_id },
          create: { user_id: d.seller_id, disputes_lost: 1 },
          update: { disputes_lost: { increment: 1 } },
        });
        return true;
      });
      if (!claimed) continue;
      await recalcDenTrust(d.seller_id);
      await Promise.all([
        notificationService.create({ receiverId: d.buyer_id, type: 'den_dispute_auto_resolved', refId: d.id }),
        notificationService.create({ receiverId: d.seller_id, type: 'den_dispute_auto_resolved', refId: d.id }),
      ]);
    }
    return stale.length;
  },

  // ── close ended auctions and YCH (call via cron) ──────────────────────────
  // Auctions used to stay 'active' forever after their end time: the bid button kept showing
  // and no winner was ever recorded. Highest bid wins (earliest bid breaks ties); no bids -> archived.
  async closeExpiredAuctions() {
    const expired = await prisma.dealerListing.findMany({
      where: { listing_kind: { in: ['auction', 'ych'] }, status: 'active', deleted_at: null, auction_ends_at: { lte: new Date() } },
      select: { id: true, seller_id: true },
    });

    let closed = 0;
    for (const l of expired) {
      const topBid = await prisma.dealerBid.findFirst({
        where: { listing_id: l.id },
        orderBy: [{ amount: 'desc' }, { created_at: 'asc' }],
        select: { bidder_id: true },
      });
      const r = await prisma.dealerListing.updateMany({
        where: { id: l.id, status: 'active' },
        data: topBid
          ? { status: 'sold', winner_id: topBid.bidder_id }
          : { status: 'archived' },
      });
      if (r.count !== 1) continue; // changed by someone else in the meantime
      closed++;
      if (topBid) {
        await recalcDenTrust(l.seller_id);
        await notificationService.create({ receiverId: topBid.bidder_id, senderId: l.seller_id, type: 'den_auction_won', refId: l.id });
      }
    }
    return closed;
  },

  // ── seller page ───────────────────────────────────────────────────────────
  async getSellerPage(username: string) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true, username: true, display_name: true, avatar_url: true,
        is_verified: true, badge_type: true, created_at: true,
        denTrustScore: true,
        den_frozen: true,
      },
    });
    if (!user) throw new Error('USER_NOT_FOUND');

    const [activeListings, reviewData, totalSales] = await Promise.all([
      prisma.dealerListing.findMany({
        where: { seller_id: user.id, status: 'active', deleted_at: null },
        select: LISTING_SELECT,
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
      dealersDenService.getSellerReviews(user.id),
      prisma.dealerListing.count({ where: { seller_id: user.id, status: 'sold', deleted_at: null } }),
    ]);

    const badges: string[] = [];
    if (user.badge_type) badges.push(user.badge_type);

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        isVerified: user.is_verified,
        denTrustScore: user.denTrustScore,
        createdAt: user.created_at,
        den_frozen: user.den_frozen,
      },
      stats: {
        totalSales,
        avgRating: reviewData.avgRating,
        reviewCount: reviewData.totalCount,
        memberSince: user.created_at,
      },
      activeListings,
      reviews: reviewData.reviews.slice(0, 10),
      badges,
    };
  },
};
