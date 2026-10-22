import { FastifyRequest, FastifyReply } from 'fastify';
import { bookmarksService } from './service.js';
import { requestIsAdult } from '../../lib/age.js';

interface JwtUser { id: string; role: string }

export const toggleUserBookmarkHandler = async (
  request: FastifyRequest<{ Params: { targetId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await bookmarksService.toggleUserBookmark(userId, request.params.targetId);
    return reply.send({ success: true, data: result, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to toggle user bookmark';
    return reply.code(400).send({ success: false, data: null, error: { code: 'USER_BOOKMARK_ERROR', message } });
  }
};

export const getUserBookmarkStatusHandler = async (
  request: FastifyRequest<{ Params: { targetId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const statusMap = await bookmarksService.getUserBookmarkStatus(userId, [request.params.targetId]);
    return reply.send({ success: true, data: { bookmarked: statusMap[request.params.targetId] ?? false }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to check user bookmark status';
    return reply.code(500).send({ success: false, data: null, error: { code: 'BOOKMARK_STATUS_ERROR', message } });
  }
};

export const getGroupBookmarkStatusHandler = async (
  request: FastifyRequest<{ Params: { groupId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const statusMap = await bookmarksService.getGroupBookmarkStatus(userId, [request.params.groupId]);
    return reply.send({ success: true, data: { bookmarked: statusMap[request.params.groupId] ?? false }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to check group bookmark status';
    return reply.code(500).send({ success: false, data: null, error: { code: 'GROUP_BOOKMARK_STATUS_ERROR', message } });
  }
};

export const getBookmarkedUsersHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const users = await bookmarksService.getBookmarkedUsers(userId);
    return reply.send({ success: true, data: { users }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch bookmarked users';
    return reply.code(500).send({ success: false, data: null, error: { code: 'BOOKMARKED_USERS_ERROR', message } });
  }
};

export const toggleGroupBookmarkHandler = async (
  request: FastifyRequest<{ Params: { groupId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await bookmarksService.toggleGroupBookmark(userId, request.params.groupId);
    return reply.send({ success: true, data: result, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to toggle group bookmark';
    return reply.code(400).send({ success: false, data: null, error: { code: 'GROUP_BOOKMARK_ERROR', message } });
  }
};

export const getBookmarkedGroupsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const groups = await bookmarksService.getBookmarkedGroups(userId);
    return reply.send({ success: true, data: { groups }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch bookmarked groups';
    return reply.code(500).send({ success: false, data: null, error: { code: 'BOOKMARKED_GROUPS_ERROR', message } });
  }
};

export const toggleListingBookmarkHandler = async (
  request: FastifyRequest<{ Params: { listingId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await bookmarksService.toggleListingBookmark(userId, request.params.listingId, requestIsAdult(request.user));
    return reply.send({ success: true, data: result, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to toggle listing bookmark';
    return reply.code(400).send({ success: false, data: null, error: { code: 'LISTING_BOOKMARK_ERROR', message } });
  }
};

export const getBookmarkedListingsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const listings = await bookmarksService.getBookmarkedListings(userId, requestIsAdult(request.user));
    return reply.send({ success: true, data: { listings }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch bookmarked listings';
    return reply.code(500).send({ success: false, data: null, error: { code: 'BOOKMARKED_LISTINGS_ERROR', message } });
  }
};

// ── Post bookmark labels ──────────────────────────────────────────────────────

export const getLabelsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const labels = await bookmarksService.getLabels(userId);
    return reply.send({ success: true, data: { labels }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to fetch labels';
    return reply.code(500).send({ success: false, data: null, error: { code: 'LABELS_ERROR', message } });
  }
};

export const createLabelHandler = async (
  request: FastifyRequest<{ Body: { name: string; color?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { name, color } = request.body;
    const label = await bookmarksService.createLabel(userId, name, color);
    return reply.code(201).send({ success: true, data: { label }, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to create label';
    return reply.code(400).send({ success: false, data: null, error: { code: 'CREATE_LABEL_ERROR', message } });
  }
};

export const deleteLabelHandler = async (
  request: FastifyRequest<{ Params: { labelId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await bookmarksService.deleteLabel(userId, request.params.labelId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to delete label';
    return reply.code(400).send({ success: false, data: null, error: { code: 'DELETE_LABEL_ERROR', message } });
  }
};

export const assignLabelHandler = async (
  request: FastifyRequest<{ Params: { postId: string }; Body: { label_id: string | null } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await bookmarksService.assignLabel(userId, request.params.postId, request.body.label_id);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to assign label';
    return reply.code(400).send({ success: false, data: null, error: { code: 'ASSIGN_LABEL_ERROR', message } });
  }
};
