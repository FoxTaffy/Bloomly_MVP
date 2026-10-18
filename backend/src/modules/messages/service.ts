import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { isBlockedBy } from '../../lib/blocks.js';
import { deleteFileByUrl, assertOwnedMedia } from '../media/service.js';
import type { SendMessageInput, GetMessagesQuery } from './types.js';
import { logError } from '../../lib/logger.js';
import { pushService } from '../push/service.js';

// Group roles that answer the group's inbox (group DMs) on its behalf.
const CHAT_STAFF_ROLES: readonly string[] = ['owner', 'admin', 'moderator'];

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
  banner_url: true,
  badge_type: true,
  deceased_at: true,
} as const;

// The message a reply points to, as shown in the quote above the bubble.
const replyToSelect = {
  select: {
    id: true, text: true, type: true, file_url: true,
    sender: { select: { id: true, username: true, display_name: true } },
  },
} as const;

// Relations every message row is returned with.
const messageInclude = { sender: { select: senderSelect }, reply_to: replyToSelect } as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Attaches `forwarded_from_sender` (the original author of a forwarded message), respecting
 * that author's `forward_identity_privacy` setting relative to `viewerId`. When not allowed,
 * the sender is nulled out but `forwarded_from_sender_id` stays set — the client shows a
 * "hidden user" placeholder instead of the identity.
 */
async function enrichWithForwardedSenders<T extends { forwarded_from_sender_id?: string | null }>(
  messages: T[],
  viewerId?: string,
): Promise<(T & { forwarded_from_sender: typeof senderSelect | null })[]> {
  const ids = [...new Set(messages.filter(m => m.forwarded_from_sender_id).map(m => m.forwarded_from_sender_id as string))];
  if (!ids.length) return messages.map(m => ({ ...m, forwarded_from_sender: null }));
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { ...senderSelect, forward_identity_privacy: true } });
  const visible = new Map<string, typeof senderSelect | null>();
  for (const u of users as any[]) {
    const { forward_identity_privacy, ...pub } = u;
    visible.set(u.id, (await isAllowedByPrivacy(forward_identity_privacy, u.id, viewerId)) ? pub : null);
  }
  return messages.map(m => ({ ...m, forwarded_from_sender: m.forwarded_from_sender_id ? visible.get(m.forwarded_from_sender_id) ?? null : null }));
}

/** Validates and normalizes the metadata payload for card-style messages. */
function validateCardMetadata(type: 'payment_request' | 'tip' | 'post_share' | 'group_share', metadata: unknown): Record<string, unknown> {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  if (type === 'post_share') {
    if (typeof meta.postId !== 'string' || !meta.postId) {
      throw Object.assign(new Error('postId is required'), { statusCode: 400 });
    }
    return { postId: meta.postId };
  }
  if (type === 'group_share') {
    if (typeof meta.groupId !== 'string' || !meta.groupId) {
      throw Object.assign(new Error('groupId is required'), { statusCode: 400 });
    }
    return { groupId: meta.groupId };
  }
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

/** Classifies an uploaded file's message type from its URL/extension (shared by single-file and album sends). */
function inferFileType(fileUrl: string, mediaType?: string): string {
  if (mediaType === 'voice') return 'voice';
  // Silent video (no audio track) — the uploader already determined this via ffprobe;
  // must win over the extension check below so it renders as a gif, not a full video player.
  if (mediaType === 'gif') return 'gif';
  if (/\.(?:mp4|webm|mov|avi|mkv)$/i.test(fileUrl)) return 'video';
  if (/\.(?:mp3|wav|ogg|m4a|flac|aac)$/i.test(fileUrl)) return 'audio';
  return 'image';
}

const MAX_ALBUM_FILES = 10;

// Free-tier daily message cap advertised on the subscription page (Lite+ is unlimited).
const FREE_DAILY_MESSAGE_LIMIT = 50;

// ── Service ───────────────────────────────────────────────────────────────────
export const messageService = {
  /**
   * Return or create a 1-to-1 conversation between two users.
   */
  async getOrCreateConversation(userA: string, userB: string) {
    // Self-DM = "Notes" (single participant)
    if (userA === userB) {
      // `every: { user_id: userA }` alone is vacuously true for a conversation with
      // ZERO participants, which would wrongly match any orphaned direct conversation
      // and hand a brand-new user someone else's (or nobody's) chat — `some` rules
      // that out by requiring at least one participant, who must be userA.
      const existing = await prisma.conversation.findFirst({
        where: { type: 'direct', participants: { every: { user_id: userA }, some: { user_id: userA } } },
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
      select: { messages_privacy: true },
    });
    if (!target) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if ((await isBlockedBy(userB, userA)) || (await isBlockedBy(userA, userB))) {
      throw Object.assign(new Error('MESSAGES_DISABLED'), { statusCode: 403 });
    }
    if (!(await isAllowedByPrivacy(target.messages_privacy, userB, userA))) {
      throw Object.assign(new Error('MESSAGES_DISABLED'), { statusCode: 403 });
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
  async getConversations(userId: string, archived?: boolean, label?: string) {
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        user_id: userId,
        hidden_at: null,
        conversation: { deleted_at: null },
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

    // Per-conversation unread count (for the list-row badge) — one aggregated query
    // instead of N, grouped by conversation.
    type UnreadRow = { conversation_id: string; count: bigint };
    const unreadRows = await prisma.$queryRaw<UnreadRow[]>`
      SELECT m.conversation_id, COUNT(*) AS count
      FROM "Message" m
      JOIN "ConversationParticipant" cp
        ON cp.conversation_id = m.conversation_id
       AND cp.user_id = ${userId}::uuid
      JOIN "Conversation" c ON c.id = m.conversation_id
      WHERE m.sender_id <> ${userId}::uuid
        AND m.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      GROUP BY m.conversation_id
    `;
    const unreadByConv = new Map(unreadRows.map((r) => [r.conversation_id, Number(r.count)]));

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
        muted_until: p.muted_until ?? null,
        sound_muted: p.sound_muted ?? false,
      },
      last_message: p.conversation.messages[0] ?? null,
      participants_count: p.conversation._count.participants,
      unread_count: unreadByConv.get(p.conversation.id) ?? 0,
      group_dm_user_id: p.conversation.group_dm_user_id ?? null,
      other_participants: p.conversation.participants
        .filter((cp: any) => cp.user_id !== userId)
        .map((cp: any) => ({ user_id: cp.user_id, user: cp.user, last_read_at: cp.last_read_at ?? null })),
    }));
  },

  /**
   * Count unread messages across all conversations, split by is_group so the client can
   * show separate "ЛС" (personal, is_group=false — includes 1:1 DMs and a member's own
   * community/group-DM thread) and "групповой чат" (is_group=true) badges.
   */
  async getUnreadCount(userId: string): Promise<{ total: number; personal: number; group: number }> {
    type Row = { is_group: boolean; count: bigint }
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT c.is_group AS is_group, COUNT(*) AS count
      FROM "Message" m
      JOIN "ConversationParticipant" cp
        ON cp.conversation_id = m.conversation_id
       AND cp.user_id = ${userId}::uuid
      JOIN "Conversation" c ON c.id = m.conversation_id
      WHERE m.sender_id   <> ${userId}::uuid
        AND m.deleted_at  IS NULL
        AND c.deleted_at  IS NULL
        AND cp.archived   = false
        AND cp.hidden_at  IS NULL
        AND (
          cp.last_read_at IS NULL
          OR m.created_at > cp.last_read_at
        )
      GROUP BY c.is_group
    `
    let personal = 0;
    let group = 0;
    for (const r of rows) {
      if (r.is_group) group = Number(r.count);
      else personal = Number(r.count);
    }
    return { total: personal + group, personal, group };
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
      include: messageInclude,
    });

    return enrichWithForwardedSenders(messages, userId);
  },

  /**
   * Send a message, persist it and broadcast to all conversation participants.
   */
  async sendMessage({ conversationId, senderId, content, encrypted_text, file_url, media_type, reply_to_id, type, metadata, attachments }: SendMessageInput) {
    // Стикер — файл автора пака, а не отправителя: владение проверяем только для обычных вложений.
    const isSticker = media_type === 'sticker' && !!file_url;
    if (isSticker) {
      const inPack = await prisma.stickerPack.findFirst({
        where: {
          stickers: { has: file_url! },
          deleted_at: null,
          OR: [{ author_id: senderId }, { userCollections: { some: { user_id: senderId } } }],
        },
        select: { id: true },
      });
      if (!inPack) throw Object.assign(new Error('Этот стикерпак не добавлен в вашу библиотеку'), { statusCode: 403 });
    }
    const conv = await this._assertCanSend(
      conversationId,
      senderId,
      [isSticker ? null : file_url, ...(attachments ?? []).map((a) => a.url)],
    );

    const text = content?.trim() ?? '';
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!text && !encrypted_text && !file_url && !type && !hasAttachments) throw new Error('Message must have text or media');
    const base = { conversation_id: conversationId, sender_id: senderId, text: text || null, reply_to_id: reply_to_id ?? null };

    let data: Prisma.MessageUncheckedCreateInput;
    if (hasAttachments && attachments!.length > 1) {
      // Album: 2+ files sent together as one message (e.g. a photo + a video in the same bubble).
      // A single-item `attachments` array is just treated as a normal file_url send below.
      if (attachments!.length > MAX_ALBUM_FILES) {
        throw Object.assign(new Error(`Album can have at most ${MAX_ALBUM_FILES} files`), { statusCode: 400 });
      }
      const files = attachments!.map((a) => ({ url: a.url, type: inferFileType(a.url, a.media_type) }));
      data = { ...base, type: 'album', metadata: { files } };
    } else if (type === 'payment_request' || type === 'tip' || type === 'post_share' || type === 'group_share') {
      // Card-style messages carry a structured metadata payload instead of a file.
      data = { ...base, type, metadata: await this._validatedCardMetadata(type, metadata) };
    } else {
      // A lone `attachments` entry (no separate file_url given) is just a plain single-file send.
      if (!file_url && hasAttachments) {
        file_url = attachments![0].url;
        media_type = attachments![0].media_type ?? media_type;
      }
      const msgType = media_type === 'sticker' ? 'sticker' : file_url ? inferFileType(file_url, media_type) : 'text';
      data = { ...base, type: msgType, encrypted_text: encrypted_text ?? null, file_url: file_url ?? null };
    }

    const [message] = await prisma.$transaction([
      prisma.message.create({ data, include: messageInclude }),
      // bump conversation.updated_at so list ordering is correct
      prisma.conversation.update({ where: { id: conversationId }, data: { updated_at: new Date() } }),
    ]);
    await this._broadcastNewMessage(conversationId, message);
    await this._maybeSendGroupWelcome(conv, conversationId, senderId);
    return message;
  },

  /**
   * Everything that may stop a send: participation, ownership of attached files, the free
   * tier's daily cap, and — in direct chats — blocks and the recipient's message privacy.
   * Returns the conversation (needed for the group welcome auto-reply).
   */
  async _assertCanSend(conversationId: string, senderId: string, fileUrls: (string | null | undefined)[]) {
    await this._assertParticipant(conversationId, senderId);
    // Вложения — только файлы самого отправителя
    for (const url of fileUrls) await assertOwnedMedia(url, senderId);

    const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { subscription_tier: true } });
    if ((sender?.subscription_tier ?? 'free') === 'free') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const sentToday = await prisma.message.count({
        where: { sender_id: senderId, created_at: { gte: startOfDay }, deleted_at: null },
      });
      if (sentToday >= FREE_DAILY_MESSAGE_LIMIT) {
        throw Object.assign(new Error('DAILY_MESSAGE_LIMIT_REACHED'), { statusCode: 402 });
      }
    }

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, group_id: true, group_dm_user_id: true, participants: { select: { user_id: true } } },
    });
    const recipientId = conv?.type === 'direct' ? conv.participants.find((p) => p.user_id !== senderId)?.user_id : undefined;
    if (recipientId) {
      const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { messages_privacy: true } });
      if ((await isBlockedBy(recipientId, senderId)) || (await isBlockedBy(senderId, recipientId))) {
        throw Object.assign(new Error('MESSAGES_DISABLED'), { statusCode: 403 });
      }
      if (recipient && !(await isAllowedByPrivacy(recipient.messages_privacy, recipientId, senderId))) {
        throw Object.assign(new Error('MESSAGES_DISABLED'), { statusCode: 403 });
      }
    }
    return conv;
  },

  /** Validates a card message payload and that the shared post / group exists. */
  async _validatedCardMetadata(type: 'payment_request' | 'tip' | 'post_share' | 'group_share', metadata: unknown) {
    const meta = validateCardMetadata(type, metadata);
    if (type === 'post_share') {
      const post = await prisma.post.findUnique({ where: { id: meta.postId as string, deleted_at: null }, select: { id: true } });
      if (!post) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    }
    if (type === 'group_share') {
      const group = await prisma.group.findUnique({ where: { id: meta.groupId as string }, select: { id: true } });
      if (!group) throw Object.assign(new Error('Group not found'), { statusCode: 404 });
    }
    return meta as Prisma.InputJsonValue;
  },


  /**
   * If this was a member's first-ever message into their personal community
   * thread with a group, and that group has a welcome auto-reply configured,
   * send it as the group owner. Best-effort — never blocks the member's own send.
   */
  async _maybeSendGroupWelcome(
    conv: { type: string; group_id: string | null; group_dm_user_id: string | null } | null,
    conversationId: string,
    senderId: string,
  ) {
    if (!conv || conv.type !== 'community' || !conv.group_id || conv.group_dm_user_id !== senderId) return;
    try {
      const messageCount = await prisma.message.count({ where: { conversation_id: conversationId, sender_id: senderId } });
      if (messageCount !== 1) return;

      const group = await prisma.group.findUnique({
        where: { id: conv.group_id },
        select: { owner_id: true, welcome_msg_enabled: true, welcome_msg_text: true },
      });
      if (!group?.welcome_msg_enabled || !group.welcome_msg_text) return;

      await this.sendMessage({ conversationId, senderId: group.owner_id, content: group.welcome_msg_text });
    } catch { /* not critical — member's message already went through */ }
  },

  /**
   * Push a freshly created message to every participant's open sockets.
   */
  async _broadcastNewMessage(conversationId: string, message: unknown) {
    const [participants, conv] = await Promise.all([
      prisma.conversationParticipant.findMany({ where: { conversation_id: conversationId }, select: { user_id: true } }),
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          group_id: true, group_dm_user_id: true,
          group: { select: { id: true, slug: true, name: true, avatar_url: true } },
        },
      }),
    ]);
    const recipients = new Set(participants.map((p) => p.user_id));
    // Group-DM thread: staff aren't participants, but any admin/owner/moderator watching
    // the group's inbox should still get the message pushed to them live. Carry the group's
    // identity alongside the message so staff clients (who don't have this conversation in
    // their local list) know to route a click to the group's "Обращения" inbox tab, not /messages.
    let groupDm: { groupId: string; groupSlug: string; groupName: string | null; groupAvatarUrl: string | null; customerId: string } | null = null;
    if (conv?.group_id && conv.group_dm_user_id) {
      const staff = await prisma.groupMember.findMany({
        where: { group_id: conv.group_id, role: { in: ['owner', 'admin', 'moderator'] } },
        select: { user_id: true },
      });
      for (const s of staff) recipients.add(s.user_id);
      groupDm = {
        groupId: conv.group_id,
        groupSlug: conv.group?.slug ?? conv.group_id,
        groupName: conv.group?.name ?? null,
        groupAvatarUrl: conv.group?.avatar_url ?? null,
        customerId: conv.group_dm_user_id,
      };
    }
    const wsPayload = { type: 'new_message', data: message, groupDm };
    for (const user_id of recipients) {
      messageSubscriptions.push(user_id, wsPayload);
    }
    void this._pushNewMessage(conversationId, message as any, participants.map((p) => p.user_id), groupDm).catch(logError('[push] message'));
  },

  /** Системное уведомление о новом сообщении (когда вкладка закрыта/в фоне). Только участникам, без отправителя и без заглушивших чат. */
  async _pushNewMessage(
    conversationId: string,
    message: { sender_id: string; type: string; text: string | null; encrypted_text?: string | null; sender?: { display_name: string | null; username: string; avatar_url: string | null } | null },
    participantIds: string[],
    groupDm: { groupName: string | null } | null,
  ) {
    if (groupDm) return; // обращения в группу — через её inbox, не через личный push
    const now = new Date();
    const rows = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId, user_id: { in: participantIds.filter((id) => id !== message.sender_id) } },
      select: { user_id: true, muted_until: true },
    });
    const preview = message.encrypted_text ? 'Новое сообщение'
      : message.text ? message.text.slice(0, 140)
      : message.type === 'sticker' ? '🎭 Стикер'
      : message.type === 'voice' ? '🎤 Голосовое сообщение'
      : message.type === 'audio' ? '🎵 Аудио'
      : message.type === 'album' ? '📎 Альбом'
      : message.type === 'image' ? '🖼 Фото'
      : message.type === 'video' ? '🎬 Видео'
      : 'Новое сообщение';
    const title = message.sender?.display_name || message.sender?.username || 'Bloomly';
    for (const r of rows) {
      if (r.muted_until && r.muted_until > now) continue;
      void pushService.sendToUser(r.user_id, {
        title,
        body: preview,
        url: `/messages?c=${conversationId}`,
        tag: `conv-${conversationId}`,
        icon: message.sender?.avatar_url ?? undefined,
      });
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

    // В групповой беседе отметить оплату может только указанный в запросе плательщик
    const conv = await prisma.conversation.findUnique({ where: { id: request.conversation_id }, select: { type: true } });
    const rawMeta = (request.metadata as Record<string, any>) ?? {};
    if (conv?.type === 'group' && rawMeta.payer_id !== userId) {
      throw Object.assign(new Error('Оплату в групповой беседе может отметить только плательщик'), { statusCode: 403 });
    }

    // Проверку статуса и смену на «оплачено» делаем под блокировкой строки: два параллельных
    // подтверждения не создадут два подтверждения оплаты
    const { updatedRequest, confirmation, dueAmount, meta } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Message" WHERE id = ${messageId}::uuid FOR UPDATE`;
      const locked = await tx.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
      const currentMeta = (locked?.metadata as Record<string, any>) ?? {};
      if (currentMeta.status === 'paid') throw Object.assign(new Error('Already paid'), { statusCode: 400 });

      const nextMeta = { ...currentMeta, status: 'paid', paid_at: new Date().toISOString() };
      // Оплата закрывает предоплату, если она была запрошена, а не полную сумму заказа
      const due = currentMeta.prepaymentPercent ? (currentMeta.amount * currentMeta.prepaymentPercent) / 100 : currentMeta.amount;
      const updated = await tx.message.update({
        where: { id: messageId },
        data: { metadata: nextMeta as any },
        include: messageInclude,
      });
      const created = await tx.message.create({
        data: {
          conversation_id: request.conversation_id,
          sender_id: userId,
          type: 'payment_confirmation',
          reply_to_id: messageId,
          metadata: { amount: due, description: currentMeta.description } as any,
        },
        include: messageInclude,
      });
      return { updatedRequest: updated, confirmation: created, dueAmount: due, meta: currentMeta };
    });

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
    // updateMany (not update): group staff reading a member's group-DM thread from the
    // inbox aren't a ConversationParticipant, so there's no row to stamp — no-op for them.
    await prisma.conversationParticipant.updateMany({
      where: { conversation_id: conversationId, user_id: userId },
      data: { last_read_at: now },
    });
    // Broadcast read receipt to other participants so they can update checkmarks,
    // and to the reader's own other devices/sessions so their unread badges sync too
    const others = await prisma.conversationParticipant.findMany({
      where: { conversation_id: conversationId },
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
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { deleted_at: new Date() },
    });

    // Messages have no restore/undelete path, so the attachment can be purged now
    // instead of leaking in S3 forever (there's no hard-delete cron for messages).
    if (msg.file_url) {
      deleteFileByUrl(msg.file_url, msg.sender_id).catch(logError('[deleteMessage] media cleanup failed'));
    }

    // Broadcast to all participants so the message disappears in real time for everyone
    const parts = await prisma.conversationParticipant.findMany({
      where: { conversation_id: msg.conversation_id },
      select: { user_id: true },
    });
    for (const { user_id } of parts) {
      messageSubscriptions.push(user_id, {
        type: 'message_deleted',
        data: { id: messageId, conversation_id: msg.conversation_id },
      });
    }
    return updated;
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
      include: messageInclude,
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

    // Читаем и пишем реакции под блокировкой строки: без неё параллельные реакции перезаписывали друг друга
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Message" WHERE id = ${messageId}::uuid FOR UPDATE`;
      const fresh = await tx.message.findUnique({ where: { id: messageId }, select: { reactions: true } });
      const current = (fresh?.reactions as Record<string, string[]> | null) ?? {};
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

      return tx.message.update({
        where: { id: messageId },
        data: { reactions: Object.keys(next).length ? next : null as any },
        include: messageInclude,
      });
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
   * Mute a conversation's notifications for the calling user.
   * `mutedUntil: null` unmutes; a far-future date reads as "muted indefinitely".
   * `soundMuted` is independent — it silences sound only, without hiding the toast/badge.
   */
  async setMute(conversationId: string, userId: string, mutedUntil: Date | null | undefined, soundMuted: boolean | undefined) {
    await this._assertParticipant(conversationId, userId);
    return prisma.conversationParticipant.update({
      where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
      data: {
        ...(mutedUntil !== undefined ? { muted_until: mutedUntil } : {}),
        ...(soundMuted !== undefined ? { sound_muted: soundMuted } : {}),
      },
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
    // for 'all': soft-delete the conversation and its messages together, so no
    // other query (unread counts, etc.) can still pick up messages from a
    // conversation that's no longer visible anywhere.
    const now = new Date();
    const [, conversation] = await prisma.$transaction([
      prisma.message.updateMany({
        where: { conversation_id: conversationId, deleted_at: null },
        data: { deleted_at: now },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { deleted_at: now },
      }),
    ]);
    return conversation;
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

  // ── Group DM ("написать сообществу") ──────────────────────────────────────
  // A regular member's personal 1:1-style thread with a group. Any admin/owner
  // of the group may read/reply in it (see _assertParticipant's staff bypass
  // below) without being a ConversationParticipant themselves — their replies
  // are rendered client-side as coming from the group, not from them personally.

  async _getGroupRole(groupId: string, userId: string): Promise<string | null> {
    const gm = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      select: { role: true },
    });
    return gm?.role ?? null;
  },

  /** Find or create the calling user's personal thread with a group. Idempotent. */
  async startGroupDm(groupId: string, userId: string): Promise<{ conversation: any; alreadyExists: boolean }> {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true, avatar_url: true, deleted_at: true } });
    if (!group || group.deleted_at) throw Object.assign(new Error('Group not found'), { statusCode: 404 });
    // Route contract is "any member": non-members must not be able to open a thread with the group.
    if (!(await this._getGroupRole(groupId, userId))) {
      throw Object.assign(new Error('Написать сообществу могут только участники группы'), { statusCode: 403 });
    }

    const existing = await prisma.conversation.findUnique({
      where: { group_id_group_dm_user_id: { group_id: groupId, group_dm_user_id: userId } },
      include: { participants: { include: { user: { select: senderSelect } } } },
    });
    if (existing && !existing.deleted_at) return { conversation: existing, alreadyExists: true };
    // (group_id, group_dm_user_id) is unique, so a soft-deleted thread would block creating a new one.
    // Restore it instead of failing with 404 forever: the member gets back the same thread.
    if (existing) {
      const [conversation] = await prisma.$transaction([
        prisma.conversation.update({
          where: { id: existing.id },
          data: { deleted_at: null },
          include: { participants: { include: { user: { select: senderSelect } } } },
        }),
        prisma.conversationParticipant.updateMany({
          where: { conversation_id: existing.id, user_id: userId },
          data: { hidden_at: null },
        }),
      ]);
      return { conversation, alreadyExists: true };
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: 'community',
        is_group: false,
        name: group.name,
        avatar_url: group.avatar_url,
        group_id: groupId,
        group_dm_user_id: userId,
        participants: { create: [{ user_id: userId, role: 'member' }] },
      },
      include: { participants: { include: { user: { select: senderSelect } } } },
    });
    return { conversation, alreadyExists: false };
  },

  /**
   * Admin/owner-only: list every member's personal thread with the group ("group inbox").
   */
  async getGroupInbox(groupId: string, requesterId: string) {
    const role = await this._getGroupRole(groupId, requesterId);
    if (!role || !CHAT_STAFF_ROLES.includes(role)) {
      throw Object.assign(new Error('Admin access required'), { statusCode: 403 });
    }

    const threads = await prisma.conversation.findMany({
      where: { group_id: groupId, group_dm_user_id: { not: null }, deleted_at: null },
      include: {
        group_dm_user: { select: senderSelect },
        messages: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { id: true, text: true, type: true, sender_id: true, created_at: true },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    return threads.map((t: any) => {
      const lastMessage = t.messages[0] ?? null;
      return {
        id: t.id,
        customer: t.group_dm_user,
        last_message: lastMessage,
        updated_at: t.updated_at,
        needs_reply: !!lastMessage && lastMessage.sender_id === t.group_dm_user_id,
      };
    });
  },

  /**
   * "Обращения" waiting for a reply, summed per group, across every group the caller
   * owns/admins/moderates — powers the aggregate badge on the sidebar's "Группы" item
   * and per-card badges on the groups grid, without an N+1 fetch per group.
   */
  async getMyGroupInboxCounts(userId: string): Promise<{ groupId: string; count: number }[]> {
    const memberships = await prisma.groupMember.findMany({
      where: { user_id: userId, role: { in: ['owner', 'admin', 'moderator'] } },
      select: { group_id: true },
    });
    const groupIds = memberships.map((m) => m.group_id);
    if (!groupIds.length) return [];

    const threads = await prisma.conversation.findMany({
      where: { group_id: { in: groupIds }, group_dm_user_id: { not: null }, deleted_at: null },
      select: {
        group_id: true,
        group_dm_user_id: true,
        messages: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { sender_id: true },
        },
      },
    });

    const counts: Record<string, number> = {};
    for (const t of threads) {
      const last = t.messages[0];
      if (last && last.sender_id === t.group_dm_user_id) {
        counts[t.group_id!] = (counts[t.group_id!] ?? 0) + 1;
      }
    }
    return groupIds.map((groupId) => ({ groupId, count: counts[groupId] ?? 0 }));
  },

  /**
   * Fetch a single conversation by id, in the same shape getConversations() returns per-row.
   * Used by group staff to open a thread from the inbox (they aren't a ConversationParticipant).
   */
  async getConversationById(conversationId: string, requesterId: string) {
    await this._assertParticipant(conversationId, requesterId);

    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { take: 6, include: { user: { select: senderSelect } } },
        _count: { select: { participants: true } },
        messages: { where: { deleted_at: null }, orderBy: { created_at: 'desc' }, take: 1, include: { sender: { select: senderSelect } } },
        pinnedMessage: {
          select: {
            id: true, text: true, type: true, file_url: true, created_at: true,
            sender: { select: { id: true, username: true, display_name: true } },
          },
        } as any,
      },
    });
    if (!conv) return null;

    const mine = conv.participants.find((p: any) => p.user_id === requesterId);

    return {
      ...conv,
      pinned_message: conv.pinnedMessage ?? null,
      my_participant: mine
        ? {
            archived: mine.archived, hidden_at: mine.hidden_at, last_read_at: mine.last_read_at,
            label: mine.label, role: mine.role, personal_pinned_message_id: mine.personal_pinned_message_id ?? null,
            muted_until: mine.muted_until ?? null, sound_muted: mine.sound_muted ?? false,
          }
        // Staff opening a member's group-DM thread: not a real participant, so there's
        // no personal state (archive/mute/pin) to report — just enough shape to render.
        : { archived: false, hidden_at: null, last_read_at: null, label: 'default', role: 'admin', personal_pinned_message_id: null, muted_until: null, sound_muted: false },
      last_message: conv.messages[0] ?? null,
      participants_count: conv._count.participants,
      unread_count: 0,
      other_participants: conv.participants
        .filter((cp: any) => cp.user_id !== requesterId)
        .map((cp: any) => ({ user_id: cp.user_id, user: cp.user, last_read_at: cp.last_read_at ?? null })),
    };
  },

  async _assertParticipant(conversationId: string, userId: string) {
    // Checked up front (not just filtered out of getConversations' listing) — otherwise a
    // conversation soft-deleted alongside its group (see groups/service.ts
    // softDeleteGroupAndConversations) stayed fully readable/writable to anyone who already
    // had the conversationId, just invisible in the list.
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { deleted_at: true, group_id: true, group_dm_user_id: true },
    });
    if (!conv || conv.deleted_at) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });

    const p = await prisma.conversationParticipant.findFirst({
      where: { conversation_id: conversationId, user_id: userId },
    });
    if (p) return;

    // Group-DM staff bypass: any admin/owner/moderator of the group may act on a
    // member's personal thread with that group without being a participant on it.
    if (conv.group_id && conv.group_dm_user_id) {
      const role = await this._getGroupRole(conv.group_id, userId);
      if (role && CHAT_STAFF_ROLES.includes(role)) return;
    }

    throw Object.assign(new Error('Not a participant'), { statusCode: 403 });
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
      await prisma.conversation.update({ where: { id: convId }, data: { pinned_message_id: messageId } });
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
      await prisma.conversation.update({ where: { id: convId }, data: { pinned_message_id: null } });
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
    const linkRows = await prisma.$queryRaw<Row[]>`
      SELECT 'link' as type, COUNT(*) as cnt FROM "Message"
      WHERE conversation_id = ${convId}::uuid AND deleted_at IS NULL
        AND text ~ 'https?://'
    `;
    if (linkRows[0]) stats.link = Number(linkRows[0].cnt);
    return stats;
  },

  /**
   * Paginated list of messages of a given media "stat" type for the media browser
   * (the sub-view opened from a stat row: Фото/Видео/Аудио/Голос/Ссылки).
   */
  async getMediaMessages(convId: string, userId: string, mediaType: string, before?: string, limit = 60) {
    await this._assertParticipant(convId, userId);
    const beforeClause = before ? { created_at: { lt: new Date(before) } } : {};

    if (mediaType === 'link') {
      return prisma.message.findMany({
        where: { conversation_id: convId, deleted_at: null, text: { contains: 'http' }, ...beforeClause },
        orderBy: { created_at: 'desc' },
        take: limit,
        include: { sender: { select: senderSelect } },
      });
    }

    const validTypes = ['image', 'video', 'audio', 'voice'];
    if (!validTypes.includes(mediaType)) return [];

    return prisma.message.findMany({
      where: { conversation_id: convId, deleted_at: null, type: mediaType, ...beforeClause },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { sender: { select: senderSelect } },
    });
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
    const targetIds = Object.keys(keys);
    if (targetIds.length > 500) throw Object.assign(new Error('Слишком много ключей за один запрос'), { statusCode: 400 });
    // Ключи получают только участники беседы
    const members = await prisma.conversationParticipant.findMany({
      where: { conversation_id: convId, user_id: { in: targetIds } },
      select: { user_id: true },
    });
    const memberIds = new Set(members.map((m) => m.user_id));
    if (targetIds.some((id) => !memberIds.has(id))) {
      throw Object.assign(new Error('Ключ можно задать только участникам беседы'), { statusCode: 400 });
    }
    // Чужой уже выданный ключ не перезаписываем: иначе участник подменял бы ключ другому и
    // читал бы его переписку. Свой ключ обновлять можно.
    const existing = await prisma.conversationKey.findMany({
      where: { conversation_id: convId, user_id: { in: targetIds, not: callerId } },
      select: { user_id: true },
    });
    if (existing.length > 0) {
      throw Object.assign(new Error('Ключи других участников нельзя перезаписать'), { statusCode: 403 });
    }
    const upserts = Object.entries(keys).map(([userId, encryptedKey]) =>
      prisma.conversationKey.upsert({
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
    const row = await prisma.conversationKey.findUnique({
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
    // Пересылать можно только из беседы, в которой отправитель сам состоит: иначе по UUID
    // сообщения можно было скопировать чужой текст и вложение
    await this._assertParticipant(source.conversation_id, senderId);
    await this._assertParticipant(targetConvId, senderId);

    const [fwdSenderRaw, [message]] = await Promise.all([
      prisma.user.findUnique({ where: { id: source.sender_id }, select: { ...senderSelect, forward_identity_privacy: true } }),
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

    // Mask the original author per-viewer, respecting their forward_identity_privacy setting
    // (e.g. "friends only" resolves differently for each recipient of the target conversation).
    const { forward_identity_privacy: fwdPrivacy, ...fwdSenderPublic } = fwdSenderRaw ?? ({} as any);
    const maskFwdSender = async (viewerId: string) => {
      if (!fwdSenderRaw) return null;
      return (await isAllowedByPrivacy(fwdPrivacy, fwdSenderRaw.id, viewerId)) ? fwdSenderPublic : null;
    };

    const enriched = { ...message, forwarded_from_sender: await maskFwdSender(senderId) };

    // Real-time push
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversation_id: targetConvId },
      select: { user_id: true },
    });
    for (const { user_id } of participants) {
      const payload = user_id === senderId ? enriched : { ...message, forwarded_from_sender: await maskFwdSender(user_id) };
      messageSubscriptions.push(user_id, { type: 'new_message', data: payload });
    }
    return enriched;
  },
};
