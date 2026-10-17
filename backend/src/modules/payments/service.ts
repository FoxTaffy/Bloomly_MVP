import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { logger } from '../../lib/logger.js';
import { yoomoneyConfig, TOPUP_MIN, TOPUP_MAX, PENDING_TTL_MS } from './config.js';
import { buildQuickpayUrl, verifyNotification, type YoomoneyMethod, type YoomoneyNotification } from './yoomoney.js';
import {
  PLAN_PRICES, PURCHASABLE_TIERS, PERIOD_MONTHS, isPaidTier, isEarlyUser, quote,
  type PaidTier, type BillingPeriod,
} from './pricing.js';

type Tx = Prisma.TransactionClient;

const httpError = (msg: string, statusCode: number) => Object.assign(new Error(msg), { statusCode });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_SELECT = {
  id: true, provider: true, purpose: true, status: true, amount: true, currency: true,
  method: true, tier: true, period: true, paid_at: true, created_at: true,
} as const;

/** Прибавляет календарные месяцы, прижимая день к концу месяца (31 янв + 1 = 28/29 фев). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

async function loadBuyer(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, deleted_at: null },
    select: { id: true, created_at: true, subscription_tier: true, subscription_expires_at: true },
  });
  if (!user) throw httpError('User not found', 404);
  return user;
}

function parseTier(tier: unknown): PaidTier {
  if (typeof tier !== 'string' || !isPaidTier(tier) || !PURCHASABLE_TIERS.includes(tier)) {
    throw httpError('TIER_NOT_PURCHASABLE', 400);
  }
  return tier;
}

function parsePeriod(period: unknown): BillingPeriod {
  if (period !== 'month' && period !== 'year') throw httpError('INVALID_PERIOD', 400);
  return period;
}

function parseMethod(method: unknown): YoomoneyMethod {
  if (method !== 'AC' && method !== 'PC') throw httpError('INVALID_METHOD', 400);
  return method;
}

function requireGateway() {
  const cfg = yoomoneyConfig();
  if (!cfg.enabled) throw httpError('PAYMENTS_DISABLED', 503);
  return cfg;
}

/**
 * Продлевает/выдаёт подписку внутри транзакции оплаты.
 * - тот же тариф и он ещё активен — период прибавляется к текущей дате окончания;
 * - другой платный тариф — остаток старого пересчитывается в дни нового по соотношению цен
 *   (апгрейд lite→pro с 30 оставшимися днями даст ~13 дополнительных дней pro);
 * - иначе период считается от текущего момента.
 */
async function applySubscription(tx: Tx, userId: string, tier: PaidTier, months: number, now = new Date()) {
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { subscription_tier: true, subscription_expires_at: true },
  });
  let start = now;
  let bonusMs = 0;
  const current = u.subscription_tier;
  const expires = u.subscription_expires_at;
  if (expires && expires > now && isPaidTier(current)) {
    if (current === tier) {
      start = expires;
    } else {
      bonusMs = Math.floor((expires.getTime() - now.getTime()) * PLAN_PRICES[current].month / PLAN_PRICES[tier].month);
    }
  }
  const expiresAt = new Date(addMonths(start, months).getTime() + bonusMs);

  await tx.subscriptionPlan.updateMany({ where: { user_id: userId, ends_at: null }, data: { ends_at: now } });
  await tx.subscriptionPlan.create({ data: { user_id: userId, tier, starts_at: now } });
  await tx.user.update({
    where: { id: userId },
    data: { subscription_tier: tier, subscription_expires_at: expiresAt },
  });
  return { tier, expiresAt };
}

/** Тариф выдан админом бессрочно — покупка поверх него сломала бы «подарок». */
function assertNotComped(user: { subscription_tier: string; subscription_expires_at: Date | null }) {
  if (user.subscription_tier !== 'free' && !user.subscription_expires_at) {
    throw httpError('SUBSCRIPTION_COMPED', 409);
  }
}

/** Атомарно переводит платёж в succeeded и применяет эффект. false — уже обработан. */
async function fulfill(paymentId: string, extra: Prisma.PaymentUpdateManyMutationInput = {}) {
  return prisma.$transaction(async (tx) => {
    const flipped = await tx.payment.updateMany({
      // expired тоже: деньги могли прийти позже TTL, их нужно зачесть
      where: { id: paymentId, status: { in: ['pending', 'expired'] } },
      data: { ...extra, status: 'succeeded', paid_at: new Date() },
    });
    if (flipped.count === 0) return false;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.purpose === 'wallet_topup') {
      await tx.wallet.upsert({
        where: { user_id: p.user_id },
        update: { balance: { increment: p.amount } },
        create: { user_id: p.user_id, balance: p.amount },
      });
    } else if (p.purpose === 'subscription' && p.tier && isPaidTier(p.tier)) {
      await applySubscription(tx, p.user_id, p.tier, PERIOD_MONTHS[parsePeriod(p.period)]);
    } else {
      throw new Error(`Payment ${p.id}: unknown purpose ${p.purpose}`);
    }
    return true;
  });
}

async function markReview(paymentId: string, reason: string, extra: Prisma.PaymentUpdateManyMutationInput) {
  await prisma.payment.updateMany({
    where: { id: paymentId, status: { in: ['pending', 'expired'] } },
    data: { ...extra, status: 'review', failure_reason: reason.slice(0, 200) },
  });
  logger.error({ paymentId, reason }, '[payments] payment needs manual review');
}

export const paymentsService = {
  getConfig: async (userId: string) => {
    const cfg = yoomoneyConfig();
    const user = await loadBuyer(userId);
    const early = isEarlyUser(user.created_at);
    return {
      enabled: cfg.enabled,
      provider: 'yoomoney',
      methods: ['AC', 'PC'] as YoomoneyMethod[],
      topup: { min: TOPUP_MIN, max: TOPUP_MAX },
      plans: PURCHASABLE_TIERS.map((tier) => ({
        tier,
        month: quote(tier, 'month', early),
        year: quote(tier, 'year', early),
      })),
      subscription: { tier: user.subscription_tier, expiresAt: user.subscription_expires_at },
    };
  },

  quote: async (userId: string, tier: unknown, period: unknown) => {
    const user = await loadBuyer(userId);
    return quote(parseTier(tier), parsePeriod(period), isEarlyUser(user.created_at));
  },

  createTopup: async (userId: string, rawAmount: unknown, rawMethod: unknown) => {
    const cfg = requireGateway();
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
      throw httpError(`Сумма — целое число от ${TOPUP_MIN} до ${TOPUP_MAX} ₽`, 400);
    }
    const method = parseMethod(rawMethod ?? 'AC');
    await loadBuyer(userId);
    const payment = await prisma.payment.create({
      data: { user_id: userId, provider: 'yoomoney', purpose: 'wallet_topup', amount, method },
    });
    return {
      paymentId: payment.id,
      amount,
      confirmationUrl: buildQuickpayUrl({
        baseUrl: cfg.quickpayUrl, receiver: cfg.receiver, amount, label: payment.id, method,
        description: `Пополнение баланса Bloomly на ${amount} ₽`,
        successUrl: `${cfg.returnUrl}?id=${payment.id}`,
      }),
    };
  },

  createSubscription: async (userId: string, rawTier: unknown, rawPeriod: unknown, rawMethod: unknown) => {
    const tier = parseTier(rawTier);
    const period = parsePeriod(rawPeriod);
    const user = await loadBuyer(userId);
    assertNotComped(user);
    const q = quote(tier, period, isEarlyUser(user.created_at));
    const label = `Подписка Bloomly ${tier[0].toUpperCase()}${tier.slice(1)} — ${period === 'year' ? '12 мес.' : '1 мес.'}`;

    if (rawMethod === 'wallet') {
      return prisma.$transaction(async (tx) => {
        // Условное списание: два параллельных запроса не уведут баланс в минус
        const debited = await tx.wallet.updateMany({
          where: { user_id: userId, balance: { gte: q.amount } },
          data: { balance: { decrement: q.amount } },
        });
        if (debited.count === 0) throw httpError('INSUFFICIENT_FUNDS', 402);
        const payment = await tx.payment.create({
          data: {
            user_id: userId, provider: 'wallet', purpose: 'subscription', status: 'succeeded',
            amount: q.amount, tier, period, paid_at: new Date(),
          },
        });
        const sub = await applySubscription(tx, userId, tier, q.months);
        return { paymentId: payment.id, status: 'succeeded' as const, amount: q.amount, subscription: sub };
      });
    }

    const cfg = requireGateway();
    const method = parseMethod(rawMethod);
    const payment = await prisma.payment.create({
      data: { user_id: userId, provider: 'yoomoney', purpose: 'subscription', amount: q.amount, method, tier, period },
    });
    return {
      paymentId: payment.id,
      status: 'pending' as const,
      amount: q.amount,
      confirmationUrl: buildQuickpayUrl({
        baseUrl: cfg.quickpayUrl, receiver: cfg.receiver, amount: q.amount, label: payment.id, method,
        description: label, successUrl: `${cfg.returnUrl}?id=${payment.id}`,
      }),
    };
  },

  getPayment: async (userId: string, id: string) => {
    if (!UUID_RE.test(id)) throw httpError('Payment not found', 404);
    const payment = await prisma.payment.findFirst({ where: { id, user_id: userId }, select: PUBLIC_SELECT });
    if (!payment) throw httpError('Payment not found', 404);
    return payment;
  },

  listMine: (userId: string) =>
    prisma.payment.findMany({
      where: { user_id: userId, status: { in: ['succeeded', 'review'] } },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: PUBLIC_SELECT,
    }),

  listAll: (status?: string) =>
    prisma.payment.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      take: 200,
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
    }),

  /**
   * HTTP-уведомление ЮMoney о входящем переводе. Должно быть идемпотентным:
   * ЮMoney повторяет уведомление, пока не получит 200.
   * Бросает 403 только при неверной подписи; всё остальное — 200 (повтор не поможет).
   */
  handleYoomoneyNotification: async (n: YoomoneyNotification) => {
    const cfg = yoomoneyConfig();
    if (!cfg.secret) throw httpError('PAYMENTS_DISABLED', 503);
    if (!verifyNotification(n, cfg.secret)) {
      logger.warn({ operation_id: n.operation_id, label: n.label }, '[payments] yoomoney notification: bad signature');
      throw httpError('BAD_SIGNATURE', 403);
    }
    if (n.test_notification === 'true') return { handled: 'test' };

    const label = n.label ?? '';
    if (!UUID_RE.test(label)) {
      // Перевод на кошелёк не через нашу форму — не наш платёж
      logger.warn({ operation_id: n.operation_id }, '[payments] yoomoney notification without our label');
      return { handled: 'foreign' };
    }
    const payment = await prisma.payment.findUnique({ where: { id: label } });
    if (!payment || payment.provider !== 'yoomoney') {
      logger.warn({ label, operation_id: n.operation_id }, '[payments] yoomoney notification for unknown payment');
      return { handled: 'unknown' };
    }
    if (payment.status === 'succeeded' || payment.status === 'review') return { handled: 'duplicate' };

    const paid = Number(n.withdraw_amount || n.amount);
    const credited = Number(n.amount);
    const { sha1_hash: _sig, ...raw } = n;
    const extra: Prisma.PaymentUpdateManyMutationInput = {
      provider_operation_id: n.operation_id || null,
      credited_amount: Number.isFinite(credited) ? credited : null,
      raw_notification: raw as Prisma.InputJsonValue,
    };

    if (n.currency !== '643') {
      await markReview(payment.id, `unexpected currency ${n.currency}`, extra);
      return { handled: 'review' };
    }
    if (n.unaccepted === 'true' || n.codepro === 'true') {
      // Деньги заморожены (код протекции / лимит кошелька) — зачислить можно только после ручной проверки
      await markReview(payment.id, 'funds not accepted yet (unaccepted/codepro)', extra);
      return { handled: 'review' };
    }
    if (!Number.isFinite(paid) || paid + 0.001 < Number(payment.amount)) {
      await markReview(payment.id, `amount mismatch: paid ${paid}, expected ${payment.amount}`, extra);
      return { handled: 'review' };
    }

    const done = await fulfill(payment.id, extra);
    if (done) logger.info({ paymentId: payment.id, purpose: payment.purpose, amount: paid }, '[payments] payment succeeded');
    return { handled: done ? 'succeeded' : 'duplicate' };
  },

  /** Только dev/test: подтверждает платёж так, будто пришло уведомление от ЮMoney. */
  devConfirm: async (userId: string, id: string) => {
    const payment = await paymentsService.getPayment(userId, id);
    await fulfill(payment.id, { provider_operation_id: `dev-${payment.id}` });
    return paymentsService.getPayment(userId, id);
  },

  /** Брошенные платежи (пользователь не дошёл до оплаты) — в expired, чтобы не висели pending. */
  expireStalePayments: async () => {
    const res = await prisma.payment.updateMany({
      where: { status: 'pending', created_at: { lt: new Date(Date.now() - PENDING_TTL_MS) } },
      data: { status: 'expired' },
    });
    return res.count;
  },

  /** Истёкшие оплаченные периоды → free. Бессрочные (выданные админом, expires = null) не трогаем. */
  expireSubscriptions: async (now = new Date()) => {
    const due = await prisma.user.findMany({
      where: { subscription_tier: { not: 'free' }, subscription_expires_at: { lte: now } },
      select: { id: true },
      take: 500,
    });
    let count = 0;
    for (const { id } of due) {
      const done = await prisma.$transaction(async (tx) => {
        // Повторная проверка в транзакции: пользователь мог продлить подписку прямо сейчас
        const res = await tx.user.updateMany({
          where: { id, subscription_tier: { not: 'free' }, subscription_expires_at: { lte: now } },
          data: { subscription_tier: 'free', subscription_expires_at: null },
        });
        if (res.count === 0) return false;
        await tx.subscriptionPlan.updateMany({ where: { user_id: id, ends_at: null }, data: { ends_at: now } });
        await tx.subscriptionPlan.create({ data: { user_id: id, tier: 'free', starts_at: now } });
        return true;
      });
      if (done) count++;
    }
    return count;
  },
};
