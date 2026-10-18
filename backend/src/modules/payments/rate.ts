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
