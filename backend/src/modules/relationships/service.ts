import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';

export const relationshipsService = {
  // ── Send a relationship request ───────────────────────────────────────────
  async sendRequest(fromId: string, toId: string) {
    if (fromId === toId) throw Object.assign(new Error('Нельзя отправить запрос себе'), { statusCode: 400 });

    // Нельзя отправлять запрос, уже находясь в отношениях — иначе acceptRequest
    // перезапишет relationship_with у отправителя, а его текущий партнёр
    // останется висеть с "отношениями" на человека, который на самом деле
    // уже в паре с кем-то другим (битая ссылка в одну сторону).
    const sender = await prisma.user.findUnique({ where: { id: fromId }, select: { relationship_with: true } });
    if (sender?.relationship_with) {
      throw Object.assign(new Error('Вы уже состоите в отношениях'), { statusCode: 400 });
    }

    // Cancel any old declined/accepted request before creating a new one
    await prisma.relationshipRequest.deleteMany({
      where: { from_id: fromId, to_id: toId, status: { in: ['declined', 'accepted'] } },
    });

    // Create idempotently
    const existing = await prisma.relationshipRequest.findFirst({
      where: { from_id: fromId, to_id: toId, status: 'pending' },
    });
    if (existing) return { request: existing, alreadySent: true };

    const req = await prisma.relationshipRequest.create({
      data: { from_id: fromId, to_id: toId, status: 'pending' },
    });

    // Notify the target
    await notificationService.create({
      receiverId: toId,
      senderId:   fromId,
      type:       'RELATIONSHIP_REQUEST',
      refId:      req.id,
    });

    return { request: req, alreadySent: false };
  },

  // ── Accept request ────────────────────────────────────────────────────────
  async acceptRequest(requestId: string, userId: string) {
    const req = await prisma.relationshipRequest.findFirst({
      where: { id: requestId, to_id: userId, status: 'pending' },
    });
    if (!req) throw Object.assign(new Error('Запрос не найден'), { statusCode: 404 });

    // Обе стороны могли успеть вступить в отношения с кем-то ещё, пока запрос
    // висел pending (отправитель мог обойти проверку в sendRequest другим
    // запросом, принятым раньше) — перепроверяем перед записью, иначе одна
    // из сторон перезатрёт существующего партнёра.
    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.from_id }, select: { relationship_with: true } }),
      prisma.user.findUnique({ where: { id: req.to_id },   select: { relationship_with: true } }),
    ]);
    if (fromUser?.relationship_with || toUser?.relationship_with) {
      await prisma.relationshipRequest.update({ where: { id: requestId }, data: { status: 'declined' } });
      throw Object.assign(new Error('Один из пользователей уже состоит в отношениях'), { statusCode: 409 });
    }

    const now = new Date();

    // Условные обновления: если кто-то успел принять другую заявку или заявка уже обработана,
    // счётчик вернёт 0 и вся транзакция откатится (проверка выше не защищает от гонки).
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.relationshipRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'accepted' },
      });
      if (claimed.count !== 1) throw Object.assign(new Error('Запрос не найден'), { statusCode: 404 });

      const from = await tx.user.updateMany({
        where: { id: req.from_id, relationship_with: null },
        data: { relationship_with: req.to_id, relationship_since: now },
      });
      const to = await tx.user.updateMany({
        where: { id: req.to_id, relationship_with: null },
        data: { relationship_with: req.from_id, relationship_since: now },
      });
      if (from.count !== 1 || to.count !== 1) {
        throw Object.assign(new Error('Один из пользователей уже состоит в отношениях'), { statusCode: 409 });
      }
    });

    // Notify the original sender that their request was accepted
    await notificationService.create({
      receiverId: req.from_id,
      senderId:   userId,
      type:       'RELATIONSHIP_ACCEPTED',
    });

    return { ok: true };
  },

  // ── Decline request ───────────────────────────────────────────────────────
  async declineRequest(requestId: string, userId: string) {
    const req = await prisma.relationshipRequest.findFirst({
      where: { id: requestId, to_id: userId, status: 'pending' },
    });
    if (!req) throw Object.assign(new Error('Запрос не найден'), { statusCode: 404 });

    await prisma.relationshipRequest.update({ where: { id: requestId }, data: { status: 'declined' } });
    return { ok: true };
  },

  // ── Cancel own outgoing request ───────────────────────────────────────────
  async cancelRequest(fromId: string, toId: string) {
    await prisma.relationshipRequest.deleteMany({
      where: { from_id: fromId, to_id: toId, status: 'pending' },
    });
    await notificationService.deleteForAction({
      receiverId: toId,
      senderId:   fromId,
      type:       'RELATIONSHIP_REQUEST',
    });
    return { ok: true };
  },

  // ── Break up (unlink both users) ──────────────────────────────────────────
  async clearPartnership(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { relationship_with: true } });
    if (!user?.relationship_with) return { ok: true };

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId },                  data: { relationship_with: null, relationship_since: null } }),
      prisma.user.update({ where: { id: user.relationship_with }, data: { relationship_with: null, relationship_since: null } }),
    ]);
    return { ok: true };
  },

  // ── Get pending incoming requests ─────────────────────────────────────────
  async getPending(userId: string) {
    return prisma.relationshipRequest.findMany({
      where:   { to_id: userId, status: 'pending' },
      include: { from: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
    });
  },
};
