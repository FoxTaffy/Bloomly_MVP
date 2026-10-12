import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, resetDb, api } from './helpers.js';

describe('privacy: дата рождения в публичных списках', () => {
  beforeEach(resetDb);

  it('скрытая дата не попадает в результаты поиска', async () => {
    const secret = await createUser({
      username: 'bd_hidden_user', display_name: 'bd_hidden_user',
      birth_date: new Date('1990-05-17T00:00:00.000Z'), birth_date_visibility: 'hidden',
    });
    const viewer = await createUser();

    const res = await api('GET', '/api/users/search?q=bd_hidden_user', { headers: viewer.auth });
    expect(res.status).toBe(200);
    const found = res.json.data.users.find((u: any) => u.id === secret.user.id);
    expect(found).toBeTruthy();
    expect(found.birth_date).toBeNull();
  });

  it('открытая дата (full) показывается в поиске', async () => {
    const open = await createUser({
      username: 'bd_open_user', display_name: 'bd_open_user',
      birth_date: new Date('1990-05-17T00:00:00.000Z'), birth_date_visibility: 'full',
    });
    const viewer = await createUser();

    const res = await api('GET', '/api/users/search?q=bd_open_user', { headers: viewer.auth });
    const found = res.json.data.users.find((u: any) => u.id === open.user.id);
    expect(found.birth_date).toBeTruthy();
  });
});
