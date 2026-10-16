import { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../../config/prisma.js';
import { analyzeContent, patrolSuspiciousActivity, submitAppeal, getOwnWarningLog } from './service.js';
import { isModerator, isAdmin } from '../../lib/roles.js';
import { errMessage } from '../../lib/httpErrors.js';

interface JwtUser { id: string; role: string }

const requireMod = (req: FastifyRequest, reply: FastifyReply): boolean => {
  const user = req.user as JwtUser;
  if (!isModerator(user.role)) {
    reply.code(403).send({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Requires moderator role or higher' },
    });
    return false;
  }
  return true;
};

export const getAutoModLogsHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; userId?: string; action?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;

  const page   = Math.max(1, parseInt(req.query.page  || '1'));
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
  const skip   = (page - 1) * limit;

  const where: any = {};
  if (req.query.userId) where.user_id = req.query.userId;
  if (req.query.action) where.action  = req.query.action;

  const [logs, total] = await Promise.all([
    prisma.autoModLog.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.autoModLog.count({ where }),
  ]);

  return reply.send({
    success: true,
    data: { logs, total, page, limit, totalPages: Math.ceil(total / limit) },
    error: null,
  });
};

export const getAutoModStatsHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;

  const since24h = new Date(Date.now() - 86_400_000);
  const since7d  = new Date(Date.now() - 7 * 86_400_000);

  const [
    total24h,
    total7d,
    byAction,
    byCategory,
    recentBans,
  ] = await Promise.all([
    prisma.autoModLog.count({ where: { created_at: { gte: since24h } } }),
    prisma.autoModLog.count({ where: { created_at: { gte: since7d } } }),
    prisma.autoModLog.groupBy({
      by: ['action'],
      _count: { action: true },
      where: { created_at: { gte: since7d } },
    }),
    prisma.autoModLog.groupBy({
      by: ['category'],
      _count: { category: true },
      where: { created_at: { gte: since7d } },
    }),
    prisma.autoModLog.findMany({
      where: { action: 'ban', created_at: { gte: since24h } },
      include: {
        user: { select: { id: true, username: true, display_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
  ]);

  return reply.send({
    success: true,
    data: {
      total24h,
      total7d,
      byAction:   byAction.map((r) => ({ action: r.action, count: r._count.action })),
      byCategory: byCategory.map((r) => ({ category: r.category, count: r._count.category })),
      recentBans,
    },
    error: null,
  });
};

export const analyzeTextHandler = async (
  req: FastifyRequest<{ Body: { text: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;

  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return reply.code(400).send({
      success: false,
      data: null,
      error: { code: 'INVALID_INPUT', message: 'text is required' },
    });
  }

  const result = analyzeContent(text);
  return reply.send({ success: true, data: result, error: null });
};

export const runPatrolHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  const user = req.user as JwtUser;
  if (!isAdmin(user.role)) {
    return reply.code(403).send({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Requires admin role or higher' },
    });
  }

  // fire-and-forget
  patrolSuspiciousActivity().catch((err) =>
    console.error('[AUTOMOD] Manual patrol error:', err),
  );

  return reply.send({ success: true, data: { message: 'Patrol started' }, error: null });
};

export const getOwnWarningHandler = async (
  req: FastifyRequest<{ Params: { logId: string } }>,
  reply: FastifyReply,
) => {
  const user = req.user as JwtUser;
  const log = await getOwnWarningLog(req.params.logId, user.id);
  if (!log) return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Warning not found' } });
  return reply.send({ success: true, data: { log }, error: null });
};

export const submitAppealHandler = async (
  req: FastifyRequest<{ Params: { logId: string }; Body: { text: string } }>,
  reply: FastifyReply,
) => {
  const user = req.user as JwtUser;
  const text = req.body?.text?.trim();
  if (!text) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_INPUT', message: 'text is required' } });
  }
  try {
    const log = await submitAppeal(req.params.logId, user.id, text);
    return reply.send({ success: true, data: { log }, error: null });
  } catch (err) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'APPEAL_ERROR', message: errMessage(err) } });
  }
};
