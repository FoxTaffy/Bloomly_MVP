import prisma from '../../config/prisma.js';
import { logger } from '../../lib/logger.js';

// 1 BLM = 1 $. Рублёвый эквивалент — курс USD ЦБ РФ, обновляется по cron 2 раза в сутки.
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
/** Запасной курс, пока в базе нет ни одного значения и ЦБ недоступен. */
const FALLBACK_RATE = Number(process.env.BLM_FALLBACK_RATE) || 90;
const CACHE_MS = 60_000;

let cache: { rate: number; at: number } | null = null;

/** Текущий курс: ₽ за 1 BLM (последнее сохранённое значение). */
export async function getBlmRate(): Promise<number> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rate;
  const row = await prisma.blmRate.findFirst({ orderBy: { created_at: 'desc' } });
  if (row) {
    cache = { rate: Number(row.usd_rub), at: Date.now() };
    return cache.rate;
  }
  return (await refreshBlmRate()) ?? FALLBACK_RATE;
}

/** Берёт курс USD у ЦБ и сохраняет новую запись. При ошибке остаётся прежний курс. */
export async function refreshBlmRate(): Promise<number | null> {
  try {
    const res = await fetch(CBR_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { Valute?: { USD?: { Value?: number; Nominal?: number } } };
    const usd = json.Valute?.USD;
    const rate = usd?.Value && usd.Nominal ? Math.round((usd.Value / usd.Nominal) * 100) / 100 : NaN;
    if (!Number.isFinite(rate) || rate < 10 || rate > 1000) throw new Error('bad rate in response');
    await prisma.blmRate.create({ data: { usd_rub: rate } });
    cache = { rate, at: Date.now() };
    logger.info({ rate }, '[BLM] rate updated');
    return rate;
  } catch (err) {
    logger.error({ err }, '[BLM] rate update failed');
    return null;
  }
}

// ── Курсы для отображения цен в валюте региона пользователя ──────────────────
// Только показ: списание идёт в валюте самого товара. Источник тот же — ЦБ РФ.
const DISPLAY_CURRENCIES = ['USD', 'EUR', 'CNY', 'INR', 'BRL'] as const;
const DISPLAY_CACHE_MS = 60 * 60_000;
let displayCache: { rates: Record<string, number>; at: number } | null = null;

/** ₽ за 1 единицу каждой валюты (RUB = 1). */
export async function getDisplayRates(): Promise<Record<string, number>> {
  if (displayCache && Date.now() - displayCache.at < DISPLAY_CACHE_MS) return displayCache.rates;
  try {
    const res = await fetch(CBR_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { Valute?: Record<string, { Value?: number; Nominal?: number }> };
    const rates: Record<string, number> = { RUB: 1 };
    for (const code of DISPLAY_CURRENCIES) {
      const v = json.Valute?.[code];
      if (v?.Value && v.Nominal) rates[code] = v.Value / v.Nominal;
    }
    if (!rates.USD) throw new Error('no USD in response');
    displayCache = { rates, at: Date.now() };
    return rates;
  } catch (err) {
    logger.error({ err }, '[display-rates] update failed');
    if (displayCache) return displayCache.rates;
    return { RUB: 1, USD: await getBlmRate() };
  }
}
