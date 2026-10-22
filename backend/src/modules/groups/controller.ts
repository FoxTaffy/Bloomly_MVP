import { FastifyReply, FastifyRequest } from 'fastify';
import { userLookup } from '../users/lookup.js';
import { groupService } from './service.js';
import { messageService } from '../messages/service.js';
import { moderatePost, moderateGroupMessage } from '../automod/service.js';
import { isModerator } from '../../lib/roles.js';
import { isMemberRole, isOrderStatus } from './types.js';
import type { GroupPermission } from './service.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';
import type { JwtUser, GetGroupsQuery, CreateGroupInput, UpdateGroupInput, CreateEventInput, UpdateEventInput, CreateTicketTierInput, UpdateCommissionInput, RateGroupInput, CreateGroupPostInput, RsvpEventInput, SubEventInput, UpdateSubEventInput, CreateOrderInput } from './types.js';
import { logError } from '../../lib/logger.js';
import { assertGroupReadable } from '../../lib/contentAccess.js';

// ── helpers ───────────────────────────────────────────────────────────────────
function ok(reply: FastifyReply, data: unknown, code = 200) {
  return reply.code(code).send({ success: true, data, error: null });
}

function fail(reply: FastifyReply, code: number, errCode: string, message: string) {
  return reply.code(code).send({ success: false, data: null, error: { code: errCode, message } });
}

async function requireGroupAdmin(request: FastifyRequest, reply: FastifyReply, groupId: string) {
  const { id: userId } = request.user as JwtUser;
  await assertGroupReadable(groupId, userId);
  const isAdmin = await groupService.isOwnerOrAdmin(groupId, userId);
  if (!isAdmin) { fail(reply, 403, 'FORBIDDEN', 'You are not an admin of this group'); return false; }
  return true;
}

async function requirePermission(request: FastifyRequest, reply: FastifyReply, groupId: string, permission: GroupPermission) {
  const { id: userId } = request.user as JwtUser;
  if (!(await groupService.hasPermission(groupId, userId, permission))) {
    fail(reply, 403, 'FORBIDDEN', 'You do not have permission to do this in this group');
    return false;
  }
  return true;
}

/** Closed groups hide their content from non-members. */
async function requireContentAccess(request: FastifyRequest, reply: FastifyReply, groupId: string) {
  const viewerId = (request.user as JwtUser | undefined)?.id ?? null;
  if (!(await groupService.canViewContent(groupId, viewerId))) {
    fail(reply, 403, 'GROUP_CLOSED', 'Это закрытая группа — содержимое доступно только участникам');
    return false;
  }
  return true;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export const listGroupsHandler = async (
  request: FastifyRequest<{ Querystring: GetGroupsQuery }>,
  reply: FastifyReply,
) => {
  try {
    const data = await groupService.list(request.query, request.user?.id);
    return ok(reply, data);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GROUPS_LIST_ERROR', errMessage(e));
  }
};

export const getGroupHandler = async (
  request: FastifyRequest<{ Params: { slugOrId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const group = await groupService.getBySlugOrId(request.params.slugOrId, request.user?.id);
    if (!group) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
    return ok(reply, { group });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GROUP_FETCH_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CREATE_GROUP_ERROR', errMessage(e));
  }
};

export const updateGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateGroupInput }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    // The verified badge is a platform-staff-only grant — a group's own admin/owner must not be able to self-award it.
    if (request.body.isVerified !== undefined) {
      const user = request.user as JwtUser;
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
      // The perk belongs to the group's owner, whoever of the staff presses "save"
      const owner = await groupService.getGroupOwner(request.params.id);
      if (!owner) return fail(reply, 404, 'NOT_FOUND', 'Group not found');
      if ((await userLookup.subscriptionTier(owner.owner_id)) !== 'business') {
        return fail(reply, 402, 'BUSINESS_REQUIRED', 'Group customization requires a Business subscription');
      }
    }
    const group = await groupService.update(request.params.id, request.body, (request.user as JwtUser).id);
    return ok(reply, { group });
  } catch (e) {
    if (e instanceof Error && errMessage(e) === 'CATEGORY_CHANGE_COOLDOWN') {
      return fail(reply, 429, 'CATEGORY_CHANGE_COOLDOWN', 'Категорию можно менять не чаще одного раза в месяц');
    }
    return fail(reply, errStatus(e) ?? 400, 'UPDATE_GROUP_ERROR', errMessage(e));
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
  } catch (e) {
    if (errMessage(e) === 'GROUP_HAS_FINANCIAL_HISTORY') {
      return fail(reply, 409, 'GROUP_HAS_FINANCIAL_HISTORY', 'Нельзя удалить группу с историей платежей или заказов — обратитесь в поддержку');
    }
    if (errMessage(e) === 'Group not found') {
      return fail(reply, 404, 'GROUP_NOT_FOUND', 'Group not found');
    }
    return fail(reply, errStatus(e) ?? 500, 'DELETE_GROUP_ERROR', errMessage(e));
  }
};

// ── Membership ──────────────────────────────────────────────────────────────

export const joinGroupHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body?: { message?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const message = typeof request.body?.message === 'string' ? request.body.message : undefined;
    const { membership, pending } = await groupService.join(request.params.id, userId, message);
    return ok(reply, { membership, pending });
  } catch (e) {
    if (e instanceof Error && errMessage(e) === 'EVENT_EXPIRED') {
      return fail(reply, 409, 'EVENT_EXPIRED', 'Мероприятие завершилось. Пока доступна только подписка на уведомления — участие и SOON откроются, когда организатор назначит новую дату.');
    }
    return fail(reply, errStatus(e) ?? 400, 'JOIN_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SUBSCRIBE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'UNSUBSCRIBE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'MY_SUBSCRIPTIONS_ERROR', errMessage(e));
  }
};

export const setEventDateHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { eventDate: string | null } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_events'))) return;
    const eventDate = request.body.eventDate ? new Date(request.body.eventDate) : null;
    if (eventDate && Number.isNaN(eventDate.getTime())) {
      return fail(reply, 400, 'INVALID_DATE', 'eventDate is not a valid date');
    }
    const group = await groupService.setEventDate(request.params.id, eventDate);
    return ok(reply, { group });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SET_EVENT_DATE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'LEAVE_ERROR', errMessage(e));
  }
};

export const getMembersHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    await assertGroupReadable(request.params.id, request.user?.id);
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '30', 10) || 30));
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const viewerId = (request.user as JwtUser | undefined)?.id ?? null;
    const members = await groupService.getMembers(request.params.id, page, limit, viewerId);
    return ok(reply, { members });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'MEMBERS_ERROR', errMessage(e));
  }
};

export const setMemberRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; userId: string }; Body: { role: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: requesterId } = request.user as JwtUser;
    const { role } = request.body;
    if (!isMemberRole(role)) return fail(reply, 400, 'INVALID_ROLE', 'Unknown member role');
    const member = await groupService.setMemberRole(request.params.id, requesterId, request.params.userId, role);
    return ok(reply, { member });
  } catch (e) {
    const status = errStatus(e) ?? (/not authorized/i.test(errMessage(e)) ? 403 : 400);
    return fail(reply, status, 'SET_ROLE_ERROR', errMessage(e));
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
  } catch (e) {
    const status = errStatus(e) ?? (/not authorized/i.test(errMessage(e)) ? 403 : 400);
    return fail(reply, status, 'REMOVE_MEMBER_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_ROLES_ERROR', errMessage(e));
  }
};

export const createCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { name: string; color?: string; icon?: string; permissions?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const role = await groupService.createCustomRole(request.params.id, userId, request.body);
    return ok(reply, { role }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CREATE_ROLE_ERROR', errMessage(e));
  }
};

export const updateCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; roleId: string }; Body: { name?: string; color?: string; icon?: string; permissions?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const role = await groupService.updateCustomRole(request.params.id, userId, request.params.roleId, request.body);
    return ok(reply, { role });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'UPDATE_ROLE_ERROR', errMessage(e));
  }
};

export const deleteCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; roleId: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_roles'))) return;
    await groupService.deleteCustomRole(request.params.id, request.params.roleId);
    return ok(reply, { deleted: true });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'DELETE_ROLE_ERROR', errMessage(e));
  }
};

// ── Events ──────────────────────────────────────────────────────────────────

export const createEventHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: Omit<CreateEventInput, 'groupId'> }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_events'))) return;
    const event = await groupService.createEvent({ ...request.body, groupId: request.params.id });
    return ok(reply, { event }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CREATE_EVENT_ERROR', errMessage(e));
  }
};

export const updateEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: UpdateEventInput }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId, request.user?.id);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requirePermission(request, reply, event.group_id, 'can_manage_events'))) return;
    const updated = await groupService.updateEvent(request.params.eventId, request.body);
    return ok(reply, { event: updated });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'UPDATE_EVENT_ERROR', errMessage(e));
  }
};

export const getEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId, request.user?.id);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    return ok(reply, { event });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'EVENT_FETCH_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'EVENTS_LIST_ERROR', errMessage(e));
  }
};

// ── Tickets ─────────────────────────────────────────────────────────────────

export const createTicketTierHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: Omit<CreateTicketTierInput, 'eventId'> }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId, request.user?.id);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requirePermission(request, reply, event.group_id, 'can_manage_events'))) return;
    const tier = await groupService.createTicketTier({ ...request.body, eventId: request.params.eventId });
    return ok(reply, { tier }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CREATE_TICKET_ERROR', errMessage(e));
  }
};

export const updateTicketTierHandler = async (
  request: FastifyRequest<{ Params: { tierId: string }; Body: Partial<Omit<CreateTicketTierInput, 'eventId'>> }>,
  reply: FastifyReply,
) => {
  try {
    const tier = await groupService.getTicketTierWithGroupId(request.params.tierId);
    if (!tier) return fail(reply, 404, 'NOT_FOUND', 'Ticket tier not found');
    if (!(await requirePermission(request, reply, tier.event.group_id, 'can_manage_events'))) return;
    const updated = await groupService.updateTicketTier(request.params.tierId, request.body);
    return ok(reply, { tier: updated });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'UPDATE_TICKET_ERROR', errMessage(e));
  }
};

export const deleteTicketTierHandler = async (
  request: FastifyRequest<{ Params: { tierId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const tier = await groupService.getTicketTierWithGroupId(request.params.tierId);
    if (!tier) return fail(reply, 404, 'NOT_FOUND', 'Ticket tier not found');
    if (!(await requirePermission(request, reply, tier.event.group_id, 'can_manage_events'))) return;
    await groupService.deleteTicketTier(request.params.tierId);
    return ok(reply, { deleted: true });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'DELETE_TICKET_ERROR', errMessage(e));
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
  } catch (e) {
    if (e instanceof Error && errMessage(e) === 'EVENT_EXPIRED') {
      return fail(reply, 409, 'EVENT_EXPIRED', 'Мероприятие завершилось. SOON откроется, когда организатор назначит новую дату.');
    }
    return fail(reply, errStatus(e) ?? 400, 'SOON_BADGE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SOON_TOGGLE_ERROR', errMessage(e));
  }
};

export const getUserSoonBadgesHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const badges = await groupService.getUserSoonBadges(request.params.userId, request.user?.id);
    return ok(reply, { badges });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'SOON_BADGES_ERROR', errMessage(e));
  }
};

// ── Commission ──────────────────────────────────────────────────────────────

export const upsertCommissionHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateCommissionInput }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    const commission = await groupService.upsertCommission(request.params.id, request.body);
    return ok(reply, { commission });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'COMMISSION_ERROR', errMessage(e));
  }
};

// ── Group posts ─────────────────────────────────────────────────────────────

export const getGroupPostsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string; hasMedia?: string; archived?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const hasMedia = request.query.hasMedia === 'true';
    const viewerId = (request.user as JwtUser | undefined)?.id ?? null;
    const archived = request.query.archived === 'true';
    // Архив группы видят только модераторы, владелец и администраторы
    if (archived && !(viewerId && await groupService.isAtLeastModerator(request.params.id, viewerId))) {
      return fail(reply, 403, 'FORBIDDEN', 'Архив доступен только модераторам группы');
    }
    const posts = await groupService.getGroupPosts(request.params.id, page, limit, hasMedia, viewerId, archived);
    return ok(reply, { posts });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GROUP_POSTS_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'MY_GROUPS_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'USER_GROUPS_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'PIN_GROUP_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'COMMON_GROUPS_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'RATE_GROUP_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_RATING_ERROR', errMessage(e));
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
      moderatePost(post.id, userId, request.body.content ?? '').catch(logError('[AUTOMOD] analyzeGroupPost error'));
    }
    return ok(reply, { post }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CREATE_GROUP_POST_ERROR', errMessage(e));
  }
};
// ── Creative Kanban ───────────────────────────────────────────────────────────

export const getKanbanHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const columns = await groupService.getKanban(request.params.id, request.user?.id);
    return ok(reply, { columns });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'KANBAN_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'RSVP_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CANCEL_RSVP_ERROR', errMessage(e));
  }
};

export const getEventAttendeesHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply,
) => {
  try {
    const page = Number(request.query.page) || 1;
    const limit = Math.min(Number(request.query.limit) || 50, 100);
    const result = await groupService.getEventAttendees(request.params.eventId, page, limit, request.user?.id);
    return ok(reply, result);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_ATTENDEES_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_MY_RSVP_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'DISCOVER_ERROR', errMessage(e));
  }
};

// ── Group events list ────────────────────────────────────────────────────────

export const getGroupEventsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: number; limit?: number; status?: string } }>,
  reply: FastifyReply,
) => {
  try {
    await assertGroupReadable(request.params.id, request.user?.id);
    const page = Number(request.query.page) || 1;
    const limit = Math.min(Number(request.query.limit) || 20, 50);
    const result = await groupService.listEvents({ groupId: request.params.id, status: request.query.status, page: String(page), limit: String(limit) }, request.user?.id);
    return ok(reply, result);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GROUP_EVENTS_ERROR', errMessage(e));
  }
};

// ── Sub-events ──────────────────────────────────────────────────────────────────

export const listSubEventsHandler = async (
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const list = await groupService.listSubEvents(request.params.eventId, request.user?.id);
    return ok(reply, { subEvents: list });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'SUBEVENT_LIST_ERROR', errMessage(e));
  }
};

export const createSubEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string }; Body: SubEventInput }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId, request.user?.id);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requirePermission(request, reply, event.group_id, 'can_manage_events'))) return;
    const sub = await groupService.createSubEvent(request.params.eventId, request.body);
    return ok(reply, { subEvent: sub }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SUBEVENT_CREATE_ERROR', errMessage(e));
  }
};

export const updateSubEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string; subId: string }; Body: UpdateSubEventInput }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId, request.user?.id);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requirePermission(request, reply, event.group_id, 'can_manage_events'))) return;
    const sub = await groupService.updateSubEvent(request.params.eventId, request.params.subId, request.body);
    return ok(reply, { subEvent: sub });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SUBEVENT_UPDATE_ERROR', errMessage(e));
  }
};

export const deleteSubEventHandler = async (
  request: FastifyRequest<{ Params: { eventId: string; subId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const event = await groupService.getEvent(request.params.eventId, request.user?.id);
    if (!event) return fail(reply, 404, 'NOT_FOUND', 'Event not found');
    if (!(await requirePermission(request, reply, event.group_id, 'can_manage_events'))) return;
    await groupService.deleteSubEvent(request.params.eventId, request.params.subId);
    return ok(reply, { deleted: true });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SUBEVENT_DELETE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_MESSAGES_ERROR', errMessage(e));
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
    moderateGroupMessage(userId).catch(logError('[AUTOMOD] moderateGroupMessage error'));
    return ok(reply, { message: msg }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SEND_MESSAGE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'START_DM_ERROR', errMessage(e));
  }
};

export const openGroupThreadHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { userId?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const target = request.body?.userId;
    if (typeof target !== 'string' || !target) return fail(reply, 400, 'OPEN_THREAD_ERROR', 'userId is required');
    const conversationId = await messageService.openGroupThread(request.params.id, userId, target);
    return ok(reply, { conversationId });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'OPEN_THREAD_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_INBOX_ERROR', errMessage(e));
  }
};

// ── Artist Queue (Todo) ───────────────────────────────────────────────────────

export const getGroupTodoColumnsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const columns = await groupService.getTodoColumns(request.params.id);
    return ok(reply, { columns });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_TODO_COLUMNS_ERROR', errMessage(e));
  }
};

export const updateGroupTodoColumnsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { columns: Array<{ key?: string; label?: string; icon?: string; color?: string }> } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    if (!Array.isArray(request.body?.columns) || !request.body.columns.length) {
      return fail(reply, 400, 'EMPTY_COLUMNS', 'At least one column is required');
    }
    const columns = await groupService.updateTodoColumns(request.params.id, request.body.columns);
    return ok(reply, { columns });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'UPDATE_TODO_COLUMNS_ERROR', errMessage(e));
  }
};

export const getGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const items = await groupService.getTodoItems(request.params.id, (request.user as JwtUser | undefined)?.id);
    return ok(reply, { items });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_TODO_ERROR', errMessage(e));
  }
};

export const createGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { title: string; description?: string; status?: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    const { title, description, status } = request.body;
    if (!title?.trim()) return fail(reply, 400, 'EMPTY_TITLE', 'Title is required');
    const item = await groupService.createTodoItem(request.params.id, { title, description, status });
    return ok(reply, { item }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'CREATE_TODO_ERROR', errMessage(e));
  }
};

export const updateGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string; itemId: string }; Body: { title?: string; description?: string; status?: string; position?: number } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    const { id: actorId } = request.user as JwtUser;
    const item = await groupService.updateTodoItem(request.params.id, request.params.itemId, request.body, actorId);
    return ok(reply, { item });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'UPDATE_TODO_ERROR', errMessage(e));
  }
};

export const deleteGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string; itemId: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    await groupService.deleteTodoItem(request.params.id, request.params.itemId);
    return ok(reply, { success: true });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'DELETE_TODO_ERROR', errMessage(e));
  }
};

export const reorderGroupTodoHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { orderedIds: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_settings'))) return;
    await groupService.reorderTodoItems(request.params.id, request.body.orderedIds);
    return ok(reply, { success: true });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'REORDER_TODO_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_ORDERS_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CREATE_ORDER_ERROR', errMessage(e));
  }
};

export const updateOrderStatusHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string }; Body: { status: string; deadlineAt?: string | null } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { status, deadlineAt } = request.body;
    if (!isOrderStatus(status)) return fail(reply, 400, 'INVALID_STATUS', 'Unknown order status');
    const order = await groupService.updateOrderStatus(request.params.orderId, userId, status, deadlineAt);
    return ok(reply, { order });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'UPDATE_ORDER_STATUS_ERROR', errMessage(e));
  }
};

export const getOrderDetailHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const order = await groupService.getOrderDetail(request.params.id, request.params.orderId, userId);
    return ok(reply, { order });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GET_ORDER_ERROR', errMessage(e));
  }
};

export const confirmOrderPaymentHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string }; Body: { deadlineAt?: string | null } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const order = await groupService.confirmOrderPayment(request.params.orderId, userId, request.body?.deadlineAt);
    return ok(reply, { order });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CONFIRM_PAYMENT_ERROR', errMessage(e));
  }
};

export const confirmOrderCompletionHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const order = await groupService.confirmOrderCompletion(request.params.orderId, userId);
    return ok(reply, { order });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'CONFIRM_COMPLETION_ERROR', errMessage(e));
  }
};

export const getOrderProgressHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const progress = await groupService.getOrderProgress(request.params.id, request.params.orderId, userId);
    return ok(reply, { progress });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ORDER_PROGRESS_ERROR', errMessage(e));
  }
};

export const addOrderProgressHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string }; Body: { text?: string; imageUrls?: string[]; stage?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const entry = await groupService.addOrderProgress(request.params.id, request.params.orderId, userId, request.body ?? {});
    return reply.code(201).send({ success: true, data: { entry }, error: null });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ORDER_PROGRESS_ERROR', errMessage(e));
  }
};

export const deleteOrderProgressHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string; progressId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await groupService.deleteOrderProgress(request.params.id, request.params.orderId, request.params.progressId, userId);
    return ok(reply, { id: request.params.progressId });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ORDER_PROGRESS_ERROR', errMessage(e));
  }
};

export const updateOrderHandler = async (
  request: FastifyRequest<{ Params: { id: string; orderId: string }; Body: { deadlineAt?: string | null; description?: string | null; references?: string[] } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { deadlineAt, description, references } = request.body ?? {};
    const order = await groupService.updateOrder(request.params.orderId, userId, { deadlineAt, description, references });
    return ok(reply, { order });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'UPDATE_ORDER_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'DELETE_ORDER_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'BUSINESS_STATS_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'DONATE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'GROUP_BALANCE_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'GET_ORDER_CONVERSATION_ERROR', errMessage(e));
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
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'TRENDING_ERROR', errMessage(e));
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
  } catch (e) {
    const code = errMessage(e) === 'Not a member' ? 403 : 500;
    return fail(reply, code, 'NOTIFY_TOGGLE_ERROR', errMessage(e));
  }
};

// ── Ownership transfer ──────────────────────────────────────────────────────

export const transferOwnershipHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    if (typeof request.body?.userId !== 'string') return fail(reply, 400, 'INVALID_USER', 'userId is required');
    const result = await groupService.transferOwnership(request.params.id, userId, request.body.userId);
    return ok(reply, result);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'TRANSFER_OWNERSHIP_ERROR', errMessage(e));
  }
};

export const setMemberCustomRoleHandler = async (
  request: FastifyRequest<{ Params: { id: string; userId: string }; Body: { roleId: string | null } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: requesterId } = request.user as JwtUser;
    const roleId = request.body?.roleId ?? null;
    if (roleId !== null && typeof roleId !== 'string') return fail(reply, 400, 'INVALID_ROLE', 'roleId must be a string or null');
    const member = await groupService.setMemberCustomRole(request.params.id, requesterId, request.params.userId, roleId);
    return ok(reply, { member });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'SET_CUSTOM_ROLE_ERROR', errMessage(e));
  }
};

// ── Join applications (closed groups) ───────────────────────────────────────

export const getMyJoinRequestHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    return ok(reply, { pending: await groupService.hasPendingJoinRequest(request.params.id, userId) });
  } catch (e) {
    return fail(reply, 500, 'JOIN_REQUEST_ERROR', errMessage(e));
  }
};

export const cancelJoinRequestHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    return ok(reply, await groupService.cancelJoinRequest(request.params.id, userId));
  } catch (e) {
    return fail(reply, 500, 'JOIN_REQUEST_ERROR', errMessage(e));
  }
};

export const listJoinRequestsHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_members'))) return;
    return ok(reply, { requests: await groupService.listJoinRequests(request.params.id) });
  } catch (e) {
    return fail(reply, 500, 'JOIN_REQUESTS_ERROR', errMessage(e));
  }
};

export const resolveJoinRequestHandler = async (
  request: FastifyRequest<{ Params: { id: string; requestId: string }; Body: { approve: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requirePermission(request, reply, request.params.id, 'can_manage_members'))) return;
    if (typeof request.body?.approve !== 'boolean') return fail(reply, 400, 'INVALID_BODY', 'approve must be a boolean');
    return ok(reply, await groupService.resolveJoinRequest(request.params.id, request.params.requestId, request.body.approve));
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'RESOLVE_JOIN_REQUEST_ERROR', errMessage(e));
  }
};

// ── Reviews, digest, categories, team ───────────────────────────────────────

export const listReviewsHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  try {
    await assertGroupReadable(request.params.id, request.user?.id);
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? '20', 10) || 20));
    return ok(reply, await groupService.listReviews(request.params.id, page, limit));
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'REVIEWS_ERROR', errMessage(e));
  }
};

export const canReviewHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    return ok(reply, await groupService.canReview(request.params.id, userId));
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'REVIEW_ERROR', errMessage(e));
  }
};

export const upsertReviewHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { rating: number; text: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const review = await groupService.upsertReview(request.params.id, userId, Number(request.body?.rating), String(request.body?.text ?? ''));
    return ok(reply, { review }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'REVIEW_ERROR', errMessage(e));
  }
};

export const deleteReviewHandler = async (
  request: FastifyRequest<{ Params: { id: string; reviewId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    return ok(reply, await groupService.deleteReview(request.params.id, request.params.reviewId, userId));
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'REVIEW_ERROR', errMessage(e));
  }
};

export const getDigestHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const viewerId = (request.user as JwtUser | undefined)?.id ?? null;
    return ok(reply, { digest: await groupService.getDigest(request.params.id, viewerId) });
  } catch (e) {
    return fail(reply, 500, 'DIGEST_ERROR', errMessage(e));
  }
};

export const getCategoriesHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    return ok(reply, { categories: await groupService.getCategories(request.params.id) });
  } catch (e) {
    return fail(reply, 500, 'CATEGORIES_ERROR', errMessage(e));
  }
};

export const getTeamHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    if (!(await requireContentAccess(request, reply, request.params.id))) return;
    const viewerId = (request.user as JwtUser | undefined)?.id ?? null;
    return ok(reply, { team: await groupService.getMembers(request.params.id, 1, 50, viewerId, true) });
  } catch (e) {
    return fail(reply, 500, 'TEAM_ERROR', errMessage(e));
  }
};
