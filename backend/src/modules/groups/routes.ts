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
  createEventHandler,
  updateEventHandler,
  getEventHandler,
  listEventsHandler,
  createTicketTierHandler,
  toggleSoonBadgeHandler,
  toggleSoonBadgeVisibilityHandler,
  getUserSoonBadgesHandler,
  upsertCommissionHandler,
  getGroupPostsHandler,
  getMyGroupsHandler,
  rateGroupHandler,
  getMyRatingHandler,
  createGroupPostHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function groupsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // ── Group CRUD ──────────────────────────────────────────────────────────
  fastify.get('/', listGroupsHandler as any);
  fastify.get('/me', auth, getMyGroupsHandler as any);
  fastify.get('/:slugOrId', getGroupHandler as any);
  fastify.post('/', auth, createGroupHandler as any);
  fastify.patch('/:id', auth, updateGroupHandler as any);
  fastify.delete('/:id', auth, deleteGroupHandler as any);

  // ── Membership ────────────────────────────────────────────────────────────
  fastify.post('/:id/join', auth, joinGroupHandler as any);
  fastify.post('/:id/leave', auth, leaveGroupHandler as any);
  fastify.get('/:id/members', getMembersHandler as any);
  fastify.patch('/:id/members/:userId/role', auth, setMemberRoleHandler as any);

  // ── Group posts ──────────────────────────────────────────────────────────
  fastify.get('/:id/posts', getGroupPostsHandler as any);
  fastify.post('/:id/posts', auth, createGroupPostHandler as any);

  // ── Group rating ────────────────────────────────────────────────────────
  fastify.post('/:id/rate', auth, rateGroupHandler as any);
  fastify.get('/:id/my-rating', auth, getMyRatingHandler as any);

  // ── Events ────────────────────────────────────────────────────────────────
  fastify.get('/events', listEventsHandler as any);
  fastify.get('/events/:eventId', getEventHandler as any);
  fastify.post('/:id/events', auth, createEventHandler as any);
  fastify.patch('/events/:eventId', auth, updateEventHandler as any);

  // ── Ticket tiers ─────────────────────────────────────────────────────────
  fastify.post('/events/:eventId/tickets', auth, createTicketTierHandler as any);

  // ── SOON Badge ────────────────────────────────────────────────────────────
  fastify.post('/events/:eventId/soon', auth, toggleSoonBadgeHandler as any);
  fastify.patch('/events/:eventId/soon/visibility', auth, toggleSoonBadgeVisibilityHandler as any);
  fastify.get('/soon/user/:userId', getUserSoonBadgesHandler as any);

  // ── Commission (Creative groups) ──────────────────────────────────────────
  fastify.put('/:id/commission', auth, upsertCommissionHandler as any);
}
