import type { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';

/** Appends a manual staff action to the audit log (category 'manual'). */
export function logStaffAction(actorId: string, targetUserId: string, action: string, reason: string) {
  return prisma.autoModLog.create({ data: { user_id: targetUserId, actor_id: actorId, action, reason, category: 'manual', score: 0 } });
}

const USER_BRIEF = { select: { id: true, username: true, display_name: true, avatar_url: true } } as const;

export interface AutoModLogFilter {
  page: number;
  limit: number;
  userId?: string;
  action?: string;
  category?: string;
  /** Include the staff member who acted (admin panel audit log). */
  withActor?: boolean;
}

export const autoModLogs = {
  /** One page of the AutoMod / staff action log, newest first. */
  async list(f: AutoModLogFilter) {
    const where: Prisma.AutoModLogWhereInput = {};
    if (f.userId)   where.user_id  = f.userId;
    if (f.action)   where.action   = f.action;
    if (f.category) where.category = f.category;
    const [logs, total] = await Promise.all([
      prisma.autoModLog.findMany({
        where,
        include: f.withActor ? { user: USER_BRIEF, actor: USER_BRIEF } : { user: USER_BRIEF },
        orderBy: { created_at: 'desc' },
        skip: (f.page - 1) * f.limit,
        take: f.limit,
      }),
      prisma.autoModLog.count({ where }),
    ]);
    return { logs, total, pages: Math.ceil(total / f.limit) };
  },

  /** Counters for the AutoMod dashboard: last 24h / 7d, breakdowns, recent bans. */
  async stats() {
    const since24h = new Date(Date.now() - 86_400_000);
    const since7d  = new Date(Date.now() - 7 * 86_400_000);
    const [total24h, total7d, byAction, byCategory, recentBans] = await Promise.all([
      prisma.autoModLog.count({ where: { created_at: { gte: since24h } } }),
      prisma.autoModLog.count({ where: { created_at: { gte: since7d } } }),
      prisma.autoModLog.groupBy({ by: ['action'], _count: { action: true }, where: { created_at: { gte: since7d } } }),
      prisma.autoModLog.groupBy({ by: ['category'], _count: { category: true }, where: { created_at: { gte: since7d } } }),
      prisma.autoModLog.findMany({
        where: { action: 'ban', created_at: { gte: since24h } },
        include: { user: { select: { id: true, username: true, display_name: true } } },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
    ]);
    return {
      total24h,
      total7d,
      byAction:   byAction.map((r) => ({ action: r.action, count: r._count.action })),
      byCategory: byCategory.map((r) => ({ category: r.category, count: r._count.category })),
      recentBans,
    };
  },
};
