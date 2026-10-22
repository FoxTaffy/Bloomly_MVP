import prisma from '../../config/prisma.js';
import { verificationAgentMode } from './verification/agent.js';
import { MAX_ATTEMPTS } from './verification/policy.js';
import type { AgentLevel } from './agentLog.js';

/**
 * Субагенты админ-панели: каждый закреплён за одной вкладкой и следит за её очередью.
 * Они только наблюдают и сообщают (кроме агента верификации, который ещё и принимает решения —
 * см. verification/agent.ts); модерацию жалоб, рекламы и обращений они не подменяют.
 */
export type AdminTabId = 'reports' | 'support' | 'ads' | 'verification';

export interface TabReport { level: AgentLevel; summary: string; details?: Record<string, number | string | boolean> }

export interface TabAgent {
  id: string;
  tab: AdminTabId;
  title: string;
  inspect(): Promise<TabReport>;
}

const HOUR = 3_600_000;
/** Сколько очередь может ждать, прежде чем это заметит агент. */
export const WARN_AFTER_HOURS = 24;
export const ALERT_AFTER_HOURS = 72;

const hoursSince = (d: Date | null | undefined) => (d ? Math.floor((Date.now() - d.getTime()) / HOUR) : 0);

/** Единая оценка очереди по числу и возрасту старейшего элемента. */
export function queueReport(label: string, count: number, oldest: Date | null | undefined): TabReport {
  if (count === 0) return { level: 'ok', summary: `${label}: очередь пуста`, details: { count: 0 } };
  const age = hoursSince(oldest);
  const level: AgentLevel = age >= ALERT_AFTER_HOURS ? 'alert' : age >= WARN_AFTER_HOURS ? 'warn' : 'info';
  return { level, summary: `${label}: ${count} в очереди, старейшая ждёт ${age} ч.`, details: { count, oldestHours: age } };
}

export const TAB_AGENTS: TabAgent[] = [
  {
    id: 'reports', tab: 'reports', title: 'Жалобы',
    async inspect() {
      const where = { status: 'pending', deleted_at: null };
      const [count, oldest] = await Promise.all([
        prisma.report.count({ where }),
        prisma.report.findFirst({ where, orderBy: { created_at: 'asc' }, select: { created_at: true } }),
      ]);
      return queueReport('Жалобы', count, oldest?.created_at);
    },
  },
  {
    id: 'support', tab: 'support', title: 'Поддержка',
    async inspect() {
      const where = { status: 'open' };
      const [count, oldest] = await Promise.all([
        prisma.supportTicket.count({ where }),
        prisma.supportTicket.findFirst({ where, orderBy: { created_at: 'asc' }, select: { created_at: true } }),
      ]);
      return queueReport('Обращения', count, oldest?.created_at);
    },
  },
  {
    id: 'ads', tab: 'ads', title: 'Реклама',
    async inspect() {
      const where = { status: 'pending' };
      const [count, oldest] = await Promise.all([
        prisma.advertisement.count({ where }),
        prisma.advertisement.findFirst({ where, orderBy: { created_at: 'asc' }, select: { created_at: true } }),
      ]);
      return queueReport('Заявки на рекламу', count, oldest?.created_at);
    },
  },
  {
    id: 'verification', tab: 'verification', title: 'Верификация',
    async inspect() {
      const mode = verificationAgentMode();
      const pending = { status: 'pending' };
      const since = new Date(Date.now() - 24 * HOUR);
      const [count, oldest, escalated, stuck, approved, rejected] = await Promise.all([
        prisma.verificationRequest.count({ where: pending }),
        prisma.verificationRequest.findFirst({ where: pending, orderBy: { created_at: 'asc' }, select: { created_at: true } }),
        prisma.verificationRequest.count({ where: { ...pending, agent_report: { path: ['outcome'], equals: 'escalated' } } }),
        prisma.verificationRequest.count({ where: { ...pending, agent_attempts: { gte: MAX_ATTEMPTS } } }),
        prisma.verificationRequest.count({ where: { decided_by_agent: true, status: 'approved', reviewed_at: { gte: since } } }),
        prisma.verificationRequest.count({ where: { decided_by_agent: true, status: 'rejected', reviewed_at: { gte: since } } }),
      ]);
      const details = { mode, pending: count, escalated, stuck, approved24h: approved, rejected24h: rejected };
      if (mode === 'off' && count > 0) return { level: 'alert', summary: `Агент верификации выключен, заявок в очереди: ${count}`, details };
      if (stuck > 0) return { level: 'alert', summary: `${stuck} заявок не удалось разобрать за ${MAX_ATTEMPTS} попытки — проверьте ключ и доступность API`, details };
      if (escalated > 0) return { level: 'warn', summary: `${escalated} заявок ждут модератора (ссылки на соцсети, видео); агентом за сутки: +${approved} / −${rejected}`, details };
      const age = hoursSince(oldest?.created_at);
      if (count > 0 && age >= 1) return { level: 'warn', summary: `Заявки не разбираются уже ${age} ч. (в очереди ${count})`, details };
      return { level: count ? 'info' : 'ok', summary: `Агентом за сутки: +${approved} / −${rejected}, в очереди ${count}`, details };
    },
  },
];
