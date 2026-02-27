import { FastifyReply, FastifyRequest } from 'fastify';
import { postService } from './service.js';
import type { CreatePostInput, JwtUser, GetPostsQuery, GetPersonalizedQuery } from './types.js';

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

export const createPostHandler = async (
  request: FastifyRequest<{ Body: { content: string; isNsfw?: boolean; category?: string; tags?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: authorId } = request.user as JwtUser;
    const { content, isNsfw, category, tags, mediaUrls } = request.body as any;
    const input: CreatePostInput = { content, authorId, isNsfw, category, tags, mediaUrls };
    const post = await postService.createPost(input);
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
    const post = await postService.getPostById(request.params.id);
    if (!post) return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Post not found' } });
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch post';
    return reply.code(500).send({ success: false, data: null, error: { code: 'FETCH_POST_ERROR', message } });
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

export const getPostsHandler = async (
  request: FastifyRequest<{ Querystring: GetPostsQuery }>,
  reply: FastifyReply,
) => {
  try {
    const query = request.query;
    if (typeof (query as any).safeMode === 'string') {
      (query as any).safeMode = (query as any).safeMode === 'true';
    }
    if (typeof (query as any).hasMedia === 'string') {
      (query as any).hasMedia = (query as any).hasMedia === 'true';
    }
    const posts = await postService.getPosts(query);
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
    const safeMode = (request.query as any).safeMode === 'true';
    const posts = await postService.getPersonalizedPosts(userId, safeMode);
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
  request: FastifyRequest<{ Params: { id: string }; Body: { content: string; parentId?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: postId } = request.params;
    const { content, parentId } = request.body;
    const comment = await postService.createComment(userId, postId, content, parentId);
    return reply.code(201).send({ success: true, data: { comment }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create comment';
    return reply.code(400).send({ success: false, data: null, error: { code: 'COMMENT_ERROR', message } });
  }
};

export const getCommentsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: postId } = request.params;
    const comments = await postService.getComments(postId);
    return reply.send({ success: true, data: { comments }, error: null });
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
    await postService.deletePost(userId, postId, role === 'admin');
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
    const code = message === 'Not authorized' ? 403 : 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'EDIT_POST_ERROR', message } });
  }
};

export const deleteCommentHandler = async (
  request: FastifyRequest<{ Params: { commentId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { commentId } = request.params;
    await postService.deleteComment(userId, commentId);
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
    const posts = await postService.getUserPosts(request.params.userId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user posts';
    return reply.code(500).send({ success: false, data: null, error: { code: 'USER_POSTS_ERROR', message } });
  }
};

export const getUserMediaPostsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const posts = await postService.getUserMediaPosts(request.params.userId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user media posts';
    return reply.code(500).send({ success: false, data: null, error: { code: 'USER_MEDIA_ERROR', message } });
  }
};

export const getUserRepawsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const posts = await postService.getUserRepawedPosts(request.params.userId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user repaws';
    return reply.code(500).send({ success: false, data: null, error: { code: 'USER_REPAWS_ERROR', message } });
  }
};

export const getUserFavouritesHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const posts = await postService.getUserFavouritePosts(request.params.userId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user likes';
    return reply.code(500).send({ success: false, data: null, error: { code: 'USER_LIKES_ERROR', message } });
  }
};
