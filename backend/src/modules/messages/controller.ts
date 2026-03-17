import { FastifyRequest, FastifyReply } from 'fastify';
import { messageService } from './service.js';
import type { JwtUser, GetMessagesQuery } from './types.js';

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversationsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const archived = (req.query as any).archived === 'true';
    const label    = (req.query as any).label as string | undefined;
    const conversations = await messageService.getConversations(userId, archived, label);
    return reply.send({ success: true, data: { conversations }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function getOrCreateConversationHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { userId: targetId } = req.body as { userId: string };
    if (!targetId) return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'userId is required' } });
    const conversation = await messageService.getOrCreateConversation(userId, targetId);
    return reply.code(200).send({ success: true, data: { conversation }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function getUnreadCountHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const count = await messageService.getUnreadCount(userId);
    return reply.send({ success: true, data: { count }, error: null });
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function getMessagesHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: GetMessagesQuery }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const messages = await messageService.getMessages(req.params.id, userId, {
      before: req.query.before,
      limit,
    });
    return reply.send({ success: true, data: { messages }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function sendMessageHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { content: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: senderId } = req.user as JwtUser;
    const { content } = req.body;
    const message = await messageService.sendMessage({
      conversationId: req.params.id,
      senderId,
      content,
    });
    return reply.code(201).send({ success: true, data: { message }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function markReadHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    await messageService.markRead(req.params.id, userId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function deleteMessageHandler(
  req: FastifyRequest<{ Params: { msgId: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    await messageService.deleteMessage(req.params.msgId, userId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function deleteConversationHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { scope: 'me' | 'all' } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const scope = (req.query as any).scope === 'all' ? 'all' : 'me';
    await messageService.deleteConversation(req.params.id, userId, scope);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function setArchivedHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { archived: boolean } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { archived } = req.body;
    await messageService.setArchived(req.params.id, userId, archived);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

// ── Group endpoints ───────────────────────────────────────────────────────────

export async function createGroupHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { name, userIds, avatar_url, banner_url } = req.body as { name: string; userIds: string[]; avatar_url?: string; banner_url?: string };
    const conversation = await messageService.createGroup(userId, name, userIds, { avatar_url, banner_url });
    return reply.code(201).send({ success: true, data: { conversation }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function updateGroupHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { name?: string; avatar_url?: string; banner_url?: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { name, avatar_url, banner_url } = req.body;
    await messageService.updateGroup(req.params.id, userId, { name, avatar_url, banner_url });
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function addMemberHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { userId: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: adminId } = req.user as JwtUser;
    const { userId: targetUserId } = req.body;
    const participant = await messageService.addMember(req.params.id, adminId, targetUserId);
    return reply.code(201).send({ success: true, data: { participant }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function removeMemberHandler(
  req: FastifyRequest<{ Params: { id: string; userId: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: adminId } = req.user as JwtUser;
    await messageService.removeMember(req.params.id, adminId, req.params.userId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function setMemberRoleHandler(
  req: FastifyRequest<{ Params: { id: string; userId: string }; Body: { role: 'admin' | 'member' } }>,
  reply: FastifyReply,
) {
  try {
    const { id: adminId } = req.user as JwtUser;
    const { role } = req.body;
    await messageService.setMemberRole(req.params.id, adminId, req.params.userId, role);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

export async function getGroupMembersHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const members = await messageService.getGroupMembers(req.params.id, userId);
    return reply.send({ success: true, data: { members }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

// ── Pin / Unpin ────────────────────────────────────────────────────────────────

export async function pinMessageHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { messageId: string; scope: 'all' | 'me' } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { messageId, scope } = req.body;
    if (!messageId) return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'messageId is required' } });
    const msg = await messageService.pinMessage(req.params.id, userId, messageId, scope ?? 'all');
    return reply.send({ success: true, data: { message: msg }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'PIN_ERROR', message: e.message } });
  }
}

export async function unpinMessageHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { scope: 'all' | 'me' } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const scope = (req.query as any).scope ?? 'all';
    await messageService.unpinMessage(req.params.id, userId, scope);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'PIN_ERROR', message: e.message } });
  }
}

export async function getMediaStatsHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const stats = await messageService.getMediaStats(req.params.id, userId);
    return reply.send({ success: true, data: { stats }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'STATS_ERROR', message: e.message } });
  }
}

/**
 * PATCH /conversations/:id/label
 * Body: { label: 'default' | 'customer' }
 */
export async function setConversationLabelHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { label: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { label } = req.body as { label: string };
    if (!label) return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'label is required' } });
    await messageService.setConversationLabel(req.params.id, userId, label);
    return reply.send({ success: true, data: { label }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: e.message } });
  }
}

