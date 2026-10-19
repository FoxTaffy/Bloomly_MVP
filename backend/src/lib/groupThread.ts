import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../config/prisma.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Личная переписка пользователя с группой (Conversation type='community'): пользователь видит её
 * во вкладке «Группы» как чат с группой, а персонал группы отвечает от лица группы из «Обращений».
 * Участвовать в такой переписке сам пользователь может без членства в группе — например, заявитель на лот.
 * Идемпотентно: удалённая переписка восстанавливается, а не дублируется (пара group_id + group_dm_user_id уникальна).
 */
export async function ensureGroupThread(groupId: string, userId: string, db: Db = prisma): Promise<string> {
  const existing = await db.conversation.findUnique({
    where: { group_id_group_dm_user_id: { group_id: groupId, group_dm_user_id: userId } },
    select: { id: true, deleted_at: true },
  });
  if (existing) {
    if (existing.deleted_at) {
      await db.conversation.update({ where: { id: existing.id }, data: { deleted_at: null } });
    }
    await db.conversationParticipant.upsert({
      where: { conversation_id_user_id: { conversation_id: existing.id, user_id: userId } },
      update: { hidden_at: null },
      create: { conversation_id: existing.id, user_id: userId, role: 'member' },
    });
    return existing.id;
  }
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true, avatar_url: true } });
  const created = await db.conversation.create({
    data: {
      type: 'community',
      is_group: false,
      name: group.name,
      avatar_url: group.avatar_url,
      group_id: groupId,
      group_dm_user_id: userId,
      participants: { create: [{ user_id: userId, role: 'member' }] },
    },
    select: { id: true },
  });
  return created.id;
}
