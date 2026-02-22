import { FastifyReply, FastifyRequest } from 'fastify';
import { userService } from './service.js';

interface JwtUser { id: string; role: string; }
type AuthReq = FastifyRequest & { user: JwtUser };

export const getUserByUsernameHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { username } = request.params as { username: string };
    const user = await userService.getUserByUsername(username);
    if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });
    return reply.send({ success: true, data: { user }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_USER_ERROR', message: error.message } });
  }
};

export const getUserByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const user = await userService.getUserById(id);
    if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });
    return reply.send({ success: true, data: { user }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_USER_ERROR', message: error.message } });
  }
};

export const updateUserHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    if (userId !== id) return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Нет прав' } });

    const body = request.body as any;
    const user = await userService.updateUser(userId, body);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'UPDATE_USER_ERROR', message: error.message } });
  }
};

export const followUserHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: followerId } = (request as AuthReq).user;
    const { id: followingId } = request.params as { id: string };
    const result = await userService.toggleFollow(followerId, followingId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'FOLLOW_ERROR', message: error.message } });
  }
};

export const blockUserHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: blockerId } = (request as AuthReq).user;
    const { id: blockedId } = request.params as { id: string };
    const result = await userService.toggleBlock(blockerId, blockedId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'BLOCK_ERROR', message: error.message } });
  }
};

export const getFollowersHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { page, limit } = request.query as any;
    const followers = await userService.getFollowers(id, parseInt(page) || 1, parseInt(limit) || 20);
    return reply.send({ success: true, data: { followers }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_FOLLOWERS_ERROR', message: error.message } });
  }
};

export const getFollowingHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const { page, limit } = request.query as any;
    const following = await userService.getFollowing(id, parseInt(page) || 1, parseInt(limit) || 20);
    return reply.send({ success: true, data: { following }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_FOLLOWING_ERROR', message: error.message } });
  }
};

export const getMeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = (request as AuthReq).user;
    const user = await userService.getUserById(id);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_ME_ERROR', message: error.message } });
  }
};
