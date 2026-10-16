import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';

/**
 * Неподтверждённая регистрация не должна занимать email и username навсегда (опечатка в почте
 * оставляла ник занятым аккаунтом, в который никто не может войти). Такой аккаунт освобождается
 * тем же способом, что и самоудалённый: deleted_at + переименование с суффиксом _del_.
 *
 * Освобождаем только «пустую» регистрацию: не подтверждена, не удалена, не забанена, не заморожена,
 * не OAuth (есть пароль, нет привязки провайдера), без постов, комментариев, сообщений и входов.
 */
export const RELEASABLE_UNVERIFIED_WHERE: Prisma.UserWhereInput = {
  email_verified: false,
  deleted_at: null,
  is_banned: false,
  frozen_at: null,
  password: { not: null },
  last_seen_at: null,
  oauthAccounts: { none: {} },
  refreshTokens: { none: {} },
  posts: { none: {} },
  comments: { none: {} },
  sentMessages: { none: {} },
};

type Db = Prisma.TransactionClient | typeof prisma;
type Candidate = { id: string; email: string; username: string; created_at: Date };

/**
 * Регистрация ещё идёт, пока у почты есть действующий код 'register'. Если кода после создания
 * аккаунта нет вовсе (между созданием и выдачей кода, или выдача не удалась), считаем регистрацию
 * идущей ещё otpWindowMs от created_at — чтобы не сорвать чужой параллельный запрос.
 */
async function hasPendingRegistration(db: Db, user: Candidate, otpWindowMs: number, now: Date) {
  const latest = await db.emailOtp.findFirst({
    where: { email: user.email, purpose: 'register', created_at: { gte: user.created_at } },
    orderBy: { created_at: 'desc' },
    select: { used: true, expires_at: true },
  });
  if (!latest) return user.created_at.getTime() > now.getTime() - otpWindowMs;
  return !latest.used && latest.expires_at > now;
}

/** Делит неподтверждённые аккаунты из `where` на освобождаемые и те, чья регистрация ещё идёт. */
export async function classifyUnverified(db: Db, where: Prisma.UserWhereInput, otpWindowMs: number) {
  const now = new Date();
  const candidates = await db.user.findMany({
    where: { AND: [RELEASABLE_UNVERIFIED_WHERE, where] },
    select: { id: true, email: true, username: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });
  const releasable: Candidate[] = [];
  const pending: Candidate[] = [];
  for (const c of candidates) {
    (await hasPendingRegistration(db, c, otpWindowMs, now) ? pending : releasable).push(c);
  }
  return { releasable, pending };
}

/**
 * Освобождает аккаунт. Условия повторяются в where: если между проверкой и записью аккаунт
 * подтвердили или его уже освободил параллельный запрос, ничего не меняется (вернёт false).
 */
export async function releaseUnverified(db: Db, user: Candidate): Promise<boolean> {
  const suffix = `_del_${Date.now()}`;
  const res = await db.user.updateMany({
    where: { AND: [RELEASABLE_UNVERIFIED_WHERE, { id: user.id, email: user.email, username: user.username }] },
    data: { deleted_at: new Date(), email: user.email + suffix, username: user.username + suffix },
  });
  return res.count === 1;
}

/**
 * Освобождает ник удалённого аккаунта (самоудаление или бан админом): запись переименовывается
 * с суффиксом _del_, бан и email остаются как есть. Email забаненного по-прежнему занят,
 * поэтому обход бана повторной регистрацией не открывается.
 */
export async function freeDeletedUsername(db: Db, username: string) {
  await db.user.updateMany({
    where: { username, deleted_at: { not: null } },
    data: { username: username + `_del_${Date.now()}` },
  });
}
