import { FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../../config/prisma.js';
import { groupService } from './service.js';
import { messageService } from '../messages/service.js';
import { moderatePost, moderateGroupMessage } from '../automod/service.js';
import { isModerator } from '../../lib/roles.js';
import type { JwtUser, GetGroupsQuery, CreateGroupInput, UpdateGroupInput, CreateEventInput, UpdateEventInput, CreateTicketTierInput, UpdateCommissionInput, RateGroupInput, CreateGroupPostInput, RsvpEventInput, SubEventInput, UpdateSubEventInput, CreateOrderInput } from './types.js';

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
    // The verified badge is a platform-staff-only grant — a group's own admin/owner must not be able to self-award it.
    if (request.body.isVerified !== undefined) {
      const user = request.user as any;
      if (!isModerator(user.role)) {
        return fail(reply, 403, 'FORBIDDEN', 'Only platform staff can change group verification status');
      }
    }
    // Finance and member-visibility fields are sensitive — only the owner may change them.
    const OWNER_ONLY_FIELDS: (keyof UpdateGroupInput)[] = ['donationsEnabled', 'bankCardMasked', 'hideAdmins', 'hiddenMemberIds', 'businessEnabled'];
    const touchesOwnerOnlyField = OWNER_ONLY_FIELDS.some((f) => request.body[f] !== undefined);
    if (touchesOwnerOnlyField) {
      const { id: userId } = request.user as JwtUser;
      if (!(await groupService.isOwner(request.params.id, userId))) {
        return fail(reply, 403, 'FORBIDDEN', 'Only the group owner can change finance or member-visibility settings');
      }
    }
    // Custom group background/frame/theme are a Business-subscription perk — gated here
    // to match the (previously frontend-only) upsell in group settings.
    const BUSINESS_TIER_FIELDS: (keyof UpdateGroupInput)[] = ['groupBgUrl', 'groupFrame', 'groupTheme'];
    const touchesBusinessField = BUSINESS_TIER_FIELDS.some((f) => request.body[f] !== undefined && request.body[f] !== null && request.body[f] !== '');
    if (touchesBusinessField) {
      const { id: userId } = request.user as JwtUser;
      const requester = await prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true } });
      if (requester?.subscription_tier !== 'business') {
        return fail(reply, 402, 'BUSINESS_REQUIRED', 'Group customization requires a Business subscription');
      }
    }
    const group = await groupService.update(request.params.id, request.body, (request.user as JwtUser).id);
    return ok(reply, { group });
  } catch (e: any) {
    if (e instanceof Error && e.message === 'CATEGORY_CHANGE_COOLDOWN') {
      return fail(reply, 429, 'CATEGORY_CHANGE_COOLDOWN', 'Категорию можно менять не чаще одного раза в месяц');
    }
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
    const result = await groupService.delete(request.params.id);
    return ok(reply, result);
  } catch (e: any) {
    if (e.message === 'GROUP_HAS_FINANCIAL_HISTORY') {
      return fail(reply, 409, 'GROUP_HAS_FINANCIAL_HISTORY', 'Нельзя удалить группу с историей платежей или заказов — обратитесь в поддержку');
    }
    if (e.message === 'Group not found') {
      return fail(reply, 404, 'GROUP_NOT_FOUND', 'Group not found');
    }
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
    if (e instanceof Error && e.message === 'EVENT_EXPIRED') {
      return fail(reply, 409, 'EVENT_EXPIRED', 'Мероприятие завершилось. Пока доступна только подписка на уведомления — участие и SOON откроются, когда организатор назначит новую дату.');
    }
    return fail(reply, 400, 'JOIN_ERROR', e.message);
  }
};

export const subscribeGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.subscribe(request.params.id, userId);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 400, 'SUBSCRIBE_ERROR', e.message);
  }
};

export const unsubscribeGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.unsubscribe(request.params.id, userId);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 400, 'UNSUBSCRIBE_ERROR', e.message);
  }
};

export const getMySubscriptionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const groupIds = await groupService.getMySubscriptions(userId);
    return ok(reply, { groupIds });
  } catch (e: any) {
    return fail(reply, 500, 'MY_SUBSCRIPTIONS_ERROR', e.message);
  }
};

export const setEventDateHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { eventDate: string | null } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const eventDate = request.body.eventDate ? new Date(request.body.eventDate) : null;
    if (eventDate && Number.isNaN(eventDate.getTime())) {
      return fail(reply, 400, 'INVALID_DATE', 'eventDate is not a valid date');
    }
    const group = await groupService.setEventDate(request.params.id, eventDate);
    return ok(reply, { group });
  } catch (e: any) {
    return fail(reply, 400, 'SET_EVENT_DATE_ERROR', e.message);
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
    const { id: requesterId } = request.user as JwtUser;
    const member = await groupService.setMemberRole(request.params.id, requesterId, request.params.userId, request.body.role as any);
    return ok(reply, { member });
  } catch (e: any) {
    const status = /not authorized/i.test(e.message) ? 403 : 400;
    return fail(reply, status, 'SET_ROLE_ERROR', e.message);
  }
};

export const removeMemberHandler = async (
  request: FastifyRequest<{ Params: { id: string; userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: requesterId } = request.user as JwtUser;
    await groupService.removeMember(request.params.id, requesterId, request.params.userId);
    return ok(reply, { removed: true });
  } catch (e: any) {
    const status = /not authorized/i.test(e.message) ? 403 : 400;
    return fail(reply, status, 'REMOVE_MEMBER_ERROR', e.message);
  }
};

// ── Custom Roles ─────────────────────────────────────────────────────────────

export const getCustomRolesHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const roles = await groupService.getCustomRoles(request.params.id);
    return ok(reply, { roles });
  } catch (e: any) {
    return fail(reply, 500, 'GET_ROLES_ERROR', e.message);
  }
};

export const createCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { name: string; color?: string; icon?: string; permissions?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const role = await groupService.createCustomRole(request.params.id, request.body);
    return ok(reply, { role }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'CREATE_ROLE_ERROR', e.message);
  }
};

export const updateCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; roleId: string }; Body: { name?: string; color?: string; icon?: string; permissions?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const role = await groupService.updateCustomRole(request.params.id, request.params.roleId, request.body);
    return ok(reply, { role });
  } catch (e: any) {
    return fail(reply, 400, 'UPDATE_ROLE_ERROR', e.message);
  }
};

export const deleteCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; roleId: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    await groupService.deleteCustomRole(request.params.id, request.params.roleId);
    return ok(reply, { deleted: true });
  } catch (e: any) {
    return fail(reply, 400, 'DELETE_ROLE_ERROR', e.message);
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
    const tier = await groupService.getTicketTierWithGroupId(request.params.tierId);
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
    const tier = await groupService.getTicketTierWithGroupId(request.params.tierId);
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
    if (e instanceof Error && e.message === 'EVENT_EXPIRED') {
      return fail(reply, 409, 'EVENT_EXPIRED', 'Мероприятие завершилось. SOON откроется, когда организатор назначит новую дату.');
    }
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
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string; hasMedia?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const page = parseInt(request.query.page ?? '1', 10);
    const limit = parseInt(request.query.limit ?? '20', 10);
    const hasMedia = request.query.hasMedia === 'true';
    const posts = await groupService.getGroupPosts(request.params.id, page, limit, hasMedia);
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

export const getUserPublicGroupsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const requesterId = (request.user as JwtUser | undefined)?.id ?? null;
    const result = await groupService.getUserGroupsForViewer(request.params.userId, requesterId);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 500, 'USER_GROUPS_ERROR', e.message);
  }
};

export const togglePinGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.togglePinGroup(userId, request.params.id);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 500, 'PIN_GROUP_ERROR', e.message);
  }
};

export const getCommonGroupsHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: currentUserId } = request.user as JwtUser;
    const groups = await groupService.getCommonGroups(request.params.userId, currentUserId);
    return ok(reply, { groups });
  } catch (e: any) {
    return fail(reply, 500, 'COMMON_GROUPS_ERROR', e.message);
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
    // fire-and-forget automod check (does not block the response) — same pipeline as personal posts
    if (post) {
      moderatePost(post.id, userId, request.body.content ?? '').catch((err) => console.error('[AUTOMOD] analyzeGroupPost error:', err));
    }
    return ok(reply, { post }, 201);
  } catch (e: any) {
    return fail(reply, 400, 'CREATE_GROUP_POST_ERROR', e.message);
  }
};
// ── Creative Kanban ───────────────────────────────────────────────────────────

export const getKanbanHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const columns = await groupService.getKanban(request.params.id);
    return ok(reply, { columns });
  } catch (e: any) {
    return fail(reply, 500, 'KANBAN_ERROR', e.message);
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
    const event = await groupService.getEvent(request.params.eventId);
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
    const event = await groupService.getEvent(request.params.eventId);
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
    const event = await groupService.getEvent(request.params.eventId);
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
    const { id: userId } = request.user as JwtUser;
    await groupService.assertGroupMember(request.params.id, userId);
    const limit = Math.min(Number(request.query.limit) || 50, 100);
    const messages = await groupService.getGroupMessages(request.params.id, request.query.before, limit);
    return ok(reply, { messages });
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 500, 'GET_MESSAGES_ERROR', e.message);
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
    await groupService.assertGroupMember(request.params.id, userId);
    const msg = await groupService.sendGroupMessage(request.params.id, userId, text.trim());
    // fire-and-forget automod check (does not block the response)
    moderateGroupMessage(userId).catch((err) => console.error('[AUTOMOD] moderateGroupMessage error:', err));
    return ok(reply, { message: msg }, 201);
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 400, 'SEND_MESSAGE_ERROR', e.message);
  }
};

// ── Group DM ("написать сообществу") ──────────────────────────────────────────

export const startGroupDmHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await messageService.startGroupDm(request.params.id, userId);
    return ok(reply, result, result.alreadyExists ? 200 : 201);
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 500, 'START_DM_ERROR', e.message);
  }
};

export const getGroupInboxHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const threads = await messageService.getGroupInbox(request.params.id, userId);
    return ok(reply, { threads });
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 500, 'GET_INBOX_ERROR', e.message);
  }
};

// ── Artist Queue (Todo) ───────────────────────────────────────────────────────

export const getGroupTodoColumnsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const columns = await groupService.getTodoColumns(request.params.id);
    return ok(reply, { columns });
  } catch (e: any) {
    return fail(reply, 500, 'GET_TODO_COLUMNS_ERROR', e.message);
  }
};

export const updateGroupTodoColumnsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { columns: Array<{ key?: string; label?: string; icon?: string; color?: string }> } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    if (!Array.isArray(request.body?.columns) || !request.body.columns.length) {
      return fail(reply, 400, 'EMPTY_COLUMNS', 'At least one column is required');
    }
    const columns = await groupService.updateTodoColumns(request.params.id, request.body.columns);
    return ok(reply, { columns });
  } catch (e: any) {
    return fail(reply, 500, 'UPDATE_TODO_COLUMNS_ERROR', e.message);
  }
};

export const getGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const items = await groupService.getTodoItems(request.params.id);
    return ok(reply, { items });
  } catch (e: any) {
    return fail(reply, 500, 'GET_TODO_ERROR', e.message);
  }
};

export const createGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { title: string; description?: string; status?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const group = await groupService.getGroupOwner(request.params.id);
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    if (group.owner_id !== userId) return fail(reply, 403, 'FORBIDDEN', 'Only group owner can manage the queue');
    const { title, description, status } = request.body;
    if (!title?.trim()) return fail(reply, 400, 'EMPTY_TITLE', 'Title is required');
    const item = await groupService.createTodoItem(request.params.id, { title, description, status });
    return ok(reply, { item }, 201);
  } catch (e: any) {
    return fail(reply, 500, 'CREATE_TODO_ERROR', e.message);
  }
};

export const updateGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string; itemId: string }; Body: { title?: string; description?: string; status?: string; position?: number } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const group = await groupService.getGroupOwner(request.params.id);
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    if (group.owner_id !== userId) return fail(reply, 403, 'FORBIDDEN', 'Only group owner can manage the queue');
    const item = await groupService.updateTodoItem(request.params.id, request.params.itemId, request.body);
    return ok(reply, { item });
  } catch (e: any) {
    return fail(reply, 500, 'UPDATE_TODO_ERROR', e.message);
  }
};

export const deleteGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string; itemId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const group = await groupService.getGroupOwner(request.params.id);
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    if (group.owner_id !== userId) return fail(reply, 403, 'FORBIDDEN', 'Only group owner can manage the queue');
    await groupService.deleteTodoItem(request.params.id, request.params.itemId);
    return ok(reply, { success: true });
  } catch (e: any) {
    return fail(reply, 500, 'DELETE_TODO_ERROR', e.message);
  }
};

export const reorderGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { orderedIds: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const group = await groupService.getGroupOwner(request.params.id);
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    if (group.owner_id !== userId) return fail(reply, 403, 'FORBIDDEN', 'Only group owner can manage the queue');
    await groupService.reorderTodoItems(request.params.id, request.body.orderedIds);
    return ok(reply, { success: true });
  } catch (e: any) {
    return fail(reply, 500, 'REORDER_TODO_ERROR', e.message);
  }
};

// ── Orders (Business tab) ──────────────────────────────────────────────────

export const getOrdersHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const membership = await groupService.getMembership(request.params.id, userId);
    if (!membership) return fail(reply, 403, 'FORBIDDEN', 'Not a member of this group');
    const orders = await groupService.getOrders(request.params.id, userId);
    return ok(reply, { orders });
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 500, 'GET_ORDERS_ERROR', e.message);
  }
};

export const createOrderHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: CreateOrderInput }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const order = await groupService.createOrder(request.params.id, userId, request.body);
    return ok(reply, { order }, 201);
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 400, 'CREATE_ORDER_ERROR', e.message);
  }
};

export const updateOrderStatusHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string }; Body: { status: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const order = await groupService.updateOrderStatus(request.params.orderId, userId, request.body.status as any);
    return ok(reply, { order });
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 400, 'UPDATE_ORDER_STATUS_ERROR', e.message);
  }
};

export const deleteOrderHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await groupService.deleteOrder(request.params.orderId, userId);
    return ok(reply, { success: true });
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 400, 'DELETE_ORDER_ERROR', e.message);
  }
};

export const getBusinessStatsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const stats = await groupService.getBusinessStats(request.params.id);
    return ok(reply, { stats });
  } catch (e: any) {
    return fail(reply, 500, 'BUSINESS_STATS_ERROR', e.message);
  }
};

export const donateToGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { amount: number; message?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.donateToGroup(request.params.id, userId, Number(request.body.amount), request.body.message);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 400, 'DONATE_ERROR', e.message);
  }
};

export const getGroupBalanceHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireGroupAdmin(request, reply, request.params.id))) return;
    const result = await groupService.getGroupBalance(request.params.id);
    return ok(reply, result);
  } catch (e: any) {
    return fail(reply, 500, 'GROUP_BALANCE_ERROR', e.message);
  }
};

export const getOrderConversationHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const conversationId = await groupService.getOrderConversation(request.params.orderId, userId);
    return ok(reply, { conversationId });
  } catch (e: any) {
    return fail(reply, e.statusCode ?? 400, 'GET_ORDER_CONVERSATION_ERROR', e.message);
  }
};

export const getTrendingHandler = async (
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const page  = parseInt(request.query.page  ?? '1',  10);
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10), 50);
    const data = await groupService.getTrending(page, limit);
    return ok(reply, data);
  } catch (e: any) {
    return fail(reply, 500, 'TRENDING_ERROR', e.message);
  }
};

export const toggleGroupNotificationHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const result = await groupService.toggleNotification(request.params.id, userId);
    return ok(reply, result);
  } catch (e: any) {
    const code = e.message === 'Not a member' ? 403 : 500;
    return fail(reply, code, 'NOTIFY_TOGGLE_ERROR', e.message);
  }
};
