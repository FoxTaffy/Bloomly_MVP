import prisma from '../../config/prisma.js';

export const notificationService = {
  async getNotifications(userId: string, unreadOnly = false) {
    return await prisma.notification.findMany({
      where: {
        user_id: userId,
        ...(unreadOnly ? { is_read: false } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        actor: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
    });
  },

  async markRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, user_id: userId },
    });
    if (!notification) throw new Error('Уведомление не найдено');

    return await prisma.notification.update({
      where: { id: notificationId },
      data: { is_read: true },
    });
  },

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
    return { success: true };
  },

  async getUnreadCount(userId: string) {
    const count = await prisma.notification.count({
      where: { user_id: userId, is_read: false },
    });
    return { count };
  },
};
