import { FastifyRequest, FastifyReply } from 'fastify';
import { relationshipsService } from './service.js';

interface JwtUser { id: string; role: string }

export const sendRequestHandler = async (
  req: FastifyRequest<{ Body: { toId: string } }>,
  reply: FastifyReply,
) => {
  const { id } = req.user as JwtUser;
  const { toId } = req.body;
  if (!toId) return reply.code(400).send({ success: false, error: 'toId required' });
  const result = await relationshipsService.sendRequest(id, toId);
  return reply.send({ success: true, data: result, error: null });
};

export const acceptRequestHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const { id: userId } = req.user as JwtUser;
  const result = await relationshipsService.acceptRequest(req.params.id, userId);
  return reply.send({ success: true, data: result, error: null });
};

export const declineRequestHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const { id: userId } = req.user as JwtUser;
  const result = await relationshipsService.declineRequest(req.params.id, userId);
  return reply.send({ success: true, data: result, error: null });
};

export const cancelRequestHandler = async (
  req: FastifyRequest<{ Body: { toId: string } }>,
  reply: FastifyReply,
) => {
  const { id } = req.user as JwtUser;
  const { toId } = req.body;
  if (!toId) return reply.code(400).send({ success: false, error: 'toId required' });
  const result = await relationshipsService.cancelRequest(id, toId);
  return reply.send({ success: true, data: result, error: null });
};

export const clearPartnershipHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id } = req.user as JwtUser;
  const result = await relationshipsService.clearPartnership(id);
  return reply.send({ success: true, data: result, error: null });
};

export const getPendingHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id } = req.user as JwtUser;
  const requests = await relationshipsService.getPending(id);
  return reply.send({ success: true, data: { requests }, error: null });
};
