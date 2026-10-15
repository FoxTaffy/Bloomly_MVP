import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, PASSWORD } from './helpers.js';
import { classifyUnverified, releaseUnverified } from '../src/modules/auth/unverifiedRelease.js';

const CONSENT = { personalData: true, cookies: true };
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const PENDING_MSG = 'Регистрация с этими данными уже начата, подождите 15 минут или подтвердите почту';

function register(username: string, email: string) {
  return api('POST', '/api/auth/register', { body: { username, email, password: PASSWORD, consent: CONSENT } });
}

/** Неподтверждённый аккаунт; code: 'expired' | 'used' | 'active' | 'none' — состояние последнего кода 'register'. */
async function unverified(username: string, email: string, opts: { ageMs?: number; code?: 'expired' | 'used' | 'active' | 'none' } = {}) {
  const { ageMs = DAY, code = 'expired' } = opts;
  const created_at = new Date(Date.now() - ageMs);
  const { user } = await createUser({ username, email, email_verified: false, onboarding_done: false, created_at });
  if (code !== 'none') {
    await prisma.emailOtp.create({
      data: {
        email, purpose: 'register', code: '123456', created_at,
        used: code === 'used',
        expires_at: code === 'expired' ? new Date(Date.now() - MIN) : new Date(Date.now() + 10 * MIN),
      },
    });
  }
  return user;
}

async function isReleased(id: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  return u.deleted_at !== null && u.email.includes('_del_') && u.username.includes('_del_');
}

describe('регистрация: брошенная неподтверждённая регистрация не занимает ник и почту', () => {
  beforeEach(resetDb);

  it('ник старой неподтверждённой регистрации (код истёк) освобождается для регистрации с другой почтой', async () => {
    const old = await unverified('fenris', 'viovolkkk@gmail.com');
    const reg = await register('fenris', 'viovolk@gmail.com');
    expect(reg.status).toBe(201);
    expect(await isReleased(old.id)).toBe(true);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { username: 'fenris' } });
    expect(fresh.email).toBe('viovolk@gmail.com');
    expect(await prisma.wallet.count({ where: { user_id: fresh.id } })).toBe(1);
  });

  it('почта старой неподтверждённой регистрации освобождается для повторной регистрации', async () => {
    const old = await unverified('old_nick', 'retry@test.local');
    const reg = await register('new_nick', 'retry@test.local');
    expect(reg.status).toBe(201);
    expect(await isReleased(old.id)).toBe(true);
  });

  it('использованный код тоже не держит регистрацию, даже если аккаунт создан недавно', async () => {
    const old = await unverified('used_code', 'used@test.local', { ageMs: MIN, code: 'used' });
    expect((await register('used_code', 'other@test.local')).status).toBe(201);
    expect(await isReleased(old.id)).toBe(true);
  });

  it('аккаунт без кода, созданный давно, освобождается', async () => {
    const old = await unverified('no_code_old', 'nocode@test.local', { code: 'none' });
    expect((await register('no_code_old', 'nocode2@test.local')).status).toBe(201);
    expect(await isReleased(old.id)).toBe(true);
  });
});

describe('регистрация: идущая регистрация (код действует) не освобождается', () => {
  beforeEach(resetDb);

  it('ник с действующим кодом: понятная ошибка, старый аккаунт не тронут', async () => {
    const old = await unverified('busy', 'busy@test.local', { ageMs: 2 * MIN, code: 'active' });
    const reg = await register('busy', 'someone@test.local');
    expect(reg.status).toBe(400);
    expect(reg.json.error.message).toBe(PENDING_MSG);
    expect(await isReleased(old.id)).toBe(false);
    expect(await prisma.user.count({ where: { email: 'someone@test.local' } })).toBe(0);
  });

  it('действующий код решает, а не возраст аккаунта: старый аккаунт с недавно переотправленным кодом защищён', async () => {
    const old = await unverified('resent', 'resent@test.local', { ageMs: DAY, code: 'active' });
    expect((await register('resent', 'x@test.local')).json.error.message).toBe(PENDING_MSG);
    expect(await isReleased(old.id)).toBe(false);
  });

  it('свежий аккаунт без выданного кода (выдача ещё идёт) защищён', async () => {
    const old = await unverified('in_flight', 'inflight@test.local', { ageMs: 0, code: 'none' });
    expect((await register('in_flight', 'y@test.local')).status).toBe(400);
    expect(await isReleased(old.id)).toBe(false);
  });

  it('почта с действующим кодом: нейтральное сообщение без раскрытия состояния', async () => {
    const old = await unverified('pending_mail', 'pending@test.local', { ageMs: 2 * MIN, code: 'active' });
    await createUser({ email: 'verified@test.local' });

    const pendingRes = await register('another1', 'pending@test.local');
    const verifiedRes = await register('another2', 'verified@test.local');
    expect(pendingRes.status).toBe(400);
    expect(verifiedRes.status).toBe(400);
    expect(pendingRes.json.error.message).toBe(verifiedRes.json.error.message);
    expect(pendingRes.json.error.message).not.toMatch(/начата|подтвержд[её]н|зарегистрирован/i);
    expect(await isReleased(old.id)).toBe(false);
  });
});

describe('регистрация: защищённые аккаунты не освобождаются никогда', () => {
  beforeEach(resetDb);

  const cases: [string, (id: string) => Promise<unknown>, Record<string, unknown>][] = [
    ['подтверждённый', async () => {}, { email_verified: true }],
    ['забаненный', async () => {}, { is_banned: true }],
    ['OAuth (привязка провайдера)', (id) => prisma.oAuthAccount.create({ data: { user_id: id, provider: 'google', provider_id: `g-${id}` } }), {}],
    ['OAuth без пароля', async () => {}, { password: null }],
    ['с постом', (id) => prisma.post.create({ data: { author_id: id, content: 'hi' } }), {}],
    ['со входом (refresh-токен)', (id) => prisma.refreshToken.create({ data: { user_id: id, token_hash: id.replace(/-/g, '').padEnd(64, '0'), expires_at: new Date(Date.now() + DAY) } }), {}],
    ['с активностью (last_seen_at)', async () => {}, { last_seen_at: new Date(Date.now() - DAY) }],
  ];

  for (const [label, addActivity, over] of cases) {
    it(`${label}: ник и почта остаются занятыми`, async () => {
      const old = await unverified('guarded', 'guarded@test.local');
      if (Object.keys(over).length) await prisma.user.update({ where: { id: old.id }, data: over as any });
      await addActivity(old.id);

      const byNick = await register('guarded', 'fresh@test.local');
      expect(byNick.status).toBe(400);
      const byMail = await register('fresh_nick', 'guarded@test.local');
      expect(byMail.status).toBe(400);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: old.id } });
      expect(after.username).toBe('guarded');
      expect(after.email).toBe('guarded@test.local');
      expect(after.deleted_at).toBeNull();
    });
  }

  it('подтверждённый ник: «Имя пользователя уже занято»', async () => {
    await createUser({ username: 'taken_nick' });
    const reg = await register('taken_nick', 'new@test.local');
    expect(reg.json.error.message).toBe('Имя пользователя уже занято');
  });
});

describe('verify-email после освобождения', () => {
  beforeEach(resetDb);

  it('если аккаунт уже освобождён, подтверждение не сообщает об успехе', async () => {
    const old = await unverified('gone', 'gone@test.local', { code: 'active' });
    expect(await releaseUnverified(prisma, old)).toBe(true);

    const res = await api('POST', '/api/auth/verify-email', { body: { email: 'gone@test.local', code: '123456' } });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toBe('Аккаунт не найден, зарегистрируйтесь заново');
    expect(res.json.data).toBeNull();
  });
});

describe('гонка: две регистрации с одним ником одновременно', () => {
  beforeEach(resetDb);

  async function race(username: string) {
    const [a, b] = await Promise.all([register(username, `${username}_a@test.local`), register(username, `${username}_b@test.local`)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);
    const loser = a.status === 400 ? a : b;
    expect(['Имя пользователя уже занято', PENDING_MSG]).toContain(loser.json.error.message);
    expect(await prisma.user.count({ where: { username } })).toBe(1);
  }

  it('свободный ник: один аккаунт и одна понятная ошибка', async () => {
    await race('racer');
  });

  it('ник брошенной регистрации: освобождается один раз, создаётся один аккаунт', async () => {
    const old = await unverified('race_stale', 'race_stale@test.local');
    await race('race_stale');
    expect(await isReleased(old.id)).toBe(true);
    expect(await prisma.user.count({ where: { username: { startsWith: 'race_stale' }, deleted_at: null } })).toBe(1);
  });
});

describe('скрипт releaseUnverifiedAccounts: отбор без изменений (dry-run)', () => {
  beforeEach(resetDb);

  it('находит только брошенные регистрации и ничего не меняет', async () => {
    const stale = await unverified('stale_one', 'stale1@test.local');
    await unverified('pending_one', 'pending1@test.local', { ageMs: MIN, code: 'active' });
    await unverified('banned_one', 'banned1@test.local').then((u) => prisma.user.update({ where: { id: u.id }, data: { is_banned: true } }));
    await createUser({ username: 'verified_one' });

    const before = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const { releasable, pending } = await classifyUnverified(prisma, {}, 15 * MIN);
    expect(releasable.map((u) => u.id)).toEqual([stale.id]);
    expect(pending.map((u) => u.username)).toEqual(['pending_one']);
    expect(await prisma.user.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});
