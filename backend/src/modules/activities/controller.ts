import { FastifyRequest, FastifyReply } from 'fastify';
import { activityService, computeTrustScore } from './service.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';

interface JwtUser { id: string; role: string }

const ok   = (r: FastifyReply, data: any, code = 200) => r.code(code).send({ success: true, data, error: null });
const fail = (r: FastifyReply, code: number, errCode: string, msg: string) =>
  r.code(code).send({ success: false, data: null, error: { code: errCode, message: msg } });

// ── Create activity ───────────────────────────────────────────────────────────

export async function createActivityHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id: userId } = req.user as JwtUser;
    const body = req.body as any;
    if (!body?.title?.trim()) return fail(reply, 400, 'VALIDATION', 'title is required');
    if (!body?.type?.trim())  return fail(reply, 400, 'VALIDATION', 'type is required');
    const activity = await activityService.create(userId, {
      type:             body.type,
      title:            body.title,
      description:      body.description,
      deadline:         body.deadline,
      max_participants: body.max_participants,
      group_id:         body.group_id,
    });
    return ok(reply, { activity }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── Get activity ──────────────────────────────────────────────────────────────

export async function getActivityHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const activity = await activityService.getById(req.params.id, userId);
    return ok(reply, { activity });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── List activities for group ─────────────────────────────────────────────────

export async function listGroupActivitiesHandler(
  req: FastifyRequest<{ Params: { groupId: string } }>,
  reply: FastifyReply,
) {
  try {
    const activities = await activityService.listForGroup(req.params.groupId);
    return ok(reply, { activities });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── Join ──────────────────────────────────────────────────────────────────────

export async function joinActivityHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const participant = await activityService.join(req.params.id, userId);
    return ok(reply, { participant }, 201);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── Withdraw ──────────────────────────────────────────────────────────────────

export async function withdrawActivityHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    const result = await activityService.withdraw(req.params.id, userId);
    return ok(reply, result);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── Update participant status (organizer) ─────────────────────────────────────

export async function updateParticipantStatusHandler(
  req: FastifyRequest<{ Params: { id: string; userId: string }; Body: { status: string; notes?: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: requesterId } = req.user as JwtUser;
    const { status } = req.body;
    if (!status) return fail(reply, 400, 'VALIDATION', 'status is required');
    const participant = await activityService.updateParticipantStatus(
      req.params.id, req.params.userId, requesterId, status,
    );
    return ok(reply, { participant });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── TrustScore ────────────────────────────────────────────────────────────────

export async function getTrustScoreHandler(
  req: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) {
  try {
    const trust = await computeTrustScore(req.params.userId);
    return ok(reply, { trust });
  } catch (e) {
    return fail(reply, errStatus(e) ?? 500, 'ACTIVITY_ERROR', errMessage(e));
  }
}

// ── Delete activity ───────────────────────────────────────────────────────────

export async function deleteActivityHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtUser;
    await activityService.deleteActivity(req.params.id, userId);
    return ok(reply, null);
  } catch (e) {
    return fail(reply, errStatus(e) ?? 400, 'ACTIVITY_ERROR', errMessage(e));
  }
}
