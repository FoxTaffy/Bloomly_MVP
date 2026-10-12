import { describe, it, expect, beforeEach } from 'vitest';
import { api, createUser, resetDb } from './helpers.js';

describe('smoke', () => {
  beforeEach(resetDb);

  it('health responds', async () => {
    const r = await api('GET', '/health');
    expect(r.status).toBe(200);
  });

  it('authenticated request works with a test token', async () => {
    const u = await createUser();
    const r = await api('GET', '/api/wallet', { headers: u.auth });
    expect(r.status).toBe(200);
  });
});
