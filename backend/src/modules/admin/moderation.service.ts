import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';

// Manual moderation actions taken by staff from the admin panel. Each one leaves an
// AutoModLog entry (category 'manual') so the audit log shows who did what.

/** Appends a staff action to the audit log. */
export function logStaffAction(actorId: string, targetUserId: string, action: string, reason: string) {
  return prisma.autoModLog.create({ data: { user_id: targetUserId, actor_id: actorId, action, reason, category: 'manual', score: 0 } });
}

export const moderationService = {
  getRole(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  },

  getSubscriptionTier(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true } });
  },

  async freeze(userId: string, actorId: string, reason: string) {
    await prisma.user.update({ where: { id: userId }, data: { frozen_at: new Date(), frozen_reason: reason } });
    await logStaffAction(actorId, userId, 'freeze', reason);
    await notificationService.create({ receiverId: userId, type: 'automod_freeze', meta: { reason } });
  },

  async unfreeze(userId: string, actorId: string) {
    await prisma.user.update({ where: { id: userId }, data: { frozen_at: null, frozen_reason: null } });
    await logStaffAction(actorId, userId, 'unfreeze', 'Разморожен вручную модератором');
    await notificationService.create({ receiverId: userId, type: 'automod_unfreeze' });
  },

  async clearWarns(userId: string, actorId: string) {
    await prisma.user.update({ where: { id: userId }, data: { warn_count: 0 } });
    await logStaffAction(actorId, userId, 'clear_warns', 'Предупреждения сброшены модератором');
    await notificationService.create({ receiverId: userId, type: 'automod_clear_warns' });
  },

  getWarnState(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { warn_count: true, frozen_at: true } });
  },

  async setDeceased(userId: string, note: string | null) {
    await prisma.user.update({ where: { id: userId }, data: { deceased_at: new Date(), deceased_note: note } });
  },

  async clearDeceased(userId: string) {
    await prisma.user.update({ where: { id: userId }, data: { deceased_at: null, deceased_note: null } });
  },
};
