import { createHmac, randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';

// Защита воронки от потери трафика (Anti-Collision Tracking):
//  • клик пишется на сервере в момент перехода, до загрузки сайта, — его не срежут блокировщики и обрезка меток;
//  • боты (превью мессенджеров, краулеры) и повторы с одного устройства помечаются и не раздувают цифры;
//  • у человека хранится первое и последнее касание — при столкновении двух реклам видно, кто кого перебил;
//  • код ссылки уникален (повторная генерация при коллизии), путь назначения проверяется — открытого редиректа нет.

const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const CLAIM_MAX_ACCOUNT_AGE_MS = 48 * 60 * 60 * 1000;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // без похожих символов: i l o 0 1

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|vkshare|discord|slack|skype|curl|wget|python|java\/|go-http|headless|lighthouse|monitor|uptime|embedly|okhttp\/|axios|node-fetch/i;

export const isBotUserAgent = (ua: string | undefined | null) => !ua || BOT_UA.test(ua);

const ipSecret = () => process.env.JWT_SECRET || 'bloomly_secret_dev_only';
/** IP в базе не хранится — только необратимый хеш для поиска повторов. */
export const hashIp = (ip: string) => createHmac('sha256', ipSecret()).update(ip).digest('hex');

// Путь назначения — только внутри сайта, без query/hash и без `//host`
const TARGET_PATH = /^\/(?!\/)[A-Za-z0-9\-._~%/]*$/;
const UTM_VALUE = /^[A-Za-z0-9\-._~%+ ]+$/;
const CUSTOM_CODE = /^[a-z0-9][a-z0-9_-]{2,39}$/;
const RESERVED_CODES = new Set(['admin', 'api', 'login', 'test', 'null', 'undefined']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR_RE = /^[A-Za-z0-9_-]{8,64}$/;

export class TrackingError extends Error {
  constructor(public status: number, message: string, public code = 'BAD_REQUEST') { super(message); }
}

export interface LinkInput {
  name?: string; code?: string; target_path?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
}

const cleanUtm = (v: unknown, max: number, required: boolean, label: string): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!s) { if (required) throw new TrackingError(400, `Заполните ${label}`); return null; }
  if (s.length > max) throw new TrackingError(400, `${label}: не длиннее ${max} символов`);
  if (!UTM_VALUE.test(s)) throw new TrackingError(400, `${label}: только латиница, цифры и - _ . ~`);
  return s;
};

const generateCode = () => Array.from({ length: 7 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const normalizeInput = (input: LinkInput) => {
  const name = (input.name ?? '').trim();
  if (!name) throw new TrackingError(400, 'Укажите название ссылки');
  if (name.length > 120) throw new TrackingError(400, 'Название не длиннее 120 символов');
  const target = (input.target_path ?? '/').trim() || '/';
  if (target.length > 300 || !TARGET_PATH.test(target)) throw new TrackingError(400, 'Путь назначения: страница сайта вида /login, без домена и параметров');
  return {
    name,
    target_path: target,
    utm_source: cleanUtm(input.utm_source, 60, true, 'utm_source')!,
    utm_medium: cleanUtm(input.utm_medium, 60, true, 'utm_medium')!,
    utm_campaign: cleanUtm(input.utm_campaign, 100, true, 'utm_campaign')!,
    utm_content: cleanUtm(input.utm_content, 100, false, 'utm_content'),
    utm_term: cleanUtm(input.utm_term, 100, false, 'utm_term'),
  };
};

export interface Touch {
  code?: string | null; click_id?: string | null; at?: string | null;
  utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null; utm_content?: string | null;
}

const utmOf = (t: Touch | undefined | null) => {
  if (!t) return null;
  const pick = (v: unknown, max: number) => (typeof v === 'string' && UTM_VALUE.test(v.trim()) ? v.trim().toLowerCase().slice(0, max) : null);
  const utm = { utm_source: pick(t.utm_source, 60), utm_medium: pick(t.utm_medium, 60), utm_campaign: pick(t.utm_campaign, 100), utm_content: pick(t.utm_content, 100) };
  return utm.utm_source || utm.utm_campaign ? utm : null;
};

/** Ссылка по коду/клику из касания; click_id надёжнее, так как не зависит от обрезки параметров. */
async function resolveLinkId(t: Touch | undefined | null): Promise<{ linkId: string | null; clickId: string | null }> {
  if (!t) return { linkId: null, clickId: null };
  if (t.click_id && UUID_RE.test(t.click_id)) {
    const click = await prisma.trackingClick.findUnique({ where: { id: t.click_id }, select: { id: true, link_id: true } });
    if (click) return { linkId: click.link_id, clickId: click.id };
  }
  if (t.code && CUSTOM_CODE.test(t.code.toLowerCase())) {
    const link = await prisma.trackingLink.findUnique({ where: { code: t.code.toLowerCase() }, select: { id: true } });
    if (link) return { linkId: link.id, clickId: null };
  }
  return { linkId: null, clickId: null };
}

export const trackingService = {
  // ── Админка ────────────────────────────────────────────────────────────────
  async createLink(input: LinkInput, actorId: string) {
    const data = normalizeInput(input);
    const custom = (input.code ?? '').trim().toLowerCase();
    if (custom && (!CUSTOM_CODE.test(custom) || RESERVED_CODES.has(custom))) {
      throw new TrackingError(400, 'Код: 3–40 символов, латиница, цифры, - и _');
    }
    // Коллизия кода: свой код занят — ошибка, сгенерированный — пробуем другой
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = custom || generateCode();
      try {
        return await prisma.trackingLink.create({ data: { ...data, code, created_by: actorId } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          if (custom) throw new TrackingError(409, 'Такой код уже занят', 'CODE_TAKEN');
          continue;
        }
        throw e;
      }
    }
    throw new TrackingError(500, 'Не удалось подобрать свободный код, попробуйте ещё раз', 'CODE_GENERATION');
  },

  async updateLink(id: string, input: LinkInput & { is_active?: boolean }) {
    const patch: Prisma.TrackingLinkUpdateInput = {};
    if (input.is_active !== undefined) patch.is_active = !!input.is_active;
    // Метки и путь менять нельзя: ссылка уже стоит в рекламе, а статистика должна остаться честной
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 120) throw new TrackingError(400, 'Название: 1–120 символов');
      patch.name = name;
    }
    try {
      return await prisma.trackingLink.update({ where: { id }, data: patch });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new TrackingError(404, 'Ссылка не найдена', 'NOT_FOUND');
      throw e;
    }
  },

  async deleteLink(id: string) {
    try {
      await prisma.trackingLink.delete({ where: { id } });
      // Регистрации остаются, но без ссылки: чтобы отчёт не ссылался на удалённое
      await prisma.userAttribution.updateMany({ where: { first_link_id: id }, data: { first_link_id: null } });
      await prisma.userAttribution.updateMany({ where: { last_link_id: id }, data: { last_link_id: null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new TrackingError(404, 'Ссылка не найдена', 'NOT_FOUND');
      throw e;
    }
  },

  /** Сводка по всем ссылкам за период + общая воронка и «потери». */
  async overview(days: number) {
    const since = new Date(Date.now() - days * 86_400_000);
    const links = await prisma.trackingLink.findMany({ orderBy: { created_at: 'desc' } });

    const [clickRows, visitRows, funnelRows, conflictRows] = await Promise.all([
      prisma.$queryRaw<{ link_id: string; total: bigint; humans: bigint; uniq: bigint; bots: bigint }[]>`
        SELECT link_id,
               COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE NOT is_bot)::bigint AS humans,
               COUNT(*) FILTER (WHERE NOT is_bot AND NOT is_duplicate)::bigint AS uniq,
               COUNT(*) FILTER (WHERE is_bot)::bigint AS bots
        FROM "TrackingClick" WHERE created_at >= ${since} GROUP BY link_id`,
      prisma.$queryRaw<{ link_id: string; visitors: bigint }[]>`
        SELECT link_id, COUNT(DISTINCT visitor_id)::bigint AS visitors
        FROM "TrackingVisit" WHERE link_id IS NOT NULL AND created_at >= ${since} GROUP BY link_id`,
      prisma.$queryRaw<{ link_id: string; signups: bigint; verified: bigint; onboarded: bigint; paid: bigint }[]>`
        SELECT a.first_link_id AS link_id,
               COUNT(*)::bigint AS signups,
               COUNT(*) FILTER (WHERE u.email_verified)::bigint AS verified,
               COUNT(*) FILTER (WHERE u.onboarding_done)::bigint AS onboarded,
               COUNT(*) FILTER (WHERE u.subscription_tier <> 'free')::bigint AS paid
        FROM "UserAttribution" a JOIN "User" u ON u.id = a.user_id
        WHERE a.first_link_id IS NOT NULL AND a.created_at >= ${since} GROUP BY a.first_link_id`,
      prisma.$queryRaw<{ link_id: string; last_touch: bigint }[]>`
        SELECT last_link_id AS link_id, COUNT(*)::bigint AS last_touch
        FROM "UserAttribution" WHERE last_link_id IS NOT NULL AND created_at >= ${since} GROUP BY last_link_id`,
    ]);

    const n = (v: bigint | undefined) => Number(v ?? 0);
    const clicks = new Map(clickRows.map((r) => [r.link_id, r]));
    const visits = new Map(visitRows.map((r) => [r.link_id, r]));
    const funnel = new Map(funnelRows.map((r) => [r.link_id, r]));
    const lastTouch = new Map(conflictRows.map((r) => [r.link_id, r]));

    const items = links.map((l) => {
      const c = clicks.get(l.id); const v = visits.get(l.id); const f = funnel.get(l.id);
      const uniqueClicks = n(c?.uniq);
      const visitors = n(v?.visitors);
      return {
        ...l,
        stats: {
          clicks: n(c?.humans), unique_clicks: uniqueClicks, bots: n(c?.bots),
          visitors, signups: n(f?.signups), verified: n(f?.verified), onboarded: n(f?.onboarded), paid: n(f?.paid),
          last_touch_signups: n(lastTouch.get(l.id)?.last_touch),
          // Сколько живых кликов не дошло до загрузки сайта с меткой
          lost_before_landing: Math.max(0, uniqueClicks - visitors),
        },
      };
    });

    const [conflicts, totalSignups, untagged] = await Promise.all([
      prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c FROM "UserAttribution"
        WHERE created_at >= ${since} AND first_link_id IS NOT NULL AND last_link_id IS NOT NULL AND first_link_id <> last_link_id`,
      prisma.userAttribution.count({ where: { created_at: { gte: since } } }),
      // Метки есть, но ссылки нет: рекламу размечали вручную, мимо этого раздела
      prisma.$queryRaw<{ source: string | null; campaign: string | null; visitors: bigint }[]>`
        SELECT utm_source AS source, utm_campaign AS campaign, COUNT(DISTINCT visitor_id)::bigint AS visitors
        FROM "TrackingVisit" WHERE link_id IS NULL AND created_at >= ${since}
        GROUP BY utm_source, utm_campaign ORDER BY visitors DESC LIMIT 20`,
    ]);

    return {
      days,
      links: items,
      totals: {
        clicks: items.reduce((s, i) => s + i.stats.clicks, 0),
        unique_clicks: items.reduce((s, i) => s + i.stats.unique_clicks, 0),
        bots: items.reduce((s, i) => s + i.stats.bots, 0),
        visitors: items.reduce((s, i) => s + i.stats.visitors, 0),
        signups: items.reduce((s, i) => s + i.stats.signups, 0),
        paid: items.reduce((s, i) => s + i.stats.paid, 0),
        lost_before_landing: items.reduce((s, i) => s + i.stats.lost_before_landing, 0),
        attribution_conflicts: n(conflicts[0]?.c),
        attributed_signups: totalSignups,
      },
      manual_utm: untagged.map((r) => ({ source: r.source, campaign: r.campaign, visitors: Number(r.visitors) })),
    };
  },

  /** Динамика по дням для одной ссылки. */
  async series(linkId: string, days: number) {
    const link = await prisma.trackingLink.findUnique({ where: { id: linkId } });
    if (!link) throw new TrackingError(404, 'Ссылка не найдена', 'NOT_FOUND');
    const since = new Date(Date.now() - days * 86_400_000);
    const [clicks, visits, signups] = await Promise.all([
      prisma.$queryRaw<{ d: string; c: bigint }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, COUNT(*)::bigint AS c
        FROM "TrackingClick" WHERE link_id = ${linkId}::uuid AND NOT is_bot AND NOT is_duplicate AND created_at >= ${since} GROUP BY 1`,
      prisma.$queryRaw<{ d: string; c: bigint }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, COUNT(DISTINCT visitor_id)::bigint AS c
        FROM "TrackingVisit" WHERE link_id = ${linkId}::uuid AND created_at >= ${since} GROUP BY 1`,
      prisma.$queryRaw<{ d: string; c: bigint }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d, COUNT(*)::bigint AS c
        FROM "UserAttribution" WHERE first_link_id = ${linkId}::uuid AND created_at >= ${since} GROUP BY 1`,
    ]);
    const map = (rows: { d: string; c: bigint }[]) => new Map(rows.map((r) => [r.d, Number(r.c)]));
    const [cm, vm, sm] = [map(clicks), map(visits), map(signups)];
    const out: { date: string; clicks: number; visitors: number; signups: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      out.push({ date, clicks: cm.get(date) ?? 0, visitors: vm.get(date) ?? 0, signups: sm.get(date) ?? 0 });
    }
    return out;
  },

  // ── Публичное ──────────────────────────────────────────────────────────────
  /** Записывает переход и возвращает адрес редиректа. Неактивная ссылка всё равно ведёт на сайт — трафик не теряем. */
  async registerClick(code: string, meta: { ip: string; userAgent?: string; referrer?: string }, frontendUrl: string) {
    const link = await prisma.trackingLink.findUnique({ where: { code: code.toLowerCase().slice(0, 40) } });
    if (!link) return null;

    let clickId: string | null = null;
    if (link.is_active) {
      const isBot = isBotUserAgent(meta.userAgent);
      const ipHash = hashIp(meta.ip);
      // Повтор: тот же IP уже кликал по этой ссылке недавно (двойной клик, обновление страницы)
      const prior = isBot ? null : await prisma.trackingClick.findFirst({
        where: { link_id: link.id, ip_hash: ipHash, is_bot: false, created_at: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
        select: { id: true },
      });
      const click = await prisma.trackingClick.create({
        data: {
          link_id: link.id, ip_hash: ipHash, is_bot: isBot, is_duplicate: !!prior,
          user_agent: meta.userAgent?.slice(0, 200) ?? null, referrer: meta.referrer?.slice(0, 300) ?? null,
        },
        select: { id: true },
      }).catch(() => null);
      clickId = click?.id ?? null;
    }

    const url = new URL(link.target_path, frontendUrl.replace(/\/+$/, '') + '/');
    url.searchParams.set('utm_source', link.utm_source);
    url.searchParams.set('utm_medium', link.utm_medium);
    url.searchParams.set('utm_campaign', link.utm_campaign);
    if (link.utm_content) url.searchParams.set('utm_content', link.utm_content);
    if (link.utm_term) url.searchParams.set('utm_term', link.utm_term);
    url.searchParams.set('bl_ref', link.code);
    if (clickId) url.searchParams.set('bl_cid', clickId);
    return url.toString();
  },

  /** Сайт открыт с меткой. Повтор того же посетителя по той же ссылке в течение 30 минут не пишем. */
  async registerVisit(input: { visitor_id?: string; touch?: Touch; path?: string }) {
    const visitorId = input.visitor_id ?? '';
    if (!VISITOR_RE.test(visitorId)) throw new TrackingError(400, 'visitor_id');
    const { linkId, clickId } = await resolveLinkId(input.touch);
    const utm = utmOf(input.touch);
    if (!linkId && !utm) return { recorded: false };

    const recent = await prisma.trackingVisit.findFirst({
      where: {
        visitor_id: visitorId, link_id: linkId,
        ...(linkId ? {} : { utm_campaign: utm?.utm_campaign ?? null }),
        created_at: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) return { recorded: false };

    await prisma.trackingVisit.create({
      data: {
        link_id: linkId, click_id: clickId, visitor_id: visitorId,
        utm_source: utm?.utm_source ?? null, utm_medium: utm?.utm_medium ?? null,
        utm_campaign: utm?.utm_campaign ?? null, utm_content: utm?.utm_content ?? null,
        landing_path: typeof input.path === 'string' ? input.path.slice(0, 300) : null,
      },
    });
    return { recorded: true };
  },

  /** Привязка новой регистрации к рекламе. Один раз на аккаунт, только для свежих аккаунтов. */
  async claim(userId: string, input: { visitor_id?: string; first?: Touch; last?: Touch }) {
    const visitorId = input.visitor_id ?? '';
    if (!VISITOR_RE.test(visitorId)) throw new TrackingError(400, 'visitor_id');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { created_at: true } });
    if (!user || Date.now() - user.created_at.getTime() > CLAIM_MAX_ACCOUNT_AGE_MS) return { claimed: false };

    const [first, last] = await Promise.all([resolveLinkId(input.first), resolveLinkId(input.last)]);
    const firstUtm = utmOf(input.first); const lastUtm = utmOf(input.last);
    if (!first.linkId && !last.linkId && !firstUtm && !lastUtm) return { claimed: false };

    const firstAt = input.first?.at ? new Date(input.first.at) : null;
    try {
      await prisma.userAttribution.create({
        data: {
          user_id: userId, visitor_id: visitorId,
          first_link_id: first.linkId, last_link_id: last.linkId,
          first_utm: firstUtm ?? Prisma.JsonNull, last_utm: lastUtm ?? Prisma.JsonNull,
          first_seen_at: firstAt && !isNaN(firstAt.getTime()) ? firstAt : null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { claimed: false };
      throw e;
    }
    return { claimed: true };
  },
};
