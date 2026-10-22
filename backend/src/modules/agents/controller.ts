import type { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../../config/prisma.js';
import { requireAdmin, requireModerator } from '../../lib/authHooks.js';
import { hasLlm, agentModel } from './llm.js';
import { inspectAll } from './supervisor.js';
import { processPendingVerifications, verificationAgentMode } from './verification/agent.js';

// GET /api/agents — состояние субагентов вкладок и настройки агента верификации
export async function agentsOverviewHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!requireModerator(request, reply)) return;
  const agents = await inspectAll();
  return reply.send({
    success: true,
    data: { agents, verification: { mode: verificationAgentMode(), model: agentModel(), llmConfigured: hasLlm() } },
  });
}

// GET /api/agents/logs?agent=&page=
export async function agentsLogsHandler(request: FastifyRequest<{ Querystring: { agent?: string; page?: string } }>, reply: FastifyReply) {
  if (!requireModerator(request, reply)) return;
  const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
  const limit = 30;
  const where = request.query.agent ? { agent: request.query.agent.slice(0, 40) } : {};
  const [logs, total] = await Promise.all([
    prisma.agentLog.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.agentLog.count({ where }),
  ]);
  return reply.send({ success: true, data: { logs, total, page, limit } });
}

// POST /api/agents/verification/run — разобрать очередь прямо сейчас
export async function runVerificationHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return;
  const results = await processPendingVerifications();
  return reply.send({ success: true, data: { processed: results.length, results: results.map((r) => ({ status: r.status, reason: r.reason })) } });
}
