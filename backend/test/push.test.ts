import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { notificationPushContent } from '../src/modules/push/texts.js';

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' } });

describe('web push: подписки', () => {
  beforeEach(resetDb);

  it('требует авторизации', async () => {
    expect((await api('GET', '/api/push/key')).status).toBe(401);
    expect((await api('POST', '/api/push/subscribe', { body: sub('https://push.example/a') })).status).toBe(401);
  });

  it('подписка сохраняется, повтор обновляет, отписка удаляет', async () => {
    const u = await createUser();
    const ep = 'https://push.example/abc';
    expect((await api('POST', '/api/push/subscribe', { headers: u.auth, body: sub(ep) })).status).toBe(200);
    expect((await api('POST', '/api/push/subscribe', { headers: u.auth, body: sub(ep) })).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(1);

    await api('POST', '/api/push/unsubscribe', { headers: u.auth, body: { endpoint: ep } });
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep } })).toBe(0);
  });

  it('эндпоинт переходит к новому аккаунту, чужую подписку отписать нельзя', async () => {
    const a = await createUser();
    const b = await createUser();
    const ep = 'https://push.example/shared';
    await api('POST', '/api/push/subscribe', { headers: a.auth, body: sub(ep) });
    await api('POST', '/api/push/unsubscribe', { headers: b.auth, body: { endpoint: ep } });
    expect(await prisma.pushSubscription.count({ where: { endpoint: ep, user_id: a.user.id } })).toBe(1);

    await api('POST', '/api/push/subscribe', { headers: b.auth, body: sub(ep) });
    expect((await prisma.pushSubscription.findUnique({ where: { endpoint: ep } }))?.user_id).toBe(b.user.id);
  });

  it('некорректные подписки отклоняются', async () => {
    const u = await createUser();
    expect((await api('POST', '/api/push/subscribe', { headers: u.auth, body: sub('http://insecure.example/x') })).status).toBe(400);
    expect((await api('POST', '/api/push/subscribe', { headers: u.auth, body: { endpoint: 'https://push.example/x' } })).status).toBe(400);
  });

  it('настройки: по умолчанию всё включено, меняются по отдельности, валидируются', async () => {
    const u = await createUser();
    const get = async () => (await api('GET', '/api/push/prefs', { headers: u.auth })).json.data;
    expect(await get()).toEqual({ messages: true, events: true });

    const r = await api('PATCH', '/api/push/prefs', { headers: u.auth, body: { events: false } });
    expect(r.status).toBe(200);
    expect(await get()).toEqual({ messages: true, events: false });

    expect((await api('PATCH', '/api/push/prefs', { headers: u.auth, body: { messages: 'no' } })).status).toBe(400);
    expect(await get()).toEqual({ messages: true, events: false });
    expect((await api('GET', '/api/push/prefs')).status).toBe(401);
  });
});

describe('web push: тексты уведомлений', () => {
  it('социальные и Dealers\' Den события, критичные типы не зависят от настроек', () => {
    expect(notificationPushContent('FOLLOW', null)).toMatchObject({ kind: 'event', body: 'подписался(ась) на вас' });
    expect(notificationPushContent('den_auction_won', null).kind).toBe('event');
    expect(notificationPushContent('automod_ban', null).kind).toBe('critical');
    expect(notificationPushContent('admin_broadcast', { title: 'Привет', body: 'Текст' })).toEqual({ title: 'Привет', body: 'Текст', kind: 'critical' });
    expect(notificationPushContent('automod_warn', { reason: 'спам' }).body).toContain('спам');
    expect(notificationPushContent('unknown_type', null)).toEqual({ body: 'Новое уведомление', kind: 'event' });
  });
});
