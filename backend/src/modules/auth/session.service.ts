import { createHash } from 'crypto';
import prisma from '../../config/prisma.js';

// Data access for login sessions (refresh tokens), linked OAuth accounts and the user
// payload returned after a successful login. HTTP concerns (cookies, status codes) stay
// in the controller.

export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** User fields returned to the client after login / refresh. */
export const FULL_USER_SELECT = {
  id: true, username: true, email: true, role: true,
  display_name: true, avatar_url: true, avatar_video_url: true, bio: true, status: true,
  subscription_tier: true, subscription_expires_at: true, commissions_status: true, profile_theme: true, profile_bg_url: true,
  profile_frame: true, is_verified: true, verification_type: true,
  badge_type: true, email_verified: true, onboarding_done: true,
  payment_region: true, birth_date: true, two_factor_method: true, created_at: true,
} as const;

export const authUsers = {
  findFullById(id: string) {
    return prisma.user.findUnique({ where: { id, deleted_at: null }, select: FULL_USER_SELECT });
  },
  findFullByEmail(email: string) {
    return prisma.user.findFirst({ where: { email: email.toLowerCase().trim(), deleted_at: null }, select: FULL_USER_SELECT });
  },
  findActiveById(id: string) {
    return prisma.user.findUnique({ where: { id, deleted_at: null } });
  },
  /** Public counters for the landing page. */
  async countUsersAndPosts() {
    const [users, posts] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.post.count({ where: { deleted_at: null } }),
    ]);
    return { users, posts };
  },
};

export interface SessionData {
  tokenHash: string;
  expiresAt: Date;
  remember: boolean;
  deviceName: string | null;
  deviceId?: string | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export const sessions = {
  /** New session row (login / registration / OAuth). */
  async create(userId: string, s: SessionData) {
    // Известное устройство (тот же device_id) с новым IP — обновляем его живую
    // сессию, а не плодим дубликат; лишние дубли того же устройства отзываем.
    if (s.deviceId) {
      const existing = await prisma.refreshToken.findMany({
        where: { user_id: userId, device_id: s.deviceId, revoked: false, expires_at: { gt: new Date() } },
        orderBy: { last_used_at: 'desc' },
        select: { id: true },
      });
      if (existing.length) {
        const [keep, ...extra] = existing;
        await prisma.refreshToken.update({ where: { id: keep.id }, data: toRow(s) });
        if (extra.length) {
          await prisma.refreshToken.updateMany({ where: { id: { in: extra.map((e) => e.id) } }, data: { revoked: true } });
        }
        return;
      }
    }
    await prisma.refreshToken.create({ data: { user_id: userId, ...toRow(s) } });
  },

  /**
   * Rotates an existing session in place. With `expectedHash` the write is conditional:
   * it only succeeds if the row still holds the hash we read, so of two concurrent
   * refreshes exactly one wins. Returns false when the race was lost.
   */
  async rotate(sessionId: string, s: SessionData, expectedHash?: string): Promise<boolean> {
    if (!expectedHash) {
      await prisma.refreshToken.update({ where: { id: sessionId }, data: toRow(s) });
      return true;
    }
    const result = await prisma.refreshToken.updateMany({
      where: { id: sessionId, token_hash: expectedHash },
      data: { ...toRow(s), prev_token_hash: expectedHash, rotated_at: new Date() },
    });
    return result.count > 0;
  },

  /** Живая сессия, чей токен был ротирован не позднее `graceMs` назад (для повторного refresh со старым токеном). */
  findRecentlyRotated(prevHash: string, graceMs: number) {
    return prisma.refreshToken.findFirst({
      where: {
        prev_token_hash: prevHash,
        revoked: false,
        expires_at: { gt: new Date() },
        rotated_at: { gt: new Date(Date.now() - graceMs) },
      },
    });
  },

  findByHash(hash: string) {
    return prisma.refreshToken.findUnique({ where: { token_hash: hash } });
  },

  /** Whether the session holding this hash still exists, is not revoked and not expired. */
  async isAlive(hash: string): Promise<boolean> {
    const s = await prisma.refreshToken.findUnique({ where: { token_hash: hash }, select: { revoked: true, expires_at: true } });
    return !!s && !s.revoked && s.expires_at >= new Date();
  },

  async revokeByHash(hash: string) {
    await prisma.refreshToken.updateMany({ where: { token_hash: hash, revoked: false }, data: { revoked: true } });
  },

  listActive(userId: string) {
    return prisma.refreshToken.findMany({
      where: { user_id: userId, revoked: false, expires_at: { gt: new Date() } },
      orderBy: { last_used_at: 'desc' },
      select: { id: true, device_name: true, ip_address: true, created_at: true, last_used_at: true, token_hash: true },
    });
  },

  /** Revokes one of the user's sessions; returns its hash, or null if it isn't theirs. */
  async revokeOwn(userId: string, sessionId: string): Promise<string | null> {
    const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
    if (!session || session.user_id !== userId) return null;
    await prisma.refreshToken.update({ where: { id: sessionId }, data: { revoked: true } });
    return session.token_hash;
  },

  async revokeAllExcept(userId: string, keepHash: string | null) {
    await prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked: false, ...(keepHash ? { token_hash: { not: keepHash } } : {}) },
      data: { revoked: true },
    });
  },
};

function toRow(s: SessionData) {
  return {
    token_hash: s.tokenHash, expires_at: s.expiresAt, remember: s.remember, revoked: false,
    device_name: s.deviceName, ...(s.deviceId ? { device_id: s.deviceId } : {}), user_agent: s.userAgent, ip_address: s.ipAddress,
    last_used_at: new Date(),
  };
}

export const oauthAccounts = {
  list(userId: string) {
    return prisma.oAuthAccount.findMany({ where: { user_id: userId }, select: { provider: true, provider_id: true } });
  },

  /** Links a provider identity to a user; 'taken' if it already belongs to someone else. */
  async link(userId: string, provider: string, providerId: string): Promise<'linked' | 'taken'> {
    const where = { provider_provider_id: { provider, provider_id: providerId } };
    const conflict = await prisma.oAuthAccount.findUnique({ where });
    if (conflict && conflict.user_id !== userId) return 'taken';
    await prisma.oAuthAccount.upsert({ where, create: { user_id: userId, provider, provider_id: providerId }, update: {} });
    return 'linked';
  },

  /** Unlinks a provider unless it is the user's last way to sign in. */
  async unlink(userId: string, provider: string): Promise<'unlinked' | 'last_method'> {
    const [user, otherAccountsCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
      prisma.oAuthAccount.count({ where: { user_id: userId, provider: { not: provider } } }),
    ]);
    if (!user?.password && otherAccountsCount === 0) return 'last_method';
    await prisma.oAuthAccount.deleteMany({ where: { user_id: userId, provider } });
    return 'unlinked';
  },
};
