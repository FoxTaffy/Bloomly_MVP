import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { getBlmRate } from '../payments/rate.js';
import { monthlyPrice, quote, isPaidTier, PURCHASABLE_TIERS, EARLY_USER_CUTOFF, type BillingPeriod, type PaidTier } from '../payments/pricing.js';

// Отчёт «Финансы и Premium» для админки. Только чтение.
//
// Что считается деньгами: платежи через ЮKassa (provider = yookassa) за пополнение, подписку и донат, статус
// succeeded или refunded, по дате оплаты (paid_at). Проверочный платёж привязки карты (1 ₽, всегда возвращается)
// и оплата подписки с баланса (это Bloom, не рубли) в выручку не входят и показываются отдельно.
// Сутки — московские (UTC+3, без перехода на летнее время), как у пользователей и в кабинете ЮKassa.

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const FINANCE_RANGES = [7, 30, 90, 365] as const;

const GATEWAY = Prisma.sql`provider = 'yookassa' AND purpose IN ('wallet_topup', 'subscription', 'donation')`;
const PAID = Prisma.sql`status IN ('succeeded', 'refunded')`;
const MSK = (col: string) => Prisma.raw(`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')`);

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

const USER_SELECT = { id: true, username: true, display_name: true, avatar_url: true } as const;

/** Начало московских суток (в UTC), в которые попадает момент t. */
const startOfMskDay = (t: number) => Math.floor((t + MSK_OFFSET_MS) / DAY_MS) * DAY_MS - MSK_OFFSET_MS;

function mskDayKeys(from: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY_MS + MSK_OFFSET_MS).toISOString().slice(0, 10));
}

type Window = { gross: number; refunded: number; commission: number; paidCount: number; refundedCount: number; payers: number };

async function windowTotals(from: Date, to: Date): Promise<Window> {
  const [row] = await prisma.$queryRaw<{
    gross: number; refunded: number; commission: number; paid_count: number; refunded_count: number; payers: number;
  }[]>`
    SELECT
      COALESCE(SUM(amount), 0)::float8                                              AS gross,
      COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float8            AS refunded,
      COALESCE(SUM(amount - credited_amount) FILTER (WHERE credited_amount IS NOT NULL), 0)::float8 AS commission,
      COUNT(*)::int                                                                  AS paid_count,
      COUNT(*) FILTER (WHERE status = 'refunded')::int                               AS refunded_count,
      COUNT(DISTINCT user_id)::int                                                   AS payers
    FROM "Payment"
    WHERE ${GATEWAY} AND ${PAID} AND paid_at >= ${from} AND paid_at < ${to}
  `;
  return {
    gross: r2(row.gross), refunded: r2(row.refunded), commission: r2(row.commission),
    paidCount: row.paid_count, refundedCount: row.refunded_count, payers: row.payers,
  };
}

type PaymentListRow = {
  id: string; purpose: string; provider: string; status: string; amount: number; tier: string | null; period: string | null;
  recurring: boolean; failure_reason: string | null; created_at: Date; paid_at: Date | null; method_type: string | null; blm_amount: number | null;
  user_id: string; username: string; display_name: string | null; avatar_url: string | null;
};

function listPayments(where: Prisma.Sql, order: Prisma.Sql, limit: number) {
  return prisma.$queryRaw<PaymentListRow[]>`
    SELECT p.id, p.purpose, p.provider, p.status, p.amount::float8 AS amount, p.tier, p.period, p.recurring, p.failure_reason,
           p.created_at, p.paid_at, p.raw_notification->'payment_method'->>'type' AS method_type, p.blm_amount::float8 AS blm_amount,
           u.id AS user_id, u.username, u.display_name, u.avatar_url
    FROM "Payment" p JOIN "User" u ON u.id = p.user_id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ${limit}
  `.then((rows) => rows.map((r) => ({
    id: r.id, purpose: r.purpose, provider: r.provider, status: r.status, amount: r2(r.amount), tier: r.tier, period: r.period,
    recurring: r.recurring, reason: r.failure_reason, createdAt: r.created_at, paidAt: r.paid_at, method: r.method_type, blmAmount: r.blm_amount,
    user: { id: r.user_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url },
  })));
}

export async function getFinanceReport(rawDays: number) {
  const days = (FINANCE_RANGES as readonly number[]).includes(rawDays) ? rawDays : 30;
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const from = new Date(startOfMskDay(nowMs) - (days - 1) * DAY_MS);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  const dayKeys = mskDayKeys(from, days);
  const soon = new Date(nowMs + 7 * DAY_MS);

  const [
    cur, prev, byPurposeRows, dailyRows, subsSeriesRows, tierRows, newSubRows, activeRows, funnelRows, renewRows,
    renewReasons, savedCount, savedByType, savedUsers, newMethods, bindingRows, shareRows, firstPayers, payersAllTime,
    walletAgg, ledgerRows, topHolders, topPayersRows, recent, refundsList, reviewList, partialRefunds, sponsors,
  ] = await Promise.all([
    windowTotals(from, now),
    windowTotals(prevFrom, from),
    prisma.$queryRaw<{ purpose: string; gross: number; refunded: number; cnt: number }[]>`
      SELECT purpose, SUM(amount)::float8 AS gross, COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::float8 AS refunded, COUNT(*)::int AS cnt
      FROM "Payment" WHERE ${GATEWAY} AND ${PAID} AND paid_at >= ${from} AND paid_at < ${now} GROUP BY purpose`,
    prisma.$queryRaw<{ day: string; purpose: string; sum: number; cnt: number }[]>`
      SELECT to_char(date_trunc('day', ${MSK('paid_at')}), 'YYYY-MM-DD') AS day, purpose, SUM(amount)::float8 AS sum, COUNT(*)::int AS cnt
      FROM "Payment" WHERE ${GATEWAY} AND ${PAID} AND paid_at >= ${from} AND paid_at < ${now} GROUP BY 1, 2`,
    // Подписчики по дням — по журналу смены тарифов (SubscriptionPlan): кто на конец суток был на платном тарифе
    prisma.$queryRaw<{ day: string; tier: string; cnt: number }[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') - ((${days}::int - 1) * interval '1 day'),
          date_trunc('day', now() AT TIME ZONE 'Europe/Moscow'), interval '1 day') AS d)
      SELECT to_char(days.d, 'YYYY-MM-DD') AS day, sp.tier, COUNT(DISTINCT sp.user_id)::int AS cnt
      FROM days JOIN "SubscriptionPlan" sp
        ON ${MSK('sp.starts_at')} < days.d + interval '1 day'
       AND (sp.ends_at IS NULL OR ${MSK('sp.ends_at')} >= days.d + interval '1 day')
      WHERE sp.tier <> 'free' GROUP BY 1, 2`,
    // Оборот по уровням: и рубли (ЮKassa), и покупки за Bloom (provider = wallet)
    prisma.$queryRaw<{ tier: string; period: string; provider: string; recurring: boolean; status: string; sum: number; cnt: number }[]>`
      SELECT tier, period, provider, recurring, status, SUM(amount)::float8 AS sum, COUNT(*)::int AS cnt
      FROM "Payment" WHERE purpose = 'subscription' AND provider IN ('yookassa', 'wallet') AND ${PAID} AND tier IS NOT NULL
        AND paid_at >= ${from} AND paid_at < ${now} GROUP BY 1, 2, 3, 4, 5`,
    prisma.$queryRaw<{ tier: string; cnt: number }[]>`
      SELECT p.tier, COUNT(*)::int AS cnt FROM "Payment" p
      WHERE p.purpose = 'subscription' AND p.status IN ('succeeded', 'refunded') AND p.tier IS NOT NULL AND p.paid_at >= ${from} AND p.paid_at < ${now}
        AND NOT EXISTS (SELECT 1 FROM "Payment" q WHERE q.user_id = p.user_id AND q.purpose = 'subscription'
          AND q.status IN ('succeeded', 'refunded') AND q.paid_at < p.paid_at)
      GROUP BY 1`,
    prisma.$queryRaw<{ tier: string; period: string; auto: boolean; early: boolean; comped: boolean; soon: boolean; cnt: number }[]>`
      SELECT subscription_tier AS tier, COALESCE(subscription_period, 'month') AS period, subscription_auto_renew AS auto,
             (created_at < ${EARLY_USER_CUTOFF}) AS early, (subscription_expires_at IS NULL) AS comped,
             (subscription_expires_at IS NOT NULL AND subscription_expires_at <= ${soon}) AS soon, COUNT(*)::int AS cnt
      FROM "User"
      WHERE deleted_at IS NULL AND subscription_tier <> 'free' AND (subscription_expires_at IS NULL OR subscription_expires_at > ${now})
      GROUP BY 1, 2, 3, 4, 5, 6`,
    prisma.$queryRaw<{ purpose: string; status: string; cnt: number }[]>`
      SELECT purpose, status, COUNT(*)::int AS cnt FROM "Payment"
      WHERE provider = 'yookassa' AND created_at >= ${from} AND created_at < ${now} GROUP BY 1, 2`,
    prisma.$queryRaw<{ status: string; sum: number; cnt: number }[]>`
      SELECT status, COALESCE(SUM(amount), 0)::float8 AS sum, COUNT(*)::int AS cnt FROM "Payment"
      WHERE provider = 'yookassa' AND recurring = true AND created_at >= ${from} AND created_at < ${now} GROUP BY 1`,
    prisma.$queryRaw<{ reason: string; cnt: number }[]>`
      SELECT COALESCE(failure_reason, '—') AS reason, COUNT(*)::int AS cnt FROM "Payment"
      WHERE provider = 'yookassa' AND recurring = true AND status = 'expired' AND created_at >= ${from} AND created_at < ${now}
      GROUP BY 1 ORDER BY cnt DESC LIMIT 5`,
    // Сохранённые способы оплаты
    prisma.paymentMethod.count({ where: { provider_method_id: { not: null } } }),
    prisma.paymentMethod.groupBy({ by: ['type'], where: { provider_method_id: { not: null } }, _count: { _all: true } }),
    prisma.$queryRaw<{ cnt: number }[]>`SELECT COUNT(DISTINCT user_id)::int AS cnt FROM "PaymentMethod" WHERE provider_method_id IS NOT NULL`,
    prisma.paymentMethod.count({ where: { provider_method_id: { not: null }, created_at: { gte: from } } }),
    prisma.paymentMethod.findMany({
      where: { provider_method_id: { not: null } }, orderBy: { created_at: 'desc' }, take: 8,
      select: { id: true, type: true, brand: true, last4: true, title: true, created_at: true, user: { select: USER_SELECT } },
    }),
    prisma.$queryRaw<{ method: string; sum: number; cnt: number }[]>`
      SELECT COALESCE(raw_notification->'payment_method'->>'type', 'unknown') AS method, SUM(amount)::float8 AS sum, COUNT(*)::int AS cnt
      FROM "Payment" WHERE ${GATEWAY} AND ${PAID} AND paid_at >= ${from} AND paid_at < ${now} GROUP BY 1 ORDER BY sum DESC`,
    prisma.$queryRaw<{ cnt: number }[]>`
      SELECT COUNT(*)::int AS cnt FROM (SELECT MIN(paid_at) AS m FROM "Payment" WHERE ${GATEWAY} AND ${PAID} GROUP BY user_id) t
      WHERE m >= ${from} AND m < ${now}`,
    prisma.$queryRaw<{ cnt: number }[]>`
      SELECT COUNT(DISTINCT user_id)::int AS cnt FROM "Payment" WHERE ${GATEWAY} AND ${PAID}`,
    // Кошелёк Bloom
    prisma.wallet.aggregate({ _sum: { balance: true }, _count: { _all: true }, where: { balance: { gt: 0 } } }),
    prisma.$queryRaw<{ kind: string; sum: number; cnt: number }[]>`
      SELECT kind, SUM(amount)::float8 AS sum, COUNT(*)::int AS cnt FROM "WalletTransaction"
      WHERE created_at >= ${from} AND created_at < ${now} GROUP BY 1 ORDER BY ABS(SUM(amount)) DESC`,
    prisma.wallet.findMany({
      where: { balance: { gt: 0 } }, orderBy: { balance: 'desc' }, take: 5,
      select: { balance: true, user: { select: USER_SELECT } },
    }),
    prisma.$queryRaw<{ user_id: string; total: number; cnt: number; last: Date }[]>`
      SELECT user_id, SUM(amount)::float8 AS total, COUNT(*)::int AS cnt, MAX(paid_at) AS last
      FROM "Payment" WHERE ${GATEWAY} AND status = 'succeeded' GROUP BY 1 ORDER BY total DESC LIMIT 10`,
    listPayments(Prisma.sql`p.status IN ('succeeded', 'refunded', 'review') AND p.purpose <> 'card_binding'`, Prisma.sql`COALESCE(p.paid_at, p.created_at) DESC`, 25),
    listPayments(Prisma.sql`p.status = 'refunded' AND p.purpose <> 'card_binding'`, Prisma.sql`p.updated_at DESC`, 10),
    listPayments(Prisma.sql`p.status = 'review'`, Prisma.sql`p.created_at DESC`, 50),
    prisma.payment.count({ where: { status: 'succeeded', failure_reason: { startsWith: 'partial refund' } } }),
    prisma.user.count({ where: { is_sponsor: true, deleted_at: null } }),
  ]);

  // ── Ряды по дням ──────────────────────────────────────────────────────────
  const daily = dayKeys.map((day) => ({ day, subscription: 0, topup: 0, donation: 0, total: 0, count: 0 }));
  const dayIdx = new Map(daily.map((d, i) => [d.day, i]));
  for (const r of dailyRows) {
    const d = daily[dayIdx.get(r.day) ?? -1];
    if (!d) continue;
    const key = r.purpose === 'wallet_topup' ? 'topup' : r.purpose === 'subscription' ? 'subscription' : 'donation';
    d[key] = r2(d[key] + r.sum);
    d.total = r2(d.total + r.sum);
    d.count += r.cnt;
  }

  const subscribers = dayKeys.map((day) => ({ day, lite: 0, pro: 0, business: 0 }));
  const subIdx = new Map(subscribers.map((d, i) => [d.day, i]));
  for (const r of subsSeriesRows) {
    const d = subscribers[subIdx.get(r.day) ?? -1];
    if (d && (r.tier === 'lite' || r.tier === 'pro' || r.tier === 'business')) d[r.tier] = r.cnt;
  }

  // ── Подписчики сейчас, MRR, ближайшие продления ──────────────────────────
  const tiers: Record<string, {
    tier: string; active: number; granted: number; autoRenew: number; mrr: number;
    revenue: number; refunded: number; payments: number; walletPayments: number; walletRub: number; newSubscribers: number;
    month: number; year: number; renewals: number; manual: number;
  }> = {};
  const tierRow = (tier: string) => (tiers[tier] ??= {
    tier, active: 0, granted: 0, autoRenew: 0, mrr: 0, revenue: 0, refunded: 0, payments: 0, walletPayments: 0, walletRub: 0,
    newSubscribers: 0, month: 0, year: 0, renewals: 0, manual: 0,
  });
  for (const t of ['lite', 'pro']) tierRow(t);
  let expectedRenewals = 0, expectedRenewalsCount = 0, churnRisk = 0, autoRenewActive = 0;
  for (const r of activeRows) {
    const t = tierRow(r.tier);
    if (r.comped) { t.granted += r.cnt; continue; }
    t.active += r.cnt;
    if (isPaidTier(r.tier) && (PURCHASABLE_TIERS as string[]).includes(r.tier)) {
      const period: BillingPeriod = r.period === 'year' ? 'year' : 'month';
      t.mrr += r.cnt * monthlyPrice(r.tier as PaidTier, period, r.early);
      if (r.auto) {
        t.autoRenew += r.cnt;
        autoRenewActive += r.cnt;
        if (r.soon) { expectedRenewals += r.cnt * quote(r.tier as PaidTier, period, r.early).amount; expectedRenewalsCount += r.cnt; }
      } else if (r.soon) churnRisk += r.cnt;
    }
  }
  for (const r of tierRows) {
    const t = tierRow(r.tier);
    if (r.provider === 'wallet') { t.walletPayments += r.cnt; t.walletRub += r.sum; continue; }
    t.revenue += r.sum;
    t.payments += r.cnt;
    if (r.status === 'refunded') t.refunded += r.sum;
    if (r.period === 'year') t.year += r.cnt; else t.month += r.cnt;
    if (r.recurring) t.renewals += r.cnt; else t.manual += r.cnt;
  }
  for (const r of newSubRows) tierRow(r.tier).newSubscribers = r.cnt;
  const tierList = Object.values(tiers).map((t) => ({
    ...t, mrr: r2(t.mrr), revenue: r2(t.revenue), refunded: r2(t.refunded), walletRub: r2(t.walletRub),
  })).sort((a, b) => b.revenue - a.revenue || b.active - a.active);
  const mrr = r2(tierList.reduce((s, t) => s + t.mrr, 0));
  const activePaid = tierList.reduce((s, t) => s + t.active, 0);

  // ── Воронка оплаты ───────────────────────────────────────────────────────
  const funnel: Record<string, Record<string, number>> = {};
  for (const r of funnelRows) (funnel[r.purpose] ??= {})[r.status] = r.cnt;
  const funnelList = ['subscription', 'wallet_topup', 'donation', 'card_binding'].map((purpose) => {
    const f = funnel[purpose] ?? {};
    const created = Object.values(f).reduce((s, n) => s + n, 0);
    const paid = (f.succeeded ?? 0) + (f.refunded ?? 0);
    return {
      purpose, created, paid, pending: f.pending ?? 0, expired: f.expired ?? 0, review: f.review ?? 0, refunded: f.refunded ?? 0,
      conversion: created ? Math.round((paid / created) * 1000) / 10 : null,
    };
  });

  // ── Автопродление ────────────────────────────────────────────────────────
  const renew = { ok: 0, failed: 0, pending: 0, okSum: 0, failedSum: 0 };
  for (const r of renewRows) {
    if (r.status === 'succeeded' || r.status === 'refunded') { renew.ok += r.cnt; renew.okSum += r.sum; }
    else if (r.status === 'expired') { renew.failed += r.cnt; renew.failedSum += r.sum; }
    else if (r.status === 'pending') renew.pending += r.cnt;
  }
  const bindingFunnel = funnelList.find((f) => f.purpose === 'card_binding')!;

  const byPurpose = Object.fromEntries(byPurposeRows.map((r) => [r.purpose, { gross: r2(r.gross), refunded: r2(r.refunded), count: r.cnt }]));
  const net = r2(cur.gross - cur.refunded);
  const prevNet = r2(prev.gross - prev.refunded);

  const payerIds = topPayersRows.map((r) => r.user_id);
  const payerUsers = payerIds.length
    ? await prisma.user.findMany({ where: { id: { in: payerIds } }, select: { ...USER_SELECT, subscription_tier: true } })
    : [];
  const payerById = new Map(payerUsers.map((u) => [u.id, u]));

  const ledger = ledgerRows.map((r) => ({ kind: r.kind, sum: r2(r.sum), count: r.cnt }));

  return {
    range: { days, from, to: now, previousFrom: prevFrom },
    kpi: {
      gross: cur.gross, refunded: cur.refunded, net, commission: cur.commission,
      netAfterCommission: r2(net - cur.commission),
      paidCount: cur.paidCount, refundedCount: cur.refundedCount, payers: cur.payers,
      avgCheck: cur.paidCount ? r2(cur.gross / cur.paidCount) : 0,
      arppu: cur.payers ? r2(net / cur.payers) : 0,
      refundRate: cur.gross ? Math.round((cur.refunded / cur.gross) * 1000) / 10 : 0,
      commissionRate: cur.gross ? Math.round((cur.commission / cur.gross) * 1000) / 10 : 0,
      firstTimePayers: firstPayers[0]?.cnt ?? 0,
      payersAllTime: payersAllTime[0]?.cnt ?? 0,
      delta: { gross: pct(cur.gross, prev.gross), net: pct(net, prevNet), paidCount: pct(cur.paidCount, prev.paidCount), payers: pct(cur.payers, prev.payers) },
    },
    byPurpose: {
      subscription: byPurpose.subscription ?? { gross: 0, refunded: 0, count: 0 },
      topup: byPurpose.wallet_topup ?? { gross: 0, refunded: 0, count: 0 },
      donation: byPurpose.donation ?? { gross: 0, refunded: 0, count: 0 },
    },
    daily,
    subscribers,
    premium: {
      tiers: tierList,
      activePaid, mrr, arr: r2(mrr * 12),
      autoRenewActive, autoRenewShare: activePaid ? Math.round((autoRenewActive / activePaid) * 1000) / 10 : 0,
      expectedRenewals7d: r2(expectedRenewals), expectedRenewals7dCount: expectedRenewalsCount, churnRisk7d: churnRisk,
    },
    funnel: funnelList,
    autoRenew: {
      ok: renew.ok, failed: renew.failed, pending: renew.pending, okSum: r2(renew.okSum), failedSum: r2(renew.failedSum),
      successRate: renew.ok + renew.failed ? Math.round((renew.ok / (renew.ok + renew.failed)) * 1000) / 10 : null,
      failureReasons: renewReasons,
    },
    cards: {
      saved: savedCount, users: savedUsers[0]?.cnt ?? 0, newInPeriod: newMethods,
      byType: savedByType.map((r) => ({ type: r.type, count: r._count._all })),
      bindingsStarted: bindingFunnel.created, bindingsDone: bindingFunnel.paid,
      recent: bindingRows,
    },
    methods: shareRows.map((r) => ({ method: r.method, sum: r2(r.sum), count: r.cnt })),
    wallet: {
      balanceTotal: r2(Number(walletAgg._sum.balance ?? 0)), holders: walletAgg._count._all, bcRate: await getBlmRate(),
      ledger,
      topHolders: topHolders.map((h) => ({ balance: r2(Number(h.balance)), user: h.user })),
    },
    topPayers: topPayersRows.map((r) => ({
      total: r2(r.total), count: r.cnt, lastPaidAt: r.last, user: payerById.get(r.user_id) ?? null,
    })).filter((r) => r.user),
    recent,
    refunds: { list: refundsList, partial: partialRefunds },
    review: reviewList,
    sponsors,
    generatedAt: now,
  };
}
