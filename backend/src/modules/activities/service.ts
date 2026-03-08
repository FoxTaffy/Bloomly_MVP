import prisma from '../../config/prisma.js';

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

export async function computeTrustScore(userId: string): Promise<TrustScore> {
  const [rows, blacklist] = await Promise.all([
    prisma.activityParticipant.groupBy({
      by: ['status'],
      where: { user_id: userId, deleted_at: null },
      _count: { status: true },
    }),
    prisma.activityBlacklist.findUnique({ where: { user_id: userId } }),
  ]);

  const counts = Object.fromEntries(rows.map((r) => [r.status, r._count.status]));
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

    // Compute trust scores for all participants in parallel
    const participantsWithTrust = await Promise.all(
      activity.participants.map(async (p) => ({
        ...p,
        trust: await computeTrustScore(p.user_id),
      }))
    );

    return { ...activity, participants: participantsWithTrust };
  },

  // ── List for group ────────────────────────────────────────────────────────

  async listForGroup(groupId: string) {
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
    // Check blacklist
    const blacklisted = await prisma.activityBlacklist.findUnique({ where: { user_id: userId } });
    if (blacklisted) {
      throw Object.assign(
        new Error('Вы в чёрном списке интерактивов: ' + blacklisted.reason),
        { statusCode: 403 }
      );
    }

    const activity = await prisma.activity.findFirst({
      where: { id: activityId, deleted_at: null },
      include: { _count: { select: { participants: { where: { deleted_at: null } } } } },
    });
    if (!activity) throw Object.assign(new Error('Activity not found'), { statusCode: 404 });
    if (activity.status !== 'active') throw Object.assign(new Error('Интерактив уже не принимает участников'), { statusCode: 400 });
    if (activity.max_participants && activity._count.participants >= activity.max_participants) {
      throw Object.assign(new Error('Мест больше нет'), { statusCode: 400 });
    }

    // withdraw_deadline = join date + 3 days
    const withdrawDeadline = new Date();
    withdrawDeadline.setDate(withdrawDeadline.getDate() + 3);

    const participant = await prisma.activityParticipant.upsert({
      where: { activity_id_user_id: { activity_id: activityId, user_id: userId } },
      create: {
        activity_id:       activityId,
        user_id:           userId,
        status:            'pending',
        withdraw_deadline: withdrawDeadline,
      },
      update: {
        // Re-join after soft-delete
        deleted_at:        null,
        status:            'pending',
        withdraw_deadline: withdrawDeadline,
      },
      include: { user: { select: userMiniSelect } },
    });
    return participant;
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
