import prisma from '../../config/prisma.js';
import type { CreateListingInput, UpdateListingInput, GetListingsQuery, PlaceBidInput } from './types.js';

const LISTING_SELECT = {
  id: true,
  seller_id: true,
  title: true,
  description: true,
  price: true,
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
};

export const dealersDenService = {
  // ── list listings ─────────────────────────────────────────────────────────
  async list(query: GetListingsQuery) {
    const page  = Math.max(1, parseInt(query.page  ?? '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    const where: any = { deleted_at: null };

    if (query.status) {
      where.status = query.status;
    } else if (!query.sellerId) {
      where.status = 'active';
    }

    if (query.category)    where.category    = query.category;
    if (query.type)        where.type        = query.type;
    if (query.listingKind) where.listing_kind = query.listingKind;
    if (query.sellerId)    where.seller_id   = query.sellerId;
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
                                    { created_at: 'desc' }; // newest (default)

    const [listings, total] = await Promise.all([
      prisma.dealerListing.findMany({
        where,
        select: LISTING_SELECT,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.dealerListing.count({ where }),
    ]);

    return { listings, total, page, limit };
  },

  // ── get single ────────────────────────────────────────────────────
  async getById(id: string) {
    return prisma.dealerListing.findFirst({
      where: { id, deleted_at: null },
      select: LISTING_SELECT,
    });
  },

  // ── create ─────────────────────────────────────────────────────────────────
  async create(sellerId: string, input: CreateListingInput) {
    const kind = input.listingKind ?? 'fixed';
    return prisma.dealerListing.create({
      data: {
        seller_id:    sellerId,
        title:        input.title,
        description:  input.description,
        price:        input.price,
        currency:     input.currency        ?? 'USD',
        category:     input.category        ?? 'other',
        type:         input.type            ?? 'physical',
        listing_kind: kind,
        images:       input.images          ?? [],
        quantity:     input.quantity        ?? 1,
        is_nsfw:      input.isNsfw          ?? false,
        tags:         input.tags            ?? [],
        status:       input.status          ?? 'active',
        // auction fields
        auction_ends_at:     input.auctionEndsAt ? new Date(input.auctionEndsAt) : undefined,
        bid_increment:       input.bidIncrement  ?? 1,
        auto_buy_price:      input.autoBuyPrice  ?? undefined,
        raffle_max_tickets:  input.raffleMaxTickets ?? undefined,
      },
      select: LISTING_SELECT,
    });
  },

  // ── update ──────────────────────────────────────────────────────────────────────
  async update(id: string, sellerId: string, input: UpdateListingInput) {
    const existing = await prisma.dealerListing.findFirst({ where: { id, seller_id: sellerId, deleted_at: null } });
    if (!existing) return null;

    const data: any = {};
    if (input.title       !== undefined) data.title       = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.price       !== undefined) data.price       = input.price;
    if (input.currency    !== undefined) data.currency    = input.currency;
    if (input.category    !== undefined) data.category    = input.category;
    if (input.type        !== undefined) data.type        = input.type;
    if (input.images      !== undefined) data.images      = input.images;
    if (input.quantity    !== undefined) data.quantity    = input.quantity;
    if (input.isNsfw      !== undefined) data.is_nsfw     = input.isNsfw;
    if (input.tags        !== undefined) data.tags        = input.tags;
    if (input.status      !== undefined) data.status      = input.status;

    return prisma.dealerListing.update({
      where: { id },
      data,
      select: LISTING_SELECT,
    });
  },

  // ── soft delete ─────────────────────────────────────────────────────────────────
  async delete(id: string, sellerId: string) {
    const existing = await prisma.dealerListing.findFirst({ where: { id, seller_id: sellerId, deleted_at: null } });
    if (!existing) return null;
    return prisma.dealerListing.update({ where: { id }, data: { deleted_at: new Date() } });
  },

  // ── my listings ────────────────────────────────────────────────────────────────
  async getMyListings(sellerId: string) {
    return prisma.dealerListing.findMany({
      where: { seller_id: sellerId, deleted_at: null },
      select: LISTING_SELECT,
      orderBy: { created_at: 'desc' },
    });
  },

  // ── place bid ───────────────────────────────────────────────────────────────────
  async placeBid(listingId: string, bidderId: string, input: PlaceBidInput) {
    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, deleted_at: null, listing_kind: { in: ['auction', 'ych'] } },
    });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (listing.seller_id === bidderId) throw new Error('CANNOT_BID_OWN');
    if (listing.status !== 'active') throw new Error('LISTING_INACTIVE');
    if (listing.auction_ends_at && new Date() > listing.auction_ends_at) throw new Error('AUCTION_ENDED');

    const minAmount = listing.current_bid
      ? parseFloat(listing.current_bid.toString()) + parseFloat(listing.bid_increment.toString())
      : parseFloat(listing.price.toString());

    if (input.amount < minAmount) throw new Error(`MIN_BID:${minAmount}`);

    // Record bid
    const bid = await prisma.dealerBid.create({
      data: { listing_id: listingId, bidder_id: bidderId, amount: input.amount, message: input.message },
      include: { bidder: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
    });

    // Update listing
    const updatedListing = await prisma.dealerListing.update({
      where: { id: listingId },
      data: {
        current_bid: input.amount,
        bid_count: { increment: 1 },
        // Auto-buy: close immediately
        ...(listing.auto_buy_price && input.amount >= parseFloat(listing.auto_buy_price.toString())
          ? { status: 'sold', winner_id: bidderId }
          : {}),
      },
      select: LISTING_SELECT,
    });

    return { bid, listing: updatedListing };
  },

  // ── get bids for listing ────────────────────────────────────────────────────
  async getBids(listingId: string, limit = 20) {
    return prisma.dealerBid.findMany({
      where: { listing_id: listingId },
      include: { bidder: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  },

  // ── buy raffle ticket ──────────────────────────────────────────────────────────
  async buyRaffleTicket(listingId: string, buyerId: string) {
    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, listing_kind: 'raffle', status: 'active', deleted_at: null },
    });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (listing.raffle_max_tickets && listing.raffle_tickets_sold >= listing.raffle_max_tickets)
      throw new Error('RAFFLE_FULL');

    const updated = await prisma.dealerListing.update({
      where: { id: listingId },
      data: { raffle_tickets_sold: { increment: 1 } },
      select: LISTING_SELECT,
    });
    return updated;
  },

  // ── comments ──────────────────────────────────────────────────────────────
  async getComments(listingId: string) {
    return prisma.dealerListingComment.findMany({
      where: { listing_id: listingId, parent_id: null, deleted_at: null },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
        replies: {
          where: { deleted_at: null },
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true, is_verified: true } },
          },
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
};


