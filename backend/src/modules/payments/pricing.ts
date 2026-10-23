// Единственный источник цен подписки. Фронт показывает те же цифры (SubscriptionView),
// но сумму к оплате всегда считает сервер — клиенту доверять нельзя.

export type PaidTier = 'lite' | 'pro' | 'business';
export type BillingPeriod = 'month' | 'year';

/**
 * Цена в BLM за месяц (1 BLM = 1 $): при помесячной оплате и при годовой (годовая списывается разом ×12, −25%).
 * Это обычная цена; ранним пользователям она достаётся со скидкой 50 % (Lite 1, Pro 2, Business 5 BLM/мес).
 */
export const PLAN_PRICES_BLM: Record<PaidTier, { month: number; year: number }> = {
  lite:     { month: 2,  year: 1.5 },
  pro:      { month: 4,  year: 3 },
  business: { month: 10, year: 7.5 },
};

/** Все платные тарифы продаются самостоятельно (Business больше не «через менеджера»). */
export const PURCHASABLE_TIERS: PaidTier[] = ['lite', 'pro', 'business'];

// Ранние пользователи — зарегистрировались до 1 января 2027, постоянная скидка
export const EARLY_USER_CUTOFF = new Date('2027-01-01T00:00:00Z');
export const EARLY_USER_DISCOUNT = 50; // %

export const PERIOD_MONTHS: Record<BillingPeriod, number> = { month: 1, year: 12 };

export const TIER_RANK: Record<string, number> = { free: 0, lite: 1, pro: 2, business: 3 };

export function isPaidTier(t: string): t is PaidTier {
  return t in PLAN_PRICES_BLM;
}

export function isEarlyUser(createdAt: Date): boolean {
  return createdAt < EARLY_USER_CUTOFF;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Цена месяца в BLM с учётом периода и скидки ранних пользователей. */
export function monthlyPriceBlm(tier: PaidTier, period: BillingPeriod, earlyUser: boolean): number {
  const base = PLAN_PRICES_BLM[tier][period];
  return earlyUser ? cents(base * (1 - EARLY_USER_DISCOUNT / 100)) : base;
}

/** Рублей за BLM-сумму по курсу: целые рубли вверх — столько уходит на шлюз. */
export const blmToRub = (blm: number, rate: number) => Math.ceil(blm * rate - 1e-6);

/** Месячная цена в рублях по курсу (для оценки выручки и показа). */
export function monthlyPrice(tier: PaidTier, period: BillingPeriod, earlyUser: boolean, rate: number): number {
  return blmToRub(monthlyPriceBlm(tier, period, earlyUser), rate);
}

/**
 * Сумма к оплате за весь период. Цена задана в BLM: с баланса списывается ровно blmAmount, на шлюз уходит
 * рублёвый эквивалент по текущему курсу (amount). Пользователю показываем оба.
 */
export function quote(tier: PaidTier, period: BillingPeriod, earlyUser: boolean, rate: number) {
  const blmPerMonth = monthlyPriceBlm(tier, period, earlyUser);
  const months = PERIOD_MONTHS[period];
  const blmAmount = cents(blmPerMonth * months);
  return {
    tier, period, months, discounted: earlyUser,
    blmPerMonth, blmAmount,
    perMonth: blmToRub(blmPerMonth, rate), amount: blmToRub(blmAmount, rate),
    bcAmount: blmAmount,
  };
}

/** Размеры пакетов пополнения в BLM (1 BLM = 1 $); рублёвая цена считается по текущему курсу. */
const TOPUP_PACKAGE_SIZES = [5, 10, 25, 50];
export const topupPackages = (rate: number) =>
  TOPUP_PACKAGE_SIZES.map((bc) => ({ bc, rub: Math.ceil(bc * rate), ...(bc === 10 ? { popular: true } : {}) }));

/** Сколько BLM зачислить за рубли по курсу (вниз до сотых). */
export function rubToBlm(rub: number, rate: number): number {
  return Math.floor((rub / rate) * 100 + 1e-6) / 100;
}

/** Сколько BLM списать за товар, оценённый в рублях (вверх до сотых). */
export function rubToBlmCharge(rub: number, rate: number): number {
  return Math.ceil((rub / rate) * 100 - 1e-6) / 100;
}

/** Старый курс (1 Bloom = 90 ₽, пакеты и розница 108 ₽) — только для платежей, созданных до появления BLM. */
const LEGACY_BC_PACKAGES = [{ bc: 5, rub: 540 }, { bc: 10, rub: 990 }, { bc: 25, rub: 2250 }, { bc: 50, rub: 4500 }];
export function legacyRubToBc(rub: number): number {
  const pkg = LEGACY_BC_PACKAGES.find((p) => p.rub === rub);
  if (pkg) return pkg.bc;
  return Math.floor((rub / 108) * 100 + 1e-6) / 100;
}
