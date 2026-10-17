import prisma from '../config/prisma.js';
import { isAdult } from './age.js';
import { UUID_PATTERN } from './contentAccess.js';

/** Current DB state, shared by HTTP and long-lived transports. JWT claims are not account state. */
export async function resolveAccountIdentity(id: string) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw Object.assign(new Error('User not found'), { statusCode: 401, code: 'UNAUTHORIZED' });
  }
  const user = await prisma.user.findUnique({
    where: { id }, select: { role: true, deleted_at: true, is_banned: true, frozen_at: true, frozen_reason: true, birth_date: true },
  });
  if (!user || user.deleted_at || user.is_banned) throw Object.assign(new Error('User not found'), { statusCode: 401, code: 'UNAUTHORIZED' });
  if (user.frozen_at) throw Object.assign(new Error(user.frozen_reason || 'Аккаунт временно заморожен за подозрительную активность'), { statusCode: 403, code: 'ACCOUNT_FROZEN' });
  return { id, role: user.role, is_adult: isAdult(user.birth_date) };
}
