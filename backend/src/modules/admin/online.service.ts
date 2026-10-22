import prisma from '../../config/prisma.js';
import { presence } from '../realtime/presence.js';

// Сколько хранить минутные замеры; аналитика считается по всем сохранённым дням.
const RETENTION_DAYS = 365;
const DEFAULT_TZ = process.env.ADMIN_STATS_TZ ?? 'Europe/Moscow';

/** Часовой пояс приходит от клиента: пропускаем в SQL только то, что знает Intl. */
export function resolveTimeZone(raw: string | undefined): string {
  for (const tz of [raw, DEFAULT_TZ, 'UTC']) {
    if (!tz) continue;
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return tz;
    } catch { /* следующий вариант */ }
  }
  return 'UTC';
}

const minuteStart = (d = new Date()) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

interface DayRow { day: string; avg: number; peak: number; peak_at: Date }

export const onlineService = {
  /** Cron раз в минуту: фиксирует текущее число пользователей онлайн. */
  async recordSample() {
    const at = minuteStart();
    const online = presence.onlineCount();
    await prisma.onlineSample.upsert({
      where: { sampled_at: at },
      create: { sampled_at: at, online },
      update: { online },
    });
  },

  async cleanup() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    const { count } = await prisma.onlineSample.deleteMany({ where: { sampled_at: { lt: cutoff } } });
    return count;
  },

  /** Для live-блока: онлайн прямо сейчас + последние 60 минут для мини-графика. */
  async live() {
    const since = new Date(Date.now() - 60 * 60_000);
    const recent = await prisma.onlineSample.findMany({
      where: { sampled_at: { gte: since } },
      orderBy: { sampled_at: 'asc' },
      select: { sampled_at: true, online: true },
    });
    return {
      online: presence.onlineCount(),
      server_time: new Date().toISOString(),
      recent: recent.map((r) => ({ at: r.sampled_at.toISOString(), online: r.online })),
    };
  },

  /**
   * Суточная аналитика: для каждого часа 00–23 — среднее число онлайн по всем дням хранения
   * (сначала среднее внутри часа конкретного дня, затем по дням) и пик с датой/временем.
   */
  async daily(tzRaw?: string) {
    const tz = resolveTimeZone(tzRaw);
    // sampled_at хранится как UTC без пояса → переводим в локальное время выбранной зоны
    const local = `("sampled_at" AT TIME ZONE 'UTC' AT TIME ZONE $1)`;

    const [hours, peaks, days, summary] = await Promise.all([
      prisma.$queryRawUnsafe<{ hour: number; avg: number; days: bigint }[]>(
        `WITH per_day AS (
           SELECT date_trunc('hour', ${local}) AS h, AVG("online") AS a FROM "OnlineSample" GROUP BY 1
         )
         SELECT EXTRACT(HOUR FROM h)::int AS hour, AVG(a)::float AS avg, COUNT(*) AS days
         FROM per_day GROUP BY 1 ORDER BY 1`, tz),
      prisma.$queryRawUnsafe<{ hour: number; peak: number; peak_at: Date }[]>(
        `SELECT DISTINCT ON (EXTRACT(HOUR FROM ${local}))
                EXTRACT(HOUR FROM ${local})::int AS hour, "online" AS peak, "sampled_at" AS peak_at
         FROM "OnlineSample"
         ORDER BY EXTRACT(HOUR FROM ${local}), "online" DESC, "sampled_at" DESC`, tz),
      prisma.$queryRawUnsafe<DayRow[]>(
        `SELECT DISTINCT ON (d) d::text AS day,
                AVG("online") OVER (PARTITION BY d)::float AS avg,
                "online" AS peak, "sampled_at" AS peak_at
         FROM (SELECT *, ${local}::date AS d FROM "OnlineSample") x
         ORDER BY d DESC, "online" DESC, "sampled_at" DESC
         LIMIT 30`, tz),
      prisma.onlineSample.aggregate({ _min: { sampled_at: true }, _count: true, _avg: { online: true } }),
    ]);

    const byHourPeak = new Map(peaks.map((p) => [p.hour, p]));
    const byHourAvg = new Map(hours.map((h) => [h.hour, h]));
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      const a = byHourAvg.get(hour);
      const p = byHourPeak.get(hour);
      return {
        hour,
        avg: a ? Math.round(a.avg * 10) / 10 : 0,
        peak: p?.peak ?? 0,
        peak_at: p ? p.peak_at.toISOString() : null,
        days: a ? Number(a.days) : 0,
      };
    });

    const overallPeak = hourly.reduce<(typeof hourly)[number] | null>((m, h) => (h.peak_at && (!m || h.peak > m.peak) ? h : m), null);
    const busiest = hourly.reduce<(typeof hourly)[number] | null>((m, h) => (h.days && (!m || h.avg > m.avg) ? h : m), null);

    return {
      timezone: tz,
      hourly,
      daily: days.map((d) => ({ day: d.day, avg: Math.round(d.avg * 10) / 10, peak: d.peak, peak_at: d.peak_at.toISOString() })),
      summary: {
        samples: summary._count,
        since: summary._min.sampled_at?.toISOString() ?? null,
        avg_online: summary._avg.online != null ? Math.round(summary._avg.online * 10) / 10 : 0,
        peak: overallPeak ? { online: overallPeak.peak, at: overallPeak.peak_at } : null,
        busiest_hour: busiest ? { hour: busiest.hour, avg: busiest.avg } : null,
      },
    };
  },
};
