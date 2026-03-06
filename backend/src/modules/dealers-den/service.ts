import prisma from '../../config/prisma.js';
import type { CreateListingInput, UpdateListingInput, GetListingsQuery } from './types.js';

const LISTING_SELECT = {
  id: true,
  seller_id: true,
  title: true,
  description: true,
  price: true,
  currency: true,
  category: true,
  type: true,
  images: true,
  status: true,
  quantity: true,
  quantity_sold: true,
  is_nsfw: true,
  tags: true,
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
  // ── list listings ──────────────────────────────────────────────────────────
  async list(query: GetListingsQuery) {
    const page  = Math.max(1, parseInt(query.page  ?? '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip  = (page - 1) * limit;

    const where: any = { deleted_at: null };

    // Only show active listings by default (unless filtering by seller or explicit status)
    if (query.status) {
      where.status = query.status;
    } else if (!query.sellerId) {
      where.status = 'active';
    }

    if (query.category) where.category = query.category;
    if (query.type)     where.type = query.type;
    if (query.sellerId) where.seller_id = query.sellerId;

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

    const [listings, total] = await Promise.all([
      prisma.dealerListing.findMany({
        where,
        select: LISTING_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dealerListing.count({ where }),
    ]);

    return { listings, total, page, limit };
  },

  // ── get single ────────────────────────────────────────────────────────────
  async getById(id: string) {
    return prisma.dealerListing.findFirst({
      where: { id, deleted_at: null },
      select: LISTING_SELECT,
    });
  },

  // ── create ────────────────────────────────────────────────────────────────
  async create(sellerId: string, input: CreateListingInput) {
    return prisma.dealerListing.create({
      data: {
        seller_id:   sellerId,
        title:       input.title,
        description: input.description,
        price:       input.price,
        currency:    input.currency    ?? 'USD',
        category:    input.category    ?? 'other',
        type:        input.type        ?? 'physical',
        images:      input.images      ?? [],
        quantity:    input.quantity    ?? 1,
        is_nsfw:     input.isNsfw      ?? false,
        tags:        input.tags        ?? [],
        status:      input.status      ?? 'active',
      },
      select: LISTING_SELECT,
    });
  },

  // ── update ────────────────────────────────────────────────────────────────
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

  // ── soft delete ───────────────────────────────────────────────────────────
  async delete(id: string, sellerId: string) {
    const existing = await prisma.dealerListing.findFirst({ where: { id, seller_id: sellerId, deleted_at: null } });
    if (!existing) return null;
    return prisma.dealerListing.update({ where: { id }, data: { deleted_at: new Date() } });
  },

  // ── my listings ───────────────────────────────────────────────────────────
  async getMyListings(sellerId: string) {
    return prisma.dealerListing.findMany({
      where: { seller_id: sellerId, deleted_at: null },
      select: LISTING_SELECT,
      orderBy: { created_at: 'desc' },
    });
  },
};
