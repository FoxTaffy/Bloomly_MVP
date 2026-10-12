import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, freshIp } from './helpers.js';

const NEW_PASSWORD = 'Brand-new-passw0rd';

/** Запрашивает код сброса и возвращает его из БД (в проде он уходит на почту). */
async function requestResetCode(email: string) {
  await api('POST', '/api/auth/forgot-password', { body: { email } });
  const otp = await prisma.emailOtp.findFirst({ where: { email, purpose: 'reset', used: false }, orderBy: { created_at: 'desc' } });
  return otp!.code;
}

/** Каждый запрос с новым IP: лимит по IP здесь не должен мешать проверке счётчика OTP. */
const resetWith = (email: string, code: string) =>
  api('POST', '/api/auth/reset-password', { ip: freshIp(), body: { email, code, password: NEW_PASSWORD } });

describe('auth: счётчик неверных попыток OTP', () => {
  beforeEach(resetDb);

  it('после 5 неверных вводов верный код уже не принимается, пароль не меняется', async () => {
    const { user } = await createUser();
    const before = (await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } }))!.password;
    const realCode = await requestResetCode(user.email);

    for (let i = 0; i < 5; i++) {
      const wrong = await resetWith(user.email, '000000');
      expect(wrong.status).toBe(400);
    }
    const late = await resetWith(user.email, realCode);
    expect(late.status).toBe(400);
    expect(late.json.error.message).toContain('Слишком много попыток');

    const after = (await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } }))!.password;
    expect(after).toBe(before);
  });

  it('переотправка кода не сбрасывает счётчик попыток', async () => {
    const { user } = await createUser();
    await requestResetCode(user.email);
    for (let i = 0; i < 5; i++) await resetWith(user.email, '000000');

    const rowsBefore = await prisma.emailOtp.count({ where: { email: user.email, purpose: 'reset' } });
    const resend = await api('POST', '/api/auth/resend-otp', { ip: freshIp(), body: { email: user.email, purpose: 'reset' } });
    // Ответ такой же, как для несуществующего аккаунта: блокировку не раскрываем
    expect(resend.status).toBe(200);
    expect(await prisma.emailOtp.count({ where: { email: user.email, purpose: 'reset' } })).toBe(rowsBefore);
  });

  it('верный код в пределах лимита принимается', async () => {
    const { user } = await createUser();
    const realCode = await requestResetCode(user.email);
    await resetWith(user.email, '000000');
    await resetWith(user.email, '111111');
    const ok = await resetWith(user.email, realCode);
    expect(ok.status).toBe(200);
  });
});
