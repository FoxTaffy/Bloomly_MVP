import { FastifyReply, FastifyRequest } from 'fastify';
import { groupService } from './service.js';

interface JwtUser { id: string; role: string; }
type AuthReq = FastifyRequest & { user: JwtUser };

export const getGroupsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { type, page, limit } = request.query as any;
    const groups = await groupService.getGroups(type, parseInt(page) || 1, parseInt(limit) || 20);
    return reply.send({ success: true, data: { groups }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_GROUPS_ERROR', message: error.message } });
  }
};

export const getGroupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.params as { id: string };
    const group = await groupService.getGroupById(id);
    if (!group) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Группа не найдена' } });
    return reply.send({ success: true, data: { group }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_GROUP_ERROR', message: error.message } });
  }
};

export const createGroupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: creatorId } = (request as AuthReq).user;
    const { name, slug, description, type } = request.body as any;
    const group = await groupService.createGroup({ name, slug, description, type, creatorId });
    return reply.code(201).send({ success: true, data: { group }, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'CREATE_GROUP_ERROR', message: error.message } });
  }
};

export const joinGroupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id: groupId } = request.params as { id: string };
    const result = await groupService.toggleMembership(groupId, userId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'JOIN_GROUP_ERROR', message: error.message } });
  }
};
