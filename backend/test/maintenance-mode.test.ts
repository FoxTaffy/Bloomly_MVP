import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createUser, resetDb, api } from './helpers.js';

describe('режим обслуживания', () => {
  beforeEach(resetDb);

  let admin: Awaited<ReturnType<typeof createUser>>;
  const setMaintenance = (value: boolean) =>
    api('PATCH', '/api/admin/settings', { headers: admin.auth, body: { key: 'maintenance_mode', value } });

  afterEach(async () => { await setMaintenance(false); });

  it('закрывает API для пользователей и гостей, пропускает персонал и /api/auth', async () => {
    admin = await createUser({ role: 'admin' });
    const user = await createUser();
    expect((await setMaintenance(true)).status).toBe(200);

    const blocked = await api('GET', '/api/posts/trending-tags', { headers: user.auth });
    expect(blocked.status).toBe(503);
    expect(blocked.json.error.code).toBe('MAINTENANCE');
    expect((await api('GET', '/api/posts/trending-tags')).status).toBe(503);

    expect((await api('GET', '/api/posts/trending-tags', { headers: admin.auth })).status).toBe(200);
    expect((await api('GET', '/api/auth/me', { headers: user.auth })).status).toBe(200);
  });
});
