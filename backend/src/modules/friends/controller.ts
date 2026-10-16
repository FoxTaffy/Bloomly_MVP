import type { FastifyRequest, FastifyReply } from 'fastify';
import { friendsService } from './service.js';
import { presence } from '../realtime/presence.js';

type AuthRequest = FastifyRequest;

export async function sendRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { targetId } = req.body as { targetId: string };
  if (!targetId) return reply.code(400).send({ error: 'targetId required' });
  try {
    const result = await friendsService.sendRequest((req.user as any).id, targetId);
    return reply.code(201).send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: err.message });
  }
}

export async function acceptRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.acceptRequest(id, (req.user as any).id);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: err.message });
  }
}

export async function rejectRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.rejectRequest(id, (req.user as any).id);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: err.message });
  }
}

export async function cancelRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.cancelRequest(id, (req.user as any).id);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: err.message });
  }
}

export async function removeFriendHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.removeFriend((req.user as any).id, id);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: err.message });
  }
}

export async function getIncomingRequestsHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getIncomingRequests((req.user as any).id);
  return reply.send({ success: true, data: result });
}

export async function getOutgoingRequestsHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getOutgoingRequests((req.user as any).id);
  return reply.send({ success: true, data: result });
}

export async function getFriendsHandler(req: AuthRequest, reply: FastifyReply) {
  const { filter } = req.query as { filter?: string }
  const userId = (req.user as any).id

  const onlineSet = presence.onlineIds()
  const deviceById = new Map([...onlineSet].map((id) => [id, presence.deviceOf(id) ?? '']))

  const all = await friendsService.getFriends(userId, onlineSet, deviceById)
  const result = filter === 'online' ? all.filter((f) => f.online) : all
  return reply.send({ success: true, data: result })
}

export async function getFollowersHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getFollowers((req.user as any).id)
  return reply.send({ success: true, data: result })
}

export async function getFollowingHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getFollowing((req.user as any).id)
  return reply.send({ success: true, data: result })
}

export async function getBirthdaysHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getUpcomingBirthdays((req.user as any).id);
  return reply.send({ success: true, data: result });
}

export async function getNearbyBirthdaysHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getNearbyBirthdays((req.user as any).id);
  return reply.send({ success: true, data: result });
}

export async function getSuggestionsHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getSuggestions((req.user as any).id);
  return reply.send({ success: true, data: result });
}

export async function getFriendStatusHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const result = await friendsService.getStatus((req.user as any).id, id);
  return reply.send({ success: true, data: result });
}
