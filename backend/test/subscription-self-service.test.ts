import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

describe('subscription: самостоятельная смена тарифа', () => {
  const env = process.env.NODE_ENV;
  beforeAll(() => getApp());
  beforeEach(resetDb);
  afterEach(() => { process.env.NODE_ENV = env; });

  it('в production платный тариф не выдаётся сам себе, даже с сохранённой картой', async () => {
    const { user, auth } = await createUser();
    await prisma.paymentMethod.create({
      data: { user_id: user.id, last4: '4242', brand: 'visa', exp_month: 12, exp_year: 2030, holder_name: 'Test' },
    });
    process.env.NODE_ENV = 'production';

    const res = await api('PATCH', '/api/users/me/subscription', { headers: auth, body: { tier: 'business' } });
    expect(res.status).toBe(403);
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { subscription_tier: true } });
    expect(after?.subscription_tier).not.toBe('business');
  });

  it('понижение до free в production разрешено', async () => {
    const { auth } = await createUser({ subscription_tier: 'pro' });
    process.env.NODE_ENV = 'production';
    const res = await api('PATCH', '/api/users/me/subscription', { headers: auth, body: { tier: 'free' } });
    expect(res.status).toBe(200);
  });
});
