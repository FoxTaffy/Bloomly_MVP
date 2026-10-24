import { FastifyReply, FastifyRequest } from 'fastify';
import { pagination, idList } from '../../lib/pagination.js';
import { postService } from './service.js';
import { followsService } from '../follows/service.js';
import type { CreatePostInput, EditPostInput, JwtUser, GetPostsQuery, GetPersonalizedQuery } from './types.js';
import { moderatePost, moderateComment } from '../automod/service.js';
import { isModerator, isAdmin } from '../../lib/roles.js';
import { requestIsAdult } from '../../lib/age.js';
import { resolveNsfwMode } from '../../lib/contentFilters.js';
import { logError } from '../../lib/logger.js';
import { errCode, errMessage, errStatus } from '../../lib/httpErrors.js';
import { boostPost, getBoostInfo } from './boost.service.js';

export const getTrendingTagsHandler = async (
  request: FastifyRequest<{ Querystring: { includeNsfw?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const includeNsfw = request.query.includeNsfw === 'true';
    const tags = await postService.getTrendingTags(includeNsfw);
    return reply.send({ success: true, data: { tags }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch trending tags';
    return reply.code(500).send({ success: false, data: null, error: { code: 'TRENDING_TAGS_ERROR', message } });
  }
};

export const suggestTagsHandler = async (
  request: FastifyRequest<{ Querystring: { q?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const q = request.query.q ?? '';
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 8;
    const tags = await postService.suggestTags(q, limit);
    return reply.send({ success: true, data: { tags }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to suggest tags';
    return reply.code(500).send({ success: false, data: null, error: { code: 'SUGGEST_TAGS_ERROR', message } });
  }
};

export const createPostHandler = async (
  request: FastifyRequest<{ Body: { content: string; isNsfw?: boolean; isAiGenerated?: boolean; subscriberOnly?: boolean; isPaid?: boolean; price?: number; rewardForUserId?: string; videoTitle?: string; videoDescription?: string; category?: string; tags?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: authorId } = request.user as JwtUser;
    const { content, isNsfw, isAiGenerated, subscriberOnly, isPaid, price, rewardForUserId, videoTitle, videoDescription, category, tags, mediaUrls, mediaOriginalUrls } = request.body as any;
    const input: CreatePostInput = { content, authorId, isNsfw, isAiGenerated, subscriberOnly, isPaid, price, rewardForUserId, videoTitle, videoDescription, category, tags, mediaUrls, mediaOriginalUrls };
    const post = await postService.createPost(input);
    // fire-and-forget automod check (does not block the response)
    if (post) {
      moderatePost(post.id, authorId, content ?? '').catch(logError('[AUTOMOD] analyzePost error'));
    }
    return reply.code(201).send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create post';
    return reply.code(400).send({
      success: false,
      data: null,
      error: { code: 'CREATE_POST_ERROR', message },
    });
  }
};

export const getPostByIdHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewerId = (request.user as JwtUser | undefined)?.id;
    const post = await postService.getPostById(request.params.id, viewerId);
    if (!post) return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Post not found' } });
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const message = error instanceof Error ? error.message : 'Failed to fetch post';
    return reply.code(statusCode).send({ success: false, data: null, error: { code: 'FETCH_POST_ERROR', message } });
  }
};

export const votePostHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { value: 1 | -1 } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const { value } = request.body;
    const result = await postService.toggleVote(userId, postId, value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to register vote';
    return reply.code(400).send({
      success: false,
      data: null,
      error: { code: 'VOTE_ERROR', message },
    });
  }
};

export const searchPostsHandler = async (
  request: FastifyRequest<{ Querystring: { q?: string; safeMode?: string; nsfw?: string; page?: string; limit?: string; synonyms?: string; sort?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { q = '', safeMode, nsfw, page, limit, synonyms, sort } = request.query;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const nsfwMode = resolveNsfwMode({ nsfw, safeMode, isAdult: requestIsAdult(request.user) });
    const viewerId = (request.user as JwtUser | undefined)?.id;
    const posts = await postService.searchPosts(q, nsfwMode, pageNum, limitNum, viewerId, synonyms !== 'false', sort === 'new' ? 'new' : 'relevance');
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search posts';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'SEARCH_POSTS_ERROR', message },
    });
  }
};

export const searchTagsHandler = async (
  request: FastifyRequest<{ Querystring: { q?: string; safeMode?: string; nsfw?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { q = '', safeMode, nsfw, limit } = request.query;
    const nsfwMode = resolveNsfwMode({ nsfw, safeMode, isAdult: requestIsAdult(request.user) });
    const limitNum = Math.min(20, Math.max(1, limit ? parseInt(limit, 10) || 8 : 8));
    const tags = await postService.searchTags(q, nsfwMode, limitNum);
    return reply.send({ success: true, data: { tags }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search tags';
    return reply.code(500).send({ success: false, data: null, error: { code: 'SEARCH_TAGS_ERROR', message } });
  }
};

export const getPostsHandler = async (
  request: FastifyRequest<{ Querystring: GetPostsQuery }>,
  reply: FastifyReply,
) => {
  try {
    const query = request.query;
    query.nsfwMode = resolveNsfwMode({ nsfw: query.nsfw, safeMode: query.safeMode, isAdult: requestIsAdult(request.user) });
    if (typeof query.hasMedia === 'string') {
      query.hasMedia = query.hasMedia === 'true';
    }
    const viewerId = (request.user as JwtUser | undefined)?.id;
    const posts = await postService.getPosts(query, viewerId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch posts';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'GET_POSTS_ERROR', message },
    });
  }
};

export const getPersonalizedPostsHandler = async (
  request: FastifyRequest<{ Querystring: GetPersonalizedQuery }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const nsfwMode = resolveNsfwMode({ nsfw: request.query.nsfw, safeMode: request.query.safeMode, isAdult: requestIsAdult(request.user) });
    const { page: pageNum, limit: limitNum } = pagination(request.query.page, request.query.limit, 30, 50);

    const posts = await postService.getPersonalizedPosts(userId, nsfwMode, pageNum, limitNum);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch personalized posts';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'GET_PERSONALIZED_ERROR', message },
    });
  }
};

const CHECK_NEW_MODES = ['for-you', 'subscriptions', 'news', 'photos', 'nsfw'] as const;
type CheckNewMode = (typeof CHECK_NEW_MODES)[number];

/** GET /posts/check-new?mode=…&since=<ISO>: сколько постов новее `since` в выдаче вкладки. Только число, без самих постов. */
export const checkNewPostsHandler = async (
  request: FastifyRequest<{ Querystring: { mode?: string; since?: string; nsfw?: string; safeMode?: string } }>,
  reply: FastifyReply,
) => {
  const { mode, since: sinceRaw } = request.query;
  const bad = (message: string) => reply.code(400).send({ success: false, data: null, error: { code: 'CHECK_NEW_INVALID', message } });
  if (!mode || !(CHECK_NEW_MODES as readonly string[]).includes(mode)) return bad('Unknown feed mode');
  const sinceInput = new Date(sinceRaw ?? '');
  if (!sinceRaw || Number.isNaN(sinceInput.getTime())) return bad('Invalid since');
  // В БД время с микросекундами, в JS — с миллисекундами: без запаса самый свежий из показанных постов считался бы «новее» самого себя
  const since = new Date(sinceInput.getTime() + 1);
  try {
    const { id: userId } = request.user as JwtUser;
    // Вкладка NSFW всегда спрашивает режим show, как и сама выдача
    const nsfwMode = resolveNsfwMode({
      nsfw: mode === 'nsfw' ? 'show' : request.query.nsfw,
      safeMode: request.query.safeMode,
      isAdult: requestIsAdult(request.user),
    });
    const count = (mode as CheckNewMode) === 'subscriptions'
      ? await followsService.countNewSince(userId, nsfwMode, since)
      : await postService.countNewSince(userId, mode as 'for-you' | 'news' | 'photos' | 'nsfw', since, nsfwMode);
    return reply.send({ success: true, data: { count }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check new posts';
    return reply.code(500).send({ success: false, data: null, error: { code: 'CHECK_NEW_ERROR', message } });
  }
};

export const repawPostHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const result = await postService.toggleRepaw(userId, postId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to repaw';
    return reply.code(400).send({ success: false, data: null, error: { code: 'REPAW_ERROR', message } });
  }
};

export const favouritePostHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const result = await postService.toggleFavourite(userId, postId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to favourite';
    return reply.code(400).send({ success: false, data: null, error: { code: 'FAVOURITE_ERROR', message } });
  }
};

export const getUserPostStatusHandler = async (
  request: FastifyRequest<{ Querystring: { ids: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const ids = idList(request.query.ids);
    if (!ids.length) return reply.send({ success: true, data: [], error: null });
    const result = await postService.getPostStatus(userId, ids);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get post status';
    return reply.code(500).send({ success: false, data: null, error: { code: 'STATUS_ERROR', message } });
  }
};

export const createCommentHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { content: string; parentId?: string; type?: string; file_url?: string; groupId?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const { content, parentId, type, file_url, groupId } = request.body;
    const comment = await postService.createComment(userId, postId, content, parentId, type, file_url, groupId);
    // fire-and-forget automod burst check (does not block the response)
    moderateComment(comment.id, userId).catch(logError('[AUTOMOD] moderateComment error'));
    return reply.code(201).send({ success: true, data: { comment }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create comment';
    const statusCode = (error as any)?.statusCode ?? 400;
    return reply.code(statusCode).send({ success: false, data: null, error: { code: 'COMMENT_ERROR', message } });
  }
};

export const getCommentsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: postId } = request.params;
    const viewer = request.user as { id: string; role: string } | undefined;
    const [comments, canModerate] = await Promise.all([
      postService.getComments(postId, viewer?.id),
      postService.canManageComments(postId, viewer?.id, viewer ? isModerator(viewer.role) : false),
    ]);
    return reply.send({ success: true, data: { comments, canModerate }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch comments';
    return reply.code((error as { statusCode?: number })?.statusCode ?? 500).send({ success: false, data: null, error: { code: 'GET_COMMENTS_ERROR', message } });
  }
};

export const voteCommentHandler = async (
  request: FastifyRequest<{ Params: { commentId: string }; Body: { value: 1 | -1 } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { commentId } = request.params;
    const { value } = request.body;
    if (value !== 1 && value !== -1) {
      return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_VOTE', message: 'Vote must be 1 or -1' } });
    }

    const result = await postService.voteComment(userId, commentId, value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to vote comment';
    return reply.code(400).send({ success: false, data: null, error: { code: 'COMMENT_VOTE_ERROR', message } });
  }
};

export const deletePostHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId, role } = request.user as JwtUser;
    const { id: postId } = request.params;
    await postService.deletePost(userId, postId, isAdmin(role));
    return reply.send({ success: true, data: null, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete post';
    const code = (error as { statusCode?: number })?.statusCode ?? (message === 'Not authorized' ? 403 : 400);
    return reply.code(code).send({ success: false, data: null, error: { code: 'DELETE_POST_ERROR', message } });
  }
};

export const editPostHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: EditPostInput }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const { content, isNsfw, isAiGenerated, tags, addMediaUrls, addMediaOriginalUrls, listingId } = request.body;
    const post = await postService.editPost(userId, postId, { content, isNsfw, isAiGenerated, tags, addMediaUrls, addMediaOriginalUrls, listingId });
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to edit post';
    const code = (error as { statusCode?: number })?.statusCode ?? (message === 'Not authorized' || message === 'Edit window expired' ? 403 : 400);
    return reply.code(code).send({ success: false, data: null, error: { code: 'EDIT_POST_ERROR', message } });
  }
};

export const deleteCommentHandler = async (
  request: FastifyRequest<{ Params: { commentId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId, role } = request.user as JwtUser;
    const { commentId } = request.params;
    await postService.deleteComment(userId, commentId, isModerator(role));
    return reply.send({ success: true, data: null, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete comment';
    const code = (error as { statusCode?: number })?.statusCode ?? (message === 'Not authorized' ? 403 : 400);
    return reply.code(code).send({ success: false, data: null, error: { code: 'DELETE_COMMENT_ERROR', message } });
  }
};

export const getUserPostsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = request.user as JwtUser | undefined;
    const posts = await postService.getUserPosts(request.params.userId, undefined, viewer?.id);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user posts';
    return reply.code((error as any)?.statusCode ?? 500).send({ success: false, data: null, error: { code: 'USER_POSTS_ERROR', message } });
  }
};

export const getUserMediaPostsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = request.user as JwtUser | undefined;
    const posts = await postService.getUserMediaPosts(request.params.userId, undefined, viewer?.id);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user media posts';
    return reply.code((error as any)?.statusCode ?? 500).send({ success: false, data: null, error: { code: 'USER_MEDIA_ERROR', message } });
  }
};

export const getUserRepawsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = request.user as JwtUser | undefined;
    const posts = await postService.getUserRepawedPosts(request.params.userId, undefined, viewer?.id);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user repaws';
    return reply.code((error as any)?.statusCode ?? 500).send({ success: false, data: null, error: { code: 'USER_REPAWS_ERROR', message } });
  }
};

export const getUserFavouritesHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = request.user as JwtUser | undefined;
    const posts = await postService.getUserFavouritePosts(request.params.userId, undefined, viewer?.id);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user likes';
    return reply.code((error as any)?.statusCode ?? 500).send({ success: false, data: null, error: { code: 'USER_LIKES_ERROR', message } });
  }
};

export const recordPostViewHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = request.user as JwtUser | undefined;
    const result = await postService.recordView(request.params.id, viewer?.id);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record view';
    return reply.code(500).send({ success: false, data: null, error: { code: 'VIEW_ERROR', message } });
  }
};

export const toggleArchivePostHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await postService.toggleArchive(userId, request.params.id);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to archive post';
    const code = (error as { statusCode?: number })?.statusCode ?? (message === 'Not authorized' ? 403 : 400);
    return reply.code(code).send({ success: false, data: null, error: { code: 'ARCHIVE_ERROR', message } });
  }
};

export const setNotInterestedHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { value: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await postService.setNotInterested(userId, request.params.id, request.body.value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update';
    return reply.code(400).send({ success: false, data: null, error: { code: 'NOT_INTERESTED_ERROR', message } });
  }
};

export const toggleCommentsDisabledHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await postService.toggleCommentsDisabled(userId, request.params.id);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to toggle comments';
    const code = (error as { statusCode?: number })?.statusCode ?? (message === 'Not authorized' ? 403 : 400);
    return reply.code(code).send({ success: false, data: null, error: { code: 'COMMENTS_TOGGLE_ERROR', message } });
  }
};

export const getUserArchivedPostsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: viewerId } = request.user as JwtUser;
    const posts = await postService.getUserArchivedPosts(request.params.userId, viewerId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch archived posts';
    return reply.code((error as any)?.statusCode ?? 500).send({ success: false, data: null, error: { code: 'ARCHIVED_POSTS_ERROR', message } });
  }
};

export const getPostStatsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const stats = await postService.getPostStats(userId, request.params.id);
    return reply.send({ success: true, data: { stats }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch post stats';
    const code = (error as any)?.statusCode ?? 500;
    return reply.code(code).send({ success: false, data: null, error: { code: 'POST_STATS_ERROR', message } });
  }
};

export const getTagInsightsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const insights = await postService.getUserTagInsights(userId);
    return reply.send({ success: true, data: { insights }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tag insights';
    return reply.code(500).send({ success: false, data: null, error: { code: 'TAG_INSIGHTS_ERROR', message } });
  }
};

export const getMyBookmarksHandler = async (
  request: FastifyRequest<{ Querystring: { skip?: string; take?: string; sort?: string; hasMedia?: string; labelId?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const skip     = parseInt(request.query.skip  ?? '0',  10);
    const take     = Math.min(parseInt(request.query.take  ?? '20', 10), 50);
    const sort     = (request.query.sort ?? 'newest') as 'newest' | 'oldest' | 'top';
    const hasMedia = request.query.hasMedia === 'true' ? true : undefined;
    const labelId  = request.query.labelId === 'none' ? null
                   : request.query.labelId ?? undefined;
    const result   = await postService.getMyBookmarks(userId, { skip, take, sort, hasMedia, labelId });
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch bookmarks';
    return reply.code(500).send({ success: false, data: null, error: { code: 'BOOKMARKS_ERROR', message } });
  }
};

export const getMyPostsLikedByHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: ownerId } = request.user as JwtUser;
    const result = await postService.getMyPostsLikedBy(ownerId, request.params.userId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch liked posts';
    return reply.code(500).send({ success: false, data: null, error: { code: 'LIKED_BY_ERROR', message } });
  }
};

// ── Буст поста в ленту ────────────────────────────────────────────────────────

export const getBoostInfoHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const { id: userId } = request.user as JwtUser;
  return reply.send({ success: true, data: await getBoostInfo(userId), error: null });
};

export const boostPostHandler = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const { id: userId } = request.user as JwtUser;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'POST_NOT_FOUND', message: 'Post not found or not yours' } });
  }
  try {
    return reply.send({ success: true, data: await boostPost(userId, request.params.id), error: null });
  } catch (error: unknown) {
    const status = errStatus(error);
    if (status && status < 500) {
      return reply.code(status).send({ success: false, data: null, error: { code: errCode(error) ?? 'BOOST_ERROR', message: errMessage(error), details: (error as { details?: unknown }).details } });
    }
    logError('[posts.boost] failed')(error);
    return reply.code(500).send({ success: false, data: null, error: { code: 'BOOST_ERROR', message: 'Failed to boost post' } });
  }
};
