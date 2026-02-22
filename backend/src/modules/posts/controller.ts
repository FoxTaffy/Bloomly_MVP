import { FastifyReply, FastifyRequest } from 'fastify';
import { postService } from './service.js';

interface JwtUser { id: string; role: string; }
type AuthReq = FastifyRequest & { user: JwtUser };

export const createPostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: authorId } = (request as AuthReq).user;
    const { content, isNsfw, groupId } = request.body as { content: string; isNsfw?: boolean; groupId?: string };
    const post = await postService.createPost({ content, authorId, isNsfw, groupId });
    return reply.code(201).send({ success: true, data: { post }, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'CREATE_POST_ERROR', message: error.message } });
  }
};

export const getPostsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { sortBy, page, limit, userId, groupId, hashtag } = request.query as any;
    const posts = await postService.getPosts(
      sortBy === 'rating' ? 'rating' : 'date',
      parseInt(page) || 1,
      parseInt(limit) || 20,
      { userId, groupId, hashtag }
    );
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_POSTS_ERROR', message: error.message } });
  }
};

export const getPostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const post = await postService.getPost(id);
    if (!post) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Пост не найден' } });
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_POST_ERROR', message: error.message } });
  }
};

export const updatePostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId, role } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    const { content } = request.body as { content?: string };
    const post = await postService.updatePost(id, userId, { content });
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: any) {
    const code = error.message.includes('прав') ? 403 : 400;
    return reply.code(code).send({ success: false, error: { code: 'UPDATE_POST_ERROR', message: error.message } });
  }
};

export const deletePostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId, role } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    await postService.deletePost(id, userId, role);
    return reply.send({ success: true, data: null, error: null });
  } catch (error: any) {
    const code = error.message.includes('прав') ? 403 : 400;
    return reply.code(code).send({ success: false, error: { code: 'DELETE_POST_ERROR', message: error.message } });
  }
};

export const votePostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id: postId } = request.params as { id: string };
    const { value } = request.body as { value: 1 | -1 };
    const result = await postService.toggleVote(userId, postId, value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'VOTE_ERROR', message: error.message } });
  }
};

export const repostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: authorId } = (request as AuthReq).user;
    const { id: originalPostId } = request.params as { id: string };
    const { content } = request.body as { content?: string };
    const post = await postService.repost({ originalPostId, authorId, content });
    return reply.code(201).send({ success: true, data: { post }, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'REPOST_ERROR', message: error.message } });
  }
};

export const savePostHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id: postId } = request.params as { id: string };
    const result = await postService.toggleSave(userId, postId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'SAVE_ERROR', message: error.message } });
  }
};

export const getSavedPostsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { page, limit } = request.query as any;
    const posts = await postService.getSavedPosts(userId, parseInt(page) || 1, parseInt(limit) || 20);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_SAVED_ERROR', message: error.message } });
  }
};
