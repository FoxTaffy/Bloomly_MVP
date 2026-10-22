import { FastifyRequest, FastifyReply } from 'fastify';
import { messageService } from './service.js';
import { moderateMessage } from '../automod/service.js';
import type { JwtUser, GetMessagesQuery } from './types.js';
import { errCode, errMessage, errStatus } from '../../lib/httpErrors.js';
import { logError } from '../../lib/logger.js';

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getConversationsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const archivedParam = (req.query as any).archived;
    const archived = archivedParam !== undefined ? archivedParam === 'true' : undefined;
    const label    = (req.query as any).label as string | undefined;
    const conversations = await messageService.getConversations(userId, archived, label);
    return reply.send({ success: true, data: { conversations }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function getConversationByIdHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { id } = req.params as { id: string };
    const conversation = await messageService.getConversationById(id, userId);
    if (!conversation) return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    return reply.send({ success: true, data: { conversation }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function getOrCreateConversationHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { userId: targetId } = req.body as { userId: string };
    if (!targetId) return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'userId is required' } });
    const conversation = await messageService.getOrCreateConversation(userId, targetId);
    return reply.code(200).send({ success: true, data: { conversation }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function getUnreadCountHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { total, personal, group } = await messageService.getUnreadCount(userId);
    return reply.send({ success: true, data: { count: total, personal, group }, error: null });
  } catch (e) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function getMyGroupInboxCountsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const counts = await messageService.getMyGroupInboxCounts(userId);
    return reply.send({ success: true, data: { counts }, error: null });
  } catch (e) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function sendMessageHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: {
    content?: string; encrypted_text?: string; file_url?: string; media_type?: string;
    reply_to_id?: string; type?: string; metadata?: Record<string, unknown>;
    attachments?: Array<{ url: string; media_type?: string }>;
  } }>,
  reply: FastifyReply,
) {
  try {
    const { id: senderId } = req.user as JwtUser;
    const { content = '', encrypted_text, file_url, media_type, reply_to_id, type, metadata, attachments } = req.body ?? {} as any;
    // Only these client-settable types bypass the normal text/media inference — anything
    // else (e.g. 'system') stays server-only.
    const cardType = type === 'payment_request' || type === 'tip' || type === 'post_share' || type === 'group_share' ? type : undefined;
    const message = await messageService.sendMessage({
      conversationId: req.params.id,
      senderId,
      content,
      encrypted_text,
      file_url,
      media_type,
      reply_to_id,
      type: cardType,
      metadata: cardType ? metadata : undefined,
      attachments: Array.isArray(attachments) ? attachments : undefined,
    });
    moderateMessage(senderId).catch(logError('[AUTOMOD] moderateMessage error'));
    return reply.code(201).send({ success: true, data: { message }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function payMessageHandler(
  req: FastifyRequest<{ Params: { msgId: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const result = await messageService.payPaymentRequest(req.params.msgId, userId);
    return reply.send({ success: true, data: result, error: null });
  } catch (e) {
    // Не хватило денег: клиенту нужен код и сколько не хватает, чтобы отправить на пополнение
    if (errCode(e) === 'INSUFFICIENT_FUNDS') {
      return reply.code(402).send({ success: false, data: null, error: { code: 'INSUFFICIENT_FUNDS', message: errMessage(e), details: (e as { details?: unknown }).details } });
    }
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 500).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function editMessageHandler(
  req: FastifyRequest<{ Params: { msgId: string }; Body: { text: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { text } = req.body ?? {} as any;
    if (typeof text !== 'string') {
      return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'text is required' } });
    }
    const message = await messageService.editMessage(req.params.msgId, userId, text);
    return reply.send({ success: true, data: { message }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function toggleReactionHandler(
  req: FastifyRequest<{ Params: { msgId: string }; Body: { emoji: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { emoji } = req.body ?? {} as any;
    if (typeof emoji !== 'string' || !emoji.length) {
      return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'emoji is required' } });
    }
    const message = await messageService.toggleReaction(req.params.msgId, userId, emoji);
    return reply.send({ success: true, data: { message }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function deleteConversationHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { scope: 'me' | 'all' } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const scope = req.query.scope === 'all' ? 'all' : 'me';
    await messageService.deleteConversation(req.params.id, userId, scope);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

export async function setMuteHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: { muted_until?: string | null; sound_muted?: boolean } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { muted_until, sound_muted } = req.body ?? {};
    const mutedUntil = muted_until === undefined ? undefined : (muted_until === null ? null : new Date(muted_until));
    await messageService.setMute(req.params.id, userId, mutedUntil, sound_muted);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

// ── Group endpoints ───────────────────────────────────────────────────────────

export async function createGroupHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { name, userIds, avatar_url, banner_url } = req.body as { name: string; userIds: string[]; avatar_url?: string; banner_url?: string };
    const conversation = await messageService.createGroup(userId, name, userIds, { avatar_url, banner_url });
    return reply.code(201).send({ success: true, data: { conversation }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'PIN_ERROR', message: errMessage(e) } });
  }
}

export async function unpinMessageHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { scope: 'all' | 'me' } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const scope = req.query.scope ?? 'all';
    await messageService.unpinMessage(req.params.id, userId, scope);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'PIN_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'STATS_ERROR', message: errMessage(e) } });
  }
}

export async function getMediaMessagesHandler(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { type: string; before?: string; limit?: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { type, before, limit } = req.query;
    const messages = await messageService.getMediaMessages(req.params.id, userId, type, before, limit ? Number(limit) : undefined);
    return reply.send({ success: true, data: { messages }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'STATS_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'MSG_ERROR', message: errMessage(e) } });
  }
}

// ── E2EE key management ─────────────────────────────────────────────────────

/** PUT /keys — register own public key */
export async function registerPublicKeyHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { publicKey } = req.body as { publicKey: string };
    if (!publicKey) return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'publicKey is required' } });
    const result = await messageService.registerPublicKey(userId, publicKey);
    return reply.send({ success: true, data: result, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 500).send({ success: false, data: null, error: { code: 'KEY_ERROR', message: errMessage(e) } });
  }
}

/** POST /keys/batch — get public keys for multiple users */
export async function getPublicKeysHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { userIds } = req.body as { userIds: string[] };
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'userIds array is required' } });
    }
    const keys = await messageService.getPublicKeys(userIds);
    return reply.send({ success: true, data: { keys }, error: null });
  } catch (e) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'KEY_ERROR', message: errMessage(e) } });
  }
}

/** PUT /conversations/:id/keys — set encrypted conv keys for all participants */
export async function setConversationKeysHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const { keys } = req.body as { keys: Record<string, string> };
    if (!keys || typeof keys !== 'object') {
      return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'keys map is required' } });
    }
    await messageService.setConversationKeys((req.params as any).id, userId, keys);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'KEY_ERROR', message: errMessage(e) } });
  }
}

/** GET /conversations/:id/keys/me — get my encrypted conv key */
export async function getMyConversationKeyHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const encryptedKey = await messageService.getMyConversationKey((req.params as any).id, userId);
    return reply.send({ success: true, data: { encryptedKey }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'KEY_ERROR', message: errMessage(e) } });
  }
}

// ── Forward message ─────────────────────────────────────────────────────────

/** POST /messages/:msgId/forward */
export async function forwardMessageHandler(
  req: FastifyRequest<{ Params: { msgId: string }; Body: { targetConversationId: string; encrypted_text?: string; text?: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: senderId } = req.user as JwtUser;
    const { targetConversationId, encrypted_text, text } = req.body ?? {} as any;
    if (!targetConversationId) {
      return reply.code(400).send({ success: false, data: null, error: { code: 'VALIDATION', message: 'targetConversationId is required' } });
    }
    const message = await messageService.forwardMessage(req.params.msgId, targetConversationId, senderId, encrypted_text, text);
    return reply.code(201).send({ success: true, data: { message }, error: null });
  } catch (e) {
    return reply.code(errStatus(e) ?? 400).send({ success: false, data: null, error: { code: 'FORWARD_ERROR', message: errMessage(e) } });
  }
}

