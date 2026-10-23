import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { bugHunterProgress } from '../src/lib/bugHunter.js';

describe('bugHunterProgress: уровни достижения', () => {
  it('до первого порога уровня нет, цель — 10', () => {
    expect(bugHunterProgress(0)).toMatchObject({ level: 0, levelKey: 'none', nextTarget: 10, currentMin: 0 });
    expect(bugHunterProgress(9)).toMatchObject({ level: 0, nextTarget: 10 });
  });

  it('10 → LVL 1, 25 → LVL 2, 50 → «Хакер» без следующей цели', () => {
    expect(bugHunterProgress(10)).toMatchObject({ level: 1, levelKey: 'lvl1', nextTarget: 25, currentMin: 10 });
    expect(bugHunterProgress(24)).toMatchObject({ level: 1, nextTarget: 25 });
    expect(bugHunterProgress(25)).toMatchObject({ level: 2, levelKey: 'lvl2', nextTarget: 50, currentMin: 25 });
    expect(bugHunterProgress(49)).toMatchObject({ level: 2, nextTarget: 50 });
    expect(bugHunterProgress(50)).toMatchObject({ level: 3, levelKey: 'hacker', nextTarget: null });
    expect(bugHunterProgress(99)).toMatchObject({ level: 3, nextTarget: null, count: 99 });
  });

  it('мусорное значение не ломает расчёт', () => {
    expect(bugHunterProgress(-4).count).toBe(0);
    expect(bugHunterProgress(NaN).level).toBe(0);
  });
});

describe('баг-репорты и счётчик достижения', () => {
  beforeEach(resetDb);

  async function newTicket(userId: string, type = 'bug') {
    return prisma.supportTicket.create({
      data: { user_id: userId, type, subject: 'Тест', messages: { create: { sender_type: 'user', sender_user_id: userId, body: 'x' } } },
    });
  }
  const setStatus = (adminAuth: Record<string, string>, id: string, status: string) =>
    api('PATCH', `/api/support/admin/tickets/${id}`, { headers: adminAuth, body: { status } });
  const count = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { bugs_confirmed: true } }))!.bugs_confirmed;

  it('«Подтверждён» и «Исправлен» засчитывают баг один раз на тикет', async () => {
    const admin = await createUser({ role: 'admin' });
    const reporter = await createUser();
    const t = await newTicket(reporter.user.id);

    expect((await setStatus(admin.auth, t.id, 'in_progress')).status).toBe(200);
    expect(await count(reporter.user.id)).toBe(0);

    expect((await setStatus(admin.auth, t.id, 'confirmed')).status).toBe(200);
    expect(await count(reporter.user.id)).toBe(1);

    // переход confirmed → fixed и повторные клики не удваивают счётчик
    await setStatus(admin.auth, t.id, 'fixed');
    await setStatus(admin.auth, t.id, 'fixed');
    await setStatus(admin.auth, t.id, 'open');
    await setStatus(admin.auth, t.id, 'confirmed');
    expect(await count(reporter.user.id)).toBe(1);
  });

  it('вопросы и отзывы не дают очков, обычное «Решён» тоже', async () => {
    const admin = await createUser({ role: 'admin' });
    const reporter = await createUser();
    const question = await newTicket(reporter.user.id, 'question');
    const bug = await newTicket(reporter.user.id);

    await setStatus(admin.auth, question.id, 'fixed');
    await setStatus(admin.auth, bug.id, 'resolved');
    expect(await count(reporter.user.id)).toBe(0);
  });

  it('профиль отдаёт прогресс достижения', async () => {
    const admin = await createUser({ role: 'admin' });
    const reporter = await createUser({ bugs_confirmed: 24 });
    await setStatus(admin.auth, (await newTicket(reporter.user.id)).id, 'fixed');

    const res = await api('GET', `/api/users/${reporter.user.username}`, { headers: admin.auth });
    expect(res.status).toBe(200);
    const profile = res.json?.data?.user ?? res.json?.data ?? res.json;
    expect(profile.bug_hunter).toMatchObject({ count: 25, level: 2, nextTarget: 50 });
  });

  const notifs = (userId: string) =>
    prisma.notification.findMany({ where: { receiver_id: userId }, orderBy: { created_at: 'asc' }, select: { type: true, meta: true } });

  it('засчитанный баг шлёт уведомление один раз, без повышения уровня — без поздравления', async () => {
    const admin = await createUser({ role: 'admin' });
    const reporter = await createUser();
    const t = await newTicket(reporter.user.id);

    await setStatus(admin.auth, t.id, 'confirmed');
    await setStatus(admin.auth, t.id, 'fixed');
    expect((await notifs(reporter.user.id)).map(n => n.type)).toEqual(['bug_report_confirmed']);
  });

  it.each([
    [9, 'lvl1', 'LVL 1'],
    [24, 'lvl2', 'LVL 2'],
    [49, 'hacker', 'Хакер'],
  ])('на пороге после %i багов шлётся поздравление с уровнем «%s»', async (before, levelKey, levelName) => {
    const admin = await createUser({ role: 'admin' });
    const reporter = await createUser({ bugs_confirmed: before });
    await setStatus(admin.auth, (await newTicket(reporter.user.id)).id, 'confirmed');

    const list = await notifs(reporter.user.id);
    expect(list.map(n => n.type)).toEqual(['bug_report_confirmed', 'bug_hunter_level']);
    expect(list[1].meta).toMatchObject({ level: levelName, levelKey });
  });

  it('отклонённые и не-баги уведомлений не шлют', async () => {
    const admin = await createUser({ role: 'admin' });
    const reporter = await createUser({ bugs_confirmed: 9 });
    await setStatus(admin.auth, (await newTicket(reporter.user.id, 'question')).id, 'fixed');
    await setStatus(admin.auth, (await newTicket(reporter.user.id)).id, 'closed');
    expect(await notifs(reporter.user.id)).toEqual([]);
  });
});
