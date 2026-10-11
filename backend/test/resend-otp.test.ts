import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, freshIp } from './helpers.js';

const otpCount = (email: string) => prisma.emailOtp.count({ where: { email } });

describe('auth: resend-otp и лимиты', () => {
  beforeEach(resetDb);

  it('код не уходит на адрес без аккаунта (reset/unfreeze/register)', async () => {
    const email = 'nobody@test.local';
    for (const purpose of ['reset', 'unfreeze', 'register']) {
      const res = await api('POST', '/api/auth/resend-otp', { body: { email, purpose } });
      expect(res.status).toBe(200); // ответ одинаковый — аккаунт не раскрывается
    }
    expect(await otpCount(email)).toBe(0);
  });

  it('reset отправляется только существующему аккаунту', async () => {
    const { user } = await createUser();
    const res = await api('POST', '/api/auth/resend-otp', { body: { email: user.email, purpose: 'reset' } });
    expect(res.status).toBe(200);
    expect(await otpCount(user.email)).toBe(1);
  });

  it('register не шлётся уже подтверждённому аккаунту', async () => {
    const { user } = await createUser({ email_verified: true });
    await api('POST', '/api/auth/resend-otp', { body: { email: user.email, purpose: 'register' } });
    expect(await otpCount(user.email)).toBe(0);
  });

  it('unfreeze отправляется только замороженному аккаунту', async () => {
    const frozen = await createUser({ frozen_at: new Date() });
    const active = await createUser();
    await api('POST', '/api/auth/resend-otp', { body: { email: frozen.user.email, purpose: 'unfreeze' } });
    await api('POST', '/api/auth/resend-otp', { body: { email: active.user.email, purpose: 'unfreeze' } });
    expect(await otpCount(frozen.user.email)).toBe(1);
    expect(await otpCount(active.user.email)).toBe(0);
  });

  it('change_email через этот эндпоинт не принимается', async () => {
    const res = await api('POST', '/api/auth/resend-otp', { body: { email: 'a@test.local', purpose: 'change_email' } });
    expect(res.status).toBe(400);
  });

  it('регистрация ограничена 5 запросами за 15 минут с одного IP', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await api('POST', '/api/auth/register', {
        ip,
        body: { username: `spam_user_${i}`, email: `spam${i}@test.local`, password: 'Passw0rd!long' },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
