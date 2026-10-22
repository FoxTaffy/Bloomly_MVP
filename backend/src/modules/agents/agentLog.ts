import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';

export type AgentLevel = 'ok' | 'info' | 'warn' | 'alert';

export interface AgentEvent {
  agent: string;
  tab: string;
  level: AgentLevel;
  summary: string;
  details?: Prisma.InputJsonValue;
}

const fingerprint = (e: AgentEvent) => createHash('sha256').update(`${e.level}|${e.summary}`).digest('hex');

/** Событие, которое нужно сохранить всегда (решение по заявке, сбой). */
export async function logAgentEvent(e: AgentEvent) {
  await prisma.agentLog.create({
    data: { agent: e.agent, tab: e.tab, level: e.level, summary: e.summary.slice(0, 300), details: e.details, fingerprint: fingerprint(e) },
  });
}

/**
 * Состояние вкладки: пишем, только если оно изменилось с прошлой записи этого агента.
 * Иначе проход раз в несколько минут заполнил бы журнал одинаковыми строками.
 */
export async function logAgentState(e: AgentEvent): Promise<boolean> {
  const last = await prisma.agentLog.findFirst({ where: { agent: e.agent }, orderBy: { created_at: 'desc' }, select: { fingerprint: true } });
  if (last?.fingerprint === fingerprint(e)) return false;
  await logAgentEvent(e);
  return true;
}
