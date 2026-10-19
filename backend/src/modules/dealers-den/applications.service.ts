import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';
import { sanitizeDisplayText } from '../../lib/sanitizeText.js';
import { ensureGroupThread } from '../../lib/groupThread.js';
import { messageService } from '../messages/service.js';
import { sanitizeCharacters, resolveCharacters, type CharacterRef } from '../../lib/orderCharacters.js';

// Заявка на лот подаётся только в группу-продавца: в личные сообщения ничего не уходит,
// группа сама пишет заявителю первой. Одна заявка на пользователя и лот.

export const APPLICATION_STATUSES = ['pending', 'contacted', 'accepted', 'declined'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

const MAX_MESSAGE = 1000;

const APPLICANT_SELECT = {
  id: true, username: true, display_name: true, avatar_url: true, is_verified: true, created_at: true,
} as const;

const LISTING_BRIEF_SELECT = {
  id: true, title: true, price: true, discount_percent: true, currency: true, images: true, is_nsfw: true, status: true,
} as const;

/** Владелец и администраторы группы видят и обрабатывают заявки. */
async function canManageGroup(groupId: string, userId: string): Promise<boolean> {
  const member = await prisma.groupMember.findUnique({
    where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    select: { role: true },
  });
  return member?.role === 'owner' || member?.role === 'admin';
}

export const listingApplicationService = {
  async create(listingId: string, applicantId: string, rawMessage: unknown, rawCharacters?: unknown) {
    const message = typeof rawMessage === 'string' ? sanitizeDisplayText(rawMessage, MAX_MESSAGE) : '';
    if (!message.trim()) throw new Error('EMPTY_MESSAGE');
    const characters = await sanitizeCharacters(applicantId, rawCharacters);

    const listing = await prisma.dealerListing.findFirst({
      where: { id: listingId, status: 'active', deleted_at: null },
      select: { id: true, title: true, seller_id: true, group_id: true, group: { select: { id: true, slug: true, owner_id: true, deleted_at: true } } },
    });
    if (!listing) throw new Error('LISTING_NOT_FOUND');
    if (!listing.group || listing.group.deleted_at) throw new Error('NO_GROUP');
    if (listing.seller_id === applicantId || listing.group.owner_id === applicantId) throw new Error('OWN_LISTING');

    const applicant = await prisma.user.findUnique({ where: { id: applicantId }, select: { den_frozen: true } });
    if (applicant?.den_frozen) throw new Error('DEN_FROZEN');

    const existing = await prisma.listingApplication.findUnique({
      where: { listing_id_applicant_id: { listing_id: listingId, applicant_id: applicantId } },
      select: { id: true },
    });
    if (existing) throw new Error('ALREADY_APPLIED');

    let application;
    try {
      application = await prisma.listingApplication.create({
        data: { listing_id: listingId, group_id: listing.group.id, applicant_id: applicantId, message, characters: characters as any },
        select: { id: true, status: true, created_at: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new Error('ALREADY_APPLIED'); // гонка двух кликов
      throw e;
    }

    await notificationService.create({
      receiverId: listing.group.owner_id,
      senderId: applicantId,
      type: 'den_lot_application',
      refId: application.id,
      meta: { groupSlug: listing.group.slug, groupId: listing.group.id, listingId: listing.id, listingTitle: listing.title },
    });

    return application;
  },

  /** Статус собственной заявки на лот; у принятой — ещё и текущий этап заказа. */
  async getMine(listingId: string, applicantId: string) {
    const app = await prisma.listingApplication.findUnique({
      where: { listing_id_applicant_id: { listing_id: listingId, applicant_id: applicantId } },
      select: { id: true, status: true, created_at: true, order_id: true },
    });
    if (!app) return null;
    const order = app.order_id
      ? await prisma.order.findFirst({ where: { id: app.order_id, deleted_at: null }, select: { status: true, deadline_at: true } })
      : null;
    const { order_id: _o, ...rest } = app;
    return { ...rest, orderStage: order?.status ?? null, deadlineAt: order?.deadline_at ?? null };
  },

  async listForGroup(groupId: string, userId: string, status?: string) {
    if (!(await canManageGroup(groupId, userId))) throw new Error('FORBIDDEN');
    const where = {
      group_id: groupId,
      ...(status && (APPLICATION_STATUSES as readonly string[]).includes(status) ? { status } : {}),
    };
    const [applications, pending] = await Promise.all([
      prisma.listingApplication.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: 200,
        select: {
          id: true, message: true, status: true, created_at: true, resolved_at: true, characters: true, order_id: true,
          applicant: { select: APPLICANT_SELECT },
          listing: { select: LISTING_BRIEF_SELECT },
        },
      }),
      prisma.listingApplication.count({ where: { group_id: groupId, status: 'pending' } }),
    ]);
    const resolved = await Promise.all(applications.map(async a => ({ ...a, characters: await resolveCharacters(a.characters) })));
    return { applications: resolved, pending };
  },

  async pendingCount(groupId: string, userId: string): Promise<number> {
    if (!(await canManageGroup(groupId, userId))) return 0;
    return prisma.listingApplication.count({ where: { group_id: groupId, status: 'pending' } });
  },

  async setStatus(applicationId: string, userId: string, status: string) {
    if (!(APPLICATION_STATUSES as readonly string[]).includes(status)) throw new Error('INVALID_STATUS');
    const application = await prisma.listingApplication.findUnique({
      where: { id: applicationId },
      include: {
        listing: { select: { id: true, title: true } },
        group: { select: { id: true, slug: true, owner_id: true } },
      },
    });
    if (!application) throw new Error('NOT_FOUND');
    if (!(await canManageGroup(application.group_id, userId))) throw new Error('FORBIDDEN');
    // Принятая заявка уже стала заказом в очереди — дальше ею управляют там
    if (application.status === 'accepted') {
      if (status === 'accepted') return { id: application.id, status: 'accepted', resolved_at: application.resolved_at, order_id: application.order_id };
      throw new Error('ALREADY_ACCEPTED');
    }

    const notify = (type: string) => notificationService.create({
      receiverId: application.applicant_id, senderId: userId, senderGroupId: application.group_id, type, refId: application.id,
      meta: { groupSlug: application.group.slug, listingId: application.listing.id, listingTitle: application.listing.title },
    });

    if (status === 'accepted') {
      const orderId = await createOrderFromApplication(application);
      const updated = await prisma.listingApplication.update({
        where: { id: applicationId },
        data: { status, resolved_at: new Date(), order_id: orderId },
        select: { id: true, status: true, resolved_at: true, order_id: true },
      });
      await notify('den_application_accepted');
      // Первое сообщение от лица группы: чат появляется у заявителя во вкладке «Группы»
      try {
        const order = await prisma.order.findUnique({ where: { id: orderId }, select: { conversation_id: true } });
        if (order?.conversation_id) {
          await messageService.sendMessage({
            conversationId: order.conversation_id,
            senderId: application.group.owner_id,
            content: `Заявка на «${application.listing.title}» принята — заказ в очереди. Здесь мы будем обсуждать детали и сообщать о ходе работы.`,
          });
        }
      } catch { /* не критично: заявка уже принята */ }
      return updated;
    }

    const updated = await prisma.listingApplication.update({
      where: { id: applicationId },
      data: { status, resolved_at: status === 'pending' ? null : new Date() },
      select: { id: true, status: true, resolved_at: true, order_id: true },
    });
    if (status === 'declined') await notify('den_application_declined');
    return updated;
  },
};

/**
 * Принятая заявка автоматически становится заказом в очереди группы («Ожидание»): персонажи
 * и текст переезжают в заказ, дедлайн художник ставит сам при старте работы. Чат с заказчиком
 * создаётся здесь — группа пишет первой.
 */
async function createOrderFromApplication(app: {
  id: string; group_id: string; applicant_id: string; message: string; characters: unknown;
  listing: { id: string; title: string }; group: { owner_id: string };
}): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Очередь заказов живёт во вкладке «Заказы»; у группы с Dealers Den она должна быть доступна
    await tx.group.updateMany({ where: { id: app.group_id, business_enabled: false }, data: { business_enabled: true } });
    const last = await tx.order.findFirst({
      where: { group_id: app.group_id, deleted_at: null }, orderBy: { position: 'desc' }, select: { position: true },
    });
    const conversationId = await ensureGroupThread(app.group_id, app.applicant_id, tx);
    const order = await tx.order.create({
      data: {
        group_id: app.group_id,
        customer_id: app.applicant_id,
        title: app.listing.title.slice(0, 200),
        description: app.message,
        form_data: { source: 'listing_application', applicationId: app.id, listingId: app.listing.id, characters: app.characters as CharacterRef[], references: [] } as any,
        position: (last?.position ?? -1) + 1,
        conversation_id: conversationId,
      },
      select: { id: true },
    });
    return order.id;
  });
}
