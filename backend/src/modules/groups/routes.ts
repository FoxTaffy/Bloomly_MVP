import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
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
  subscribeGroupHandler,
  unsubscribeGroupHandler,
  getMySubscriptionsHandler,
  setEventDateHandler,
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
  fastify.get<RouteGenericOf<typeof listGroupsHandler>>('/', listGroupsHandler);
  fastify.get<RouteGenericOf<typeof getMyGroupsHandler>>('/me', auth, getMyGroupsHandler);
  fastify.get<RouteGenericOf<typeof getTrendingHandler>>('/trending', getTrendingHandler);
  fastify.get<RouteGenericOf<typeof discoverGroupsHandler>>('/discover', discoverGroupsHandler);
  fastify.get<RouteGenericOf<typeof getMySubscriptionsHandler>>('/me/subscriptions', auth, getMySubscriptionsHandler);
  fastify.get<RouteGenericOf<typeof getUserPublicGroupsHandler>>('/user/:userId', { onRequest: [fastify.tryAuthenticate] }, getUserPublicGroupsHandler);
  fastify.get<RouteGenericOf<typeof getCommonGroupsHandler>>('/common/:userId', auth, getCommonGroupsHandler);
  fastify.get('/search', async (request, reply) => {           // GET /groups/search?q=
    const { q = '', limit, page } = request.query as { q?: string; limit?: string; page?: string };
    const groups = await groupService.searchGroups(q, limit ? parseInt(limit, 10) : 8, page ? parseInt(page, 10) : 1);
    return reply.send({ success: true, data: { groups }, error: null });
  });
  fastify.get<RouteGenericOf<typeof getGroupHandler>>('/:slugOrId', getGroupHandler);
  fastify.post<RouteGenericOf<typeof createGroupHandler>>('/', auth, createGroupHandler);
  fastify.patch<RouteGenericOf<typeof updateGroupHandler>>('/:id', auth, updateGroupHandler);
  fastify.delete<RouteGenericOf<typeof deleteGroupHandler>>('/:id', auth, deleteGroupHandler);

  // ── Membership ────────────────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof joinGroupHandler>>('/:id/join', auth, joinGroupHandler);
  fastify.post<RouteGenericOf<typeof leaveGroupHandler>>('/:id/leave', auth, leaveGroupHandler);
  fastify.patch<RouteGenericOf<typeof togglePinGroupHandler>>('/:id/pin', auth, togglePinGroupHandler);
  fastify.patch<RouteGenericOf<typeof toggleGroupNotificationHandler>>('/:id/notify', auth, toggleGroupNotificationHandler);
  fastify.get<RouteGenericOf<typeof getMembersHandler>>('/:id/members', { onRequest: [fastify.tryAuthenticate] }, getMembersHandler);
  fastify.patch<RouteGenericOf<typeof setMemberRoleHandler>>('/:id/members/:userId/role', auth, setMemberRoleHandler);
  fastify.delete<RouteGenericOf<typeof removeMemberHandler>>('/:id/members/:userId', auth, removeMemberHandler);
  fastify.post<RouteGenericOf<typeof subscribeGroupHandler>>('/:id/subscribe', auth, subscribeGroupHandler);
  fastify.delete<RouteGenericOf<typeof unsubscribeGroupHandler>>('/:id/subscribe', auth, unsubscribeGroupHandler);

  // ── Custom Roles ────────────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getCustomRolesHandler>>('/:id/roles', auth, getCustomRolesHandler);
  fastify.post<RouteGenericOf<typeof createCustomRoleHandler>>('/:id/roles', auth, createCustomRoleHandler);
  fastify.patch<RouteGenericOf<typeof updateCustomRoleHandler>>('/:id/roles/:roleId', auth, updateCustomRoleHandler);
  fastify.delete<RouteGenericOf<typeof deleteCustomRoleHandler>>('/:id/roles/:roleId', auth, deleteCustomRoleHandler);

  // ── Group posts ──────────────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getGroupPostsHandler>>('/:id/posts', { onRequest: [fastify.tryAuthenticate] }, getGroupPostsHandler);
  fastify.post<RouteGenericOf<typeof createGroupPostHandler>>('/:id/posts', auth, createGroupPostHandler);

  // ── Creative Kanban ────────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getKanbanHandler>>('/:id/kanban', getKanbanHandler);

  // ── Group rating ────────────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof rateGroupHandler>>('/:id/rate', auth, rateGroupHandler);
  fastify.get<RouteGenericOf<typeof getMyRatingHandler>>('/:id/my-rating', auth, getMyRatingHandler);

  // ── Events ────────────────────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof listEventsHandler>>('/events', listEventsHandler);
  fastify.get<RouteGenericOf<typeof getEventHandler>>('/events/:eventId', getEventHandler);
  fastify.get<RouteGenericOf<typeof getGroupEventsHandler>>('/:id/events', getGroupEventsHandler);       // GET /groups/:id/events
  fastify.post<RouteGenericOf<typeof createEventHandler>>('/:id/events', auth, createEventHandler);
  fastify.patch<RouteGenericOf<typeof updateEventHandler>>('/events/:eventId', auth, updateEventHandler);
  fastify.patch<RouteGenericOf<typeof setEventDateHandler>>('/:id/event-date', auth, setEventDateHandler);

  // ── RSVP ─────────────────────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof rsvpEventHandler>>('/events/:eventId/rsvp', auth, rsvpEventHandler);
  fastify.delete<RouteGenericOf<typeof cancelRsvpHandler>>('/events/:eventId/rsvp', auth, cancelRsvpHandler);
  fastify.get<RouteGenericOf<typeof getEventAttendeesHandler>>('/events/:eventId/attendees', getEventAttendeesHandler);
  fastify.get<RouteGenericOf<typeof getMyRsvpHandler>>('/events/:eventId/my-rsvp', auth, getMyRsvpHandler);

  // ── Ticket tiers ─────────────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof createTicketTierHandler>>('/events/:eventId/tickets', auth, createTicketTierHandler);
  fastify.patch<RouteGenericOf<typeof updateTicketTierHandler>>('/tickets/:tierId', auth, updateTicketTierHandler);
  fastify.delete<RouteGenericOf<typeof deleteTicketTierHandler>>('/tickets/:tierId', auth, deleteTicketTierHandler);

  // ── SOON Badge ────────────────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof toggleSoonBadgeHandler>>('/events/:eventId/soon', auth, toggleSoonBadgeHandler);
  fastify.patch<RouteGenericOf<typeof toggleSoonBadgeVisibilityHandler>>('/events/:eventId/soon/visibility', auth, toggleSoonBadgeVisibilityHandler);
  fastify.get<RouteGenericOf<typeof getUserSoonBadgesHandler>>('/soon/user/:userId', getUserSoonBadgesHandler);

  // ── Commission (Creative groups) ──────────────────────────────────────────
  fastify.put<RouteGenericOf<typeof upsertCommissionHandler>>('/:id/commission', auth, upsertCommissionHandler);

  // ── Sub-events ────────────────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof listSubEventsHandler>>('/events/:eventId/subevents', listSubEventsHandler);
  fastify.post<RouteGenericOf<typeof createSubEventHandler>>('/events/:eventId/subevents', auth, createSubEventHandler);
  fastify.patch<RouteGenericOf<typeof updateSubEventHandler>>('/events/:eventId/subevents/:subId', auth, updateSubEventHandler);
  fastify.delete<RouteGenericOf<typeof deleteSubEventHandler>>('/events/:eventId/subevents/:subId', auth, deleteSubEventHandler);

  // ── Group chat (REST fallback) ─────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getGroupMessagesHandler>>('/:id/chat', auth, getGroupMessagesHandler);
  fastify.post<RouteGenericOf<typeof sendGroupMessageHandler>>('/:id/chat', auth, sendGroupMessageHandler);
  // ── Community Conversation ────────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof startGroupDmHandler>>('/:id/dm', auth, startGroupDmHandler);        // any member: find-or-create my personal thread with the group
  fastify.get<RouteGenericOf<typeof getGroupInboxHandler>>('/:id/inbox', auth, getGroupInboxHandler);     // owner/admin/moderator only: shared inbox of all members' threads

  // ── Artist Queue (Todo) ────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getGroupTodoColumnsHandler>>('/:id/todo-columns', getGroupTodoColumnsHandler);
  fastify.put<RouteGenericOf<typeof updateGroupTodoColumnsHandler>>('/:id/todo-columns', auth, updateGroupTodoColumnsHandler);
  fastify.get<RouteGenericOf<typeof getGroupTodoHandler>>('/:id/todo', getGroupTodoHandler);
  fastify.post<RouteGenericOf<typeof createGroupTodoHandler>>('/:id/todo', auth, createGroupTodoHandler);
  fastify.patch<RouteGenericOf<typeof updateGroupTodoHandler>>('/:id/todo/:itemId', auth, updateGroupTodoHandler);
  fastify.delete<RouteGenericOf<typeof deleteGroupTodoHandler>>('/:id/todo/:itemId', auth, deleteGroupTodoHandler);
  fastify.put<RouteGenericOf<typeof reorderGroupTodoHandler>>('/:id/todo/reorder', auth, reorderGroupTodoHandler);

  // ── Orders (Business tab) ───────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getOrdersHandler>>('/:id/orders', auth, getOrdersHandler);
  fastify.post<RouteGenericOf<typeof createOrderHandler>>('/:id/orders', auth, createOrderHandler);
  fastify.patch<RouteGenericOf<typeof updateOrderStatusHandler>>('/:id/orders/:orderId/status', auth, updateOrderStatusHandler);
  fastify.delete<RouteGenericOf<typeof deleteOrderHandler>>('/:id/orders/:orderId', auth, deleteOrderHandler);
  fastify.get<RouteGenericOf<typeof getBusinessStatsHandler>>('/:id/orders-stats', auth, getBusinessStatsHandler);
  fastify.get<RouteGenericOf<typeof getOrderConversationHandler>>('/:id/orders/:orderId/conversation', auth, getOrderConversationHandler);

  // ── Group balance (donations) ───────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof donateToGroupHandler>>('/:id/donate', auth, donateToGroupHandler);
  fastify.get<RouteGenericOf<typeof getGroupBalanceHandler>>('/:id/balance', auth, getGroupBalanceHandler);
}
