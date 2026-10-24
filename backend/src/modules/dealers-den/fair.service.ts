import prisma from '../../config/prisma.js';
import type { CreateFairInput } from './types.js';

const PARTICIPANT_SELECT = { id: true, user_id: true, listing_id: true, status: true, user: { select: { id: true, username: true, display_name: true, avatar_url: true } } } as const;

/** Публично виден только одобренный состав: заявки на рассмотрении и отклонённые — дело организатора. */
const PUBLIC_PARTICIPANTS = { select: PARTICIPANT_SELECT, where: { status: 'approved' } } as const;

const FAIR_SELECT = {
  id: true, title: true, description: true, theme: true,
  banner_url: true, starts_at: true, ends_at: true, status: true, created_at: true,
};

export const fairService = {
  async getCurrent(viewerId?: string) {
    const now = new Date();
    const fair = await prisma.denFair.findFirst({
      where: { deleted_at: null, status: { in: ['open', 'upcoming'] }, starts_at: { lte: now }, ends_at: { gte: now } },
      select: { ...FAIR_SELECT, participants: PUBLIC_PARTICIPANTS },
      orderBy: { starts_at: 'desc' },
    }) ?? await prisma.denFair.findFirst({
      where: { deleted_at: null, status: 'upcoming' },
      select: { ...FAIR_SELECT, participants: PUBLIC_PARTICIPANTS },
      orderBy: { starts_at: 'asc' },
    });

    if (!fair) return null;

    const topListings = await prisma.dealerListing.findMany({
      where: {
        status: 'active', deleted_at: null, is_nsfw: false, category: { not: 'avatar_frame' },
        id: { in: fair.participants.filter(p => p.status === 'approved' && p.listing_id).map(p => p.listing_id!) },
      },
      select: { id: true, title: true, price: true, currency: true, images: true, listing_kind: true, seller: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      take: 10,
    });

    return { fair, topListings, mine: await this.mine(fair.id, viewerId) };
  },

  async getById(fairId: string, viewerId?: string) {
    const fair = await prisma.denFair.findFirst({
      where: { id: fairId, deleted_at: null },
      select: { ...FAIR_SELECT, participants: PUBLIC_PARTICIPANTS },
    });
    if (!fair) return null;

    const topListings = await prisma.dealerListing.findMany({
      where: {
        status: 'active', deleted_at: null, is_nsfw: false, category: { not: 'avatar_frame' },
        id: { in: fair.participants.filter(p => p.status === 'approved' && p.listing_id).map(p => p.listing_id!) },
      },
      select: { id: true, title: true, price: true, currency: true, images: true, listing_kind: true, seller: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      take: 10,
    });

    return { fair, topListings, mine: await this.mine(fair.id, viewerId) };
  },

  /** Собственная заявка зрителя: публичный состав показывает только одобренных, а свой статус человек должен видеть всегда. */
  async mine(fairId: string, viewerId?: string) {
    if (!viewerId) return null;
    return prisma.denFairParticipant.findUnique({
      where: { fair_id_user_id: { fair_id: fairId, user_id: viewerId } },
      select: { status: true, listing_id: true },
    });
  },

  async listAll() {
    return prisma.denFair.findMany({
      where: { deleted_at: null },
      select: FAIR_SELECT,
      orderBy: { starts_at: 'desc' },
    });
  },

  async create(input: CreateFairInput) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw Object.assign(new Error('Название ярмарки: от 1 до 200 символов'), { statusCode: 422 });
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw Object.assign(new Error('Укажите корректные даты: конец позже начала'), { statusCode: 422 });
    }
    return prisma.denFair.create({
      data: {
        title: input.title.trim(),
        description: input.description,
        theme: input.theme,
        banner_url: input.bannerUrl,
        starts_at: startsAt,
        ends_at:   endsAt,
      },
      select: FAIR_SELECT,
    });
  },

  async apply(fairId: string, userId: string, listingId?: string) {
    const fair = await prisma.denFair.findFirst({ where: { id: fairId, deleted_at: null }, select: { ends_at: true } });
    if (!fair) throw Object.assign(new Error('Ярмарка не найдена'), { statusCode: 404 });
    if (fair.ends_at < new Date()) throw Object.assign(new Error('Ярмарка уже закончилась'), { statusCode: 409 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { is_verified: true, den_frozen: true } });
    if (!user?.is_verified || user.den_frozen) throw Object.assign(new Error('Участвовать могут верифицированные продавцы без заморозки'), { statusCode: 403 });

    if (listingId) {
      // Выставить на ярмарку можно только свой активный лот не 18+ — иначе витрину занимают чужие и скрытые товары
      const own = await prisma.dealerListing.findFirst({
        where: { id: listingId, seller_id: userId, status: 'active', deleted_at: null, is_nsfw: false },
        select: { id: true },
      });
      if (!own) throw Object.assign(new Error('Выберите свой активный лот без пометки 18+'), { statusCode: 422 });
    }

    const prev = await prisma.denFairParticipant.findUnique({ where: { fair_id_user_id: { fair_id: fairId, user_id: userId } } });
    // Смена лота после одобрения возвращает заявку на рассмотрение, иначе одобрение можно «перенести» на другой товар
    const listingChanged = !!prev && (prev.listing_id ?? null) !== (listingId ?? null);
    return prisma.denFairParticipant.upsert({
      where: { fair_id_user_id: { fair_id: fairId, user_id: userId } },
      create: { fair_id: fairId, user_id: userId, listing_id: listingId },
      update: { listing_id: listingId, ...(listingChanged && prev?.status !== 'rejected' ? { status: 'pending' } : {}) },
    });
  },

  async updateParticipant(fairId: string, userId: string, status: 'approved' | 'rejected') {
    return prisma.denFairParticipant.update({
      where: { fair_id_user_id: { fair_id: fairId, user_id: userId } },
      data: { status },
    });
  },
};
