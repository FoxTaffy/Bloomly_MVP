/**
 * One-off maintenance: purges S3/MinIO files that belong to content already soft-deleted
 * (Post/Comment/Message/DealerListing with `deleted_at` set) but whose files were never
 * cleaned up because deletePost()/deleteComment()/deleteMessage()/dealerListing.delete()
 * didn't purge S3 until this fix shipped. Dry-run by default — never deletes anything
 * unless invoked with --execute.
 *
 * Deliberately excludes:
 *  - User (avatar_url etc.) — soft-deleted accounts are restorable via admin, so their
 *    files must be kept.
 *  - Group — has no soft-delete state (only hard `delete()`, which already purges S3).
 *
 * Usage:
 *   npm run db:cleanup-deleted-media               # dry run, prints a report only
 *   npm run db:cleanup-deleted-media -- --dry-run   # то же самое, явно
 *   npm run db:cleanup-deleted-media -- --execute   # actually deletes the files
 */
import prisma from '../config/prisma.js';
import { urlToObjectKey, deleteObjectKeys } from '../modules/media/service.js';

async function collectDeletedMediaKeys(): Promise<{ keys: Set<string>; byModel: Map<string, number> }> {
  const keys = new Set<string>();
  const byModel = new Map<string, number>();
  const add = (model: string, url: unknown) => {
    const key = urlToObjectKey(url);
    if (key && !keys.has(key)) {
      keys.add(key);
      byModel.set(model, (byModel.get(model) ?? 0) + 1);
    }
  };
  const addAll = (model: string, urls: unknown) => {
    if (Array.isArray(urls)) urls.forEach((u) => add(model, u));
  };

  const [posts, postComments, comments, messages, listings] = await Promise.all([
    prisma.post.findMany({ where: { deleted_at: { not: null } }, select: { media_urls: true, media_original_urls: true } }),
    prisma.comment.findMany({ where: { post: { deleted_at: { not: null } } }, select: { file_url: true } }),
    prisma.comment.findMany({ where: { deleted_at: { not: null } }, select: { file_url: true } }),
    prisma.message.findMany({ where: { deleted_at: { not: null } }, select: { file_url: true } }),
    prisma.dealerListing.findMany({ where: { deleted_at: { not: null } }, select: { images: true } }),
  ]);

  posts.forEach((p) => { addAll('Post', p.media_urls); addAll('Post', p.media_original_urls); });
  postComments.forEach((c) => add('Comment (on deleted post)', c.file_url));
  comments.forEach((c) => add('Comment', c.file_url));
  messages.forEach((m) => add('Message', m.file_url));
  listings.forEach((l) => addAll('DealerListing', l.images));

  return { keys, byModel };
}

async function main() {
  const execute = process.argv.includes('--execute');
  if (execute && process.argv.includes('--dry-run')) {
    throw new Error('--dry-run и --execute нельзя указывать вместе');
  }

  console.log('Scanning soft-deleted rows for referenced media...');
  const { keys, byModel } = await collectDeletedMediaKeys();
  console.log(`Found ${keys.size} distinct file(s) belonging to deleted content:`);
  [...byModel.entries()].forEach(([model, count]) => console.log(`  ${model}: ${count}`));

  if (keys.size === 0) {
    console.log('\nNothing to clean up.');
    return;
  }

  if (!execute) {
    console.log('\nDry run only — nothing was deleted. Re-run with --execute to actually delete these files.');
    return;
  }

  console.log(`\nDeleting ${keys.size} file(s)...`);
  const keyList = [...keys];
  const BATCH = 1000;
  for (let i = 0; i < keyList.length; i += BATCH) {
    await deleteObjectKeys(keyList.slice(i, i + BATCH));
  }
  console.log('Done.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
