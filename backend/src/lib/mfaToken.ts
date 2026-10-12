import { createHmac, timingSafeEqual } from 'crypto';
import { isDevEnv } from './env.js';

// ── Короткоживущий токен ожидания второго фактора ──────────────────────────────
// Намеренно НЕ подписывается через @fastify/jwt: там `authenticate`-декоратор
// принимает любой валидный JWT с полем `id` как полноценную сессию (проверяет
// только подпись, не назначение токена). Если бы mfaToken использовал тот же
// секрет/схему, он работал бы как обычный access token и позволил бы обойти
// второй фактор. Отдельный HMAC-секрет и формат гарантируют, что этот токен
// годится только для ручной проверки в /auth/login/2fa/*.
// Публичный fallback-секрет подделал бы mfaToken, поэтому вне dev/test без ключа токен не выдаём.
function getSecret(): string {
  const key = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (key) return key;
  if (!isDevEnv()) throw new Error('TWO_FACTOR_ENCRYPTION_KEY is required');
  return 'insecure-dev-fallback-key';
}
const TTL_MS = 5 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createMfaToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ id: userId, exp: Date.now() + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyMfaToken(token: string): string | null {
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;

  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const { id, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof id !== 'string' || typeof exp !== 'number' || exp < Date.now()) return null;
    return id;
  } catch {
    return null;
  }
}
