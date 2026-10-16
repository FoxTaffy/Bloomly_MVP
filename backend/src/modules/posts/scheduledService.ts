import prisma from '../../config/prisma.js';
import { assertOwnedMedia } from '../media/service.js';
import { groupService } from '../groups/service.js';
import { postService } from './service.js';
import { moderatePost } from '../automod/service.js';
import { normalizeTag } from '../../lib/tagRules.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';
import { logError } from '../../lib/logger.js';

const MAX_MEDIA_PER_POST = 20;
const REPEAT_INTERVALS = ['daily', 'weekly', 'monthly'] as const;
type RepeatInterval = typeof REPEAT_INTERVALS[number];

export interface ScheduledPostInput {
  content: string;
  groupId?: string;
  isNsfw?: boolean;
  isAiGenerated?: boolean;
  category?: string;
  tags?: string[];
  mediaUrls?: string[];
  mediaOriginalUrls?: string[];
  scheduledAt?: string | null; // ISO UTC — omitted/null → draft
  timezone?: string;
  repeatInterval?: RepeatInterval | null;
  repeatUntil?: string | null;
}

/** Same "content or media" + trust + count validation createPost/createGroupPost use, shared here so drafts/scheduled posts can't smuggle in something the live path would reject. */
async function validateContentAndMedia(ownerId: string, content: string, mediaUrls: string[], mediaOriginalUrls: string[]) {
  if (!content && mediaUrls.length === 0) throw Object.assign(new Error('Content is required'), { statusCode: 400 });
  if (mediaUrls.length > MAX_MEDIA_PER_POST) throw Object.assign(new Error('TOO_MANY_MEDIA_FILES'), { statusCode: 422 });
  // Владение, а не только домен бакета: иначе в отложенный пост можно вставить чужой файл
  for (const url of [...mediaUrls, ...mediaOriginalUrls]) await assertOwnedMedia(url, ownerId);
}

function normalizeTags(tags?: string[]): string[] {
  return Array.from(
    new Set((tags ?? []).map(normalizeTag).filter(Boolean)),
  );
}

async function assertGroupPermission(groupId: string, userId: string) {
  if (!(await groupService.isAtLeastModerator(groupId, userId))) {
    throw Object.assign(new Error('Not authorized to post as this group'), { statusCode: 403 });
  }
}

function nextOccurrence(from: Date, interval: RepeatInterval): Date {
  const next = new Date(from);
  if (interval === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (interval === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

async function assertOwned(id: string, userId: string) {
  const row = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!row || row.author_id !== userId) {
    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
  }
  return row;
}

export const scheduledPostService = {
  async create(userId: string, input: ScheduledPostInput) {
    const content = (input.content ?? '').trim();
    const mediaUrls = (input.mediaUrls ?? []).filter(Boolean);
    const mediaOriginalUrls = input.mediaOriginalUrls?.length === mediaUrls.length ? input.mediaOriginalUrls : [];
    await validateContentAndMedia(userId, content, mediaUrls, mediaOriginalUrls);

    if (input.groupId) await assertGroupPermission(input.groupId, userId);

    let scheduledAt: Date | null = null;
    if (input.scheduledAt) {
      scheduledAt = new Date(input.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) throw Object.assign(new Error('Invalid scheduled time'), { statusCode: 422 });
      if (scheduledAt.getTime() <= Date.now()) throw Object.assign(new Error('Scheduled time must be in the future'), { statusCode: 422 });
    }
    const repeatInterval = input.repeatInterval && REPEAT_INTERVALS.includes(input.repeatInterval) ? input.repeatInterval : null;
    const repeatUntil = input.repeatUntil ? new Date(input.repeatUntil) : null;
    if (repeatInterval && !scheduledAt) {
      throw Object.assign(new Error('Repeating posts require a scheduled time'), { statusCode: 422 });
    }

    return prisma.scheduledPost.create({
      data: {
        author_id: userId,
        group_id: input.groupId ?? null,
        content,
        media_urls: mediaUrls,
        media_original_urls: mediaOriginalUrls,
        is_nsfw: input.isNsfw ?? false,
        is_ai_generated: input.isAiGenerated ?? false,
        category: input.category?.trim() || null,
        tags: normalizeTags(input.tags),
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduled_at: scheduledAt,
        timezone: input.timezone || null,
        repeat_interval: repeatInterval,
        repeat_until: repeatUntil,
      },
    });
  },

  async listMine(userId: string, groupId?: string) {
    return prisma.scheduledPost.findMany({
      where: {
        author_id: userId,
        status: { in: ['draft', 'scheduled', 'failed'] },
        ...(groupId ? { group_id: groupId } : {}),
      },
      orderBy: [{ status: 'asc' }, { scheduled_at: 'asc' }, { created_at: 'desc' }],
      include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } },
    });
  },

  async update(id: string, userId: string, input: ScheduledPostInput) {
    const existing = await assertOwned(id, userId);
    if (!['draft', 'scheduled', 'failed'].includes(existing.status)) {
      throw Object.assign(new Error('Already published'), { statusCode: 400 });
    }

    const content = (input.content ?? existing.content).trim();
    const mediaUrls = input.mediaUrls !== undefined ? input.mediaUrls.filter(Boolean) : existing.media_urls;
    const mediaOriginalUrls = input.mediaOriginalUrls?.length === mediaUrls.length ? input.mediaOriginalUrls : (input.mediaUrls !== undefined ? [] : existing.media_original_urls);
    await validateContentAndMedia(userId, content, mediaUrls, mediaOriginalUrls);

    const groupId = input.groupId !== undefined ? input.groupId : existing.group_id ?? undefined;
    if (groupId) await assertGroupPermission(groupId, userId);

    let scheduledAt: Date | null | undefined = existing.scheduled_at;
    if (input.scheduledAt !== undefined) {
      scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw Object.assign(new Error('Invalid scheduled time'), { statusCode: 422 });
      if (scheduledAt && scheduledAt.getTime() <= Date.now()) throw Object.assign(new Error('Scheduled time must be in the future'), { statusCode: 422 });
    }
    const repeatInterval = input.repeatInterval !== undefined
      ? (input.repeatInterval && REPEAT_INTERVALS.includes(input.repeatInterval) ? input.repeatInterval : null)
      : existing.repeat_interval as RepeatInterval | null;
    if (repeatInterval && !scheduledAt) {
      throw Object.assign(new Error('Repeating posts require a scheduled time'), { statusCode: 422 });
    }

    return prisma.scheduledPost.update({
      where: { id },
      data: {
        content,
        media_urls: mediaUrls,
        media_original_urls: mediaOriginalUrls,
        group_id: groupId ?? null,
        is_nsfw: input.isNsfw !== undefined ? input.isNsfw : existing.is_nsfw,
        is_ai_generated: input.isAiGenerated !== undefined ? input.isAiGenerated : existing.is_ai_generated,
        category: input.category !== undefined ? (input.category?.trim() || null) : existing.category,
        tags: input.tags !== undefined ? normalizeTags(input.tags) : existing.tags,
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduled_at: scheduledAt,
        timezone: input.timezone !== undefined ? (input.timezone || null) : existing.timezone,
        repeat_interval: repeatInterval,
        repeat_until: input.repeatUntil !== undefined ? (input.repeatUntil ? new Date(input.repeatUntil) : null) : existing.repeat_until,
        last_error: null,
      },
    });
  },

  async cancel(id: string, userId: string) {
    await assertOwned(id, userId);
    await prisma.scheduledPost.delete({ where: { id } });
    return { deleted: true };
  },

  async publishNow(id: string, userId: string) {
    const row = await assertOwned(id, userId);
    if (!['draft', 'scheduled', 'failed'].includes(row.status)) {
      throw Object.assign(new Error('Already published'), { statusCode: 400 });
    }
    return publishRow(row);
  },

  /** Called by the cron job: publish every row whose scheduled_at is due. */
  async publishDueOnes() {
    const due = await prisma.scheduledPost.findMany({
      where: { status: 'scheduled', scheduled_at: { lte: new Date() } },
    });
    let published = 0;
    for (const row of due) {
      try {
        await publishRow(row);
        published++;
      } catch (err) {
        // 409 — строку уже публикует другой запуск: её статус трогать нельзя
        if (errStatus(err) === 409) continue;
      }
    }
    return published;
  },
};

async function publishRow(row: Awaited<ReturnType<typeof prisma.scheduledPost.findUniqueOrThrow>>) {
  // Захват строки до публикации: ручная публикация и cron не опубликуют пост дважды
  const claim = await prisma.scheduledPost.updateMany({
    where: { id: row.id, status: { in: ['draft', 'scheduled', 'failed'] } },
    data: { status: 'publishing' },
  });
  if (claim.count !== 1) throw Object.assign(new Error('Post is already being published'), { statusCode: 409 });
  try {
    return await publishClaimedRow(row);
  } catch (err) {
    await prisma.scheduledPost.update({
      where: { id: row.id },
      data: { status: 'failed', last_error: errMessage(err) ?? 'Publish failed' },
    }).catch(() => {});
    throw err;
  }
}

async function publishClaimedRow(row: Awaited<ReturnType<typeof prisma.scheduledPost.findUniqueOrThrow>>) {
  const post = row.group_id
    ? await groupService.createGroupPost(row.group_id, row.author_id, {
        content: row.content,
        isNsfw: row.is_nsfw,
        isAiGenerated: row.is_ai_generated,
        mediaUrls: row.media_urls,
        mediaOriginalUrls: row.media_original_urls,
        tags: row.tags,
        category: row.category ?? undefined,
      })
    : await postService.createPost({
        content: row.content,
        authorId: row.author_id,
        isNsfw: row.is_nsfw,
        isAiGenerated: row.is_ai_generated,
        category: row.category ?? undefined,
        tags: row.tags,
        mediaUrls: row.media_urls,
        mediaOriginalUrls: row.media_original_urls,
      });

  if (post) {
    moderatePost(post.id, row.author_id, row.content).catch(logError('[AUTOMOD] scheduled post analyzePost error'));
  }

  const interval = row.repeat_interval as RepeatInterval | null;
  if (interval && row.scheduled_at) {
    const next = nextOccurrence(row.scheduled_at, interval);
    if (!row.repeat_until || next.getTime() <= row.repeat_until.getTime()) {
      await prisma.scheduledPost.update({
        where: { id: row.id },
        data: {
          status: 'scheduled',
          scheduled_at: next,
          occurrences_count: { increment: 1 },
          published_post_id: post?.id ?? null,
          last_error: null,
        },
      });
      return post;
    }
  }

  await prisma.scheduledPost.update({
    where: { id: row.id },
    data: { status: 'published', published_post_id: post?.id ?? null, occurrences_count: { increment: 1 }, last_error: null },
  });
  return post;
}
