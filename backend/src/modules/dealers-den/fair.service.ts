import prisma from '../../config/prisma.js';
import type { CreateFairInput } from './types.js';

const FAIR_SELECT = {
  id: true, title: true, description: true, theme: true,
  banner_url: true, starts_at: true, ends_at: true, status: true, created_at: true,
};

export const fairService = {
  async getCurrent() {
    const now = new Date();
    const fair = await prisma.denFair.findFirst({
      where: { deleted_at: null, status: { in: ['open', 'upcoming'] }, starts_at: { lte: now }, ends_at: { gte: now } },
      select: { ...FAIR_SELECT, participants: { select: { id: true, user_id: true, listing_id: true, status: true, user: { select: { id: true, username: true, display_name: true, avatar_url: true } } } } },
      orderBy: { starts_at: 'desc' },
    }) ?? await prisma.denFair.findFirst({
      where: { deleted_at: null, status: 'upcoming' },
      select: { ...FAIR_SELECT, participants: { select: { id: true, user_id: true, listing_id: true, status: true, user: { select: { id: true, username: true, display_name: true, avatar_url: true } } } } },
      orderBy: { starts_at: 'asc' },
    });

    if (!fair) return null;

    const topListings = await prisma.dealerListing.findMany({
      where: {
        status: 'active', deleted_at: null,
        id: { in: fair.participants.filter(p => p.status === 'approved' && p.listing_id).map(p => p.listing_id!) },
      },
      select: { id: true, title: true, price: true, currency: true, images: true, listing_kind: true, seller: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      take: 10,
    });

    return { fair, topListings };
  },

  async getById(fairId: string) {
    const fair = await prisma.denFair.findFirst({
      where: { id: fairId, deleted_at: null },
      select: { ...FAIR_SELECT, participants: { select: { id: true, user_id: true, listing_id: true, status: true, user: { select: { id: true, username: true, display_name: true, avatar_url: true } } } } },
    });
    if (!fair) return null;

    const topListings = await prisma.dealerListing.findMany({
      where: {
        status: 'active', deleted_at: null,
        id: { in: fair.participants.filter(p => p.status === 'approved' && p.listing_id).map(p => p.listing_id!) },
      },
      select: { id: true, title: true, price: true, currency: true, images: true, listing_kind: true, seller: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      take: 10,
    });

    return { fair, topListings };
  },

  async listAll() {
    return prisma.denFair.findMany({
      where: { deleted_at: null },
      select: FAIR_SELECT,
      orderBy: { starts_at: 'desc' },
    });
  },

  async create(input: CreateFairInput) {
    return prisma.denFair.create({
      data: {
        title: input.title,
        description: input.description,
        theme: input.theme,
        banner_url: input.bannerUrl,
        starts_at: new Date(input.startsAt),
        ends_at:   new Date(input.endsAt),
      },
      select: FAIR_SELECT,
    });
  },

  async apply(fairId: string, userId: string, listingId?: string) {
    return prisma.denFairParticipant.upsert({
      where: { fair_id_user_id: { fair_id: fairId, user_id: userId } },
      create: { fair_id: fairId, user_id: userId, listing_id: listingId },
      update: { listing_id: listingId },
    });
  },

  async updateParticipant(fairId: string, userId: string, status: 'approved' | 'rejected') {
    return prisma.denFairParticipant.update({
      where: { fair_id_user_id: { fair_id: fairId, user_id: userId } },
      data: { status },
    });
  },
};
