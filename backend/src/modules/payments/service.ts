import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { logger } from '../../lib/logger.js';
import {
  yookassaConfig, TOPUP_MIN, TOPUP_STEP, TOPUP_MAX, DONATE_MIN, DONATE_MAX, PENDING_TTL_MS,
  CARD_BINDING_AMOUNT, RENEW_AHEAD_MS, RENEW_RETRY_MS, RENEW_MAX_ATTEMPTS, RENEW_GRACE_MS,
} from './config.js';
import {
  createYookassaPayment, fetchYookassaPayment, chargeSavedPaymentMethod, refundYookassaPayment,
  type PayMethod, type YookassaNotification, type YookassaPayment, type YookassaPaymentMethod,
} from './yookassa.js';
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
  method: true, tier: true, period: true, recurring: true, paid_at: true, created_at: true,
} as const;

/** Способ оплаты, по которому можно списывать: есть токен ЮKassa. Старые «карты» без токена не годятся. */
const CHARGEABLE = { provider_method_id: { not: null } } as const;

const tierLabel = (tier: string) => `${tier[0].toUpperCase()}${tier.slice(1)}`;
const subscriptionLabel = (tier: string, period: BillingPeriod) =>
  `Подписка Bloomly ${tierLabel(tier)} — ${period === 'year' ? '12 мес.' : '1 мес.'}`;

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
    select: {
      id: true, created_at: true, subscription_tier: true, subscription_expires_at: true,
      subscription_period: true, subscription_auto_renew: true,
    },
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
  // Реальный способ (карта, ЮMoney, СБП) выбирается в виджете; поле — подсказка для истории
  return method === 'PC' ? 'PC' : 'AC';
}

function requireGateway() {
  const cfg = yookassaConfig();
  if (!cfg.enabled) throw httpError('PAYMENTS_DISABLED', 503);
  return cfg;
}

/** Создаёт платёж в ЮKassa и привязывает его id к нашей строке Payment. */
async function openGatewayPayment(
  cfg: ReturnType<typeof requireGateway>,
  payment: { id: string; user_id: string; save_method?: boolean }, amount: number, description: string,
) {
  const buyer = cfg.receipt.enabled
    ? await prisma.user.findUnique({ where: { id: payment.user_id }, select: { email: true } })
    : null;
  try {
    const remote = await createYookassaPayment({
      paymentId: payment.id, amount, description,
      returnUrl: `${cfg.returnUrl}?id=${payment.id}`,
      customerEmail: buyer?.email,
      savePaymentMethod: payment.save_method,
    });
    const confirmationUrl = remote.confirmation?.confirmation_url;
    if (!confirmationUrl) throw new Error('YooKassa: no confirmation_url');
    await prisma.payment.update({ where: { id: payment.id }, data: { provider_operation_id: remote.id } });
    return { confirmationUrl };
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
async function applySubscription(tx: Tx, userId: string, tier: PaidTier, period: BillingPeriod, now = new Date()) {
  const months = PERIOD_MONTHS[period];
  // Different payment rows can target the same account simultaneously.
  // Lock the account before calculating its new expiry, not only the payment.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
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
    data: {
      subscription_tier: tier, subscription_expires_at: expiresAt, subscription_period: period,
      // Период оплачен — счётчик неудачных автосписаний обнуляется
      subscription_renew_attempts: 0, subscription_next_renew_at: null,
    },
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
      await applySubscription(tx, p.user_id, p.tier, parsePeriod(p.period));
    } else if (p.purpose === 'donation' || p.purpose === 'card_binding') {
      // Донат — только фиксируем факт оплаты; привязка — способ сохраняется после транзакции, 1 ₽ возвращается
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

type PaymentRow = Prisma.PaymentGetPayload<object>;

/** Сохраняет способ оплаты из успешного платежа и делает его основным. */
async function saveMethodFromPayment(userId: string, pm: YookassaPaymentMethod) {
  const card = pm.card;
  const expYear = Number(card?.expiry_year);
  const data = {
    type: pm.type.slice(0, 20),
    brand: (pm.type === 'bank_card' ? (card?.card_type || 'card') : pm.type).toLowerCase().slice(0, 20),
    last4: card?.last4?.slice(-4) ?? pm.account_number?.slice(-4) ?? null,
    exp_month: Number(card?.expiry_month) || null,
    exp_year: Number.isFinite(expYear) && expYear > 0 ? expYear : null,
    title: (pm.title ?? (pm.account_number ? `ЮMoney ${pm.account_number}` : null))?.slice(0, 100) ?? null,
  };
  return prisma.$transaction(async (tx) => {
    await tx.paymentMethod.updateMany({ where: { user_id: userId, is_default: true }, data: { is_default: false } });
    return tx.paymentMethod.upsert({
      where: { provider_method_id: pm.id },
      // Повторная обработка того же платежа — обновляем, а не дублируем
      update: { ...data, is_default: true },
      create: { ...data, user_id: userId, provider_method_id: pm.id, is_default: true },
    });
  });
}

/** После зачисления: сохранить способ оплаты, включить автопродление, вернуть проверочный платёж. */
async function afterSuccess(payment: PaymentRow, remote: YookassaPayment) {
  const pm = remote.payment_method;
  const saved = payment.save_method && pm?.saved && pm.id;
  if (saved) {
    await saveMethodFromPayment(payment.user_id, pm);
    if (payment.purpose === 'subscription') {
      await prisma.user.update({ where: { id: payment.user_id }, data: { subscription_auto_renew: true } });
    }
  } else if (payment.save_method && !payment.recurring) {
    // Например, оплатили через СБП без привязки — платёж прошёл, но списывать потом не по чему
    logger.warn({ paymentId: payment.id, type: pm?.type }, '[payments] payment method was not saved');
  }
  if (payment.purpose === 'card_binding') {
    try {
      await refundYookassaPayment({ paymentId: payment.id, remoteId: remote.id, amount: Number(payment.amount) });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'refunded', failure_reason: saved ? null : 'payment method not saved' },
      });
    } catch (e) {
      // Деньги остались у нас — оставляем succeeded, вернуть можно из кабинета ЮKassa
      logger.error({ err: e, paymentId: payment.id }, '[payments] card binding refund failed');
    }
  }
}

/** Автосписание не прошло. Отзыв разрешения (карту отвязали в банке/ЮMoney) — токен больше не годится. */
async function onRenewalFailed(payment: PaymentRow, remote: YookassaPayment) {
  const reason = remote.cancellation_details?.reason ?? 'unknown';
  if (reason === 'permission_revoked' && remote.payment_method?.id) {
    await prisma.paymentMethod.deleteMany({ where: { provider_method_id: remote.payment_method.id } });
  }
  const left = await prisma.paymentMethod.count({ where: { user_id: payment.user_id, ...CHARGEABLE } });
  const u = await prisma.user.findUnique({ where: { id: payment.user_id }, select: { subscription_renew_attempts: true } });
  if (!left || (u && u.subscription_renew_attempts >= RENEW_MAX_ATTEMPTS)) {
    await prisma.user.update({ where: { id: payment.user_id }, data: { subscription_auto_renew: false, subscription_next_renew_at: null } });
  }
  logger.warn({ paymentId: payment.id, reason }, '[payments] auto-renewal charge failed');
}

/**
 * Разбирает состояние платежа, полученное из API ЮKassa (webhook или ответ на автосписание).
 * Идемпотентно: повторный вызов для уже обработанного платежа ничего не меняет.
 */
async function settle(payment: PaymentRow, remote: YookassaPayment) {
  if (remote.status === 'canceled') {
    const res = await prisma.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'expired', failure_reason: `canceled: ${remote.cancellation_details?.reason ?? 'unknown'}`.slice(0, 200) },
    });
    if (res.count && payment.recurring) await onRenewalFailed(payment, remote);
    return 'canceled';
  }
  if (remote.status !== 'succeeded' || !remote.paid) return 'ignored';

  const paid = Number(remote.amount.value);
  const credited = Number(remote.income_amount?.value);
  const extra: Prisma.PaymentUpdateManyMutationInput = {
    credited_amount: Number.isFinite(credited) ? credited : null,
    raw_notification: remote as unknown as Prisma.InputJsonValue,
  };
  if (remote.amount.currency !== 'RUB') {
    await markReview(payment.id, `unexpected currency ${remote.amount.currency}`, extra);
    return 'review';
  }
  if (!Number.isFinite(paid) || paid + 0.001 < Number(payment.amount)) {
    await markReview(payment.id, `amount mismatch: paid ${paid}, expected ${payment.amount}`, extra);
    return 'review';
  }

  const done = await fulfill(payment.id, extra);
  if (!done) return 'duplicate';
  logger.info({ paymentId: payment.id, purpose: payment.purpose, amount: paid, recurring: payment.recurring }, '[payments] payment succeeded');
  await afterSuccess(payment, remote);
  return 'succeeded';
}

export const paymentsService = {
  getConfig: async (userId: string) => {
    const cfg = yookassaConfig();
    const user = await loadBuyer(userId);
    const early = isEarlyUser(user.created_at);
    return {
      enabled: cfg.enabled,
      recurring: cfg.recurring,
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
      subscription: {
        tier: user.subscription_tier,
        expiresAt: user.subscription_expires_at,
        period: user.subscription_period,
        autoRenew: user.subscription_auto_renew,
      },
      hasSavedMethod: (await prisma.paymentMethod.count({ where: { user_id: userId, ...CHARGEABLE } })) > 0,
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
    const checkout = await openGatewayPayment(cfg, payment, amount, `Пополнение баланса Bloomly: ${rubToBc(amount)} Blooms`);
    return { paymentId: payment.id, amount, ...checkout };
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
    const checkout = await openGatewayPayment(cfg, payment, amount, `Поддержка проекта Bloomly — ${amount} ₽`);
    return { paymentId: payment.id, amount, ...checkout };
  },

  /**
   * autoRenew: при оплате через ЮKassa способ оплаты сохраняется и включается автопродление;
   * при оплате с баланса автопродление включается, если уже есть привязанный способ.
   */
  createSubscription: async (userId: string, rawTier: unknown, rawPeriod: unknown, rawMethod: unknown, rawAutoRenew?: unknown) => {
    const autoRenew = rawAutoRenew === true;
    const tier = parseTier(rawTier);
    const period = parsePeriod(rawPeriod);
    const user = await loadBuyer(userId);
    assertNotComped(user);
    const q = quote(tier, period, isEarlyUser(user.created_at));
    const label = subscriptionLabel(tier, period);

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
        const sub = await applySubscription(tx, userId, tier, period);
        if (autoRenew && await tx.paymentMethod.count({ where: { user_id: userId, ...CHARGEABLE } })) {
          await tx.user.update({ where: { id: userId }, data: { subscription_auto_renew: true } });
        }
        return { paymentId: payment.id, status: 'succeeded' as const, amount: q.amount, subscription: sub };
      });
    }

    const cfg = requireGateway();
    const method = parseMethod(rawMethod);
    const payment = await prisma.payment.create({
      data: {
        user_id: userId, provider: 'yookassa', purpose: 'subscription', amount: q.amount, method, tier, period,
        save_method: autoRenew && cfg.recurring,
      },
    });
    const checkout = await openGatewayPayment(cfg, payment, q.amount, label);
    return { paymentId: payment.id, status: 'pending' as const, amount: q.amount, ...checkout };
  },

  /** Привязка карты/кошелька без покупки: платёж на 1 ₽ с сохранением способа, после оплаты — возврат. */
  createCardBinding: async (userId: string) => {
    const cfg = requireGateway();
    if (!cfg.recurring) throw httpError('RECURRING_DISABLED', 503);
    await loadBuyer(userId);
    const payment = await prisma.payment.create({
      data: {
        user_id: userId, provider: 'yookassa', purpose: 'card_binding', amount: CARD_BINDING_AMOUNT,
        method: 'AC', save_method: true,
      },
    });
    const checkout = await openGatewayPayment(cfg, payment, CARD_BINDING_AMOUNT,
      `Привязка способа оплаты к Bloomly (${CARD_BINDING_AMOUNT} ₽ вернётся)`);
    return { paymentId: payment.id, amount: CARD_BINDING_AMOUNT, ...checkout };
  },

  /** Включить/выключить автопродление. Включить можно только на оплаченный период и при привязанном способе. */
  setAutoRenew: async (userId: string, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw httpError('INVALID_BODY', 400);
    const user = await loadBuyer(userId);
    if (enabled) {
      if (!isPaidTier(user.subscription_tier) || !user.subscription_expires_at) throw httpError('NO_ACTIVE_SUBSCRIPTION', 409);
      if (!PURCHASABLE_TIERS.includes(user.subscription_tier)) throw httpError('TIER_NOT_PURCHASABLE', 409);
      const methods = await prisma.paymentMethod.count({ where: { user_id: userId, ...CHARGEABLE } });
      if (!methods) throw httpError('NO_SAVED_METHOD', 409);
    }
    await prisma.user.update({
      where: { id: userId },
      data: enabled
        ? { subscription_auto_renew: true, subscription_period: user.subscription_period ?? 'month' }
        : { subscription_auto_renew: false, subscription_renew_attempts: 0, subscription_next_renew_at: null },
    });
    return { autoRenew: enabled };
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
    if (['succeeded', 'review', 'refunded'].includes(payment.status)) return { handled: 'duplicate' };

    const remote = await fetchYookassaPayment(remoteId);
    if (remote.metadata?.payment_id !== payment.id) {
      logger.warn({ remoteId, paymentId: payment.id }, '[payments] yookassa payment metadata mismatch');
      return { handled: 'unknown' };
    }
    return { handled: await settle(payment, remote) };
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

  /**
   * Истёкшие оплаченные периоды → free. Бессрочные (выданные админом, expires = null) не трогаем.
   * С включённым автопродлением тариф держится ещё RENEW_GRACE_MS, пока идут повторные попытки списания.
   */
  expireSubscriptions: async (now = new Date()) => {
    const graceEdge = new Date(now.getTime() - RENEW_GRACE_MS);
    const expiredWhere: Prisma.UserWhereInput = {
      subscription_tier: { not: 'free' },
      subscription_expires_at: { lte: now },
      OR: [{ subscription_auto_renew: false }, { subscription_expires_at: { lte: graceEdge } }],
    };
    const due = await prisma.user.findMany({
      where: expiredWhere,
      select: { id: true },
      take: 500,
    });
    let count = 0;
    for (const { id } of due) {
      const done = await prisma.$transaction(async (tx) => {
        // Повторная проверка в транзакции: пользователь мог продлить подписку прямо сейчас
        const res = await tx.user.updateMany({
          where: { id, ...expiredWhere },
          data: {
            subscription_tier: 'free', subscription_expires_at: null,
            subscription_auto_renew: false, subscription_renew_attempts: 0, subscription_next_renew_at: null,
          },
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

  /**
   * Автопродление: за RENEW_AHEAD_MS до конца периода списываем стоимость того же тарифа и периода
   * с основного привязанного способа. Неудача — повтор через RENEW_RETRY_MS, после RENEW_MAX_ATTEMPTS
   * автопродление выключается и подписка истекает обычным порядком.
   */
  renewSubscriptions: async (now = new Date()) => {
    const cfg = yookassaConfig();
    if (!cfg.recurring) return 0;
    const due = await prisma.user.findMany({
      where: {
        deleted_at: null,
        subscription_auto_renew: true,
        subscription_tier: { in: PURCHASABLE_TIERS },
        subscription_expires_at: { not: null, lte: new Date(now.getTime() + RENEW_AHEAD_MS) },
        subscription_renew_attempts: { lt: RENEW_MAX_ATTEMPTS },
        OR: [{ subscription_next_renew_at: null }, { subscription_next_renew_at: { lte: now } }],
      },
      select: {
        id: true, email: true, created_at: true, subscription_tier: true, subscription_period: true,
        subscription_renew_attempts: true, subscription_next_renew_at: true,
      },
      take: 200,
    });

    let charged = 0;
    for (const u of due) {
      const method = await prisma.paymentMethod.findFirst({
        where: { user_id: u.id, ...CHARGEABLE },
        orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      });
      if (!method) {
        await prisma.user.update({ where: { id: u.id }, data: { subscription_auto_renew: false } });
        continue;
      }
      // Захват попытки: параллельный запуск cron не спишет второй раз
      const claimed = await prisma.user.updateMany({
        where: {
          id: u.id,
          subscription_renew_attempts: u.subscription_renew_attempts,
          subscription_next_renew_at: u.subscription_next_renew_at,
        },
        data: {
          subscription_renew_attempts: { increment: 1 },
          subscription_next_renew_at: new Date(now.getTime() + RENEW_RETRY_MS),
        },
      });
      if (!claimed.count) continue;

      const tier = u.subscription_tier as PaidTier;
      const period: BillingPeriod = u.subscription_period === 'year' ? 'year' : 'month';
      const q = quote(tier, period, isEarlyUser(u.created_at));
      const payment = await prisma.payment.create({
        data: {
          user_id: u.id, provider: 'yookassa', purpose: 'subscription', amount: q.amount,
          method: method.type === 'yoo_money' ? 'PC' : 'AC', tier, period, recurring: true,
        },
      });
      try {
        const remote = await chargeSavedPaymentMethod({
          paymentId: payment.id,
          paymentMethodId: method.provider_method_id!,
          amount: q.amount,
          description: `${subscriptionLabel(tier, period)}, автопродление`,
          customerEmail: cfg.receipt.enabled ? u.email ?? undefined : undefined,
        });
        await prisma.payment.update({ where: { id: payment.id }, data: { provider_operation_id: remote.id } });
        // Обычно ответ сразу succeeded/canceled; pending дождётся webhook
        const result = await settle(payment, remote);
        if (result === 'succeeded') charged++;
      } catch (e) {
        // Шлюз недоступен: платёж не создан — попытка засчитана, повторим через RENEW_RETRY_MS
        await prisma.payment.updateMany({
          where: { id: payment.id, status: 'pending' },
          data: { status: 'expired', failure_reason: 'gateway create failed' },
        });
        logger.error({ err: e, userId: u.id }, '[payments] auto-renewal request failed');
        const after = await prisma.user.findUnique({ where: { id: u.id }, select: { subscription_renew_attempts: true } });
        if (after && after.subscription_renew_attempts >= RENEW_MAX_ATTEMPTS) {
          await prisma.user.update({ where: { id: u.id }, data: { subscription_auto_renew: false, subscription_next_renew_at: null } });
        }
      }
    }
    return charged;
  },
};
