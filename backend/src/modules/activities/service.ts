import prisma from '../../config/prisma.js';
import { assertGroupReadable, accessError, requireUuid } from '../../lib/contentAccess.js';

// ── Selectors ─────────────────────────────────────────────────────────────────

const userMiniSelect = {
  id: true,
  username: true,
  display_name: true,
  avatar_url: true,
  badge_type: true,
} as const;

// ── TrustScore calculation ────────────────────────────────────────────────────

export type TrustTier = 'green' | 'yellow' | 'red' | 'none';

export interface TrustScore {
  tier: TrustTier;
  completed: number;
  withdrawn: number;
  delayed: number;
  fraud: number;
  total_finished: number;
  percent: number; // 0–100 completion rate
  is_blacklisted: boolean;
  blacklist_reason?: string;
}

function trustFromCounts(counts: Record<string, number>, blacklist?: { reason: string } | null): TrustScore {
  const completed   = counts['completed']  ?? 0;
  const withdrawn   = counts['withdrawn']  ?? 0;
  const delayed     = counts['delayed']    ?? 0;
  const fraud       = counts['fraud']      ?? 0;
  const total_finished = completed + withdrawn + delayed + fraud;

  const percent = total_finished === 0 ? 100 : Math.round((completed / total_finished) * 100);

  let tier: TrustTier;
  if (total_finished === 0) {
    tier = 'none';
  } else if (fraud > 0 || blacklist) {
    tier = 'red';
  } else if (percent >= 90 && delayed === 0) {
    tier = 'green';
  } else {
    tier = 'yellow';
  }

  return {
    tier,
    completed,
    withdrawn,
    delayed,
    fraud,
    total_finished,
    percent,
    is_blacklisted: !!blacklist,
    blacklist_reason: blacklist?.reason,
  };
}

export async function computeTrustScores(userIds: string[]): Promise<Map<string, TrustScore>> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return new Map();
  const [rows, blacklist] = await Promise.all([
    prisma.activityParticipant.groupBy({ by: ['user_id', 'status'], where: { user_id: { in: unique }, deleted_at: null }, _count: { status: true } }),
    prisma.activityBlacklist.findMany({ where: { user_id: { in: unique } }, select: { user_id: true, reason: true } }),
  ]);
  const counts = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const current = counts.get(row.user_id) ?? {};
    current[row.status] = row._count.status;
    counts.set(row.user_id, current);
  }
  const blocked = new Map(blacklist.map(row => [row.user_id, row]));
  return new Map(unique.map(id => [id, trustFromCounts(counts.get(id) ?? {}, blocked.get(id))]));
}

export async function computeTrustScore(userId: string): Promise<TrustScore> {
  return (await computeTrustScores([userId])).get(userId)!;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const activityService = {

  // ── Create ────────────────────────────────────────────────────────────────

  async create(ownerId: string, input: {
    type: string;
    title: string;
    description?: string;
    deadline?: string;
    max_participants?: number;
    group_id?: string;
  }) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 ||
      typeof input.type !== 'string' || !input.type.trim() || input.type.length > 30) throw accessError('Invalid activity title or type', 400);
    if (input.max_participants !== undefined && input.max_participants !== null &&
      (!Number.isSafeInteger(input.max_participants) || input.max_participants < 1 || input.max_participants > 10000)) throw accessError('Invalid participant limit', 400);
    if (input.deadline && !Number.isFinite(new Date(input.deadline).getTime())) throw accessError('Invalid deadline', 400);
    if (input.group_id) {
      const group = await assertGroupReadable(input.group_id, ownerId);
      const member = await prisma.groupMember.findUnique({ where: { group_id_user_id: { group_id: group.id, user_id: ownerId } }, select: { role: true } });
      if (group.owner_id !== ownerId && !['owner', 'admin', 'moderator'].includes(member?.role ?? '')) throw accessError('Group staff access required', 403);
    }
    const activity = await prisma.activity.create({
      data: {
        type:             input.type,
        owner_id:         ownerId,
        group_id:         input.group_id ?? null,
        title:            input.title,
        description:      input.description ?? null,
        deadline:         input.deadline ? new Date(input.deadline) : null,
        max_participants: input.max_participants ?? null,
        status:           'active',
      },
      include: {
        owner: { select: userMiniSelect },
        _count: { select: { participants: true } },
      },
    });
    return activity;
  },

  // ── Get detail ────────────────────────────────────────────────────────────

  async getById(activityId: string, requesterId?: string) {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, deleted_at: null },
      include: {
        owner: { select: userMiniSelect },
        participants: {
          where: { deleted_at: null },
          include: { user: { select: userMiniSelect } },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { participants: true } },
      },
    });
    if (!activity) throw Object.assign(new Error('Activity not found'), { statusCode: 404 });
    if (activity.group_id) await assertGroupReadable(activity.group_id, requesterId);

    const scores = await computeTrustScores(activity.participants.map(participant => participant.user_id));
    const participantsWithTrust = activity.participants.map(participant => ({ ...participant, trust: scores.get(participant.user_id)! }));

    return { ...activity, participants: participantsWithTrust };
  },

  // ── List for group ────────────────────────────────────────────────────────

  async listForGroup(groupId: string, requesterId?: string) {
    await assertGroupReadable(groupId, requesterId);
    return prisma.activity.findMany({
      where: { group_id: groupId, deleted_at: null },
      include: {
        owner: { select: userMiniSelect },
        _count: { select: { participants: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  // ── Join ──────────────────────────────────────────────────────────────────

  async join(activityId: string, userId: string) {
    requireUuid(activityId);
    const blacklisted = await prisma.activityBlacklist.findUnique({ where: { user_id: userId } });
    if (blacklisted) throw accessError('Вы в чёрном списке интерактивов: ' + blacklisted.reason, 403);
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Activity" WHERE id = ${activityId}::uuid FOR UPDATE`;
      const activity = await tx.activity.findFirst({ where: { id: activityId, deleted_at: null } });
      if (!activity) throw accessError('Activity not found', 404);
      if (activity.group_id) await assertGroupReadable(activity.group_id, userId);
      const existing = await tx.activityParticipant.findUnique({ where: { activity_id_user_id: { activity_id: activityId, user_id: userId } } });
      // Repeating a request cannot reset an organizer's decision or extend the grace period.
      if (existing && !existing.deleted_at) return existing;
      if (existing && ['completed', 'fraud'].includes(existing.status)) throw accessError('Participation is already finalized', 409);
      if (activity.status !== 'active' || (activity.deadline && activity.deadline < new Date())) throw accessError('Интерактив уже не принимает участников', 400);
      const count = await tx.activityParticipant.count({ where: { activity_id: activityId, deleted_at: null } });
      if (activity.max_participants && count >= activity.max_participants) throw accessError('Мест больше нет', 409);
      const withdrawDeadline = existing?.withdraw_deadline ?? new Date(Date.now() + 3 * 86400000);
      return tx.activityParticipant.upsert({
        where: { activity_id_user_id: { activity_id: activityId, user_id: userId } },
        create: { activity_id: activityId, user_id: userId, status: 'pending', withdraw_deadline: withdrawDeadline },
        update: { deleted_at: null, status: 'pending', withdraw_deadline: withdrawDeadline },
      });
    });
  },

  // ── Withdraw ──────────────────────────────────────────────────────────────

  async withdraw(activityId: string, userId: string) {
    const participant = await prisma.activityParticipant.findFirst({
      where: { activity_id: activityId, user_id: userId, deleted_at: null },
    });
    if (!participant) throw Object.assign(new Error('Вы не являетесь участником этого интерактива'), { statusCode: 404 });
    if (['completed', 'fraud', 'withdrawn'].includes(participant.status)) {
      throw Object.assign(new Error('Нельзя отозвать заявку в текущем статусе'), { statusCode: 400 });
    }

    const now = new Date();
    const withinGrace = participant.withdraw_deadline && now <= participant.withdraw_deadline;

    // Soft delete + mark status
    const newStatus = withinGrace ? 'withdrawn' : 'withdrawn'; // Always mark as withdrawn
    // For late withdrawal (outside grace period) we leave history but don't auto-fraud — organizer decides
    const updated = await prisma.activityParticipant.update({
      where: { id: participant.id },
      data: {
        status:     newStatus,
        deleted_at: now, // soft delete
      },
    });

    return {
      participant: updated,
      withinGrace,
      message: withinGrace
        ? 'Выход в пределах 3-дневного периода — без штрафа для репутации'
        : 'Выход после окончания льготного периода — организатор был уведомлён',
    };
  },

  // ── Update participant status (organizer/owner only) ──────────────────────

  async updateParticipantStatus(
    activityId: string,
    targetUserId: string,
    requesterId: string,
    newStatus: string,
  ) {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, deleted_at: null },
    });
    if (!activity) throw Object.assign(new Error('Activity not found'), { statusCode: 404 });
    if (activity.owner_id !== requesterId) {
      throw Object.assign(new Error('Только организатор может менять статусы участников'), { statusCode: 403 });
    }

    const allowedStatuses = ['approved', 'completed', 'delayed', 'fraud'];
    if (!allowedStatuses.includes(newStatus)) {
      throw Object.assign(new Error('Недопустимый статус: ' + newStatus), { statusCode: 400 });
    }

    const participant = await prisma.activityParticipant.findFirst({
      where: { activity_id: activityId, user_id: targetUserId, deleted_at: null },
    });
    if (!participant) throw Object.assign(new Error('Участник не найден'), { statusCode: 404 });

    const updated = await prisma.activityParticipant.update({
      where: { id: participant.id },
      data: {
        status:       newStatus,
        submitted_at: newStatus === 'submitted' ? new Date() : undefined,
      },
      include: { user: { select: userMiniSelect } },
    });

    // If organizer marks as FRAUD — auto-add to blacklist
    if (newStatus === 'fraud') {
      await prisma.activityBlacklist.upsert({
        where: { user_id: targetUserId },
        create: {
          user_id:   targetUserId,
          reason:    `Помечен как мошенник в интерактиве "${activity.title}"`,
          banned_by: requesterId,
        },
        update: {
          reason:    `Помечен как мошенник в интерактиве "${activity.title}"`,
          banned_by: requesterId,
          banned_at: new Date(),
        },
      });
    }

    return updated;
  },

  // ── TrustScore ────────────────────────────────────────────────────────────

  async getTrustScore(userId: string): Promise<TrustScore> {
    return computeTrustScore(userId);
  },

  // ── Auto-ban overdue participants (called by cron) ────────────────────────

  async autoProcessOverdue() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find activities with deadlines that passed ≥7 days ago
    const overdueParticipants = await prisma.activityParticipant.findMany({
      where: {
        deleted_at: null,
        status: { in: ['pending', 'approved'] }, // Not yet resolved
        activity: {
          deadline: { lte: sevenDaysAgo },
          status: 'active',
          deleted_at: null,
        },
      },
      include: { activity: { select: { id: true, title: true } } },
    });

    let bannedCount = 0;
    for (const p of overdueParticipants) {
      // Auto-ban: mark participant as FRAUD in blacklist
      await prisma.activityBlacklist.upsert({
        where: { user_id: p.user_id },
        create: {
          user_id:   p.user_id,
          reason:    `Авто-бан: работа не сдана и нет отметки DELAYED в интерактиве "${p.activity.title}"`,
          banned_by: null,
        },
        update: {} as any, // don't overwrite manual bans
      });
      // Soft-delete the participant record, mark fraud
      await prisma.activityParticipant.update({
        where: { id: p.id },
        data: { status: 'fraud', deleted_at: new Date() },
      });
      bannedCount++;
    }

    return { bannedCount };
  },

  // ── Delete activity (owner only) ──────────────────────────────────────────

  async deleteActivity(activityId: string, userId: string) {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, deleted_at: null },
    });
    if (!activity) throw Object.assign(new Error('Activity not found'), { statusCode: 404 });
    if (activity.owner_id !== userId) {
      throw Object.assign(new Error('Только организатор может удалить интерактив'), { statusCode: 403 });
    }
    return prisma.activity.update({
      where: { id: activityId },
      data: { deleted_at: new Date(), status: 'cancelled' },
    });
  },
};
