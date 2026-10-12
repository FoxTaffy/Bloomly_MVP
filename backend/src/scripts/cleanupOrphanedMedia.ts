/**
 * One-off maintenance: finds MinIO objects that no DB row references anymore (e.g. a soft-deleted
 * post's media that was never cleaned up, or an upload that was abandoned before being attached
 * to anything) and reports them. Dry-run by default — never deletes anything unless invoked with
 * --execute.
 *
 * Deliberately conservative:
 *  - Collects references from every model that can hold a MinIO URL, regardless of the owning
 *    row's deleted_at (a soft-deleted post's media should NOT be treated as orphaned).
 *  - Skips any object modified within the last 24h, since an object can exist in the bucket for a
 *    moment before the DB row that will reference it is committed.
 *
 * Usage:
 *   npm run db:cleanup-orphaned-media            # dry run, prints a report only
 *   npm run db:cleanup-orphaned-media -- --execute  # actually deletes the orphaned objects
 */
import prisma from '../config/prisma.js';
import { listAllObjectKeys, deleteObjectKeys, urlToObjectKey } from '../modules/media/service.js';

const SAFETY_BUFFER_MS = 24 * 60 * 60 * 1000;

async function collectReferencedKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  const add = (url: unknown) => {
    const key = urlToObjectKey(url);
    if (key) keys.add(key);
  };
  const addAll = (urls: unknown) => {
    if (Array.isArray(urls)) urls.forEach(add);
  };

  const [
    users, posts, stories, comments, ads, mediaHistory, reports, automodLogs,
    conversations, messages, groups, events, verificationRequests, denReviews,
    denFairs, stickerPacks, stickerUsages, stickerFavorites, stickerBanners,
    fursonaRefImages, fursuits, shopItems, bloomlyUpdates, supportMessages, dealerListings,
  ] = await Promise.all([
    prisma.user.findMany({ select: { avatar_url: true, avatar_video_url: true, banner_url: true, fursona_photo_url: true, fursuit_photo_url: true, profile_bg_url: true } }),
    prisma.post.findMany({ select: { media_urls: true, media_original_urls: true } }),
    prisma.story.findMany({ select: { image_url: true, video_url: true } }),
    prisma.comment.findMany({ select: { file_url: true } }),
    prisma.advertisement.findMany({ select: { image_url: true } }),
    prisma.mediaHistory.findMany({ select: { url: true, video_url: true } }),
    prisma.report.findMany({ select: { evidence_urls: true } }),
    prisma.autoModLog.findMany({ select: { image_url: true } }),
    prisma.conversation.findMany({ select: { avatar_url: true, banner_url: true } }),
    prisma.message.findMany({ select: { file_url: true, metadata: true } }),
    prisma.group.findMany({ select: { avatar_url: true, banner_url: true, group_bg_url: true, sponsors: true } }),
    prisma.event.findMany({ select: { banner_url: true } }),
    prisma.verificationRequest.findMany({ select: { evidence_urls: true } }),
    prisma.denReview.findMany({ select: { photo_url: true } }),
    prisma.denFair.findMany({ select: { banner_url: true } }),
    prisma.stickerPack.findMany({ select: { cover_url: true, stickers: true } }),
    prisma.stickerUsage.findMany({ select: { sticker_url: true } }),
    prisma.stickerFavorite.findMany({ select: { sticker_url: true } }),
    prisma.stickerBanner.findMany({ select: { image_url: true } }),
    prisma.fursonaReferenceImage.findMany({ select: { image_url: true } }),
    prisma.fursuit.findMany({ select: { image_url: true } }),
    prisma.shopItem.findMany({ select: { preview_url: true, content_data: true } }),
    prisma.bloomlyUpdate.findMany({ select: { image_url: true } }),
    prisma.supportTicketMessage.findMany({ select: { attachment_urls: true } }),
    prisma.dealerListing.findMany({ select: { images: true } }),
  ]);

  // Изображения рамок аватара и медиа отложенных постов раньше не учитывались: --execute удалял живые файлы
  const [frames, scheduledPosts] = await Promise.all([
    prisma.avatarFrame.findMany({ select: { image_url: true } }),
    prisma.scheduledPost.findMany({ select: { media_urls: true, media_original_urls: true } }),
  ]);
  frames.forEach((f) => add(f.image_url));
  scheduledPosts.forEach((p) => { addAll(p.media_urls); addAll(p.media_original_urls); });

  users.forEach((u) => { add(u.avatar_url); add(u.avatar_video_url); add(u.banner_url); add(u.fursona_photo_url); add(u.fursuit_photo_url); add(u.profile_bg_url); });
  posts.forEach((p) => { addAll(p.media_urls); addAll(p.media_original_urls); });
  stories.forEach((s) => { add(s.image_url); add(s.video_url); });
  comments.forEach((c) => add(c.file_url));
  ads.forEach((a) => add(a.image_url));
  mediaHistory.forEach((m) => { add(m.url); add(m.video_url); });
  reports.forEach((r) => addAll(r.evidence_urls));
  automodLogs.forEach((a) => add(a.image_url));
  conversations.forEach((c) => { add(c.avatar_url); add(c.banner_url); });
  // Альбомы хранят файлы в metadata.files, а file_url у них пустой
  messages.forEach((m) => {
    add(m.file_url);
    const files = (m.metadata as { files?: { url?: unknown }[] } | null)?.files;
    if (Array.isArray(files)) files.forEach((f) => add(f?.url));
  });
  groups.forEach((g) => {
    add(g.avatar_url); add(g.banner_url); add(g.group_bg_url);
    const sponsors = Array.isArray(g.sponsors) ? g.sponsors : [];
    sponsors.forEach((s: any) => add(s?.logo_url));
  });
  events.forEach((e) => add(e.banner_url));
  verificationRequests.forEach((v) => addAll(v.evidence_urls));
  denReviews.forEach((d) => add(d.photo_url));
  denFairs.forEach((d) => add(d.banner_url));
  stickerPacks.forEach((s) => { add(s.cover_url); addAll(s.stickers); });
  stickerUsages.forEach((s) => add(s.sticker_url));
  stickerFavorites.forEach((s) => add(s.sticker_url));
  stickerBanners.forEach((s) => add(s.image_url));
  fursonaRefImages.forEach((f) => add(f.image_url));
  fursuits.forEach((f) => add(f.image_url));
  shopItems.forEach((s) => {
    add(s.preview_url);
    const data = s.content_data as any;
    if (data && typeof data === 'object') add(data.url);
  });
  bloomlyUpdates.forEach((b) => add(b.image_url));
  supportMessages.forEach((s) => addAll(s.attachment_urls));
  dealerListings.forEach((d) => addAll(d.images));

  return keys;
}

async function main() {
  const execute = process.argv.includes('--execute');

  console.log('Listing all objects in the MinIO bucket...');
  const objects = await listAllObjectKeys();
  console.log(`Found ${objects.length} objects in the bucket.`);

  console.log('Collecting every referenced media URL from the database...');
  const referenced = await collectReferencedKeys();
  console.log(`Found ${referenced.size} referenced object keys.`);

  const now = Date.now();
  const orphaned = objects.filter(
    (o) => !referenced.has(o.key) && now - o.lastModified.getTime() > SAFETY_BUFFER_MS,
  );

  const totalBytes = orphaned.reduce((sum, o) => sum + o.size, 0);
  console.log(`\nOrphaned objects: ${orphaned.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);

  const byFolder = new Map<string, { count: number; bytes: number }>();
  orphaned.forEach((o) => {
    const folder = o.key.split('/')[0] ?? 'other';
    const entry = byFolder.get(folder) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += o.size;
    byFolder.set(folder, entry);
  });
  console.log('\nBy folder:');
  [...byFolder.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .forEach(([folder, { count, bytes }]) => {
      console.log(`  ${folder}: ${count} objects, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
    });

  console.log('\nSample (up to 20):');
  orphaned.slice(0, 20).forEach((o) => console.log(`  ${o.key}`));

  if (!execute) {
    console.log('\nDry run only — nothing was deleted. Re-run with --execute to actually delete these objects.');
    return;
  }

  console.log(`\nDeleting ${orphaned.length} orphaned objects...`);
  const keys = orphaned.map((o) => o.key);
  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    await deleteObjectKeys(keys.slice(i, i + BATCH));
  }
  console.log('Done.');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
