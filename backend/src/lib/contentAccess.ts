import type { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { isAdult } from './age.js';
import { getBlockerIds } from './blocks.js';

export const accessError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw accessError('Invalid identifier', 400);
}

export function readableGroupsWhere(viewerId?: string | null): Prisma.GroupWhereInput {
  return {
    deleted_at: null,
    OR: [
      { is_public: true },
      ...(viewerId ? [{ owner_id: viewerId }, { members: { some: { user_id: viewerId } } }] : []),
    ],
  };
}

export async function assertGroupReadable(groupId: string, viewerId?: string | null) {
  requireUuid(groupId);
  const group = await prisma.group.findFirst({ where: { id: groupId, ...readableGroupsWhere(viewerId) } });
  if (group) return group;
  const exists = await prisma.group.count({ where: { id: groupId, deleted_at: null } });
  throw accessError(exists ? 'GROUP_PRIVATE' : 'Group not found', exists ? 403 : 404);
}

export function readableProfilesWhere(viewerId?: string | null): Prisma.UserWhereInput {
  return {
    deleted_at: null,
    OR: [
      { profile_visibility: { notIn: ['friends', 'nobody', 'only_me'] } },
      ...(viewerId ? [
        { id: viewerId },
        { profile_visibility: 'friends',
          following: { some: { follower_id: viewerId } },
          followers: { some: { following_id: viewerId } } },
      ] : []),
    ],
  };
}

export async function assertProfileReadable(userId: string, viewerId?: string | null) {
  requireUuid(userId);
  const blocked = await getBlockerIds(viewerId ?? undefined);
  const owner = await prisma.user.findFirst({ where: { id: userId, AND: [readableProfilesWhere(viewerId)] }, select: { id: true } });
  if (!owner || blocked.includes(userId)) throw accessError('PROFILE_PRIVATE', 403);
}

/** A single SQL policy for feeds, permalinks, comments, bookmarks and public previews. */
export async function readablePostsWhere(viewerId?: string | null, allowArchived = false): Promise<Prisma.PostWhereInput> {
  const [viewer, blockedIds] = await Promise.all([
    viewerId ? prisma.user.findUnique({ where: { id: viewerId }, select: { birth_date: true } }) : null,
    getBlockerIds(viewerId ?? undefined),
  ]);
  const personalSubscriber: Prisma.PostWhereInput[] = viewerId ? [
    { author_id: viewerId },
    { groupPosts: { none: {} }, author: { following: { some: { follower_id: viewerId } } } },
    { groupPosts: { some: { group: { OR: [
      { owner_id: viewerId }, { members: { some: { user_id: viewerId } } }, { subscribers: { some: { user_id: viewerId } } },
    ] } } } },
  ] : [];
  return {
    AND: [
      { deleted_at: null, author: readableProfilesWhere(viewerId) },
      { groupPosts: { every: { group: readableGroupsWhere(viewerId) } } },
      ...(blockedIds.length ? [{ author_id: { notIn: blockedIds } }] : []),
      ...(!isAdult(viewer?.birth_date) ? [{ OR: [{ is_nsfw: false }, ...(viewerId ? [{ author_id: viewerId }] : [])] }] : []),
      ...(!allowArchived ? [{ OR: [
        { is_archived: false },
        ...(viewerId ? [{ author_id: viewerId }, { groupPosts: { some: { group: { members: { some: { user_id: viewerId, role: { in: ['owner', 'admin', 'moderator'] } } } } } } }] : []),
      ] }] : []),
      { OR: [{ subscriber_only: false }, ...personalSubscriber] },
      { OR: [{ is_paid: false }, ...(viewerId ? [{ author_id: viewerId }] : [])] },
    ],
  };
}

export async function assertPostReadable(postId: string, viewerId?: string | null) {
  requireUuid(postId);
  const post = await prisma.post.findFirst({
    where: { id: postId, AND: [await readablePostsWhere(viewerId)] },
    select: { id: true, author_id: true },
  });
  if (post) return post;
  const exists = await prisma.post.count({ where: { id: postId, deleted_at: null } });
  throw accessError(exists ? 'POST_PRIVATE' : 'Post not found', exists ? 403 : 404);
}
