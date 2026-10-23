// Правила общей ленты Dealers Den. Что даёт тариф (кулдаун, бесплатные поднятия, автоподнятие) — в payments/plan-perks.ts;
// здесь остальные константы ленты.
import { perksFor } from '../payments/plan-perks.js';

export const DEN_FEED = {
  /** Цена платного поднятия, BLM (сначала тратится промо-баланс). */
  bumpPriceBlm: 0.5,
  /** Одну карточку нельзя поднять чаще, чем раз в N часов. */
  bumpMinIntervalHours: 6,
  /** Автоподнятие возвращает карточку наверх, если она провела в ленте не меньше N часов. */
  autoBumpIntervalHours: 24,
  /** Автоподнятий на группу — не чаще раза в N часов, чтобы одна витрина не занимала ленту целиком. */
  autoBumpGroupGapHours: 3,
} as const;

export const HOUR_MS = 3_600_000;

/** Кулдаун новой карточки группы в общую ленту (в часах — в plan-perks), мс. */
export const cooldownMs = (tier: string) => perksFor(tier).denCooldownHours * HOUR_MS;
export const freeBumpsFor = (tier: string) => perksFor(tier).freeBumpsPerMonth;
export const canAutoBump = (tier: string) => perksFor(tier).autoBump;
/** Начало календарного месяца (UTC) — с него считаются бесплатные поднятия. */
export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
