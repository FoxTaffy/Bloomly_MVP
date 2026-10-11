import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createUser, resetDb, api, getApp } from './helpers.js';

describe('wallet: демо-пополнение', () => {
  const env = process.env.NODE_ENV;
  // Приложение грузим при обычном окружении: модули проверяют NODE_ENV при импорте
  beforeAll(() => getApp());
  beforeEach(resetDb);
  afterEach(() => { process.env.NODE_ENV = env; });

  it('в production пополнение отключено и баланс не меняется', async () => {
    process.env.NODE_ENV = 'production';
    const { auth } = await createUser();
    const res = await api('POST', '/api/wallet/topup', { headers: auth, body: { amount: 5000 } });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('TOPUP_DISABLED');
  });

  it('вне production работает с лимитом за запрос', async () => {
    process.env.NODE_ENV = 'development';
    const { auth } = await createUser();
    const ok = await api('POST', '/api/wallet/topup', { headers: auth, body: { amount: 100 } });
    expect(ok.status).toBe(200);
    expect(Number(ok.json.data.balance)).toBe(100); // Decimal уходит в JSON строкой
    const tooMuch = await api('POST', '/api/wallet/topup', { headers: auth, body: { amount: 999999 } });
    expect(tooMuch.status).toBe(400);
  });
});
