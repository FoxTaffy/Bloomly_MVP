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

  // Оплаченные периоды подписки: истёкшие → free (бессрочные, выданные админом, не трогаются)
  { name: 'subscription expiry', schedule: '*/10 * * * *', run: async () => {
    const expired = await paymentsService.expireSubscriptions();
    if (expired > 0) logger.info(`[CRON] Subscriptions: ${expired} expired → free`);
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
