import webpush from 'web-push';
import prisma from '../../config/prisma.js';
import { logger } from '../../lib/logger.js';
import type { PushKind } from './texts.js';
import { isAllowedPushEndpoint } from '../../lib/pushEndpoint.js';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const enabled = !!(PUBLIC_KEY && PRIVATE_KEY);

if (enabled) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@bloomly.fun', PUBLIC_KEY, PRIVATE_KEY);
} else {
  logger.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы — Web Push отключён');
}

export interface PushPayload {
  title: string;
  body: string;
  /** Куда перейти по клику (путь внутри сайта) */
  url: string;
  /** Одинаковый tag схлопывает уведомления (например, один чат) */
  tag?: string;
  icon?: string;
}

export const pushService = {
  publicKey: () => (enabled ? PUBLIC_KEY : null),

  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 300) },
      // endpoint мог перейти к другому аккаунту на том же браузере
      update: { user_id: userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 300) },
    });
  },

  async unsubscribe(userId: string, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { user_id: userId, endpoint } });
  },

  /** Fire-and-forget: ошибки доставки не должны ломать основной сценарий. */
  async getPrefs(userId: string) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { push_messages: true, push_events: true } });
    return { messages: u?.push_messages ?? true, events: u?.push_events ?? true };
  },

  async setPrefs(userId: string, prefs: { messages?: boolean; events?: boolean }) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(prefs.messages !== undefined ? { push_messages: prefs.messages } : {}),
        ...(prefs.events !== undefined ? { push_events: prefs.events } : {}),
      },
    });
  },

  /** `critical` (модерация, рассылки администрации) приходит независимо от настроек. */
  async sendToUser(userId: string, payload: PushPayload, kind: PushKind = 'event') {
    if (!enabled) return;
    if (kind !== 'critical') {
      const prefs = await this.getPrefs(userId);
      if (kind === 'message' ? !prefs.messages : !prefs.events) return;
    }
    // Подписки, сохранённые до проверки адреса, тоже не отправляем на посторонние хосты
    const subs = (await prisma.pushSubscription.findMany({ where: { user_id: userId } })).filter((s) => isAllowedPushEndpoint(s.endpoint));
    if (subs.length === 0) return;
    const body = JSON.stringify(payload);
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        } else {
          logger.warn({ err, status }, '[push] send failed');
        }
      }
    }));
  },
};
