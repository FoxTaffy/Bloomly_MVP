import prisma from '../../config/prisma.js';

// In-memory subscriber map for real-time push: receiverId → Set of send functions
type PushFn = (data: string) => void;
const subscribers = new Map<string, Set<PushFn>>();

export const notificationService = {
  subscribe(userId: string, fn: PushFn) {
    if (!subscribers.has(userId)) subscribers.set(userId, new Set());
    subscribers.get(userId)!.add(fn);
    return () => {
      subscribers.get(userId)?.delete(fn);
      if (!subscribers.get(userId)?.size) subscribers.delete(userId);
    };
  },

  push(userId: string, payload: object) {
    subscribers.get(userId)?.forEach((fn) => {
      try { fn(JSON.stringify(payload)); } catch { /* socket closed */ }
    });
  },

  async create(input: {
    receiverId: string;
    senderId?:  string;
    type:       string;
    postId?:    string;
    commentId?: string;
    refId?:     string;
  }) {
    const { receiverId, senderId, type, postId, commentId, refId } = input;
    if (receiverId === senderId) return null; // don't notify yourself

    const notif = await prisma.notification.create({
      data:    { receiver_id: receiverId, sender_id: senderId, type, post_id: postId, comment_id: commentId, ref_id: refId },
      include: {
        sender: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true, pronouns: true } },
      },
    });

    // Real-time push
    this.push(receiverId, { type: 'notification', data: notif });
    return notif;
  },

  /** Soft-delete notification(s) matching an action that has since been retracted (unlike, un-repaw, cancelled request, etc). */
  async deleteForAction(where: {
    receiverId: string;
    senderId?:  string;
    type:       string;
    postId?:    string;
    refId?:     string;
  }) {
    await prisma.notification.updateMany({
      where: {
        receiver_id: where.receiverId,
        sender_id:   where.senderId,
        type:        where.type,
        post_id:     where.postId,
        ref_id:      where.refId,
        deleted_at:  null,
      },
      data: { deleted_at: new Date() },
    });
  },

  async getForUser(userId: string, limit = 50) {
    return prisma.notification.findMany({
      where:   { receiver_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take:    limit,
      include: {
        sender: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true, pronouns: true } },
      },
    });
  },

  async markRead(userId: string, ids?: string[]) {
    await prisma.notification.updateMany({
      where: {
        receiver_id: userId,
        deleted_at:  null,
        ...(ids?.length ? { id: { in: ids } } : {}),
        read: false,
      },
      data: { read: true },
    });
    return { ok: true };
  },

  async unreadCount(userId: string) {
    return prisma.notification.count({ where: { receiver_id: userId, read: false, deleted_at: null } });
  },

  async deleteAll(userId: string) {
    await prisma.notification.updateMany({
      where: { receiver_id: userId, deleted_at: null },
      data:  { deleted_at: new Date() },
    });
    return { ok: true };
  },
};
