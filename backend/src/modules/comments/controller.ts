import { FastifyReply, FastifyRequest } from 'fastify';
import { commentService } from './service.js';

interface JwtUser { id: string; role: string; }
type AuthReq = FastifyRequest & { user: JwtUser };

export const getCommentsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { post_id } = request.query as { post_id: string };
    const comments = await commentService.getComments(post_id);
    return reply.send({ success: true, data: { comments }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_COMMENTS_ERROR', message: error.message } });
  }
};

export const createCommentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { postId, content, parentCommentId } = request.body as any;
    const comment = await commentService.createComment({ postId, userId, content, parentCommentId });
    return reply.code(201).send({ success: true, data: { comment }, error: null });
  } catch (error: any) {
    const code = error.message.includes('не найден') ? 404 : 400;
    return reply.code(code).send({ success: false, error: { code: 'CREATE_COMMENT_ERROR', message: error.message } });
  }
};

export const updateCommentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };
    const comment = await commentService.updateComment(id, userId, content);
    return reply.send({ success: true, data: { comment }, error: null });
  } catch (error: any) {
    const code = error.message.includes('прав') ? 403 : 400;
    return reply.code(code).send({ success: false, error: { code: 'UPDATE_COMMENT_ERROR', message: error.message } });
  }
};

export const deleteCommentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId, role } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    await commentService.deleteComment(id, userId, role);
    return reply.send({ success: true, data: null, error: null });
  } catch (error: any) {
    const code = error.message.includes('прав') ? 403 : 400;
    return reply.code(code).send({ success: false, error: { code: 'DELETE_COMMENT_ERROR', message: error.message } });
  }
};

export const voteCommentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id: commentId } = request.params as { id: string };
    const { value } = request.body as { value: 1 | -1 };
    const result = await commentService.toggleVote(userId, commentId, value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'VOTE_COMMENT_ERROR', message: error.message } });
  }
};
