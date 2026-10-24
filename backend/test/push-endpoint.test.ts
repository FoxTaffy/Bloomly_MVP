import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { isAllowedPushEndpoint } from '../src/lib/pushEndpoint.js';

describe('push: адрес подписки — только push-сервисы браузеров (защита от SSRF)', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('разрешает FCM, Mozilla, Apple, WNS', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
      'https://web.push.apple.com/QGx',
      'https://db5p.notify.windows.com/w/?token=x',
    ]) expect(isAllowedPushEndpoint(ok), ok).toBe(true);
  });

  it('запрещает внутренние адреса, порты, http и похожие домены', () => {
    for (const bad of [
      'https://127.0.0.1/x', 'https://localhost:9000/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
      'https://fcm.googleapis.com.evil.com/x', 'https://evilfcm.googleapis.com.attacker.io/', 'https://user:pw@fcm.googleapis.com/x',
      'https://169.254.169.254/latest/meta-data', 'not a url',
    ]) expect(isAllowedPushEndpoint(bad), bad).toBe(false);
  });

  it('POST /api/push/subscribe отклоняет посторонний хост и принимает FCM', async () => {
    const u = await createUser();
    const keys = { p256dh: 'BKey', auth: 'Auth' };
    const bad = await api('POST', '/api/push/subscribe', { headers: u.auth, body: { endpoint: 'https://10.0.0.5/hook', keys } });
    expect(bad.status).toBe(400);
    const ok = await api('POST', '/api/push/subscribe', { headers: u.auth, body: { endpoint: 'https://fcm.googleapis.com/fcm/send/x1', keys } });
    expect(ok.status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { user_id: u.user.id } })).toBe(1);
  });
});
