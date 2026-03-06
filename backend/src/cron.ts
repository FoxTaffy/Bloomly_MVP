import cron from 'node-cron';
import prisma from './config/prisma.js';
import { patrolSuspiciousActivity } from './modules/automod/service.js';

export function initCronJobs() {
  console.log('[CRON] Initializing background tasks...');

  cron.schedule('0 3 * * *', async () => {
    console.log('[CRON] Running daily DB cleanup task...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Run all deletions in a single transaction for atomicity.
      // Order matters: delete child rows BEFORE parent rows to satisfy FK constraints.
      await prisma.$transaction([
        // 1. Comment votes belonging to expired soft-deleted comments
        prisma.$executeRaw`DELETE FROM "CommentVote" WHERE "comment_id" IN (SELECT "id" FROM "Comment" WHERE "deleted_at" <= ${thirtyDaysAgo})`,

        // 2. Replies (child comments) referencing soft-deleted parent comments
        //    Must delete children before parents due to self-referencing FK
        prisma.$executeRaw`DELETE FROM "Comment" WHERE "parent_id" IN (SELECT "id" FROM "Comment" WHERE "deleted_at" <= ${thirtyDaysAgo})`,

        // 3. Root-level soft-deleted comments
        prisma.$executeRaw`DELETE FROM "Comment" WHERE "deleted_at" <= ${thirtyDaysAgo}`,

        // 4. Dependents of soft-deleted Posts (GroupPost has ON DELETE CASCADE, but Vote/Favourite/Repaw/PostTag/UserActivity/Comment do not)
        prisma.$executeRaw`DELETE FROM "Vote"         WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo})`,
        prisma.$executeRaw`DELETE FROM "Favourite"    WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo})`,
        prisma.$executeRaw`DELETE FROM "Repaw"        WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo})`,
        prisma.$executeRaw`DELETE FROM "PostTag"      WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo})`,
        prisma.$executeRaw`DELETE FROM "UserActivity" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo})`,
        // Also clean up CommentVotes and Comments belonging to deleted posts
        prisma.$executeRaw`DELETE FROM "CommentVote" WHERE "comment_id" IN (SELECT "id" FROM "Comment" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo}))`,
        prisma.$executeRaw`DELETE FROM "Comment"      WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo})`,

        // 5. Hard-delete the posts themselves (GroupPost rows cascade automatically)
        prisma.$executeRaw`DELETE FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo}`,
      ]);

      console.log('[CRON] DB Cleanup completed successfully.');
    } catch (err: any) {
      console.error('[CRON] Failed to run daily DB cleanup task:', err.message);
    }
  });

  // Automod patrol: every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await patrolSuspiciousActivity();
    } catch (err: any) {
      console.error('[CRON] AutoMod patrol error:', err.message);
    }
  });

  console.log('[CRON] Background tasks initialized.');
}
