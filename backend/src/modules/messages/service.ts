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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enrichWithForwardedSenders<T extends { forwarded_from_sender_id?: string | null }>(
  messages: T[],
): Promise<(T & { forwarded_from_sender: typeof senderSelect | null })[]> {
  const ids = [...new Set(messages.filter(m => m.forwarded_from_sender_id).map(m => m.forwarded_from_sender_id as string))];
  if (!ids.length) return messages.map(m => ({ ...m, forwarded_from_sender: null }));
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: senderSelect });
  const byId = Object.fromEntries(users.map((u: any) => [u.id, u]));
  return messages.map(m => ({ ...m, forwarded_from_sender: m.forwarded_from_sender_id ? byId[m.forwarded_from_sender_id] ?? null : null }));
}

/** Validates and normalizes the metadata payload for card-style messages. */
function validateCardMetadata(type: 'payment_request' | 'tip', metadata: unknown): Record<string, unknown> {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const amount = Number(meta.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw Object.assign(new Error('amount must be a positive number'), { statusCode: 400 });
  }
  if (type === 'payment_request') {
    const description = typeof meta.description === 'string' ? meta.description.trim().slice(0, 300) : '';
    const out: Record<string, unknown> = { amount, description, status: 'pending' };
    if (meta.prepaymentPercent != null) {
      const pct = Number(meta.prepaymentPercent);
      if (Number.isFinite(pct) && pct > 0 && pct <= 100) out.prepaymentPercent = pct;
    }
    if (typeof meta.deadline === 'string' && !Number.isNaN(Date.parse(meta.deadline))) {
      out.deadline = meta.deadline;
    }
    return out;
  }
  // tip
  const note = typeof meta.note === 'string' ? meta.note.trim().slice(0, 200) : '';
  return { amount, note };
}

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

    const target = await prisma.user.findUnique({
      where: { id: userB },
      select: { allow_messages: true },
    });
    if (!target) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (!target.allow_messages) throw Object.assign(new Error('MESSAGES_DISABLED'), { statusCode: 403 });

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
  async getConversations(userId: string, archived?: boolean, label?: string) {
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        user_id: userId,
        hidden_at: null,
        ...(archived !== undefined ? { archived } : {}),
        ...(label ? { label } : {}),
      },
      include: {
        conversation: {
          include: {
            // Capped — the client only ever renders up to 4 avatars in the group grid.
            // Fetching every member of a large community's conversation on every list
            // load was pulling in thousands of rows for no reason; participants_count
            // (a cheap aggregate) carries the real total for the "N участников" label.
            participants: {
              take: 6,
              include: { user: { select: senderSelect } },
            },
            _count: { select: { participants: true } },
            messages: {
              where: { deleted_at: null },
              orderBy: { created_at: 'desc' },
              take: 1,
              include: { sender: { select: senderSelect } },
            },
            pinnedMessage: {
              select: {
                id: true, text: true, type: true, file_url: true, created_at: true,
                sender: { select: { id: true, username: true, display_name: true } },
              },
            } as any,
          },
        },
      },
      orderBy: { conversation: { updated_at: 'desc' } },
    });

    return participants.map((p: any) => ({
      ...p.conversation,
      pinned_message: p.conversation.pinnedMessage ?? null,
      my_participant: {
        archived: p.archived,
        hidden_at: p.hidden_at,
        last_read_at: p.last_read_at,
        label: p.label,
        role: p.role,
        personal_pinned_message_id: p.personal_pinned_message_id ?? null,
      },
      last_message: p.conversation.messages[0] ?? null,
      participants_count: p.conversation._count.participants,
      other_participants: p.conversation.participants
        .filter((cp: any) => cp.user_id !== userId)
        .map((cp: any) => ({ user_id: cp.user_id, user: cp.user, last_read_at: cp.last_read_at ?? null })),
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

    const messages = await prisma.message.findMany({
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

    return enrichWithForwardedSenders(messages);
  },

  /**
   * Send a message, persist it and broadcast to all conversation participants.
   */
  async sendMessage({ conversationId, senderId, content, encrypted_text, file_url, media_type, reply_to_id, type, metadata }: SendMessageInput) {
    await this._assertParticipant(conversationId, senderId);

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, participants: { select: { user_id: true } } },
    });
    if (conv?.type === 'direct') {
      const recipientId = conv.participants.find((p: any) => p.user_id !== senderId)?.user_id;
      if (recipientId) {
        const recipient = await prisma.user.findUnique({
          where: { id: recipientId },
          select: { allow_messages: true },
        });
        if (recipient && !recipient.allow_messages) {
          throw Object.assign(new Error('MESSAGES_DISABLED'), { statusCode: 403 });
        }
      }
    }

    const text = content?.trim() ?? '';
    if (!text && !encrypted_text && !file_url && !type) throw new Error('Message must have text or media');

    // Card-style messages (payment_request, tip) carry a structured metadata payload
    // instead of being derived from file_url/media_type.
    if (type === 'payment_request' || type === 'tip') {
      const meta = validateCardMetadata(type, metadata);
      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: {
            conversation_id: conversationId,
            sender_id: senderId,
            text: text || null,
            type,
            reply_to_id: reply_to_id ?? null,
            metadata: meta as any,
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
        prisma.conversation.update({ where: { id: conversationId }, data: { updated_at: new Date() } }),
      ]);
      await this._broadcastNewMessage(conversationId, message);
      return message;
    }

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
          encrypted_text: encrypted_text ?? null,
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

    await this._broadcastNewMessage(conversationId, message);
    return message;
  },

  /**
   * Push a freshly created message to every participant's open sockets.
   */
  async _broadcastNewMessage(conversationId: string, message: unknown) {
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId },
      select: { user_id: true },
    });
    const wsPayload = { type: 'new_message', data: message };
    for (const { user_id } of participants) {
      messageSubscriptions.push(user_id, wsPayload);
    }
  },

  /**
   * Mark a pending payment_request message as paid, and post a payment_confirmation
   * card in reply. Chat-only — no real payment processor or Dealers' Den linkage.
   */
  async payPaymentRequest(messageId: string, userId: string) {
    const request = await prisma.message.findUnique({ where: { id: messageId } });
    if (!request) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    if (request.type !== 'payment_request') throw Object.assign(new Error('Not a payment request'), { statusCode: 400 });
    if (request.deleted_at) throw Object.assign(new Error('Message deleted'), { statusCode: 400 });
    await this._assertParticipant(request.conversation_id, userId);
    if (request.sender_id === userId) throw Object.assign(new Error('Cannot pay your own request'), { statusCode: 400 });

    const meta = (request.metadata as Record<string, any>) ?? {};
    if (meta.status === 'paid') throw Object.assign(new Error('Already paid'), { statusCode: 400 });

    const nextMeta = { ...meta, status: 'paid', paid_at: new Date().toISOString() };
    // Paying settles the prepayment portion when one was requested, not the full order total.
    const dueAmount = meta.prepaymentPercent ? (meta.amount * meta.prepaymentPercent) / 100 : meta.amount;
    const [updatedRequest, confirmation] = await prisma.$transaction([
      prisma.message.update({
        where: { id: messageId },
        data: { metadata: nextMeta as any },
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
      prisma.message.create({
        data: {
          conversation_id: request.conversation_id,
          sender_id: userId,
          type: 'payment_confirmation',
          reply_to_id: messageId,
          metadata: { amount: dueAmount, description: meta.description } as any,
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
    ]);

    const parts = await prisma.conversationParticipant.findMany({
      where: { conversation_id: request.conversation_id },
      select: { user_id: true },
    });
    for (const { user_id } of parts) {
      messageSubscriptions.push(user_id, { type: 'message_updated', data: updatedRequest });
    }
    await this._broadcastNewMessage(request.conversation_id, confirmation);

    return { request: updatedRequest, confirmation };
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
   * Edit message text (only sender, only text messages, within 24h).
   */
  async editMessage(messageId: string, userId: string, text: string) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    if (msg.sender_id !== userId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    if (msg.deleted_at) throw Object.assign(new Error('Message deleted'), { statusCode: 400 });
    if (msg.type !== 'text') throw Object.assign(new Error('Only text messages can be edited'), { statusCode: 400 });

    const trimmed = text.trim();
    if (!trimmed) throw Object.assign(new Error('Text cannot be empty'), { statusCode: 400 });
    if (trimmed.length > 4000) throw Object.assign(new Error('Text too long'), { statusCode: 400 });

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { text: trimmed, edited_at: new Date() },
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

    // Broadcast update to all participants
    const parts = await prisma.conversationParticipant.findMany({
      where: { conversation_id: msg.conversation_id },
      select: { user_id: true },
    });
    for (const { user_id } of parts) {
      messageSubscriptions.push(user_id, { type: 'message_updated', data: updated });
    }
    return updated;
  },

  /**
   * Toggle a single emoji reaction on a message for the calling user.
   * If user already reacted with that emoji → remove. Otherwise → add.
   */
  async toggleReaction(messageId: string, userId: string, emoji: string) {
    if (!emoji || emoji.length > 16) throw Object.assign(new Error('Invalid emoji'), { statusCode: 400 });
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    if (msg.deleted_at) throw Object.assign(new Error('Message deleted'), { statusCode: 400 });
    await this._assertParticipant(msg.conversation_id, userId);

    const current = (msg.reactions as Record<string, string[]> | null) ?? {};
    const next: Record<string, string[]> = { ...current };
    const list = next[emoji] ? [...next[emoji]] : [];
    const idx = list.indexOf(userId);
    if (idx === -1) {
      list.push(userId);
    } else {
      list.splice(idx, 1);
    }
    if (list.length === 0) {
      delete next[emoji];
    } else {
      next[emoji] = list;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { reactions: Object.keys(next).length ? next : null as any },
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

    const parts = await prisma.conversationParticipant.findMany({
      where: { conversation_id: msg.conversation_id },
      select: { user_id: true },
    });
    for (const { user_id } of parts) {
      messageSubscriptions.push(user_id, { type: 'message_updated', data: updated });
    }
    return updated;
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
    // for 'all': soft-delete the conversation
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { deleted_at: new Date() },
    });
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
  async createGroup(creatorId: string, name: string, userIds: string[], opts?: { avatar_url?: string; banner_url?: string }) {
    const all = Array.from(new Set([creatorId, ...userIds]));
    if (all.length < 3) throw Object.assign(new Error('Group requires at least 3 participants'), { statusCode: 400 });
    if (!name?.trim()) throw Object.assign(new Error('Group name is required'), { statusCode: 400 });

    return prisma.conversation.create({
      data: {
        type: 'group',
        is_group: true,
        name: name.trim(),
        ...(opts?.avatar_url ? { avatar_url: opts.avatar_url } : {}),
        ...(opts?.banner_url ? { banner_url: opts.banner_url } : {}),
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
  async updateGroup(conversationId: string, userId: string, data: { name?: string; avatar_url?: string; banner_url?: string }) {
    await this._assertAdmin(conversationId, userId);
    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
        ...(data.banner_url !== undefined ? { banner_url: data.banner_url } : {}),
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

  // ── Pin / Unpin message ─────────────────────────────────────────────────
  async pinMessage(convId: string, userId: string, messageId: string, scope: 'all' | 'me') {
    await this._assertParticipant(convId, userId);
    const msg = await prisma.message.findFirst({ where: { id: messageId, conversation_id: convId, deleted_at: null } });
    if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    if (scope === 'all') {
      await (prisma.conversation as any).update({ where: { id: convId }, data: { pinned_message_id: messageId } });
      // Broadcast system notification to all participants
      const actor = await prisma.user.findUnique({ where: { id: userId }, select: { display_name: true, username: true } });
      const actorName = actor?.display_name || actor?.username || '?';
      const sysMsg = await prisma.message.create({
        data: { conversation_id: convId, sender_id: userId, text: `\u{1F4CC} ${actorName} \u0437\u0430\u043a\u0440\u0435\u043f\u0438\u043b \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435`, type: 'system' },
        include: { sender: { select: senderSelect } },
      });
      await prisma.conversation.update({ where: { id: convId }, data: { updated_at: new Date() } });
      const parts = await prisma.conversationParticipant.findMany({ where: { conversation_id: convId }, select: { user_id: true } });
      for (const { user_id } of parts) {
        messageSubscriptions.push(user_id, { type: 'new_message', data: sysMsg });
      }
    } else {
      await prisma.$executeRaw`UPDATE "ConversationParticipant" SET personal_pinned_message_id = ${messageId}::uuid WHERE conversation_id = ${convId}::uuid AND user_id = ${userId}::uuid`;
    }
    return msg;
  },

  async unpinMessage(convId: string, userId: string, scope: 'all' | 'me') {
    await this._assertParticipant(convId, userId);
    if (scope === 'all') {
      await (prisma.conversation as any).update({ where: { id: convId }, data: { pinned_message_id: null } });
    } else {
      await prisma.$executeRaw`UPDATE "ConversationParticipant" SET personal_pinned_message_id = NULL WHERE conversation_id = ${convId}::uuid AND user_id = ${userId}::uuid`;
    }
  },

  // ── Media stats ─────────────────────────────────────────────────────────
  async getMediaStats(convId: string, userId: string) {
    await this._assertParticipant(convId, userId);
    type Row = { type: string; cnt: bigint };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT type, COUNT(*) as cnt
      FROM "Message"
      WHERE conversation_id = ${convId}::uuid
        AND deleted_at IS NULL
        AND file_url IS NOT NULL
      GROUP BY type
    `;
    const stats: Record<string, number> = {};
    for (const row of rows) stats[row.type] = Number(row.cnt);
    const voiceRows = await prisma.$queryRaw<Row[]>`
      SELECT 'voice' as type, COUNT(*) as cnt FROM "Message"
      WHERE conversation_id = ${convId}::uuid AND deleted_at IS NULL AND type = 'audio'
    `;
    if (voiceRows[0]) stats.voice = Number(voiceRows[0].cnt);
    const linkRows = await prisma.$queryRaw<Row[]>`
      SELECT 'link' as type, COUNT(*) as cnt FROM "Message"
      WHERE conversation_id = ${convId}::uuid AND deleted_at IS NULL
        AND text ~ 'https?://'
    `;
    if (linkRows[0]) stats.link = Number(linkRows[0].cnt);
    return stats;
  },

  // ── E2EE key management ────────────────────────────────────────────────

  /** Register or update the user's RSA-OAEP public key (JWK string). */
  async registerPublicKey(userId: string, publicKey: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { public_key: publicKey },
      select: { id: true, public_key: true },
    });
  },

  /** Get public keys for a list of user IDs (used by frontend to encrypt conv key for each participant). */
  async getPublicKeys(userIds: string[]): Promise<Record<string, string>> {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, public_key: true },
    });
    const map: Record<string, string> = {};
    for (const u of users) {
      if (u.public_key) map[u.id] = u.public_key;
    }
    return map;
  },

  /**
   * Store encrypted conversation keys for multiple participants.
   * Called by the conversation creator after generating the AES key on the client.
   * keys: { [userId]: encryptedKeyBase64 }
   */
  async setConversationKeys(convId: string, callerId: string, keys: Record<string, string>) {
    await this._assertParticipant(convId, callerId);
    const upserts = Object.entries(keys).map(([userId, encryptedKey]) =>
      (prisma as any).conversationKey.upsert({
        where: { conversation_id_user_id: { conversation_id: convId, user_id: userId } },
        create: { conversation_id: convId, user_id: userId, encrypted_key: encryptedKey },
        update: { encrypted_key: encryptedKey },
      }),
    );
    await prisma.$transaction(upserts);
  },

  /** Get the caller's encrypted conversation key for a given conversation. */
  async getMyConversationKey(convId: string, userId: string): Promise<string | null> {
    await this._assertParticipant(convId, userId);
    const row = await (prisma as any).conversationKey.findUnique({
      where: { conversation_id_user_id: { conversation_id: convId, user_id: userId } },
    });
    return row?.encrypted_key ?? null;
  },

  // ── Forward message ────────────────────────────────────────────────────

  /**
   * Forward a message to a target conversation.
   * The frontend re-encrypts content for the target conversation before calling this.
   */
  async forwardMessage(
    sourceMessageId: string,
    targetConvId: string,
    senderId: string,
    encryptedText?: string | null,
    text?: string | null,
  ) {
    const source = await prisma.message.findUnique({ where: { id: sourceMessageId } });
    if (!source) throw Object.assign(new Error('Source message not found'), { statusCode: 404 });
    if (source.deleted_at) throw Object.assign(new Error('Cannot forward deleted message'), { statusCode: 400 });
    await this._assertParticipant(targetConvId, senderId);

    const [fwdSender, [message]] = await Promise.all([
      prisma.user.findUnique({ where: { id: source.sender_id }, select: senderSelect }),
      prisma.$transaction([
        prisma.message.create({
          data: {
            conversation_id: targetConvId,
            sender_id: senderId,
            text: text ?? source.text ?? null,
            encrypted_text: encryptedText ?? null,
            type: source.type === 'system' ? 'text' : source.type,
            file_url: source.file_url ?? null,
            forwarded_from_id: source.id,
            forwarded_from_sender_id: source.sender_id,
            forwarded_from_conv_id: source.conversation_id,
          },
          include: {
            sender: { select: senderSelect },
          },
        }),
        prisma.conversation.update({
          where: { id: targetConvId },
          data: { updated_at: new Date() },
        }),
      ]),
    ]);

    const enriched = { ...message, forwarded_from_sender: fwdSender ?? null };

    // Real-time push
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversation_id: targetConvId },
      select: { user_id: true },
    });
    for (const { user_id } of participants) {
      messageSubscriptions.push(user_id, { type: 'new_message', data: enriched });
    }
    return enriched;
  },
};
