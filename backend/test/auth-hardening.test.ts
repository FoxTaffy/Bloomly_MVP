import { describe, it, expect, beforeEach } from 'vitest';
import { authenticator } from 'otplib';
import { createUser, prisma, resetDb, api, PASSWORD } from './helpers.js';
import { encryptTotpSecret } from '../src/lib/totpCrypto.js';

describe('auth: забаненный email не освобождается при регистрации', () => {
  beforeEach(resetDb);

  it('регистрация на email забаненного аккаунта отклоняется, новый аккаунт не создаётся', async () => {
    const email = 'banned@test.local';
    await createUser({ email, username: 'banned_old', deleted_at: new Date(), is_banned: true, frozen_reason: '[AUTOMOD BAN] spam' });

    const reg = await api('POST', '/api/auth/register', { body: { username: 'banned_new', email, password: PASSWORD, consent: { personalData: true, cookies: true } } });
    expect(reg.status).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.user.count({ where: { username: 'banned_new' } })).toBe(0);
  });

  it('самоудалённый аккаунт (не бан) освобождает email для новой регистрации', async () => {
    const email = 'selfdel@test.local';
    await createUser({ email, username: 'selfdel_old', deleted_at: new Date(), is_banned: false });

    const reg = await api('POST', '/api/auth/register', { body: { username: 'selfdel_new', email, password: PASSWORD, consent: { personalData: true, cookies: true } } });
    expect(reg.status).toBe(201);
  });
});

describe('auth: блокировка после серии неверных паролей', () => {
  beforeEach(resetDb);

  it('после 10 неудач даже верный пароль отклоняется с 429, пока блокировка не истекла', async () => {
    const { user } = await createUser();
    for (let i = 0; i < 10; i++) {
      // Каждый запрос с новым IP: проверяем счётчик на аккаунте, а не per-IP лимит
      const bad = await api('POST', '/api/auth/login', { body: { email: user.email, password: 'wrong-password-123' } });
      expect(bad.status).toBe(401);
    }
    const locked = await api('POST', '/api/auth/login', { body: { email: user.email, password: PASSWORD } });
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('auth: TOTP-код одноразовый', () => {
  beforeEach(resetDb);

  it('повторный ввод уже принятого TOTP-кода отклоняется', async () => {
    const secret = authenticator.generateSecret();
    const u = await createUser({ two_factor_method: 'totp', totp_secret: encryptTotpSecret(secret) });
    const code = authenticator.generate(secret);

    const first = await api('POST', '/api/auth/login', { body: { email: u.user.email, password: PASSWORD } });
    const ok = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken: first.json.data.mfaToken, code } });
    expect(ok.status).toBe(200);

    // Тот же код в том же 30-секундном окне, новый mfaToken: это повтор, он не должен проходить
    const again = await api('POST', '/api/auth/login', { body: { email: u.user.email, password: PASSWORD } });
    const replay = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken: again.json.data.mfaToken, code } });
    expect(replay.status).toBe(400);
  });
});
