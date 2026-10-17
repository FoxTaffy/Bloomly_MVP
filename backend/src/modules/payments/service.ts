import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { logger } from '../../lib/logger.js';
import { yookassaConfig, TOPUP_MIN, TOPUP_STEP, TOPUP_MAX, DONATE_MIN, DONATE_MAX, PENDING_TTL_MS } from './config.js';
import { createYookassaPayment, fetchYookassaPayment, type PayMethod, type YookassaNotification } from './yookassa.js';
import {
  PLAN_PRICES, PURCHASABLE_TIERS, PERIOD_MONTHS, isPaidTier, isEarlyUser, quote,
  BC_RATE, TOPUP_PACKAGES, rubToBc, rubToBcCharge,
  type PaidTier, type BillingPeriod,
} from './pricing.js';

type Tx = Prisma.TransactionClient;

const httpError = (msg: string, statusCode: number) => Object.assign(new Error(msg), { statusCode });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Для пополнения добавляем зачисленные BC (amount хранится в рублях). */
const withBc = <T extends { purpose: string; amount: Prisma.Decimal }>(p: T) =>
  ({ ...p, bc: p.purpose === 'wallet_topup' ? rubToBc(Number(p.amount)) : null });

/** Цена подписки в рублях + эквивалент в BC для оплаты с баланса. */
const quoteWithBc = (tier: PaidTier, period: BillingPeriod, early: boolean) => {
  const q = quote(tier, period, early);
  return { ...q, bcAmount: rubToBcCharge(q.amount) };
};

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

function parseMethod(method: unknown): PayMethod {
  if (method !== 'AC' && method !== 'PC') throw httpError('INVALID_METHOD', 400);
  return method;
}

function requireGateway() {
  const cfg = yookassaConfig();
  if (!cfg.enabled) throw httpError('PAYMENTS_DISABLED', 503);
  return cfg;
}

/** Создаёт платёж в ЮKassa и привязывает его id к нашей строке Payment. */
async function openGatewayPayment(
  cfg: ReturnType<typeof requireGateway>,
  payment: { id: string; user_id: string }, amount: number, method: PayMethod, description: string,
) {
  const buyer = cfg.receipt.enabled
    ? await prisma.user.findUnique({ where: { id: payment.user_id }, select: { email: true } })
    : null;
  try {
    const remote = await createYookassaPayment({
      paymentId: payment.id, amount, method, description,
      returnUrl: `${cfg.returnUrl}?id=${payment.id}`,
      customerEmail: buyer?.email,
    });
    const url = remote.confirmation?.confirmation_url;
    if (!url) throw new Error('YooKassa: no confirmation_url');
    await prisma.payment.update({ where: { id: payment.id }, data: { provider_operation_id: remote.id } });
    return url;
  } catch (e) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'expired', failure_reason: 'gateway create failed' },
    });
    throw e;
  }
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
        update: { balance: { increment: rubToBc(Number(p.amount)) } },
        create: { user_id: p.user_id, balance: rubToBc(Number(p.amount)) },
      });
    } else if (p.purpose === 'subscription' && p.tier && isPaidTier(p.tier)) {
      await applySubscription(tx, p.user_id, p.tier, PERIOD_MONTHS[parsePeriod(p.period)]);
    } else if (p.purpose === 'donation') {
      // Донат — только фиксируем факт оплаты
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
    const cfg = yookassaConfig();
    const user = await loadBuyer(userId);
    const early = isEarlyUser(user.created_at);
    return {
      enabled: cfg.enabled,
      provider: 'yookassa',
      methods: ['AC', 'PC'] as PayMethod[],
      bcRate: BC_RATE,
      topup: { min: TOPUP_MIN, max: TOPUP_MAX, step: TOPUP_STEP, packages: TOPUP_PACKAGES },
      donate: { min: DONATE_MIN, max: DONATE_MAX },
      plans: PURCHASABLE_TIERS.map((tier) => ({
        tier,
        month: quoteWithBc(tier, 'month', early),
        year: quoteWithBc(tier, 'year', early),
      })),
      subscription: { tier: user.subscription_tier, expiresAt: user.subscription_expires_at },
    };
  },

  quote: async (userId: string, tier: unknown, period: unknown) => {
    const user = await loadBuyer(userId);
    return quoteWithBc(parseTier(tier), parsePeriod(period), isEarlyUser(user.created_at));
  },

  createTopup: async (userId: string, rawAmount: unknown, rawMethod: unknown) => {
    const cfg = requireGateway();
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX
      || (amount % TOPUP_STEP !== 0 && !TOPUP_PACKAGES.some((p) => p.rub === amount))) {
      throw httpError(`Сумма — от ${TOPUP_MIN} до ${TOPUP_MAX} ₽ с шагом ${TOPUP_STEP}`, 400);
    }
    const method = parseMethod(rawMethod ?? 'AC');
    await loadBuyer(userId);
    const payment = await prisma.payment.create({
      data: { user_id: userId, provider: 'yookassa', purpose: 'wallet_topup', amount, method },
    });
    const confirmationUrl = await openGatewayPayment(cfg, payment, amount, method, `Пополнение баланса Bloomly: ${rubToBc(amount)} Blooms`);
    return { paymentId: payment.id, amount, confirmationUrl };
  },

  createDonation: async (userId: string, rawAmount: unknown, rawMethod: unknown) => {
    const cfg = requireGateway();
    const amount = Number(rawAmount);
    if (!Number.isInteger(amount) || amount < DONATE_MIN || amount > DONATE_MAX) {
      throw httpError(`Сумма — целое число от ${DONATE_MIN} до ${DONATE_MAX} ₽`, 400);
    }
    const method = parseMethod(rawMethod ?? 'AC');
    await loadBuyer(userId);
    const payment = await prisma.payment.create({
      data: { user_id: userId, provider: 'yookassa', purpose: 'donation', amount, method },
    });
    const confirmationUrl = await openGatewayPayment(cfg, payment, amount, method, `Поддержка проекта Bloomly — ${amount} ₽`);
    return { paymentId: payment.id, amount, confirmationUrl };
  },

  createSubscription: async (userId: string, rawTier: unknown, rawPeriod: unknown, rawMethod: unknown) => {
    const tier = parseTier(rawTier);
    const period = parsePeriod(rawPeriod);
    const user = await loadBuyer(userId);
    assertNotComped(user);
    const q = quote(tier, period, isEarlyUser(user.created_at));
    const label = `Подписка Bloomly ${tier[0].toUpperCase()}${tier.slice(1)} — ${period === 'year' ? '12 мес.' : '1 мес.'}`;

    if (rawMethod === 'wallet') {
      const bcCharge = rubToBcCharge(q.amount);
      return prisma.$transaction(async (tx) => {
        // Условное списание: два параллельных запроса не уведут баланс в минус
        const debited = await tx.wallet.updateMany({
          where: { user_id: userId, balance: { gte: bcCharge } },
          data: { balance: { decrement: bcCharge } },
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
      data: { user_id: userId, provider: 'yookassa', purpose: 'subscription', amount: q.amount, method, tier, period },
    });
    const confirmationUrl = await openGatewayPayment(cfg, payment, q.amount, method, label);
    return { paymentId: payment.id, status: 'pending' as const, amount: q.amount, confirmationUrl };
  },

  getPayment: async (userId: string, id: string) => {
    if (!UUID_RE.test(id)) throw httpError('Payment not found', 404);
    const payment = await prisma.payment.findFirst({ where: { id, user_id: userId }, select: PUBLIC_SELECT });
    if (!payment) throw httpError('Payment not found', 404);
    return withBc(payment);
  },

  listMine: async (userId: string) =>
    (await prisma.payment.findMany({
      where: { user_id: userId, status: { in: ['succeeded', 'review'] } },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: PUBLIC_SELECT,
    })).map(withBc),

  listAll: (status?: string) =>
    prisma.payment.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      take: 200,
      include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
    }),

  /**
   * Webhook ЮKassa (payment.succeeded / payment.canceled). Идемпотентен: ЮKassa повторяет доставку,
   * пока не получит 200. Уведомление не подписано — по id достаём платёж из API и верим только ему.
   * Бросает ошибку (→ 5xx, ЮKassa повторит) только если API недоступен.
   */
  handleYookassaNotification: async (n: YookassaNotification) => {
    const cfg = yookassaConfig();
    if (!cfg.enabled) throw httpError('PAYMENTS_DISABLED', 503);
    const remoteId = n.object?.id;
    if (!remoteId || (n.event !== 'payment.succeeded' && n.event !== 'payment.canceled')) return { handled: 'ignored' };

    const payment = await prisma.payment.findUnique({ where: { provider_operation_id: remoteId } });
    if (!payment || payment.provider !== 'yookassa') {
      logger.warn({ remoteId }, '[payments] yookassa notification for unknown payment');
      return { handled: 'unknown' };
    }
    if (payment.status === 'succeeded' || payment.status === 'review') return { handled: 'duplicate' };

    const remote = await fetchYookassaPayment(remoteId);
    if (remote.metadata?.payment_id !== payment.id) {
      logger.warn({ remoteId, paymentId: payment.id }, '[payments] yookassa payment metadata mismatch');
      return { handled: 'unknown' };
    }

    if (remote.status === 'canceled') {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'expired', failure_reason: `canceled: ${remote.cancellation_details?.reason ?? 'unknown'}`.slice(0, 200) },
      });
      return { handled: 'canceled' };
    }
    if (remote.status !== 'succeeded' || !remote.paid) return { handled: 'ignored' };

    const paid = Number(remote.amount.value);
    const credited = Number(remote.income_amount?.value);
    const extra: Prisma.PaymentUpdateManyMutationInput = {
      credited_amount: Number.isFinite(credited) ? credited : null,
      raw_notification: remote as unknown as Prisma.InputJsonValue,
    };
    if (remote.amount.currency !== 'RUB') {
      await markReview(payment.id, `unexpected currency ${remote.amount.currency}`, extra);
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

  /** Только dev/test: подтверждает платёж так, будто пришёл webhook от ЮKassa. */
  devConfirm: async (userId: string, id: string) => {
    const payment = await paymentsService.getPayment(userId, id);
    await fulfill(payment.id);
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
