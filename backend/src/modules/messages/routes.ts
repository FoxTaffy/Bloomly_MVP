import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getConversationsHandler,
  getConversationByIdHandler,
  getOrCreateConversationHandler,
  getUnreadCountHandler,
  getMyGroupInboxCountsHandler,
  getMessagesHandler,
  sendMessageHandler,
  markReadHandler,
  deleteMessageHandler,
  editMessageHandler,
  toggleReactionHandler,
  deleteConversationHandler,
  setArchivedHandler,
  setMuteHandler,
  createGroupHandler,
  updateGroupHandler,
  addMemberHandler,
  removeMemberHandler,
  setMemberRoleHandler,
  getGroupMembersHandler,
  setConversationLabelHandler,
  payMessageHandler,
  pinMessageHandler,
  unpinMessageHandler,
  getMediaStatsHandler,
  getMediaMessagesHandler,
  registerPublicKeyHandler,
  getPublicKeysHandler,
  setConversationKeysHandler,
  getMyConversationKeyHandler,
  forwardMessageHandler,
} from './controller.js';

const getMessagesSchema = {
  querystring: {
    type: 'object',
    properties: {
      limit:  { type: 'integer', minimum: 1, maximum: 100, default: 40 },
      before: { type: 'string' },
    },
  },
};

export async function messagesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // Conversations
  fastify.get<RouteGenericOf<typeof getConversationsHandler>>('/conversations', auth, getConversationsHandler);
  fastify.post<RouteGenericOf<typeof getOrCreateConversationHandler>>('/conversations', auth, getOrCreateConversationHandler);
  fastify.get<RouteGenericOf<typeof getConversationByIdHandler>>('/conversations/:id', auth, getConversationByIdHandler);
  fastify.get<RouteGenericOf<typeof getUnreadCountHandler>>('/conversations/unread', auth, getUnreadCountHandler);
  fastify.get<RouteGenericOf<typeof getMyGroupInboxCountsHandler>>('/groups/inbox-counts', auth, getMyGroupInboxCountsHandler);

  // Messages within a conversation
  fastify.get<RouteGenericOf<typeof getMessagesHandler>>('/conversations/:id/messages', { schema: getMessagesSchema, onRequest: [fastify.authenticate] }, getMessagesHandler);
  fastify.post<RouteGenericOf<typeof sendMessageHandler>>('/conversations/:id/messages', auth, sendMessageHandler);
  fastify.post<RouteGenericOf<typeof markReadHandler>>('/conversations/:id/read', auth, markReadHandler);
  fastify.patch<RouteGenericOf<typeof setArchivedHandler>>('/conversations/:id/archive', auth, setArchivedHandler);
  fastify.patch<RouteGenericOf<typeof setMuteHandler>>('/conversations/:id/mute', auth, setMuteHandler);
  fastify.patch<RouteGenericOf<typeof setConversationLabelHandler>>('/conversations/:id/label', auth, setConversationLabelHandler);
  fastify.delete<RouteGenericOf<typeof deleteConversationHandler>>('/conversations/:id', auth, deleteConversationHandler);

  // Pin / unpin
  fastify.put<RouteGenericOf<typeof pinMessageHandler>>('/conversations/:id/pin',    auth, pinMessageHandler);
  fastify.delete<RouteGenericOf<typeof unpinMessageHandler>>('/conversations/:id/pin', auth, unpinMessageHandler);
  fastify.get<RouteGenericOf<typeof getMediaStatsHandler>>('/conversations/:id/media-stats', auth, getMediaStatsHandler);
  fastify.get<RouteGenericOf<typeof getMediaMessagesHandler>>('/conversations/:id/media', auth, getMediaMessagesHandler);

  // Individual message actions
  fastify.delete<RouteGenericOf<typeof deleteMessageHandler>>('/messages/:msgId', auth, deleteMessageHandler);
  fastify.patch<RouteGenericOf<typeof editMessageHandler>>('/messages/:msgId', auth, editMessageHandler);
  fastify.post<RouteGenericOf<typeof toggleReactionHandler>>('/messages/:msgId/reactions', auth, toggleReactionHandler);
  fastify.post<RouteGenericOf<typeof payMessageHandler>>('/messages/:msgId/pay', auth, payMessageHandler);

  // Group endpoints
  fastify.post<RouteGenericOf<typeof createGroupHandler>>('/groups', auth, createGroupHandler);
  fastify.patch<RouteGenericOf<typeof updateGroupHandler>>('/conversations/:id/group', auth, updateGroupHandler);
  fastify.get<RouteGenericOf<typeof getGroupMembersHandler>>('/conversations/:id/members', auth, getGroupMembersHandler);
  fastify.post<RouteGenericOf<typeof addMemberHandler>>('/conversations/:id/members', auth, addMemberHandler);
  fastify.delete<RouteGenericOf<typeof removeMemberHandler>>('/conversations/:id/members/:userId', auth, removeMemberHandler);
  fastify.patch<RouteGenericOf<typeof setMemberRoleHandler>>('/conversations/:id/members/:userId/role', auth, setMemberRoleHandler);

  // E2EE key management
  fastify.put<RouteGenericOf<typeof registerPublicKeyHandler>>('/keys', auth, registerPublicKeyHandler);
  fastify.post<RouteGenericOf<typeof getPublicKeysHandler>>('/keys/batch', auth, getPublicKeysHandler);
  fastify.put<RouteGenericOf<typeof setConversationKeysHandler>>('/conversations/:id/keys', auth, setConversationKeysHandler);
  fastify.get<RouteGenericOf<typeof getMyConversationKeyHandler>>('/conversations/:id/keys/me', auth, getMyConversationKeyHandler);

  // Forward
  fastify.post<RouteGenericOf<typeof forwardMessageHandler>>('/messages/:msgId/forward', auth, forwardMessageHandler);
}
