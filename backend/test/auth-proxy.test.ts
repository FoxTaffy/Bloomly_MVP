import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, getApp, prisma, resetDb, PASSWORD } from './helpers.js';

/** Логин с произвольным socket-адресом (remoteAddress) и заголовком X-Forwarded-For. */
async function login(remoteAddress: string, xff: string | undefined, email: string, password = PASSWORD) {
  const a = await getApp();
  const headers: Record<string, string> = xff ? { 'x-forwarded-for': xff } : {};
  return a.inject({ method: 'POST', url: '/api/auth/login', headers, remoteAddress, payload: { email, password } });
}

describe('auth: client IP (trustProxy)', () => {
  beforeEach(resetDb);

  it('прямой клиент не может подменить IP через X-Forwarded-For', async () => {
    const { user } = await createUser();
    const res = await login('203.0.113.9', '198.51.100.1', user.email);
    expect(res.statusCode).toBe(200);

    const rt = await prisma.refreshToken.findFirst({ where: { user_id: user.id } });
    expect(rt?.ip_address).toBe('203.0.113.9');
  });

  it('за доверенным прокси берётся IP клиента из правого конца цепочки', async () => {
    const { user } = await createUser();
    // nginx на хосте (127.0.0.1) дописывает реальный адрес клиента в конец заголовка
    const res = await login('127.0.0.1', '198.51.100.1, 198.51.100.7', user.email);
    expect(res.statusCode).toBe(200);

    const rt = await prisma.refreshToken.findFirst({ where: { user_id: user.id } });
    expect(rt?.ip_address).toBe('198.51.100.7');
  });

  it('подмена X-Forwarded-For не обходит лимит логина (10/мин)', async () => {
    const { user } = await createUser();
    const attackerIp = '203.0.113.77';
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      // каждый запрос с новым "поддельным" IP — раньше это давало бесконечный лимит
      const res = await login(attackerIp, `192.0.2.${i + 1}`, user.email, 'wrong-password');
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
