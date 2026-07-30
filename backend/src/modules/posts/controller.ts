import { FastifyReply, FastifyRequest } from 'fastify';
import { postService } from './service.js';
import type { CreatePostInput, JwtUser, GetPostsQuery, GetPersonalizedQuery } from './types.js';
import { moderatePost, moderateComment } from '../automod/service.js';
import { isModerator, isAdmin } from '../../lib/roles.js';
import { requestIsAdult } from '../../lib/age.js';

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
      moderatePost(post.id, authorId, content ?? '').catch((err) => console.error('[AUTOMOD] analyzePost error:', err));
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
  request: FastifyRequest<{ Querystring: { q?: string; safeMode?: string; page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { q = '', safeMode, page, limit } = request.query;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const effectiveSafeMode = !requestIsAdult(request.user) || safeMode === 'true';
    const viewerId = (request.user as JwtUser | undefined)?.id;
    const posts = await postService.searchPosts(q, effectiveSafeMode, pageNum, limitNum, viewerId);
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

export const getPostsHandler = async (
  request: FastifyRequest<{ Querystring: GetPostsQuery }>,
  reply: FastifyReply,
) => {
  try {
    const query = request.query;
    if (typeof (query as any).safeMode === 'string') {
      (query as any).safeMode = (query as any).safeMode === 'true';
    }
    if (!requestIsAdult(request.user)) {
      (query as any).safeMode = true;
    }
    if (typeof (query as any).hasMedia === 'string') {
      (query as any).hasMedia = (query as any).hasMedia === 'true';
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
    const safeMode = !requestIsAdult(request.user) || (request.query as any).safeMode === 'true';
    const pageNum = request.query.page ? parseInt(request.query.page as string, 10) : 1;
    const limitNum = request.query.limit ? parseInt(request.query.limit as string, 10) : 30;

    const posts = await postService.getPersonalizedPosts(userId, safeMode, pageNum, limitNum);
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
    const ids = (request.query.ids || '').split(',').filter(Boolean);
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
    moderateComment(comment.id, userId).catch((err) => console.error('[AUTOMOD] moderateComment error:', err));
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
    return reply.code(500).send({ success: false, data: null, error: { code: 'GET_COMMENTS_ERROR', message } });
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
    const code = message === 'Not authorized' ? 403 : 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'DELETE_POST_ERROR', message } });
  }
};

export const editPostHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { content: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const { content } = request.body;
    const post = await postService.editPost(userId, postId, content);
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to edit post';
    const code = message === 'Not authorized' || message === 'Edit window expired' ? 403 : 400;
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
    const code = message === 'Not authorized' ? 403 : 400;
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
    const code = message === 'Not authorized' ? 403 : 400;
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
    const code = message === 'Not authorized' ? 403 : 400;
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
