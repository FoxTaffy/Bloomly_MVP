import { FastifyReply, FastifyRequest } from 'fastify';
import { postService } from './service.js';
import type { CreatePostInput, JwtUser, PostSortBy } from './types.js';

export const createPostHandler = async (
  request: FastifyRequest<{ Body: { content: string; isNsfw?: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: authorId } = request.user as JwtUser;
    const { content, isNsfw } = request.body;
    const input: CreatePostInput = { content, authorId, isNsfw };
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
  request: FastifyRequest<{ Querystring: { sortBy?: PostSortBy } }>,
  reply: FastifyReply,
) => {
  try {
    const { sortBy } = request.query;
    const posts = await postService.getPosts(sortBy === 'rating' ? 'rating' : 'date');
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
