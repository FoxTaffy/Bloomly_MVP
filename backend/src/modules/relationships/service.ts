import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';

export const relationshipsService = {
  // ── Send a relationship request ───────────────────────────────────────────
  async sendRequest(fromId: string, toId: string) {
    if (fromId === toId) throw Object.assign(new Error('Нельзя отправить запрос себе'), { statusCode: 400 });

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

    const now = new Date();

    await prisma.$transaction([
      prisma.relationshipRequest.update({ where: { id: requestId }, data: { status: 'accepted' } }),
      prisma.user.update({ where: { id: req.from_id }, data: { relationship_with: req.to_id, relationship_since: now } }),
      prisma.user.update({ where: { id: req.to_id },   data: { relationship_with: req.from_id, relationship_since: now } }),
    ]);

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
