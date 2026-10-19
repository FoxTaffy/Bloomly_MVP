import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, freshIp } from './helpers.js';

const BROWSER = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36' };
const VISITOR = 'visitor_abcdefgh1234';

const linkBody = (over: Record<string, unknown> = {}) => ({
  name: 'Telegram октябрь', target_path: '/login',
  utm_source: 'Telegram', utm_medium: 'cpc', utm_campaign: 'autumn_launch', ...over,
});

async function admin() {
  return createUser({ role: 'admin' });
}
async function makeLink(over: Record<string, unknown> = {}) {
  const { auth } = await admin();
  const res = await api('POST', '/api/admin/tracking/links', { headers: auth, body: linkBody(over) });
  expect(res.status).toBe(201);
  return res.json.data.link as { id: string; code: string };
}

describe('рекламные ссылки: создание и права', () => {
  beforeEach(resetDb);

  it('создаёт ссылку, приводит метки к нижнему регистру и выдаёт код', async () => {
    const link = await makeLink();
    const row = await prisma.trackingLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.utm_source).toBe('telegram');
    expect(row.code).toMatch(/^[a-z0-9]{7}$/);
  });

  it('обычный пользователь и модератор не могут создавать и смотреть статистику', async () => {
    const { auth } = await createUser({ role: 'user' });
    const { auth: mod } = await createUser({ role: 'moderator' });
    expect((await api('POST', '/api/admin/tracking/links', { headers: auth, body: linkBody() })).status).toBe(403);
    expect((await api('GET', '/api/admin/tracking/overview', { headers: mod })).status).toBe(403);
  });

  it('занятый свой код → 409, внешний адрес назначения отклоняется (нет открытого редиректа)', async () => {
    const { auth } = await admin();
    expect((await api('POST', '/api/admin/tracking/links', { headers: auth, body: linkBody({ code: 'promo-1' }) })).status).toBe(201);
    expect((await api('POST', '/api/admin/tracking/links', { headers: auth, body: linkBody({ code: 'PROMO-1' }) })).status).toBe(409);
    for (const target_path of ['//evil.com', 'https://evil.com', '/ok?x=1', '/\\evil.com']) {
      const res = await api('POST', '/api/admin/tracking/links', { headers: auth, body: linkBody({ target_path }) });
      expect(res.status, target_path).toBe(400);
    }
  });
});

describe('клик по короткой ссылке', () => {
  beforeEach(resetDb);

  it('пишет клик на сервере и редиректит на сайт с метками, bl_ref и bl_cid', async () => {
    const link = await makeLink({ utm_content: 'video_a' });
    const res = await api('GET', `/api/t/${link.code}`, { headers: BROWSER });
    expect(res.status).toBe(302);
    const loc = new URL(res.res.headers.location as string);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('utm_source')).toBe('telegram');
    expect(loc.searchParams.get('utm_campaign')).toBe('autumn_launch');
    expect(loc.searchParams.get('utm_content')).toBe('video_a');
    expect(loc.searchParams.get('bl_ref')).toBe(link.code);
    const click = await prisma.trackingClick.findFirstOrThrow({ where: { link_id: link.id } });
    expect(loc.searchParams.get('bl_cid')).toBe(click.id);
    expect(click.is_bot).toBe(false);
    expect(click.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('неизвестный код ведёт на главную, а не в ошибку', async () => {
    const res = await api('GET', '/api/t/nonexist', { headers: BROWSER });
    expect(res.status).toBe(302);
  });

  it('боты и повторы с того же IP помечаются и не попадают в уникальные клики', async () => {
    const link = await makeLink();
    const ip = freshIp();
    await api('GET', `/api/t/${link.code}`, { headers: BROWSER, ip });
    await api('GET', `/api/t/${link.code}`, { headers: BROWSER, ip });
    await api('GET', `/api/t/${link.code}`, { headers: { 'user-agent': 'TelegramBot (like TwitterBot)' } });
    const rows = await prisma.trackingClick.findMany({ where: { link_id: link.id }, orderBy: { created_at: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.is_bot)).toHaveLength(1);
    expect(rows.filter((r) => r.is_duplicate)).toHaveLength(1);

    const { auth } = await admin();
    const ov = await api('GET', '/api/admin/tracking/overview?days=7', { headers: auth });
    const stats = ov.json.data.links[0].stats;
    expect(stats).toMatchObject({ clicks: 2, unique_clicks: 1, bots: 1 });
  });

  it('пауза: ссылка по-прежнему ведёт на сайт, но клик не пишется', async () => {
    const link = await makeLink();
    const { auth } = await admin();
    await api('PATCH', `/api/admin/tracking/links/${link.id}`, { headers: auth, body: { is_active: false } });
    const res = await api('GET', `/api/t/${link.code}`, { headers: BROWSER });
    expect(res.status).toBe(302);
    expect(await prisma.trackingClick.count({ where: { link_id: link.id } })).toBe(0);
  });
});

describe('визит и привязка регистрации', () => {
  beforeEach(resetDb);

  it('визит находит ссылку по click_id, даже если utm срезаны, и не дублируется за 30 минут', async () => {
    const link = await makeLink();
    await api('GET', `/api/t/${link.code}`, { headers: BROWSER });
    const click = await prisma.trackingClick.findFirstOrThrow({ where: { link_id: link.id } });
    const body = { visitor_id: VISITOR, touch: { click_id: click.id, at: new Date().toISOString() }, path: '/login' };
    expect((await api('POST', '/api/track/visit', { body })).json.data.recorded).toBe(true);
    expect((await api('POST', '/api/track/visit', { body })).json.data.recorded).toBe(false);
    const visit = await prisma.trackingVisit.findFirstOrThrow({});
    expect(visit.link_id).toBe(link.id);
  });

  it('claim: первое и последнее касание хранятся раздельно, конфликт виден в отчёте', async () => {
    const a = await makeLink({ utm_campaign: 'ad_a', code: 'ad-a' });
    const b = await makeLink({ utm_campaign: 'ad_b', code: 'ad-b' });
    const { auth, user } = await createUser();
    const at = new Date().toISOString();
    const res = await api('POST', '/api/track/claim', {
      headers: auth,
      body: { visitor_id: VISITOR, first: { code: a.code, at }, last: { code: b.code, at } },
    });
    expect(res.json.data.claimed).toBe(true);
    const row = await prisma.userAttribution.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(row.first_link_id).toBe(a.id);
    expect(row.last_link_id).toBe(b.id);

    const { auth: adm } = await admin();
    const ov = await api('GET', '/api/admin/tracking/overview', { headers: adm });
    expect(ov.json.data.totals.attribution_conflicts).toBe(1);
    const byCode = Object.fromEntries(ov.json.data.links.map((l: any) => [l.code, l.stats]));
    expect(byCode['ad-a']).toMatchObject({ signups: 1, last_touch_signups: 0 });
    expect(byCode['ad-b']).toMatchObject({ signups: 0, last_touch_signups: 1 });
  });

  it('claim срабатывает один раз и не принимает старые аккаунты', async () => {
    const link = await makeLink();
    const touch = { code: link.code, at: new Date().toISOString() };
    const { auth } = await createUser();
    const body = { visitor_id: VISITOR, first: touch, last: touch };
    expect((await api('POST', '/api/track/claim', { headers: auth, body })).json.data.claimed).toBe(true);
    expect((await api('POST', '/api/track/claim', { headers: auth, body })).json.data.claimed).toBe(false);

    const { auth: oldAuth } = await createUser({ created_at: new Date(Date.now() - 5 * 86_400_000) });
    expect((await api('POST', '/api/track/claim', { headers: oldAuth, body })).json.data.claimed).toBe(false);
    expect(await prisma.userAttribution.count()).toBe(1);
  });

  it('воронка считает подтверждение почты, онбординг и оплату', async () => {
    const link = await makeLink();
    const touch = { code: link.code, at: new Date().toISOString() };
    const free = await createUser({ email_verified: false, onboarding_done: false });
    const paid = await createUser({ subscription_tier: 'pro' });
    for (const u of [free, paid]) {
      await api('POST', '/api/track/claim', { headers: u.auth, body: { visitor_id: VISITOR + u.user.id.slice(0, 4), first: touch, last: touch } });
    }
    const { auth } = await admin();
    const stats = (await api('GET', '/api/admin/tracking/overview', { headers: auth })).json.data.links[0].stats;
    expect(stats).toMatchObject({ signups: 2, verified: 1, onboarded: 1, paid: 1 });
  });

  it('удаление ссылки убирает клики и отвязывает регистрации', async () => {
    const link = await makeLink();
    await api('GET', `/api/t/${link.code}`, { headers: BROWSER });
    const { auth, user } = await createUser();
    const touch = { code: link.code, at: new Date().toISOString() };
    await api('POST', '/api/track/claim', { headers: auth, body: { visitor_id: VISITOR, first: touch, last: touch } });
    const { auth: adm } = await admin();
    expect((await api('DELETE', `/api/admin/tracking/links/${link.id}`, { headers: adm })).status).toBe(200);
    expect(await prisma.trackingClick.count()).toBe(0);
    const row = await prisma.userAttribution.findUniqueOrThrow({ where: { user_id: user.id } });
    expect(row.first_link_id).toBeNull();
  });
});
