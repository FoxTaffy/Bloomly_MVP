import prisma from '../config/prisma.js';
import { logger } from './logger.js';
import { errMessage } from './httpErrors.js';

interface ActionEntry {
  userId: string;
  action: string;
  targetId?: string | null;
  ok?: boolean;
  error?: unknown;
  before?: unknown;
  after?: unknown;
}

/** Пишет действие пользователя в UserActionLog. Никогда не бросает: журнал не должен ломать само действие. */
export async function logAction(e: ActionEntry): Promise<void> {
  try {
    await prisma.userActionLog.create({
      data: {
        user_id:   e.userId,
        action:    e.action,
        target_id: e.targetId ?? null,
        ok:        e.ok ?? e.error === undefined,
        error:     e.error === undefined ? null : errMessage(e.error).slice(0, 300),
        before:    e.before === undefined ? undefined : JSON.parse(JSON.stringify(e.before)),
        after:     e.after === undefined ? undefined : JSON.parse(JSON.stringify(e.after)),
      },
    });
  } catch (err) {
    logger.error({ err, action: e.action }, '[actionLog] failed to write');
  }
}
