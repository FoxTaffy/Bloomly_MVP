import cron from 'node-cron';
import prisma from './config/prisma.js';
import { patrolSuspiciousActivity } from './modules/automod/service.js';
import { activityService } from './modules/activities/service.js';
import { dealersDenService } from './modules/dealers-den/service.js';
import { pollSupportInbox } from './modules/support/mailPoller.js';
import { scheduledPostService } from './modules/posts/scheduledService.js';
import { cleanupSoftDeletedRows, cleanupExpiredStories } from './jobs/cleanup.js';
import { logger } from './lib/logger.js';
import { paymentsService } from './modules/payments/service.js';
import { refreshBlmRate } from './modules/payments/rate.js';
import { onlineService } from './modules/admin/online.service.js';
import { processPendingVerifications } from './modules/agents/verification/agent.js';
import { runSupervisor } from './modules/agents/supervisor.js';

interface CronJob {
  name: string;
  schedule: string;
  run: () => Promise<unknown>;
  /** Log when the job starts (for the rare daily jobs; not for the every-minute ones). */
  announce?: boolean;
}

const JOBS: CronJob[] = [
  // DB keepalive — prevents idle connection drops (failures are reconnected by Prisma)
  { name: 'DB keepalive', schedule: '*/5 * * * *', run: () => prisma.$queryRaw`SELECT 1` },

  // Замер числа пользователей онлайн — основа суточной аналитики активности в админке
  { name: 'online sample', schedule: '* * * * *', run: () => onlineService.recordSample() },
  { name: 'online samples cleanup', schedule: '40 3 * * *', run: () => onlineService.cleanup() },

  // Курс BLM (1 BLM = 1 $): обновляем из курса ЦБ 2 раза в сутки
  { name: 'BLM rate update', schedule: '0 9,21 * * *', announce: true, run: refreshBlmRate },

  { name: 'daily DB cleanup', schedule: '0 3 * * *', announce: true, run: async () => {
    await cleanupSoftDeletedRows();
    logger.info('[CRON] DB Cleanup completed successfully.');
  } },

  { name: 'story cleanup', schedule: '30 3 * * *', announce: true, run: cleanupExpiredStories },

  { name: 'AutoMod patrol', schedule: '*/15 * * * *', run: patrolSuspiciousActivity },

  // Activity Engine: auto-ban overdue participants
  { name: 'activity auto-ban', schedule: '0 4 * * *', announce: true, run: async () => {
    const { bannedCount } = await activityService.autoProcessOverdue();
    if (bannedCount > 0) logger.info(`[CRON] Activity auto-ban: ${bannedCount} participant(s) added to blacklist`);
  } },

  // Den disputes: auto-resolve unanswered disputes
  { name: 'autoResolveDisputes', schedule: '0 * * * *', run: () => dealersDenService.autoResolveDisputes() },

  // Den auctions: close auctions past their end time (winner = top bid)
  { name: 'closeExpiredAuctions', schedule: '*/5 * * * *', run: () => dealersDenService.closeExpiredAuctions() },

  // Support inbox: poll bloomly_support@pm.me (via Proton Bridge) for new/replied messages
  { name: 'support inbox poll', schedule: '*/1 * * * *', run: pollSupportInbox },

  // Scheduled posts: publish due drafts/scheduled posts (and roll recurring ones forward)
  { name: 'scheduled posts publish', schedule: '*/1 * * * *', run: async () => {
    const published = await scheduledPostService.publishDueOnes();
    if (published > 0) logger.info(`[CRON] Scheduled posts: published ${published} post(s)`);
  } },

  // Агент верификации: разбирает новые заявки (режим VERIFICATION_AGENT_MODE: off | shadow | auto)
  { name: 'verification agent', schedule: '*/2 * * * *', run: async () => {
    const done = await processPendingVerifications();
    if (done.length > 0) logger.info(`[CRON] Verification agent: ${done.map((r) => r.status).join(', ')}`);
  } },

  // Субагенты вкладок админки: следят за очередями и пишут в журнал только изменения состояния
  { name: 'admin tab agents', schedule: '*/10 * * * *', run: runSupervisor },

  // Оплаченные периоды подписки: истёкшие → free (бессрочные, выданные админом, не трогаются)
  { name: 'subscription expiry', schedule: '*/10 * * * *', run: async () => {
    const expired = await paymentsService.expireSubscriptions();
    if (expired > 0) logger.info(`[CRON] Subscriptions: ${expired} expired → free`);
  } },

  // Автопродление подписок: списание с привязанной карты/ЮMoney за сутки до конца периода
  { name: 'subscription renewal', schedule: '5,35 * * * *', run: async () => {
    const renewed = await paymentsService.renewSubscriptions();
    if (renewed > 0) logger.info(`[CRON] Subscriptions: ${renewed} auto-renewed`);
  } },

  // Сверка с ЮKassa: догоняет платежи, по которым webhook не дошёл (оплата не должна зависеть от доставки webhook)
  { name: 'payments reconcile', schedule: '*/10 * * * *', run: async () => {
    const fixed = await paymentsService.reconcilePayments();
    if (fixed > 0) logger.info(`[CRON] Payments: reconciled ${fixed}`);
  } },

  // Брошенные платежи (не дошли до оплаты за сутки) → expired
  { name: 'stale payments', schedule: '15 * * * *', run: () => paymentsService.expireStalePayments() },
];

export function initCronJobs() {
  logger.info('[CRON] Initializing background tasks...');
  for (const job of JOBS) {
    cron.schedule(job.schedule, async () => {
      if (job.announce) logger.info(`[CRON] Running ${job.name}...`);
      try {
        await job.run();
      } catch (err) {
        logger.error({ err }, `[CRON] ${job.name} failed`);
      }
    });
  }
  logger.info('[CRON] Background tasks initialized.');
}
