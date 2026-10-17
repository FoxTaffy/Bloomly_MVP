// Единственный источник цен подписки. Фронт показывает те же цифры (SubscriptionView),
// но сумму к оплате всегда считает сервер — клиенту доверять нельзя.

export type PaidTier = 'lite' | 'pro' | 'business';
export type BillingPeriod = 'month' | 'year';

/** Цена за месяц в рублях: при помесячной оплате и при годовой (годовая списывается разом ×12). */
export const PLAN_PRICES: Record<PaidTier, { month: number; year: number }> = {
  lite:     { month: 149, year: 99 },
  pro:      { month: 349, year: 249 },
  business: { month: 899, year: 649 },
};

/** Business продаётся только через менеджера (на фронте — «свяжитесь с нами»). */
export const PURCHASABLE_TIERS: PaidTier[] = ['lite', 'pro'];

// Ранние пользователи — зарегистрировались до 1 января 2027, постоянная скидка
export const EARLY_USER_CUTOFF = new Date('2027-01-01T00:00:00Z');
export const EARLY_USER_DISCOUNT = 50; // %

export const PERIOD_MONTHS: Record<BillingPeriod, number> = { month: 1, year: 12 };

export const TIER_RANK: Record<string, number> = { free: 0, lite: 1, pro: 2, business: 3 };

export function isPaidTier(t: string): t is PaidTier {
  return t in PLAN_PRICES;
}

export function isEarlyUser(createdAt: Date): boolean {
  return createdAt < EARLY_USER_CUTOFF;
}

/** Месячная цена с учётом периода и скидки (округление как на фронте). */
export function monthlyPrice(tier: PaidTier, period: BillingPeriod, earlyUser: boolean): number {
  const base = PLAN_PRICES[tier][period];
  return earlyUser ? Math.round(base * (1 - EARLY_USER_DISCOUNT / 100)) : base;
}

/** Сумма к оплате за весь период. */
export function quote(tier: PaidTier, period: BillingPeriod, earlyUser: boolean) {
  const perMonth = monthlyPrice(tier, period, earlyUser);
  const months = PERIOD_MONTHS[period];
  return { tier, period, months, perMonth, amount: perMonth * months, discounted: earlyUser };
}

/** Базовый курс игровой валюты: 1 Bloom = 90 ₽ (по нему считается списание за подписки с баланса и цена крупных пакетов). */
export const BC_RATE = 90;
/** Розничная цена Bloom при пополнении «своей суммой» — выгоднее брать пакет. */
export const RETAIL_RATE = 108;

/** Пакеты пополнения (маркетинг: чем крупнее пакет, тем ближе к базовому курсу). Популярный выделяется на фронте. */
export const TOPUP_PACKAGES = [
  { bc: 5,  rub: 540 },
  { bc: 10, rub: 990, popular: true },
  { bc: 25, rub: 2250 },
  { bc: 50, rub: 4500 },
];

/** Сколько Bloom зачислить за рубли: пакет — по его размеру, своя сумма — по розничному курсу (вниз до сотых). */
export function rubToBc(rub: number): number {
  const pkg = TOPUP_PACKAGES.find((p) => p.rub === rub);
  if (pkg) return pkg.bc;
  return Math.floor((rub / RETAIL_RATE) * 100 + 1e-6) / 100;
}

/** Сколько Bloom списать за товар, оценённый в рублях (вверх до сотых, по базовому курсу). */
export function rubToBcCharge(rub: number): number {
  return Math.ceil((rub / BC_RATE) * 100 - 1e-6) / 100;
}
