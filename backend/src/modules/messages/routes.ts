import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  getConversationsHandler,
  getOrCreateConversationHandler,
  getUnreadCountHandler,
  getMessagesHandler,
  sendMessageHandler,
  markReadHandler,
  deleteMessageHandler,
  deleteConversationHandler,
  setArchivedHandler,
  createGroupHandler,
  updateGroupHandler,
  addMemberHandler,
  removeMemberHandler,
  setMemberRoleHandler,
  getGroupMembersHandler,
  setConversationLabelHandler,
  pinMessageHandler,
  unpinMessageHandler,
  getMediaStatsHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

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
  fastify.get('/conversations', auth, getConversationsHandler as any);
  fastify.post('/conversations', auth, getOrCreateConversationHandler as any);
  fastify.get('/conversations/unread', auth, getUnreadCountHandler as any);

  // Messages within a conversation
  fastify.get('/conversations/:id/messages', { schema: getMessagesSchema, onRequest: [fastify.authenticate] }, getMessagesHandler as any);
  fastify.post('/conversations/:id/messages', auth, sendMessageHandler as any);
  fastify.post('/conversations/:id/read', auth, markReadHandler as any);
  fastify.patch('/conversations/:id/archive', auth, setArchivedHandler as any);
  fastify.patch('/conversations/:id/label', auth, setConversationLabelHandler as any);
  fastify.delete('/conversations/:id', auth, deleteConversationHandler as any);

  // Pin / unpin
  fastify.put('/conversations/:id/pin',    auth, pinMessageHandler   as any);
  fastify.delete('/conversations/:id/pin', auth, unpinMessageHandler  as any);
  fastify.get('/conversations/:id/media-stats', auth, getMediaStatsHandler as any);

  // Individual message actions
  fastify.delete('/messages/:msgId', auth, deleteMessageHandler as any);

  // Group endpoints
  fastify.post('/groups', auth, createGroupHandler as any);
  fastify.patch('/conversations/:id/group', auth, updateGroupHandler as any);
  fastify.get('/conversations/:id/members', auth, getGroupMembersHandler as any);
  fastify.post('/conversations/:id/members', auth, addMemberHandler as any);
  fastify.delete('/conversations/:id/members/:userId', auth, removeMemberHandler as any);
  fastify.patch('/conversations/:id/members/:userId/role', auth, setMemberRoleHandler as any);
}
