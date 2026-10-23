import { createHash } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../config/prisma.js';
import { isDevEnv } from './env.js';
import { REMEMBER_TTL_SEC } from './sessionTtl.js';
import { resolveAccountIdentity } from './accountAccess.js';

/**
 * Cookie для чтения файлов по прямым ссылкам /s3/… . <img> и <video> не передают Bearer,
 * поэтому браузер предъявляет этот cookie, а внешний nginx спрашивает у API, можно ли отдать
 * файл (auth_request → /api/media/authz).
 *
 * Значение — подписанный SHA-256 текущего refresh-токена (сам токен в cookie не попадает).
 * Ставится и снимается вместе с refresh-cookie, поэтому выход, отзыв сессии или её истечение
 * сразу закрывают и доступ к закрытым файлам. Path ограничен /s3/: на API cookie не уходит.
 */
export const MEDIA_COOKIE = 'bloomly_media';
const MEDIA_COOKIE_PATH = '/s3/';

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export function setMediaCookie(reply: FastifyReply, refreshRaw: string, remember: boolean) {
  reply.setCookie(MEDIA_COOKIE, hashToken(refreshRaw), {
    httpOnly: true,
    secure: !isDevEnv(),
    // Lax, а не Strict: картинки в превью ссылок и переходах с других сайтов тоже грузятся
    sameSite: 'lax',
    path: MEDIA_COOKIE_PATH,
    signed: true,
    ...(remember ? { maxAge: REMEMBER_TTL_SEC } : {}),
  });
}

export function clearMediaCookie(reply: FastifyReply) {
  reply.clearCookie(MEDIA_COOKIE, { path: MEDIA_COOKIE_PATH });
}

export type CookieViewer = { id: string; role: string; is_adult: boolean };

// Идентичность по cookie кэшируется ненадолго: страница запрашивает десятки файлов подряд.
const IDENTITY_TTL_MS = 30_000;
const MAX_CACHED_IDENTITIES = 5_000;
const identities = new Map<string, { viewer: CookieViewer | null; at: number }>();

/** Владелец действующей сессии из media-cookie или null (нет cookie, подпись неверна, сессия завершена). */
export async function viewerFromMediaCookie(request: FastifyRequest): Promise<CookieViewer | null> {
  const raw = request.cookies?.[MEDIA_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value || !/^[0-9a-f]{64}$/.test(unsigned.value)) return null;
  const hash = unsigned.value;

  const now = Date.now();
  const hit = identities.get(hash);
  if (hit && now - hit.at < IDENTITY_TTL_MS) return hit.viewer;

  let viewer: CookieViewer | null = null;
  const session = await prisma.refreshToken.findUnique({
    where: { token_hash: hash }, select: { user_id: true, revoked: true, expires_at: true },
  });
  if (session && !session.revoked && session.expires_at > new Date()) {
    try {
      const identity = await resolveAccountIdentity(session.user_id);
      viewer = { id: identity.id, role: identity.role, is_adult: identity.is_adult };
    } catch {
      viewer = null; // удалён, забанен или заморожен — как гость
    }
  }
  if (identities.size >= MAX_CACHED_IDENTITIES) identities.clear();
  identities.set(hash, { viewer, at: now });
  return viewer;
}

/** Для тестов. */
export function clearMediaIdentityCache() {
  identities.clear();
}
