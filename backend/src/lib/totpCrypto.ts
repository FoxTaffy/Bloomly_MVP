import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { isDevEnv } from './env.js';

// ── AES-256-GCM at-rest encryption for TOTP secrets ────────────────────────────
// TOTP secrets are as sensitive as passwords: anyone who reads them out of the
// DB can generate valid 2FA codes and fully bypass the second factor. We never
// store them in plaintext.
const rawKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
if (!rawKey) {
  if (!isDevEnv()) {
    console.error('[FATAL] TWO_FACTOR_ENCRYPTION_KEY env variable is not set. Refusing to start outside development/test.');
    process.exit(1);
  }
  console.warn('[WARN] TWO_FACTOR_ENCRYPTION_KEY is not set. Using insecure fallback for development only.');
}
// Accepts any length input and derives a stable 32-byte key from it, so the
// env var itself doesn't have to be a raw hex-encoded key.
// Без ключа вне dev/test шифровать нечем: fallback не используем, иначе секреты 2FA шифруются публичной строкой.
if (!rawKey && !isDevEnv()) throw new Error('TWO_FACTOR_ENCRYPTION_KEY is required');
const key = createHash('sha256').update(rawKey || 'insecure-dev-fallback-key').digest();

export function encryptTotpSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptTotpSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
