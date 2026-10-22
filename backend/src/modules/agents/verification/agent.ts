import { Prisma } from '@prisma/client';
import prisma from '../../../config/prisma.js';
import { logger } from '../../../lib/logger.js';
import { adminReviewRequest } from '../../verification/service.js';
import { agentModel, hasLlm, llm } from '../llm.js';
import { logAgentEvent } from '../agentLog.js';
import { buildDossier, type Dossier } from './dossier.js';
import { SYSTEM_PROMPT, VERDICT_TOOL, dossierText } from './prompt.js';
import { MAX_ATTEMPTS, decide, evaluateGates, parseVerdict, sanitizeReason, type Verdict } from './policy.js';

/**
 * off    — агент не работает (по умолчанию, пока нет ANTHROPIC_API_KEY);
 * shadow — вердикт считается и сохраняется в заявке, но статус не меняется (прогон перед включением);
 * auto   — агент сам одобряет и отклоняет.
 */
export type AgentMode = 'off' | 'shadow' | 'auto';

export function verificationAgentMode(): AgentMode {
  const v = process.env.VERIFICATION_AGENT_MODE?.trim().toLowerCase();
  if (v === 'off' || v === 'shadow' || v === 'auto') return v;
  return hasLlm() ? 'auto' : 'off';
}

const RETRY_AFTER_MS = 5 * 60_000;
const BATCH = 3;

export type ReviewResult =
  | { status: 'approved' | 'rejected'; reason: string; confidence: number | null }
  | { status: 'escalated' | 'shadow' | 'skipped' | 'error'; reason: string };

async function askModel(d: Dossier): Promise<Verdict> {
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: dossierText(d.type, d.profile, d.images.length, new Date().toISOString().slice(0, 10)) },
    ...d.images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } })),
  ];
  const res = await llm().messages.create({
    model: agentModel(),
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    tools: [VERDICT_TOOL],
    tool_choice: { type: 'tool', name: VERDICT_TOOL.name },
    messages: [{ role: 'user', content: content as never }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  const verdict = block && block.type === 'tool_use' ? parseVerdict(block.input) : null;
  if (!verdict) throw new Error('Модель вернула вердикт не по схеме');
  return verdict;
}

/** Берёт заявку в работу: атомарно, чтобы два прохода cron (или cron и ручной запуск) не разобрали её дважды. */
async function claim(id: string): Promise<boolean> {
  const { count } = await prisma.verificationRequest.updateMany({
    where: {
      id, status: 'pending', agent_report: { equals: Prisma.DbNull }, agent_attempts: { lt: MAX_ATTEMPTS },
      OR: [{ agent_checked_at: null }, { agent_checked_at: { lt: new Date(Date.now() - RETRY_AFTER_MS) } }],
    },
    data: { agent_attempts: { increment: 1 }, agent_checked_at: new Date() },
  });
  return count === 1;
}

async function recordDecision(d: Dossier, action: 'approve' | 'reject', reason: string, confidence: number | null, report: Prisma.InputJsonValue) {
  await adminReviewRequest(d.requestId, action, null, reason, {
    decided_by_agent: true, agent_confidence: confidence, agent_report: report, evidence_hashes: d.hashes,
  });
  const username = String(d.profile.username ?? '');
  // Журнал модерации: те же action, что у ручных решений, чтобы вкладка аудита показывала их единообразно (actor пуст → «агент»).
  await prisma.autoModLog.create({
    data: {
      user_id: d.userId, actor_id: null, category: 'verification', score: 0,
      action: action === 'approve' ? 'verify_profile' : 'reject_verification',
      reason: `Агент верификации: ${reason}`.slice(0, 300),
    },
  }).catch(() => {});
  await logAgentEvent({
    agent: 'verification', tab: 'verification', level: 'info',
    summary: `${action === 'approve' ? 'Одобрено' : 'Отклонено'}: @${username} (${d.type})${confidence != null ? `, ${confidence}%` : ''}`,
    details: { requestId: d.requestId, reason },
  }).catch(() => {});
}

/** Разбор одной заявки. Не бросает: сбой записывается в заявку и повторяется на следующем проходе. */
export async function reviewVerificationRequest(requestId: string): Promise<ReviewResult> {
  const mode = verificationAgentMode();
  if (mode === 'off') return { status: 'skipped', reason: 'агент выключен' };
  if (!(await claim(requestId))) return { status: 'skipped', reason: 'заявка уже разобрана или разбирается' };

  try {
    const d = await buildDossier(requestId);
    if (!d) return { status: 'skipped', reason: 'заявка не найдена' };
    if (d.unreadable > 0 && d.gate.evidence.images === 0) throw new Error('Хранилище не отдало файлы доказательств');

    const model = agentModel();
    const base = { model, mode, gate: d.gate.criteria, evidence: d.gate.evidence, checked_at: new Date().toISOString() };
    const gate = evaluateGates(d.gate);

    if (gate?.action === 'escalate') {
      await prisma.verificationRequest.update({
        where: { id: requestId },
        data: { evidence_hashes: d.hashes, agent_report: { ...base, outcome: 'escalated', gate: gate.gate, summary: gate.reason } },
      });
      await logAgentEvent({ agent: 'verification', tab: 'verification', level: 'warn', summary: `Нужен модератор: @${String(d.profile.username)} (${d.type}) — ${gate.reason}`, details: { requestId } }).catch(() => {});
      return { status: 'escalated', reason: gate.reason };
    }

    let action: 'approve' | 'reject';
    let reason: string;
    let confidence: number | null = null;
    let report: Record<string, unknown>;
    if (gate) {
      action = 'reject'; reason = gate.reason;
      report = { ...base, outcome: 'rejected', gate: gate.gate, summary: gate.reason };
    } else {
      const verdict = await askModel(d);
      const outcome = decide(d.type, verdict);
      action = outcome.action; reason = outcome.reason; confidence = outcome.confidence;
      report = { ...base, outcome: outcome.action === 'approve' ? 'approved' : 'rejected', failed: outcome.failed, verdict: { ...verdict, summary: sanitizeReason(verdict.summary) } };
    }

    if (mode === 'shadow') {
      await prisma.verificationRequest.update({
        where: { id: requestId },
        data: { evidence_hashes: d.hashes, agent_confidence: confidence, agent_report: { ...report, shadow: true, would: action } as Prisma.InputJsonValue },
      });
      return { status: 'shadow', reason: `${action}: ${reason}` };
    }

    await recordDecision(d, action, reason, confidence, report as Prisma.InputJsonValue);
    return { status: action === 'approve' ? 'approved' : 'rejected', reason, confidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId }, '[verification-agent] сбой разбора заявки');
    await prisma.verificationRequest.updateMany({ where: { id: requestId, status: 'pending' }, data: { agent_last_error: message.slice(0, 300) } }).catch(() => {});
    return { status: 'error', reason: message };
  }
}

/** Проход cron: свежие заявки, которых агент ещё не касался, и повторы после сбоев. */
export async function processPendingVerifications(): Promise<ReviewResult[]> {
  if (verificationAgentMode() === 'off') return [];
  const due = await prisma.verificationRequest.findMany({
    where: {
      status: 'pending', agent_report: { equals: Prisma.DbNull }, agent_attempts: { lt: MAX_ATTEMPTS },
      OR: [{ agent_checked_at: null }, { agent_checked_at: { lt: new Date(Date.now() - RETRY_AFTER_MS) } }],
    },
    orderBy: { created_at: 'asc' },
    take: BATCH,
    select: { id: true },
  });
  const results: ReviewResult[] = [];
  for (const r of due) results.push(await reviewVerificationRequest(r.id)); // по одной: изображения тяжёлые, лимиты API
  return results;
}
