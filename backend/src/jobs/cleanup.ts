import prisma from '../config/prisma.js';
import { purgeMediaUrl } from '../modules/media/service.js';
import { logger } from '../lib/logger.js';

/**
 * Hard-deletes rows soft-deleted more than 30 days ago (posts, comments and everything that
 * references them) plus expired/revoked refresh tokens, then purges their files from S3.
 */
export async function cleanupSoftDeletedRows() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Gather every S3 file about to be hard-deleted below, mirroring those WHERE clauses.
  // In steady state this is nearly empty — deletePost()/deleteComment() already purge S3
  // immediately on soft-delete — this is the safety net for rows that bypass those paths
  // (replies of a soft-deleted comment, comments left on a soft-deleted post).
  const [expiringPosts, expiringComments, replyComments, postComments] = await Promise.all([
    prisma.post.findMany({ where: { deleted_at: { lte: thirtyDaysAgo } }, select: { media_urls: true, media_original_urls: true } }),
    prisma.comment.findMany({ where: { deleted_at: { lte: thirtyDaysAgo } }, select: { file_url: true } }),
    prisma.comment.findMany({ where: { parent: { deleted_at: { lte: thirtyDaysAgo } } }, select: { file_url: true } }),
    prisma.comment.findMany({ where: { post: { deleted_at: { lte: thirtyDaysAgo } } }, select: { file_url: true } }),
  ]);
  const expiringMediaUrls: string[] = [];
  expiringPosts.forEach((p) => expiringMediaUrls.push(...p.media_urls, ...p.media_original_urls));
  [...expiringComments, ...replyComments, ...postComments].forEach((c) => { if (c.file_url) expiringMediaUrls.push(c.file_url); });

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

    // 6. Purge expired or revoked refresh tokens
    prisma.$executeRaw`DELETE FROM "RefreshToken" WHERE "expires_at" < NOW() OR "revoked" = true`,
  ]);

  if (expiringMediaUrls.length > 0) {
    await Promise.all(expiringMediaUrls.map((url) => purgeMediaUrl(url)));
    logger.info(`[CRON] Purged ${expiringMediaUrls.length} S3 file(s) belonging to hard-deleted rows.`);
  }
}

/**
 * Stories: hard-delete expired/soft-deleted rows and purge their media.
 * Stories are filtered out of every query once expires_at passes, but the rows (and their
 * image/video in S3) were never actually removed — every story ever posted leaked its media
 * forever, since expired stories are also invisible to the orphaned-media scanner script
 * (it treats all Story rows as referenced regardless of expiry/deleted_at).
 */
export async function cleanupExpiredStories() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h grace period past expiry/deletion before hard-deleting
  const expired = await prisma.story.findMany({
    where: { OR: [{ expires_at: { lte: cutoff } }, { deleted_at: { lte: cutoff } }] },
    select: { id: true, image_url: true, video_url: true },
  });
  if (expired.length > 0) {
    const ids = expired.map((s) => s.id);
    await prisma.$transaction([
      prisma.storyVote.deleteMany({ where: { story_id: { in: ids } } }),
      prisma.storyView.deleteMany({ where: { story_id: { in: ids } } }),
      prisma.story.deleteMany({ where: { id: { in: ids } } }),
    ]);
    const mediaUrls = expired.flatMap((s) => [s.image_url, s.video_url]).filter((u): u is string => !!u);
    await Promise.all(mediaUrls.map((url) => purgeMediaUrl(url)));
    logger.info(`[CRON] Story cleanup: removed ${expired.length} expired stor${expired.length === 1 ? 'y' : 'ies'}, purged ${mediaUrls.length} file(s).`);
  }
}
