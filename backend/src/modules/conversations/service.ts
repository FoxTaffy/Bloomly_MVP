import prisma from '../../config/prisma.js';

export const conversationService = {
  async getConversations(userId: string) {
    const convs = await prisma.conversationParticipant.findMany({
      where: { user_id: userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
              },
            },
            messages: {
              orderBy: { created_at: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { conversation: { updated_at: 'desc' } },
    });
    return convs.map(cp => cp.conversation);
  },

  async createConversation(userId: string, participantId: string) {
    if (userId === participantId) throw new Error('Нельзя создать диалог с собой');

    // Check if conversation already exists
    const existing = await prisma.conversationParticipant.findFirst({
      where: {
        user_id: userId,
        conversation: {
          participants: { some: { user_id: participantId } },
        },
      },
      include: { conversation: true },
    });

    if (existing) return existing.conversation;

    return await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({ data: {} });
      await tx.conversationParticipant.createMany({
        data: [
          { conversation_id: conversation.id, user_id: userId },
          { conversation_id: conversation.id, user_id: participantId },
        ],
      });
      return conversation;
    });
  },

  async getMessages(conversationId: string, userId: string, page = 1, limit = 50) {
    // Verify user is participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
    });
    if (!participant) throw new Error('Нет доступа к диалогу');

    const skip = (page - 1) * limit;
    return await prisma.message.findMany({
      where: { conversation_id: conversationId },
      skip,
      take: limit,
      orderBy: { created_at: 'asc' },
      include: {
        sender: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        attachments: true,
      },
    });
  },

  async sendMessage(conversationId: string, senderId: string, content: string) {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: senderId } },
    });
    if (!participant) throw new Error('Нет доступа к диалогу');

    return await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversation_id: conversationId, sender_id: senderId, content },
        include: {
          sender: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updated_at: new Date() },
      });

      // Notify other participants
      const participants = await tx.conversationParticipant.findMany({
        where: { conversation_id: conversationId, user_id: { not: senderId } },
      });

      for (const p of participants) {
        await tx.notification.create({
          data: {
            user_id: p.user_id,
            actor_id: senderId,
            type: 'message',
            entity_id: conversationId,
          },
        });
      }

      return message;
    });
  },

  async markAsRead(conversationId: string, userId: string) {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
    });
    if (!participant) throw new Error('Нет доступа к диалогу');

    await prisma.message.updateMany({
      where: {
        conversation_id: conversationId,
        sender_id: { not: userId },
        read_at: null,
      },
      data: { read_at: new Date() },
    });

    return { success: true };
  },
};
