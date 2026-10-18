import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const pay = (user_id: string, over: Record<string, unknown>) => prisma.payment.create({
  data: {
    user_id, provider: 'yookassa', purpose: 'subscription', status: 'succeeded', amount: 100, paid_at: new Date(),
    ...over,
  } as any,
});

describe('админка: финансы и Premium', () => {
  beforeAll(() => getApp());
  beforeEach(() => resetDb());

  it('только для админа', async () => {
    const user = await createUser();
    const mod = await createUser({ role: 'moderator' });
    expect((await api('GET', '/api/admin/finance', { headers: user.auth })).status).toBe(403);
    expect((await api('GET', '/api/admin/finance', { headers: mod.auth })).status).toBe(403);
    expect((await api('GET', '/api/admin/finance')).status).toBe(401);
  });

  it('пустая база: нули, а не ошибки', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await api('GET', '/api/admin/finance?days=7', { headers: admin.auth });
    expect(res.status).toBe(200);
    const d = res.json.data;
    expect(d.kpi.gross).toBe(0);
    expect(d.daily).toHaveLength(7);
    expect(d.premium.mrr).toBe(0);
    expect(d.recent).toEqual([]);
  });

  it('считает выручку, возвраты, комиссию, оборот по уровням, MRR, карты, очередь review', async () => {
    const admin = await createUser({ role: 'admin' });
    const a = await createUser({ subscription_tier: 'pro', subscription_period: 'month', subscription_auto_renew: true,
      subscription_expires_at: new Date(Date.now() + 3 * 86_400_000) });
    const b = await createUser();

    await pay(a.user.id, { tier: 'pro', period: 'month', amount: 175, credited_amount: 168.87 });
    await pay(a.user.id, { purpose: 'wallet_topup', amount: 540, credited_amount: 521.1 });
    await pay(b.user.id, { purpose: 'donation', amount: 500, status: 'refunded', credited_amount: 482.5 });
    await pay(b.user.id, { tier: 'lite', period: 'month', provider: 'wallet', amount: 75 });            // за Bloom — не выручка
    await pay(b.user.id, { purpose: 'card_binding', amount: 1, status: 'refunded' });                   // проверочный — не выручка
    await pay(a.user.id, { tier: 'pro', period: 'month', amount: 175, status: 'expired', paid_at: null, recurring: true, failure_reason: 'canceled: insufficient_funds' });
    await pay(b.user.id, { purpose: 'wallet_topup', amount: 300, status: 'review', paid_at: null, failure_reason: 'amount mismatch' });
    await prisma.subscriptionPlan.create({ data: { user_id: a.user.id, tier: 'pro', starts_at: new Date(Date.now() - 86_400_000) } });
    await prisma.paymentMethod.create({ data: { user_id: a.user.id, provider_method_id: 'pm-1', type: 'bank_card', brand: 'mastercard', last4: '4444' } });
    await prisma.walletTransaction.create({ data: { user_id: a.user.id, amount: 5, balance_after: 5, kind: 'topup', ref_id: 'x' } });

    const res = await api('GET', '/api/admin/finance?days=30', { headers: admin.auth });
    expect(res.status).toBe(200);
    const d = res.json.data;

    expect(d.kpi).toMatchObject({ gross: 1215, refunded: 500, net: 715, paidCount: 3, refundedCount: 1, payers: 2 });
    expect(d.kpi.commission).toBeCloseTo(6.13 + 18.9 + 17.5, 2);
    expect(d.byPurpose).toMatchObject({ subscription: { gross: 175, count: 1 }, topup: { gross: 540 }, donation: { gross: 500, refunded: 500 } });

    const today = d.daily[d.daily.length - 1];
    expect(today.total).toBe(1215);
    expect(d.daily.reduce((s: number, x: { total: number }) => s + x.total, 0)).toBe(1215);

    const pro = d.premium.tiers.find((t: { tier: string }) => t.tier === 'pro');
    const lite = d.premium.tiers.find((t: { tier: string }) => t.tier === 'lite');
    expect(pro).toMatchObject({ revenue: 175, payments: 1, active: 1, autoRenew: 1, mrr: 175, newSubscribers: 1 });
    expect(lite).toMatchObject({ revenue: 0, walletPayments: 1 });
    expect(d.premium).toMatchObject({ mrr: 175, activePaid: 1, expectedRenewals7d: 175, expectedRenewals7dCount: 1 });
    expect(d.subscribers[d.subscribers.length - 1].pro).toBe(1);

    expect(d.autoRenew).toMatchObject({ ok: 0, failed: 1 });
    expect(d.autoRenew.failureReasons[0].reason).toMatch(/insufficient_funds/);
    expect(d.cards).toMatchObject({ saved: 1, users: 1 });
    expect(d.wallet.ledger).toEqual([{ kind: 'topup', sum: 5, count: 1 }]);

    expect(d.review).toHaveLength(1);
    expect(d.review[0]).toMatchObject({ status: 'review', amount: 300 });
    expect(d.refunds.list).toHaveLength(1);
    expect(d.recent.map((p: { purpose: string }) => p.purpose)).not.toContain('card_binding');
    expect(d.topPayers[0]).toMatchObject({ total: 715 });
  });

  it('неизвестный период приводится к 30 дням', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await api('GET', '/api/admin/finance?days=9999', { headers: admin.auth });
    expect(res.json.data.range.days).toBe(30);
  });
});
