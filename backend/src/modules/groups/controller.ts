import { FastifyReply, FastifyRequest } from 'fastify';
import { groupService } from './service.js';
import { messageService } from '../messages/service.js';
import prisma from '../../config/prisma.js';
import type { JwtUser, GetGroupsQuery, CreateGroupInput, UpdateGroupInput, CreateEventInput, UpdateEventInput, CreateTicketTierInput, UpdateCommissionInput, RateGroupInput, CreateGroupPostInput, RsvpEventInput, SubEventInput, UpdateSubEventInput } from './types.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function ok(reply: FastifyReply, data: any, code = 200) {
  return reply.code(code).send({ success: true, data, error: null });
}

function fail(reply: FastifyReply, code: number, errCode: string, message: string) {
  return reply.code(code).send({ success: false, data: null, error: { code: errCode, message } });
}

async function requireGroupAdmin(request: FastifyRequest, reply: FastifyReply, groupId: string) {
  const { id: userId } = request.user as JwtUser;
  const isAdmin = await groupService.isOwnerOrAdmin(groupId, userId);
  if (!isAdmin) { fail(reply, 403, 'FORBIDDEN', 'You are not an admin of this group'); return false; }
  return true;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const listGroupsHandler = async (
  request: FastifyRequest<{ Querystring: GetGroupsQuery }>,
  reply: FastifyReply,
) => {
  try {
    const data = await groupService.list(request.query);
    return ok(reply, data);
  } catch (e: any) {
    return fail(reply, 500, 'GROUPS_LIST_ERROR', e.message);
  }
};

export const getGroupHandler = async (
  request: FastifyRequest<{ Params: { slugOrId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const group = await groupService.getBySlugOrId(request.params.slugOrId);
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    return ok(reply, { group });
  } catch (e: any) {
    return fail(reply, 500, 'GROUP_FETCH_ERROR', e.message);
  }
};

export const createGroupHandler = async (
  request: FastifyRequest<{ Body: CreateGroupInput }>,
  reply: FastifyReply,
) => {
  try {
    const { id: ownerId } = request.user as JwtUser;
    const group = await groupService.create(ownerId, request.body);
    return ok(reply, { group }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'CREATE_GROUP_ERROR', e.message);
  }
};

export const updateGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateGroupInput }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const group = await groupService.update(request.params.id, request.body);
    return ok(reply, { group });
  } catch (e: any) {
    return fail(reply, 400, 'UPDATE_GROUP_ERROR', e.message);
  }
};

export const deleteGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const membership = await groupService.getMembership(request.params.id, userId);
    if (!membership || membership.role !== 'owner') {
      return fail(reply, 403, 'FORBIDDEN', 'Only the group owner can delete the group');
    }
    await groupService.delete(request.params.id);
    return ok(reply, { deleted: true });
  } catch (e: any) {
    return fail(reply, 500, 'DELETE_GROUP_ERROR', e.message);
  }
};

// ── Membership ──────────────────────────────────────────────────────────────

export const joinGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const membership = await groupService.join(request.params.id, userId);
    return ok(reply, { membership });
  } catch (e: any) {
    return fail(reply, 400, 'JOIN_ERROR', e.message);
  }
};

export const leaveGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await groupService.leave(request.params.id, userId);
    return ok(reply, { left: true });
  } catch (e: any) {
    return fail(reply, 400, 'LEAVE_ERROR', e.message);
  }
};

export const getMembersHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const page = parseInt(request.query.page ?? '1', 10);
    const limit = parseInt(request.query.limit ?? '30', 10);
    const members = await groupService.getMembers(request.params.id, page, limit);
    return ok(reply, { members });
  } catch (e: any) {
    return fail(reply, 500, 'MEMBERS_ERROR', e.message);
  }
};

export const setMemberRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; userId: string }; Body: { role: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const member = await groupService.setMemberRole(request.params.id, request.params.userId, request.body.role as any);
    return ok(reply, { member });
  } catch (e: any) {
    return fail(reply, 400, 'SET_ROLE_ERROR', e.message);
  }
};

// ── Events ──────────────────────────────────────────────────────────────────

export const createEventHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: Omit<CreateEventInput, 'groupId'> }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const event = await groupService.createEvent({ ...request.body, groupId: request.params.id });
    return ok(reply, { event }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'CREATE_EVENT_ERROR', e.message);
  }
};

export const updateEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: UpdateEventInput }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requireGroupAdmin(request, reply, event.group_id))) return;
    const updated = await groupService.updateEvent(request.params.eventId, request.body);
    return ok(reply, { event: updated });
  } catch (e: any) {
    return fail(reply, 400, 'UPDATE_EVENT_ERROR', e.message);
  }
};

export const getEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    return ok(reply, { event });
  } catch (e: any) {
    return fail(reply, 500, 'EVENT_FETCH_ERROR', e.message);
  }
};

export const listEventsHandler = async (
  request: FastifyRequest<{ Querystring: { groupId?: string; status?: string; upcoming?: string; page?: string; limit?: string; sort?: string; location?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const q = request.query;
    const data = await groupService.listEvents({
      groupId: q.groupId,
      status: q.status,
      upcoming: q.upcoming === 'true',
      page: q.page,
      limit: q.limit,
      sort: q.sort,
      location: q.location,
    });
    return ok(reply, data);
  } catch (e: any) {
    return fail(reply, 500, 'EVENTS_LIST_ERROR', e.message);
  }
};

// ── Tickets ─────────────────────────────────────────────────────────────────

export const createTicketTierHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: Omit<CreateTicketTierInput, 'eventId'> }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requireGroupAdmin(request, reply, event.group_id))) return;
    const tier = await groupService.createTicketTier({ ...request.body, eventId: request.params.eventId });
    return ok(reply, { tier }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'CREATE_TICKET_ERROR', e.message);
  }
};

export const updateTicketTierHandler = async (
  request: FastifyRequest<{ Params: { tierId: string }; Body: Partial<Omit<CreateTicketTierInput, 'eventId'>> }>,
  reply: FastifyReply,
) => {
  try {
    const tier = await prisma.ticketTier.findUnique({
      where: { id: request.params.tierId },
      include: { event: { select: { group_id: true } } },
    });
    if (!tier) return fail(reply, 404, 'NOT_FOUND', 'Ticket tier not found');
    if (!(await requireGroupAdmin(request, reply, tier.event.group_id))) return;
    const updated = await groupService.updateTicketTier(request.params.tierId, request.body);
    return ok(reply, { tier: updated });
  } catch (e: any) {
    return fail(reply, 400, 'UPDATE_TICKET_ERROR', e.message);
  }
};

export const deleteTicketTierHandler = async (
  request: FastifyRequest<{ Params: { tierId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const tier = await prisma.ticketTier.findUnique({
      where: { id: request.params.tierId },
      include: { event: { select: { group_id: true } } },
    });
    if (!tier) return fail(reply, 404, 'NOT_FOUND', 'Ticket tier not found');
    if (!(await requireGroupAdmin(request, reply, tier.event.group_id))) return;
    await groupService.deleteTicketTier(request.params.tierId);
    return ok(reply, { deleted: true });
  } catch (e: any) {
    return fail(reply, 400, 'DELETE_TICKET_ERROR', e.message);
  }
};

// ── SOON Badge ──────────────────────────────────────────────────────────────

export const toggleSoonBadgeHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.toggleSoonBadge(userId, request.params.eventId);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 400, 'SOON_BADGE_ERROR', e.message);
  }
};

export const toggleSoonBadgeVisibilityHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const badge = await groupService.toggleSoonBadgeVisibility(userId, request.params.eventId);
    return ok(reply, { badge });
  } catch (e: any) {
    return fail(reply, 400, 'SOON_TOGGLE_ERROR', e.message);
  }
};

export const getUserSoonBadgesHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const badges = await groupService.getUserSoonBadges(request.params.userId);
    return ok(reply, { badges });
  } catch (e: any) {
    return fail(reply, 500, 'SOON_BADGES_ERROR', e.message);
  }
};

// ── Commission ──────────────────────────────────────────────────────────────

export const upsertCommissionHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateCommissionInput }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const commission = await groupService.upsertCommission(request.params.id, request.body);
    return ok(reply, { commission });
  } catch (e: any) {
    return fail(reply, 400, 'COMMISSION_ERROR', e.message);
  }
};

// ── Group posts ─────────────────────────────────────────────────────────────

export const getGroupPostsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const page = parseInt(request.query.page ?? '1', 10);
    const limit = parseInt(request.query.limit ?? '20', 10);
    const posts = await groupService.getGroupPosts(request.params.id, page, limit);
    return ok(reply, { posts });
  } catch (e: any) {
    return fail(reply, 500, 'GROUP_POSTS_ERROR', e.message);
  }
};

// ── My Groups ───────────────────────────────────────────────────────────────

export const getMyGroupsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const memberships = await groupService.getUserGroups(userId);
    return ok(reply, { memberships });
  } catch (e: any) {
    return fail(reply, 500, 'MY_GROUPS_ERROR', e.message);
  }
};

// ── Group Rating ────────────────────────────────────────────────────────────

export const rateGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: RateGroupInput }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.rateGroup(request.params.id, userId, request.body.value);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 400, 'RATE_GROUP_ERROR', e.message);
  }
};

export const getMyRatingHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const myRating = await groupService.getMyRating(request.params.id, userId);
    return ok(reply, { myRating });
  } catch (e: any) {
    return fail(reply, 500, 'GET_RATING_ERROR', e.message);
  }
};

// ── Create post in group ────────────────────────────────────────────────────

export const createGroupPostHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: CreateGroupPostInput }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const post = await groupService.createGroupPost(request.params.id, userId, request.body);
    return ok(reply, { post }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'CREATE_GROUP_POST_ERROR', e.message);
  }
};
// ── RSVP ─────────────────────────────────────────────────────────────────────────

export const rsvpEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: RsvpEventInput }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { status } = request.body;
    if (!['going', 'maybe', 'not_going'].includes(status)) return fail(reply, 400, 'INVALID_STATUS', 'status must be going|maybe|not_going');
    const attendee = await groupService.rsvpEvent(request.params.eventId, userId, status);
    return ok(reply, { attendee });
  } catch (e: any) {
    return fail(reply, 400, 'RSVP_ERROR', e.message);
  }
};

export const cancelRsvpHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await groupService.cancelRsvp(request.params.eventId, userId);
    return ok(reply, { cancelled: true });
  } catch (e: any) {
    return fail(reply, 400, 'CANCEL_RSVP_ERROR', e.message);
  }
};

export const getEventAttendeesHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply,
) => {
  try {
    const page = Number(request.query.page) || 1;
    const limit = Math.min(Number(request.query.limit) || 50, 100);
    const result = await groupService.getEventAttendees(request.params.eventId, page, limit);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 500, 'GET_ATTENDEES_ERROR', e.message);
  }
};

export const getMyRsvpHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const rsvp = await groupService.getMyRsvp(request.params.eventId, userId);
    return ok(reply, { rsvp });
  } catch (e: any) {
    return fail(reply, 500, 'GET_MY_RSVP_ERROR', e.message);
  }
};

// ── Discover ─────────────────────────────────────────────────────────────────────

export const discoverGroupsHandler = async (
  request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply,
) => {
  try {
    const userId = (request.user as JwtUser | undefined)?.id ?? null;
    const page = Number(request.query.page) || 1;
    const limit = Math.min(Number(request.query.limit) || 20, 50);
    const result = await groupService.discoverGroups(userId, page, limit);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 500, 'DISCOVER_ERROR', e.message);
  }
};

// ── Group events list ────────────────────────────────────────────────────────

export const getGroupEventsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: number; limit?: number; status?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const page = Number(request.query.page) || 1;
    const limit = Math.min(Number(request.query.limit) || 20, 50);
    const result = await groupService.listEvents({ groupId: request.params.id, status: request.query.status, page: String(page), limit: String(limit) });
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 500, 'GROUP_EVENTS_ERROR', e.message);
  }
};

// ── Sub-events ──────────────────────────────────────────────────────────────────

export const listSubEventsHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const list = await groupService.listSubEvents(request.params.eventId);
    return ok(reply, { subEvents: list });
  } catch (e: any) {
    return fail(reply, 500, 'SUBEVENT_LIST_ERROR', e.message);
  }
};

export const createSubEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: SubEventInput }>,
  reply: FastifyReply,
) => {
  try {
    // Caller must be admin of the parent event's group
    const event = await prisma.event.findUnique({ where: { id: request.params.eventId }, select: { group_id: true } });
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requireGroupAdmin(request, reply, event.group_id))) return;
    const sub = await groupService.createSubEvent(request.params.eventId, request.body);
    return ok(reply, { subEvent: sub }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'SUBEVENT_CREATE_ERROR', e.message);
  }
};

export const updateSubEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string; subId: string }; Body: UpdateSubEventInput }>,
  reply: FastifyReply,
) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: request.params.eventId }, select: { group_id: true } });
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requireGroupAdmin(request, reply, event.group_id))) return;
    const sub = await groupService.updateSubEvent(request.params.subId, request.body);
    return ok(reply, { subEvent: sub });
  } catch (e: any) {
    return fail(reply, 400, 'SUBEVENT_UPDATE_ERROR', e.message);
  }
};

export const deleteSubEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string; subId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: request.params.eventId }, select: { group_id: true } });
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requireGroupAdmin(request, reply, event.group_id))) return;
    await groupService.deleteSubEvent(request.params.subId);
    return ok(reply, { deleted: true });
  } catch (e: any) {
    return fail(reply, 400, 'SUBEVENT_DELETE_ERROR', e.message);
  }
};

// ── Group Chat Messages ────────────────────────────────────────────────────────────

export const getGroupMessagesHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { before?: string; limit?: number } }>,
  reply: FastifyReply,
) => {
  try {
    const limit = Math.min(Number(request.query.limit) || 50, 100);
    const messages = await groupService.getGroupMessages(request.params.id, request.query.before, limit);
    return ok(reply, { messages });
  } catch (e: any) {
    return fail(reply, 500, 'GET_MESSAGES_ERROR', e.message);
  }
};

export const sendGroupMessageHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { text: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { text } = request.body;
    if (!text?.trim()) return fail(reply, 400, 'EMPTY_MESSAGE', 'Message text is required');
    const msg = await groupService.sendGroupMessage(request.params.id, userId, text.trim());
    return ok(reply, { message: msg }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'SEND_MESSAGE_ERROR', e.message);
  }
};

// ── Community Conversation ────────────────────────────────────────────────────

export const initGroupChatHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const group = await prisma.group.findUnique({
      where: { id: request.params.id },
      select: { owner_id: true },
    });
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    if (group.owner_id !== userId) return fail(reply, 403, 'FORBIDDEN', 'Only group owner can enable community chat');
    const result = await messageService.initCommunityChat(request.params.id, userId);
    return ok(reply, result, result.alreadyExists ? 200 : 201);
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 500, 'INIT_CHAT_ERROR', e.message);
  }
};

export const getGroupChatInfoHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const conversation = await messageService.getCommunityConversation(request.params.id);
    return ok(reply, { conversation });
  } catch (e: any) {
    return fail(reply, 500, 'GET_CHAT_ERROR', e.message);
  }
};