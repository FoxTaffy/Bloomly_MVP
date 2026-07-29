import prisma from '../../config/prisma.js';

// In-memory subscriber map for real-time push: receiverId → Set of send functions
type PushFn = (data: string) => void;
const subscribers = new Map<string, Set<PushFn>>();

// Only these three social notification types are gated by a per-user toggle / quiet hours —
// AutoMod, Dealers' Den, admin-broadcast, etc. notifications always go through.
const PREF_BY_TYPE: Record<string, 'notify_new_fan' | 'notify_comment' | 'notify_repaw'> = {
  FOLLOW:  'notify_new_fan',
  COMMENT: 'notify_comment',
  REPAW:   'notify_repaw',
};

/** HH:mm range check against server-local time, handling overnight wraparound (e.g. 23:00 → 08:00).
 *  No per-user timezone field exists in the schema, so this compares server time, not the viewer's. */
function isWithinQuietHours(from: string, to: string, now = new Date()): boolean {
  const mins = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = fh * 60 + fm;
  const end   = th * 60 + tm;
  if (start === end) return false;
  return start < end ? mins >= start && mins < end : mins >= start || mins < end;
}

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
    receiverId:    string;
    senderId?:     string;
    /** Set when the action was taken "as" a group — masks the real sender in favor of the group's identity. */
    senderGroupId?: string;
    type:       string;
    postId?:    string;
    commentId?: string;
    refId?:     string;
    meta?:      object;
  }) {
    const { receiverId, senderId, senderGroupId, type, postId, commentId, refId, meta } = input;
    if (receiverId === senderId) return null; // don't notify yourself

    const prefField = PREF_BY_TYPE[type];
    let quietHoursOn = false, quietFrom = '', quietTo = '';
    if (prefField) {
      const prefs = await prisma.user.findUnique({
        where:  { id: receiverId },
        select: { [prefField]: true, quiet_hours_enabled: true, quiet_hours_from: true, quiet_hours_to: true } as any,
      });
      if (prefs && (prefs as any)[prefField] === false) return null; // opted out of this notification type entirely
      if (prefs) {
        quietHoursOn = (prefs as any).quiet_hours_enabled;
        quietFrom    = (prefs as any).quiet_hours_from;
        quietTo      = (prefs as any).quiet_hours_to;
      }
    }

    const notif = await prisma.notification.create({
      data:    { receiver_id: receiverId, sender_id: senderId, sender_group_id: senderGroupId, type, post_id: postId, comment_id: commentId, ref_id: refId, meta },
      include: {
        sender:      { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true, pronouns: true } },
        senderGroup: { select: { id: true, slug: true, name: true, avatar_url: true } },
      },
    });

    // Real-time push — suppressed during quiet hours, but the row is still written so it's there on catch-up.
    if (!quietHoursOn || !isWithinQuietHours(quietFrom, quietTo)) {
      this.push(receiverId, { type: 'notification', data: notif });
    }
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
        sender:      { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true, pronouns: true } },
        senderGroup: { select: { id: true, slug: true, name: true, avatar_url: true } },
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
