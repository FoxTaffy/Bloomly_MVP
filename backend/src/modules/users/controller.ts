import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersService } from './service.js';
import type { UpdateUserInput, JwtPayload } from './types.js';

export async function getUserHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const user = await usersService.getUserById(request.params.id);

  if (!user) {
    return reply.code(404).send({
      success: false,
      data: null,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
  }

  return reply.send({ success: true, data: { user }, error: null });
}

export async function updateMeHandler(
  request: FastifyRequest<{ Body: UpdateUserInput }>,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  const user = await usersService.updateUser(payload.id, request.body);

  return reply.send({ success: true, data: { user }, error: null });
}
