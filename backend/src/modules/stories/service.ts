import prisma from '../../config/prisma.js';
import { isTrustedMediaUrl, deleteFileByUrl, assertOwnedMedia } from '../media/service.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { isBlockedBy, getBlockerIds } from '../../lib/blocks.js';
import { logError } from '../../lib/logger.js';

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ACTIVE_STORIES_PER_USER = 20;

/** Throws a 403 unless the viewer is allowed to see userId's stories (mirrors posts/service.ts assertProfileVisible). */
async function assertProfileVisible(userId: string, viewerId?: string) {
  if (viewerId === userId) return;
  if (await isBlockedBy(userId, viewerId)) {
    throw Object.assign(new Error('PROFILE_BLOCKED'), { statusCode: 403 });
  }
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { profile_visibility: true } });
  if (owner && !(await isAllowedByPrivacy(owner.profile_visibility, userId, viewerId))) {
    throw Object.assign(new Error('PROFILE_PRIVATE'), { statusCode: 403 });
  }
}

const userSelect = {
  id: true,
  username: true,
  display_name: true,
  avatar_url: true,
} as const;

async function attachMeta<T extends { id: string }>(stories: T[], viewerId?: string) {
  if (stories.length === 0) return stories as (T & { score: number; my_vote: number; view_count: number })[];
  const ids = stories.map((s) => s.id);

  const [voteAgg, myVotes, viewCounts] = await Promise.all([
    prisma.storyVote.groupBy({ by: ['story_id'], where: { story_id: { in: ids } }, _sum: { value: true } }),
    viewerId
      ? prisma.storyVote.findMany({
          where: { story_id: { in: ids }, user_id: viewerId },
          select: { story_id: true, value: true },
        })
      : Promise.resolve([]),
    prisma.storyView.groupBy({ by: ['story_id'], where: { story_id: { in: ids } }, _count: { _all: true } }),
  ]);

  const scoreMap = new Map(voteAgg.map((v) => [v.story_id, v._sum.value ?? 0]));
  const myVoteMap = new Map(myVotes.map((v) => [v.story_id, v.value]));
  const viewMap = new Map(viewCounts.map((v) => [v.story_id, v._count._all]));

  return stories.map((s) => ({
    ...s,
    score: scoreMap.get(s.id) ?? 0,
    my_vote: myVoteMap.get(s.id) ?? 0,
    view_count: viewMap.get(s.id) ?? 0,
  }));
}

export const storiesService = {
  async getActiveStories(viewerId?: string) {
    const since = new Date(Date.now() - STORY_TTL_MS);
    const blockerIds = await getBlockerIds(viewerId);
    const stories = await prisma.story.findMany({
      where: {
        created_at: { gte: since },
        deleted_at: null,
        ...(blockerIds.length > 0 ? { user_id: { notIn: blockerIds } } : {}),
      },
      include: { user: { select: userSelect } },
      orderBy: { created_at: 'desc' },
    });
    return attachMeta(stories, viewerId);
  },

  async createStory(userId: string, imageUrl?: string, videoUrl?: string) {
    if (!imageUrl && !videoUrl) {
      throw new Error('MISSING_MEDIA');
    }
    if ((imageUrl && !isTrustedMediaUrl(imageUrl)) || (videoUrl && !isTrustedMediaUrl(videoUrl))) {
      throw new Error('INVALID_MEDIA_URL');
    }
    await assertOwnedMedia(imageUrl, userId);
    await assertOwnedMedia(videoUrl, userId);

    const since = new Date(Date.now() - STORY_TTL_MS);
    const activeCount = await prisma.story.count({
      where: { user_id: userId, created_at: { gte: since }, deleted_at: null },
    });
    if (activeCount >= MAX_ACTIVE_STORIES_PER_USER) {
      throw new Error('STORY_LIMIT_EXCEEDED');
    }

    const expires_at = new Date(Date.now() + STORY_TTL_MS);
    return prisma.story.create({
      data: {
        user_id: userId,
        image_url: imageUrl ?? null,
        video_url: videoUrl ?? null,
        expires_at,
      },
      include: { user: { select: userSelect } },
    });
  },

  async deleteStory(storyId: string, userId: string) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { user_id: true, deleted_at: true, image_url: true, video_url: true },
    });
    if (!story || story.deleted_at) return null;
    if (story.user_id !== userId) return false; // not owner

    const updated = await prisma.story.update({
      where: { id: storyId },
      data: { deleted_at: new Date() },
    });
    // Stories have no restore path and the nightly cron only hard-deletes long-expired
    // rows, so without this the image/video would otherwise sit in S3 for up to a day
    // (or forever, for NSFW content someone deliberately wants gone right away).
    [story.image_url, story.video_url].filter((u): u is string => !!u)
      .forEach((url) => deleteFileByUrl(url, story.user_id).catch(logError('[story.delete] media cleanup failed')));
    return updated;
  },

  async getStoriesByUser(userId: string, viewerId?: string) {
    await assertProfileVisible(userId, viewerId);
    const since = new Date(Date.now() - STORY_TTL_MS);
    const stories = await prisma.story.findMany({
      where: {
        user_id: userId,
        created_at: { gte: since },
        deleted_at: null,
      },
      include: { user: { select: userSelect } },
      orderBy: { created_at: 'desc' },
    });
    return attachMeta(stories, viewerId);
  },

  async recordView(storyId: string, viewerId: string) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { user_id: true, deleted_at: true },
    });
    if (!story || story.deleted_at) throw new Error('NOT_FOUND');
    if (story.user_id === viewerId) return; // owner viewing their own story isn't tracked

    await prisma.storyView.upsert({
      where: { story_id_user_id: { story_id: storyId, user_id: viewerId } },
      create: { story_id: storyId, user_id: viewerId },
      update: {},
    });
  },

  async getViewers(storyId: string, requesterId: string) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { user_id: true, deleted_at: true },
    });
    if (!story || story.deleted_at) return null;
    if (story.user_id !== requesterId) return false; // only the owner can see who viewed

    return prisma.storyView.findMany({
      where: { story_id: storyId },
      include: { user: { select: userSelect } },
      orderBy: { created_at: 'desc' },
    });
  },

  async voteStory(storyId: string, userId: string, value: 1 | -1) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { deleted_at: true },
    });
    if (!story || story.deleted_at) throw new Error('NOT_FOUND');

    const existing = await prisma.storyVote.findUnique({
      where: { story_id_user_id: { story_id: storyId, user_id: userId } },
    });

    let myVote: 1 | -1 | 0 = value;
    if (existing) {
      if (existing.value === value) {
        await prisma.storyVote.delete({ where: { id: existing.id } });
        myVote = 0;
      } else {
        await prisma.storyVote.update({ where: { id: existing.id }, data: { value } });
      }
    } else {
      await prisma.storyVote.create({ data: { story_id: storyId, user_id: userId, value } });
    }

    const agg = await prisma.storyVote.aggregate({
      where: { story_id: storyId },
      _sum: { value: true },
    });

    return { score: agg._sum.value ?? 0, my_vote: myVote };
  },
};
