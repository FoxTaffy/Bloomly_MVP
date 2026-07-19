import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  listGroupsHandler,
  getGroupHandler,
  createGroupHandler,
  updateGroupHandler,
  deleteGroupHandler,
  joinGroupHandler,
  leaveGroupHandler,
  getMembersHandler,
  setMemberRoleHandler,
  removeMemberHandler,
  createEventHandler,
  updateEventHandler,
  getEventHandler,
  listEventsHandler,
  createTicketTierHandler,
  updateTicketTierHandler,
  deleteTicketTierHandler,
  toggleSoonBadgeHandler,
  toggleSoonBadgeVisibilityHandler,
  getUserSoonBadgesHandler,
  upsertCommissionHandler,
  getGroupPostsHandler,
  getMyGroupsHandler,
  rateGroupHandler,
  getMyRatingHandler,
  createGroupPostHandler,
  rsvpEventHandler,
  cancelRsvpHandler,
  getEventAttendeesHandler,
  getMyRsvpHandler,
  discoverGroupsHandler,
  getGroupEventsHandler,
  listSubEventsHandler,
  createSubEventHandler,
  updateSubEventHandler,
  deleteSubEventHandler,
  getGroupMessagesHandler,
  sendGroupMessageHandler,
  startGroupDmHandler,
  getGroupInboxHandler,
  getGroupTodoColumnsHandler,
  updateGroupTodoColumnsHandler,
  getGroupTodoHandler,
  createGroupTodoHandler,
  updateGroupTodoHandler,
  deleteGroupTodoHandler,
  reorderGroupTodoHandler,
  getCustomRolesHandler,
  createCustomRoleHandler,
  updateCustomRoleHandler,
  deleteCustomRoleHandler,
  getUserPublicGroupsHandler,
  getCommonGroupsHandler,
  getKanbanHandler,
  togglePinGroupHandler,
  getTrendingHandler,
  toggleGroupNotificationHandler,
  getOrdersHandler,
  createOrderHandler,
  updateOrderStatusHandler,
  deleteOrderHandler,
  getBusinessStatsHandler,
  donateToGroupHandler,
  getGroupBalanceHandler,
  getOrderConversationHandler,
} from './controller.js';
import { groupService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate:    (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    tryAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function groupsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // ── Group CRUD ──────────────────────────────────────────────────────────
  fastify.get('/', listGroupsHandler as any);
  fastify.get('/me', auth, getMyGroupsHandler as any);
  fastify.get('/trending', getTrendingHandler as any);
  fastify.get('/discover', discoverGroupsHandler as any);
  fastify.get('/user/:userId', { onRequest: [fastify.tryAuthenticate] }, getUserPublicGroupsHandler as any);
  fastify.get('/common/:userId', auth, getCommonGroupsHandler as any);
  fastify.get('/search', async (request, reply) => {           // GET /groups/search?q=
    const { q = '', limit, page } = request.query as any;
    const groups = await groupService.searchGroups(q, limit ? parseInt(limit, 10) : 8, page ? parseInt(page, 10) : 1);
    return reply.send({ success: true, data: { groups }, error: null });
  });
  fastify.get('/:slugOrId', getGroupHandler as any);
  fastify.post('/', auth, createGroupHandler as any);
  fastify.patch('/:id', auth, updateGroupHandler as any);
  fastify.delete('/:id', auth, deleteGroupHandler as any);

  // ── Membership ────────────────────────────────────────────────────────────
  fastify.post('/:id/join', auth, joinGroupHandler as any);
  fastify.post('/:id/leave', auth, leaveGroupHandler as any);
  fastify.patch('/:id/pin', auth, togglePinGroupHandler as any);
  fastify.patch('/:id/notify', auth, toggleGroupNotificationHandler as any);
  fastify.get('/:id/members', getMembersHandler as any);
  fastify.patch('/:id/members/:userId/role', auth, setMemberRoleHandler as any);
  fastify.delete('/:id/members/:userId', auth, removeMemberHandler as any);

  // ── Custom Roles ────────────────────────────────────────────────────────
  fastify.get('/:id/roles', auth, getCustomRolesHandler as any);
  fastify.post('/:id/roles', auth, createCustomRoleHandler as any);
  fastify.patch('/:id/roles/:roleId', auth, updateCustomRoleHandler as any);
  fastify.delete('/:id/roles/:roleId', auth, deleteCustomRoleHandler as any);

  // ── Group posts ──────────────────────────────────────────────────────────
  fastify.get('/:id/posts', getGroupPostsHandler as any);
  fastify.post('/:id/posts', auth, createGroupPostHandler as any);

  // ── Creative Kanban ────────────────────────────────────────────────────
  fastify.get('/:id/kanban', getKanbanHandler as any);

  // ── Group rating ────────────────────────────────────────────────────────
  fastify.post('/:id/rate', auth, rateGroupHandler as any);
  fastify.get('/:id/my-rating', auth, getMyRatingHandler as any);

  // ── Events ────────────────────────────────────────────────────────────────
  fastify.get('/events', listEventsHandler as any);
  fastify.get('/events/:eventId', getEventHandler as any);
  fastify.get('/:id/events', getGroupEventsHandler as any);       // GET /groups/:id/events
  fastify.post('/:id/events', auth, createEventHandler as any);
  fastify.patch('/events/:eventId', auth, updateEventHandler as any);

  // ── RSVP ─────────────────────────────────────────────────────────────────
  fastify.post('/events/:eventId/rsvp', auth, rsvpEventHandler as any);
  fastify.delete('/events/:eventId/rsvp', auth, cancelRsvpHandler as any);
  fastify.get('/events/:eventId/attendees', getEventAttendeesHandler as any);
  fastify.get('/events/:eventId/my-rsvp', auth, getMyRsvpHandler as any);

  // ── Ticket tiers ─────────────────────────────────────────────────────────
  fastify.post('/events/:eventId/tickets', auth, createTicketTierHandler as any);
  fastify.patch('/tickets/:tierId', auth, updateTicketTierHandler as any);
  fastify.delete('/tickets/:tierId', auth, deleteTicketTierHandler as any);

  // ── SOON Badge ────────────────────────────────────────────────────────────
  fastify.post('/events/:eventId/soon', auth, toggleSoonBadgeHandler as any);
  fastify.patch('/events/:eventId/soon/visibility', auth, toggleSoonBadgeVisibilityHandler as any);
  fastify.get('/soon/user/:userId', getUserSoonBadgesHandler as any);

  // ── Commission (Creative groups) ──────────────────────────────────────────
  fastify.put('/:id/commission', auth, upsertCommissionHandler as any);

  // ── Sub-events ────────────────────────────────────────────────────────────
  fastify.get('/events/:eventId/subevents', listSubEventsHandler as any);
  fastify.post('/events/:eventId/subevents', auth, createSubEventHandler as any);
  fastify.patch('/events/:eventId/subevents/:subId', auth, updateSubEventHandler as any);
  fastify.delete('/events/:eventId/subevents/:subId', auth, deleteSubEventHandler as any);

  // ── Group chat (REST fallback) ─────────────────────────────────────────────
  fastify.get('/:id/chat', getGroupMessagesHandler as any);
  fastify.post('/:id/chat', auth, sendGroupMessageHandler as any);
  // ── Community Conversation ────────────────────────────────────────────────────
  fastify.post('/:id/dm', auth, startGroupDmHandler as any);        // any member: find-or-create my personal thread with the group
  fastify.get('/:id/inbox', auth, getGroupInboxHandler as any);     // owner/admin/moderator only: shared inbox of all members' threads

  // ── Artist Queue (Todo) ────────────────────────────────────────────────
  fastify.get('/:id/todo-columns', getGroupTodoColumnsHandler as any);
  fastify.put('/:id/todo-columns', auth, updateGroupTodoColumnsHandler as any);
  fastify.get('/:id/todo', getGroupTodoHandler as any);
  fastify.post('/:id/todo', auth, createGroupTodoHandler as any);
  fastify.patch('/:id/todo/:itemId', auth, updateGroupTodoHandler as any);
  fastify.delete('/:id/todo/:itemId', auth, deleteGroupTodoHandler as any);
  fastify.put('/:id/todo/reorder', auth, reorderGroupTodoHandler as any);

  // ── Orders (Business tab) ───────────────────────────────────────────────
  fastify.get('/:id/orders', auth, getOrdersHandler as any);
  fastify.post('/:id/orders', auth, createOrderHandler as any);
  fastify.patch('/:id/orders/:orderId/status', auth, updateOrderStatusHandler as any);
  fastify.delete('/:id/orders/:orderId', auth, deleteOrderHandler as any);
  fastify.get('/:id/orders-stats', auth, getBusinessStatsHandler as any);
  fastify.get('/:id/orders/:orderId/conversation', auth, getOrderConversationHandler as any);

  // ── Group balance (donations) ───────────────────────────────────────────
  fastify.post('/:id/donate', auth, donateToGroupHandler as any);
  fastify.get('/:id/balance', auth, getGroupBalanceHandler as any);
}
