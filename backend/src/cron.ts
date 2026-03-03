import cron from 'node-cron';
import prisma from './config/prisma.js';

export function initCronJobs() {
  console.log('[CRON] Initializing background tasks...');

  cron.schedule('0 3 * * *', async () => {
    console.log('[CRON] Running daily DB cleanup task...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // We use raw SQL for dependent deletions to circumvent lack of cascading deletes
      // 1. Delete old soft-deleted Comments
      await prisma.$executeRaw`DELETE FROM "CommentVote" WHERE "comment_id" IN (SELECT "id" FROM "Comment" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      const deletedComments = await prisma.$executeRaw`DELETE FROM "Comment" WHERE "deleted_at" <= ${thirtyDaysAgo};`;

      // 2. Delete old soft-deleted Posts (and their dependencies)
      await prisma.$executeRaw`DELETE FROM "Vote" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      await prisma.$executeRaw`DELETE FROM "Favourite" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      await prisma.$executeRaw`DELETE FROM "Repaw" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      await prisma.$executeRaw`DELETE FROM "PostTag" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      await prisma.$executeRaw`DELETE FROM "UserActivity" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      await prisma.$executeRaw`DELETE FROM "Comment" WHERE "post_id" IN (SELECT "id" FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo});`;
      const deletedPosts = await prisma.$executeRaw`DELETE FROM "Post" WHERE "deleted_at" <= ${thirtyDaysAgo};`;

      console.log(`[CRON] DB Cleanup Completed successfully.`);
    } catch (err: any) {
      console.error('[CRON] Failed to run daily DB cleanup task:', err.message);
    }
  });

  console.log('[CRON] Background tasks initialized.');
}
