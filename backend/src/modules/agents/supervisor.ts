import { logger } from '../../lib/logger.js';
import { logAgentState } from './agentLog.js';
import { TAB_AGENTS, type TabReport } from './tabAgents.js';

export interface AgentStatus extends TabReport { id: string; tab: string; title: string }

/** Один проход по всем субагентам; сбой одного не мешает остальным и сам становится тревогой. */
export async function inspectAll(): Promise<AgentStatus[]> {
  return Promise.all(TAB_AGENTS.map(async (a): Promise<AgentStatus> => {
    try {
      return { id: a.id, tab: a.tab, title: a.title, ...(await a.inspect()) };
    } catch (err) {
      logger.error({ err, agent: a.id }, '[agents] субагент не отработал');
      return { id: a.id, tab: a.tab, title: a.title, level: 'alert', summary: 'Агент не смог проверить вкладку (ошибка запроса)' };
    }
  }));
}

/** Проход cron: те же проверки + запись в журнал, если состояние вкладки изменилось. */
export async function runSupervisor(): Promise<AgentStatus[]> {
  const statuses = await inspectAll();
  for (const s of statuses) {
    await logAgentState({ agent: s.id, tab: s.tab, level: s.level, summary: s.summary, details: s.details }).catch((err) =>
      logger.error({ err, agent: s.id }, '[agents] не удалось записать журнал'));
  }
  return statuses;
}
