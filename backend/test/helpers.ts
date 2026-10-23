import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = (await import('../src/server.js')).default as FastifyInstance;
    await app.ready();
    // Для test/setup-teardown.ts: закрыть сервер после файла, чтобы сокеты и пулы не копились между файлами
    (globalThis as { __bloomlyApp?: FastifyInstance }).__bloomlyApp = app;
  }
  return app;
}

export { prisma };

/** Wipe every table except prisma's migration log. */
export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!rows.length) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export const PASSWORD = 'Passw0rd!long';

export async function createUser(over: Record<string, unknown> = {}) {
  const tag = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `u_${tag}@test.local`,
      username: `u_${tag}`,
      password: await bcrypt.hash(PASSWORD, 4),
      email_verified: true,
      onboarding_done: true,
      ...over,
    } as any,
  });
  const a = await getApp();
  const token = a.jwt.sign({ id: user.id, role: user.role }, { expiresIn: '15m' });
  return { user, token, auth: { authorization: `Bearer ${token}` } };
}

let ipCounter = 0;
/** A fresh client IP per call so per-IP rate limits don't leak between tests. */
export function freshIp() {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export async function api(
  method: string,
  url: string,
  opts: { headers?: Record<string, string>; body?: unknown; cookies?: Record<string, string>; ip?: string } = {},
) {
  const a = await getApp();
  const headers = { 'x-forwarded-for': opts.ip ?? freshIp(), ...(opts.headers ?? {}) };
  const res = await a.inject({ method: method as any, url, headers, cookies: opts.cookies, payload: opts.body as any });
  let json: any = null;
  try { json = res.json(); } catch { /* not json */ }
  const cookie = (name: string) => res.cookies.find((c) => c.name === name)?.value;
  return { status: res.statusCode, json, res, cookie };
}
