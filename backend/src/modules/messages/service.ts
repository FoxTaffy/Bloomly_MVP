import prisma from '../../config/prisma.js';
import type { SendMessageInput, GetMessagesQuery } from './types.js';

// ── In-process real-time delivery ─────────────────────────────────────────────
// Registered by server.ts when a WebSocket connection authenticates.
type PushFn = (payload: string) => void;
const subscribers = new Map<string, Set<PushFn>>();

export const messageSubscriptions = {
  subscribe(userId: string, fn: PushFn): () => void {
    if (!subscribers.has(userId)) subscribers.set(userId, new Set());
    subscribers.get(userId)!.add(fn);
    return () => {
      subscribers.get(userId)?.delete(fn);
      if (!subscribers.get(userId)?.size) subscribers.delete(userId);
    };
  },

  push(userId: string, payload: object) {
    subscribers.get(userId)?.forEach((fn) => {
      try { fn(JSON.stringify(payload)); } catch { /* closed */ }
    });
  },
};

// ── Selector helpers ──────────────────────────────────────────────────────────
const senderSelect = {
  id: true,
  username: true,
  display_name: true,
  avatar_url: true,
  badge_type: true,
} as const;

// ── Service ───────────────────────────────────────────────────────────────────
export const messageService = {
  /**
   * Return or create a 1-to-1 conversation between two users.
   */
  async getOrCreateConversation(userA: string, userB: string) {
    // Self-DM = "Notes" (single participant)
    if (userA === userB) {
      const existing = await prisma.conversation.findFirst({
        where: { type: 'direct', participants: { every: { user_id: userA } } },
        include: { participants: { include: { user: { select: senderSelect } } } },
      })
      if (existing) return existing
      return prisma.conversation.create({
        data: { type: 'direct', participants: { create: [{ user_id: userA }] } },
        include: { participants: { include: { user: { select: senderSelect } } } },
      })
    }

    // Find an existing 1-to-1 (non-group) conversation where BOTH users participate
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { user_id: userA } } },
          { participants: { some: { user_id: userB } } },
        ],
      },
      include: {
        participants: {
          include: { user: { select: senderSelect } },
        },
      },
    });

    if (existing) return existing;

    return prisma.conversation.create({
      data: {
        type: 'direct',
        participants: {
          create: [{ user_id: userA }, { user_id: userB }],
        },
      },
      include: {
        participants: {
          include: { user: { select: senderSelect } },
        },
      },
    });
  },

  /**
   * List conversations for a user, ordered by latest message.
   * @param label  If provided, filter by participant label ('customer' = Заказы tab)
   */
  async getConversations(userId: string, archived = false, label?: string) {
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        user_id: userId,
        archived,
        ...(label ? { label } : {}),
      },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: { select: senderSelect } },
            },
            messages: {
              where: { deleted_at: null },
              orderBy: { created_at: 'desc' },
              take: 1,
              include: { sender: { select: senderSelect } },
            },
          },
        },
      },
      orderBy: { conversation: { updated_at: 'desc' } },
    });

    return participants.map((p) => ({
      ...p.conversation,
      my_participant: { archived: p.archived, hidden_at: p.hidden_at, last_read_at: p.last_read_at, label: p.label },
      last_message: p.conversation.messages[0] ?? null,
      other_participants: p.conversation.participants
        .filter((cp) => cp.user_id !== userId)
        .map((cp) => ({ user_id: cp.user_id, user: cp.user, last_read_at: cp.last_read_at ?? null })),
    }));
  },

  /**
   * Count unread messages across all conversations — single aggregated query.
   */
  async getUnreadCount(userId: string): Promise<number> {
    type Row = { count: bigint }
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT COUNT(*) AS count
      FROM "Message" m
      JOIN "ConversationParticipant" cp
        ON cp.conversation_id = m.conversation_id
       AND cp.user_id = ${userId}::uuid
      WHERE m.sender_id   <> ${userId}::uuid
        AND m.deleted_at  IS NULL
        AND (
          cp.last_read_at IS NULL
          OR m.created_at > cp.last_read_at
        )
    `
    return Number(rows[0]?.count ?? 0)
  },

  /**
   * Paginated message history (cursor-based, newest first).
   */
  async getMessages(
    conversationId: string,
    userId: string,
    { before, limit = 40 }: GetMessagesQuery,
  ) {
    await this._assertParticipant(conversationId, userId);

    return prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
        ...(before ? { created_at: { lt: new Date(before) } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: {
        sender: { select: senderSelect },
        reply_to: {
          select: {
            id: true, text: true, type: true, file_url: true,
            sender: { select: { id: true, username: true, display_name: true } },
          },
        },
      },
    });
  },

  /**
   * Send a message, persist it and broadcast to all conversation participants.
   */
  async sendMessage({ conversationId, senderId, content, file_url, media_type, reply_to_id }: SendMessageInput) {
    await this._assertParticipant(conversationId, senderId);

    const text = content?.trim() ?? '';
    if (!text && !file_url) throw new Error('Message must have text or media');

    // Determine message type
    let msgType: string = 'text';
    if (media_type === 'sticker') {
      msgType = 'sticker';
    } else if (file_url) {
      if (media_type === 'voice') {
        msgType = 'voice';
      } else if (/\.(?:mp4|webm|mov|avi|mkv)$/i.test(file_url)) {
        msgType = 'video';
      } else if (/\.(?:mp3|wav|ogg|m4a|flac|aac)$/i.test(file_url)) {
        msgType = 'voice';
      } else {
        msgType = 'image';
      }
    }

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversation_id: conversationId,
          sender_id: senderId,
          text: text || null,
          file_url: file_url ?? null,
          type: msgType,
          reply_to_id: reply_to_id ?? null,
        },
        include: {
          sender: { select: senderSelect },
          reply_to: {
            select: {
              id: true, text: true, type: true, file_url: true,
              sender: { select: { id: true, username: true, display_name: true } },
            },
          },
        },
      }),
      // bump conversation.updated_at so list ordering is correct
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updated_at: new Date() },
      }),
    ]);

    // Real-time push to all participants
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId },
      select: { user_id: true },
    });

    const wsPayload = {
      type: 'new_message',
      data: message,
    };

    for (const { user_id } of participants) {
      messageSubscriptions.push(user_id, wsPayload);
    }

    return message;
  },

  /**
   * Mark all messages in a conversation as read for this user.
   */
  async markRead(conversationId: string, userId: string) {
    const now = new Date();
    await prisma.conversationParticipant.update({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
      data: { last_read_at: now },
    });
    // Broadcast read receipt to other participants so they can update checkmarks
    const others = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId, user_id: { not: userId } },
      select: { user_id: true },
    });
    for (const { user_id } of others) {
      messageSubscriptions.push(user_id, {
        type: 'read_receipt',
        conversationId,
        userId,
        last_read_at: now.toISOString(),
      });
    }
  },

  /**
   * Soft-delete a message (only sender can do it).
   */
  async deleteMessage(messageId: string, userId: string) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new Error('Message not found');
    if (msg.sender_id !== userId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    return prisma.message.update({
      where: { id: messageId },
      data: { deleted_at: new Date() },
    });
  },

  /**
   * Archive or un-archive a conversation for the current user.
   */
  async setArchived(conversationId: string, userId: string, archived: boolean) {
    await this._assertParticipant(conversationId, userId);
    return prisma.conversationParticipant.update({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
      data: { archived },
    });
  },

  /**
   * Set a CRM label on a conversation for the current user.
   * label: 'default' | 'customer'
   */
  async setConversationLabel(conversationId: string, userId: string, label: string) {
    await this._assertParticipant(conversationId, userId);
    const allowed = ['default', 'customer'];
    if (!allowed.includes(label)) throw Object.assign(new Error('Invalid label'), { statusCode: 400 });
    return prisma.conversationParticipant.update({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
      data: { label },
    });
  },

  /**
   * Delete a conversation.
   * scope='me'  → just hide it for the current user (hidden_at)
   * scope='all' → hard-delete the whole conversation and all messages
   */
  async deleteConversation(conversationId: string, userId: string, scope: 'me' | 'all') {
    await this._assertParticipant(conversationId, userId);
    if (scope === 'me') {
      return prisma.conversationParticipant.update({
        where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
        data: { hidden_at: new Date() },
      });
    }
    // for 'all': hard-delete the conversation (cascade handles messages + participants)
    return prisma.conversation.delete({ where: { id: conversationId } });
  },

  /** Return IDs of participants OTHER than the given user (for typing broadcasts). */
  async getOtherParticipantIds(conversationId: string, exceptUserId: string): Promise<string[]> {
    const parts = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId, user_id: { not: exceptUserId } },
      select: { user_id: true },
    });
    return parts.map((p) => p.user_id);
  },

  // ── Group conversation management ─────────────────────────────────────────
  /**
   * Create a group conversation with at least 2 other users (3 total).
   */
  async createGroup(creatorId: string, name: string, userIds: string[]) {
    const all = Array.from(new Set([creatorId, ...userIds]));
    if (all.length < 3) throw Object.assign(new Error('Group requires at least 3 participants'), { statusCode: 400 });
    if (!name?.trim()) throw Object.assign(new Error('Group name is required'), { statusCode: 400 });

    return prisma.conversation.create({
      data: {
        type: 'group',
        is_group: true,
        name: name.trim(),
        participants: {
          create: all.map((uid) => ({
            user_id: uid,
            role: uid === creatorId ? 'admin' : 'member',
          })),
        },
      },
      include: {
        participants: {
          include: { user: { select: senderSelect } },
        },
      },
    });
  },

  /**
   * Update group name / avatar (admin only).
   */
  async updateGroup(conversationId: string, userId: string, data: { name?: string; avatar_url?: string }) {
    await this._assertAdmin(conversationId, userId);
    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
      },
    });
  },

  /**
   * Add a member to a group (admin only).
   */
  async addMember(conversationId: string, adminId: string, targetUserId: string) {
    await this._assertAdmin(conversationId, adminId);
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv?.is_group) throw Object.assign(new Error('Not a group'), { statusCode: 400 });

    const existing = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: targetUserId } },
    });
    if (existing) throw Object.assign(new Error('Already a member'), { statusCode: 409 });

    return prisma.conversationParticipant.create({
      data: { conversation_id: conversationId, user_id: targetUserId, role: 'member' },
      include: { user: { select: senderSelect } },
    });
  },

  /**
   * Remove a member from a group (admin only; cannot remove other admins unless you're the creator).
   */
  async removeMember(conversationId: string, adminId: string, targetUserId: string) {
    if (adminId === targetUserId) {
      // Self-leave: allowed always
      return prisma.conversationParticipant.delete({
        where: { conversation_id_user_id: { conversation_id: conversationId, user_id: targetUserId } },
      });
    }
    await this._assertAdmin(conversationId, adminId);
    return prisma.conversationParticipant.delete({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: targetUserId } },
    });
  },

  /**
   * Change a member's role (admin only).
   */
  async setMemberRole(conversationId: string, adminId: string, targetUserId: string, role: 'admin' | 'member') {
    await this._assertAdmin(conversationId, adminId);
    return prisma.conversationParticipant.update({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: targetUserId } },
      data: { role },
    });
  },

  /**
   * Return full participant list for a group (for the members panel).
   */
  async getGroupMembers(conversationId: string, userId: string) {
    await this._assertParticipant(conversationId, userId);
    return prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId },
      include: { user: { select: senderSelect } },
      orderBy: [{ role: 'asc' }, { user: { display_name: 'asc' } }],
    });
  },

  // ── private ──────────────────────────────────────────────────────────────

  // ── Community Chat ────────────────────────────────────────────────────────
  /**
   * Create a COMMUNITY conversation for a group. Idempotent.
   * All current group members are added as participants.
   */
  async initCommunityChat(groupId: string, ownerId: string): Promise<{ conversation: any; alreadyExists: boolean }> {
    const existing = await prisma.conversation.findUnique({
      where: { group_id: groupId },
      include: { participants: { include: { user: { select: senderSelect } } } },
    });
    if (existing) return { conversation: existing, alreadyExists: true };

    const [group, members] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, select: { name: true } }),
      prisma.groupMember.findMany({ where: { group_id: groupId }, select: { user_id: true, role: true } }),
    ]);
    if (!members.length) throw Object.assign(new Error('Group has no members'), { statusCode: 400 });

    const conversation = await prisma.conversation.create({
      data: {
        type: 'community',
        is_group: true,
        name: group?.name ?? 'Community Chat',
        group_id: groupId,
        participants: {
          create: members.map((m) => ({
            user_id: m.user_id,
            role: m.user_id === ownerId ? 'admin' : 'member',
          })),
        },
      },
      include: { participants: { include: { user: { select: senderSelect } } } },
    });
    return { conversation, alreadyExists: false };
  },

  /**
   * Get the community conversation for a group (null if not initialised).
   */
  async getCommunityConversation(groupId: string) {
    return prisma.conversation.findUnique({
      where: { group_id: groupId },
      select: {
        id: true, type: true, name: true, avatar_url: true, group_id: true,
        _count: { select: { participants: true, messages: true } },
      },
    });
  },

  async _assertParticipant(conversationId: string, userId: string) {
    const p = await prisma.conversationParticipant.findFirst({
      where: { conversation_id: conversationId, user_id: userId },
    });
    if (!p) throw Object.assign(new Error('Not a participant'), { statusCode: 403 });
  },

  async _assertAdmin(conversationId: string, userId: string) {
    const p = await prisma.conversationParticipant.findUnique({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
    });
    if (!p) throw Object.assign(new Error('Not a participant'), { statusCode: 403 });
    if (p.role !== 'admin') throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
  },
};
