import type { FastifyRequest, FastifyReply } from 'fastify';
import { friendsService } from './service.js';
import { presence } from '../realtime/presence.js';
import { errMessage } from '../../lib/httpErrors.js';
import { logAction } from '../../lib/actionLog.js';

type AuthRequest = FastifyRequest;

export async function sendRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { targetId } = req.body as { targetId: string };
  if (!targetId) return reply.code(400).send({ error: 'targetId required' });
  try {
    const result = await friendsService.sendRequest(req.user.id, targetId);
    return reply.code(201).send({ success: true, data: result });
  } catch (err) {
    await logAction({ userId: req.user.id, action: 'friend.request', targetId: targetId as string, error: err });
    return reply.code(400).send({ success: false, error: errMessage(err) });
  }
}

export async function acceptRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.acceptRequest(id, req.user.id);
    return reply.send({ success: true, data: result });
  } catch (err) {
    await logAction({ userId: req.user.id, action: 'friend.accept', targetId: id as string, error: err });
    return reply.code(400).send({ success: false, error: errMessage(err) });
  }
}

export async function rejectRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.rejectRequest(id, req.user.id);
    return reply.send({ success: true, data: result });
  } catch (err) {
    await logAction({ userId: req.user.id, action: 'friend.reject', targetId: id as string, error: err });
    return reply.code(400).send({ success: false, error: errMessage(err) });
  }
}

export async function cancelRequestHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.cancelRequest(id, req.user.id);
    return reply.send({ success: true, data: result });
  } catch (err) {
    await logAction({ userId: req.user.id, action: 'friend.cancel', targetId: id as string, error: err });
    return reply.code(400).send({ success: false, error: errMessage(err) });
  }
}

export async function removeFriendHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const result = await friendsService.removeFriend(req.user.id, id);
    return reply.send({ success: true, data: result });
  } catch (err) {
    await logAction({ userId: req.user.id, action: 'friend.remove', targetId: id as string, error: err });
    return reply.code(400).send({ success: false, error: errMessage(err) });
  }
}

export async function getIncomingRequestsHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getIncomingRequests(req.user.id);
  return reply.send({ success: true, data: result });
}

export async function getOutgoingRequestsHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getOutgoingRequests(req.user.id);
  return reply.send({ success: true, data: result });
}

export async function getFriendsHandler(req: AuthRequest, reply: FastifyReply) {
  const { filter } = req.query as { filter?: string }
  const userId = req.user.id

  const onlineSet = presence.onlineIds()
  const deviceById = new Map([...onlineSet].map((id) => [id, presence.deviceOf(id) ?? '']))

  const all = await friendsService.getFriends(userId, onlineSet, deviceById)
  const result = filter === 'online' ? all.filter((f) => f.online) : all
  return reply.send({ success: true, data: result })
}

export async function getFollowersHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getFollowers(req.user.id)
  return reply.send({ success: true, data: result })
}

export async function getFollowingHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getFollowing(req.user.id)
  return reply.send({ success: true, data: result })
}

export async function getBirthdaysHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getUpcomingBirthdays(req.user.id);
  return reply.send({ success: true, data: result });
}

export async function getNearbyBirthdaysHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getNearbyBirthdays(req.user.id);
  return reply.send({ success: true, data: result });
}

export async function getSuggestionsHandler(req: AuthRequest, reply: FastifyReply) {
  const result = await friendsService.getSuggestions(req.user.id);
  return reply.send({ success: true, data: result });
}

export async function getFriendStatusHandler(req: AuthRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const result = await friendsService.getStatus(req.user.id, id);
  return reply.send({ success: true, data: result });
}
