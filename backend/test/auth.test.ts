import { describe, it, expect, beforeEach } from 'vitest';
import { authenticator } from 'otplib';
import { api, createUser, prisma, resetDb, PASSWORD } from './helpers.js';
import { encryptTotpSecret } from '../src/lib/totpCrypto.js';

async function latestOtp(email: string, purpose: string) {
  const otp = await prisma.emailOtp.findFirst({ where: { email, purpose, used: false }, orderBy: { created_at: 'desc' } });
  return otp!.code;
}

describe('auth: register → verify → login → refresh → logout', () => {
  beforeEach(resetDb);

  it('full happy path with refresh rotation', async () => {
    const email = 'alice@test.local';
    const reg = await api('POST', '/api/auth/register', { body: { username: 'alice', email, password: PASSWORD } });
    expect(reg.status).toBe(201);
    expect(JSON.stringify(reg.json)).not.toContain('password');

    // unverified users cannot log in
    const early = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    expect(early.status).toBe(403);
    expect(early.json.error.code).toBe('EMAIL_NOT_VERIFIED');

    const wrongCode = await api('POST', '/api/auth/verify-email', { body: { email, code: '000000' } });
    expect(wrongCode.status).toBe(400);

    const ver = await api('POST', '/api/auth/verify-email', { body: { email, code: await latestOtp(email, 'register') } });
    expect(ver.status).toBe(200);
    expect(ver.json.data.token).toBeTruthy();

    const bad = await api('POST', '/api/auth/login', { body: { email, password: 'wrong-password-123' } });
    expect(bad.status).toBe(401);

    const login = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    expect(login.status).toBe(200);
    const access = login.json.data.token as string;
    const rt1 = login.cookie('refresh_token')!;
    expect(rt1).toBeTruthy();
    expect(login.json.data.user.password).toBeUndefined();
    expect(login.json.data.user.totp_secret).toBeUndefined();

    const me = await api('GET', '/api/wallet', { headers: { authorization: `Bearer ${access}` } });
    expect(me.status).toBe(200);

    const r1 = await api('POST', '/api/auth/refresh', { cookies: { refresh_token: rt1 } });
    expect(r1.status).toBe(200);
    const rt2 = r1.cookie('refresh_token')!;
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt1);

    const r2 = await api('POST', '/api/auth/refresh', { cookies: { refresh_token: rt2 } });
    expect(r2.status).toBe(200);

    const out = await api('POST', '/api/auth/logout', { cookies: { refresh_token: r2.cookie('refresh_token')! } });
    expect(out.status).toBe(200);
    const after = await api('POST', '/api/auth/refresh', { cookies: { refresh_token: r2.cookie('refresh_token')! } });
    expect(after.status).toBe(401);
  });

  it('requires explicit personal-data consent and cookie consent before registration', async () => {
    const noConsent = await api('POST', '/api/auth/register', { body: { username: 'alice2', email: 'alice2@test.local', password: PASSWORD } });
    expect(noConsent.status).toBe(400);
    expect(noConsent.json.error.code).toBe('REGISTRATION_ERROR');

    const withConsent = await api('POST', '/api/auth/register', {
      body: {
        username: 'alice2',
        email: 'alice2@test.local',
        password: PASSWORD,
        consent: { personalData: true, cookies: true, marketingEmails: false },
      },
    });
    expect(withConsent.status).toBe(201);
  });

  it('rejects garbage and missing refresh tokens', async () => {
    expect((await api('POST', '/api/auth/refresh')).status).toBe(401);
    expect((await api('POST', '/api/auth/refresh', { cookies: { refresh_token: 'nope' } })).status).toBe(401);
  });

  it('protected route rejects missing / forged tokens', async () => {
    expect((await api('GET', '/api/wallet')).status).toBe(401);
    expect((await api('GET', '/api/wallet', { headers: { authorization: 'Bearer abc.def.ghi' } })).status).toBe(401);
  });

  it('deleted user token is rejected', async () => {
    const u = await createUser();
    await prisma.user.update({ where: { id: u.user.id }, data: { deleted_at: new Date() } });
    expect((await api('GET', '/api/wallet', { headers: u.auth })).status).toBe(401);
  });

  it('frozen user gets ACCOUNT_FROZEN', async () => {
    const u = await createUser();
    await prisma.user.update({ where: { id: u.user.id }, data: { frozen_at: new Date() } });
    const r = await api('GET', '/api/wallet', { headers: u.auth });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe('ACCOUNT_FROZEN');
  });
});

describe('auth: 2FA', () => {
  beforeEach(resetDb);

  it('TOTP: login requires second factor and mfaToken is not an access token', async () => {
    const secret = authenticator.generateSecret();
    const u = await createUser({ two_factor_method: 'totp', totp_secret: encryptTotpSecret(secret) });

    const login = await api('POST', '/api/auth/login', { body: { email: u.user.email, password: PASSWORD } });
    expect(login.status).toBe(401);
    expect(login.json.error.code).toBe('TWO_FACTOR_REQUIRED');
    expect(login.cookie('refresh_token')).toBeUndefined();
    const mfaToken = login.json.data.mfaToken as string;

    expect((await api('GET', '/api/wallet', { headers: { authorization: `Bearer ${mfaToken}` } })).status).toBe(401);

    const wrong = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken, code: '000000' } });
    expect(wrong.status).toBe(400);

    const ok = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken, code: authenticator.generate(secret) } });
    expect(ok.status).toBe(200);
    expect(ok.json.data.token).toBeTruthy();
  });

  it('email 2FA: code from mail completes login', async () => {
    const u = await createUser({ two_factor_method: 'email' });
    const login = await api('POST', '/api/auth/login', { body: { email: u.user.email, password: PASSWORD } });
    expect(login.json.error.code).toBe('TWO_FACTOR_REQUIRED');
    const code = await latestOtp(u.user.email, 'login_2fa');
    const ok = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken: login.json.data.mfaToken, code } });
    expect(ok.status).toBe(200);
    // the same code cannot be used twice
    const again = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken: login.json.data.mfaToken, code } });
    expect(again.status).toBe(400);
  });

  it('forged mfaToken is rejected', async () => {
    const r = await api('POST', '/api/auth/login/2fa/verify', { body: { mfaToken: 'x.y', code: '123456' } });
    expect(r.status).toBe(401);
  });
});
