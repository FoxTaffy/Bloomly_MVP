import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

describe('админка: ручная модерация и журнал', () => {
  beforeEach(resetDb);

  it('заморозка → разморозка → сброс предупреждений пишут журнал и уведомления', async () => {
    const mod = await createUser({ role: 'moderator' });
    const target = await createUser({ warn_count: 2 });

    const freeze = await api('POST', `/api/admin/users/${target.user.id}/freeze`, { headers: mod.auth, body: { reason: 'spam' } });
    expect(freeze.status).toBe(200);
    let row = await prisma.user.findUnique({ where: { id: target.user.id } });
    expect(row?.frozen_at).not.toBeNull();
    expect(row?.frozen_reason).toBe('spam');

    expect((await api('POST', `/api/admin/users/${target.user.id}/unfreeze`, { headers: mod.auth })).status).toBe(200);
    expect((await api('POST', `/api/admin/users/${target.user.id}/clear-warns`, { headers: mod.auth })).status).toBe(200);
    row = await prisma.user.findUnique({ where: { id: target.user.id } });
    expect(row?.frozen_at).toBeNull();
    expect(row?.warn_count).toBe(0);

    const logs = await api('GET', `/api/admin/automod/logs?userId=${target.user.id}`, { headers: mod.auth });
    expect(logs.status).toBe(200);
    expect(logs.json.data.logs.map((l: { action: string }) => l.action)).toEqual(['clear_warns', 'unfreeze', 'freeze']);
    expect(logs.json.data.logs[0].actor.id).toBe(mod.user.id);
    expect(logs.json.data.pages).toBe(1);

    const notifs = await prisma.notification.findMany({ where: { receiver_id: target.user.id }, select: { type: true } });
    expect(notifs.map((n) => n.type).sort()).toEqual(['automod_clear_warns', 'automod_freeze', 'automod_unfreeze']);

    const amLogs = await api('GET', `/api/automod/logs?userId=${target.user.id}&limit=2`, { headers: mod.auth });
    expect(amLogs.status).toBe(200);
    expect(amLogs.json.data.logs).toHaveLength(2);
    expect(amLogs.json.data.totalPages).toBe(2);

    const stats = await api('GET', '/api/automod/stats', { headers: mod.auth });
    expect(stats.status).toBe(200);
    expect(stats.json.data.total24h).toBe(3);
  });

  it('обычный пользователь не видит журнал', async () => {
    const user = await createUser();
    expect((await api('GET', '/api/admin/automod/logs', { headers: user.auth })).status).toBe(403);
    expect((await api('GET', '/api/automod/logs', { headers: user.auth })).status).toBe(403);
  });
});
