import prisma from '../../config/prisma.js';
import { isTrustedMediaUrl } from '../media/service.js';
import { sendSupportEmail } from './mail.service.js';
import { logger, logError } from '../../lib/logger.js';
import { notificationService } from '../notifications/service.js';
import { bugHunterProgress, BUG_HUNTER_LEVEL_NAMES } from '../../lib/bugHunter.js';

const MAX_ATTACHMENT_FILES = 5;

// Эти статусы у бага означают «репорт оказался полезным» и дают очко в достижении «Охота на баги»
const BUG_REWARD_STATUSES: readonly string[] = ['confirmed', 'fixed'];

export const SUPPORT_TICKET_TYPES = ['bug', 'feedback', 'question', 'other'] as const;
export type SupportTicketType = (typeof SUPPORT_TICKET_TYPES)[number];

export const SUPPORT_DEVICES = ['desktop', 'mobile', 'tablet'] as const;

export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'confirmed', 'fixed'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

const ticketAuthorSelect = {
  id: true, username: true, display_name: true, avatar_url: true,
} as const;

const messagesOrder = {
  messages: {
    orderBy: { created_at: 'asc' as const },
    include: { sender: { select: { id: true, username: true } } },
  },
};

function replyToAddress(ticket: { external_email: string | null; contact_email: string | null }): string | null {
  return ticket.external_email || ticket.contact_email;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createTicket(userId: string, input: {
  type: string; subject: string; message: string; contactEmail?: string;
  attachmentUrls?: string[];
  stepsToReproduce?: string; expectedResult?: string; device?: string; browser?: string;
}) {
  // Адрес для ответа должен быть настоящим email: иначе поле использовалось для рассылки
  const contactEmail = input.contactEmail?.trim().slice(0, 254) || null;
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    throw Object.assign(new Error('Некорректный email для ответа'), { statusCode: 400 });
  }
  const type = SUPPORT_TICKET_TYPES.includes(input.type as SupportTicketType) ? input.type : 'question';
  // Поля баг-репорта сохраняем только у багов: у вопросов и отзывов они не нужны
  const bug = type === 'bug' ? {
    steps_to_reproduce: input.stepsToReproduce?.trim().slice(0, 2000) || null,
    expected_result: input.expectedResult?.trim().slice(0, 1000) || null,
    device: SUPPORT_DEVICES.includes(input.device as typeof SUPPORT_DEVICES[number]) ? input.device : null,
    browser: input.browser?.trim().slice(0, 60) || null,
  } : {};
  const ticket = await prisma.supportTicket.create({
    data: {
      user_id: userId,
      type,
      ...bug,
      subject: input.subject.trim().slice(0, 150),
      contact_email: contactEmail,
      messages: {
        create: {
          sender_type: 'user',
          sender_user_id: userId,
          body: input.message.trim().slice(0, 3000),
          // Only accept URLs produced by our own upload endpoint, and only up to the cap —
          // a raw client can otherwise post an arbitrarily large/external array of "attachments".
          attachment_urls: (input.attachmentUrls ?? []).filter(isTrustedMediaUrl).slice(0, MAX_ATTACHMENT_FILES),
        },
      },
    },
    include: messagesOrder,
  });

  // Подтверждение шлём только на адрес самого аккаунта, а не на contact_email:
  // иначе тело обращения, написанное любым текстом, уходило бы произвольному адресату
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (owner?.email) {
    sendSupportEmail(owner.email, `Обращение принято: ${ticket.subject}`, input.message.trim().slice(0, 3000))
      .catch(logError('[SUPPORT_MAIL] Failed to send ack email'));
  }

  return ticket;
}

export async function getMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 50,
    include: messagesOrder,
  });
}

export async function getTicketForUser(userId: string, ticketId: string) {
  return prisma.supportTicket.findFirst({ where: { id: ticketId, user_id: userId }, include: messagesOrder });
}

export async function addUserMessage(userId: string, ticketId: string, body: string) {
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, user_id: userId } });
  if (!ticket) return null;

  const [message] = await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: { ticket_id: ticket.id, sender_type: 'user', sender_user_id: userId, body: body.trim().slice(0, 3000) },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: (ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'fixed') ? { status: 'open' } : {},
    }),
  ]);
  return message;
}

export async function adminGetTickets(status?: string, type?: string, page = 1, limit = 30) {
  const skip = (page - 1) * limit;
  const where: any = {};
  if (status) where.status = status;
  if (type) where.type = type;
  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where, skip, take: limit, orderBy: { created_at: 'desc' },
      include: {
        user: { select: ticketAuthorSelect },
        ...messagesOrder,
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { tickets, total, page, pages: Math.ceil(total / limit) };
}

/**
 * Засчитывает баг автору один раз за тикет: метка bug_rewarded_at ставится условным updateMany,
 * поэтому повторный клик по статусу или гонка двух админов не удвоят счётчик.
 */
async function awardBugReport(ticketId: string, userId: string) {
  const total = await prisma.$transaction(async (tx) => {
    const claimed = await tx.supportTicket.updateMany({
      where: { id: ticketId, bug_rewarded_at: null },
      data: { bug_rewarded_at: new Date() },
    });
    if (claimed.count !== 1) return null;
    const user = await tx.user.update({ where: { id: userId }, data: { bugs_confirmed: { increment: 1 } }, select: { bugs_confirmed: true } });
    return user.bugs_confirmed;
  });
  if (total === null) return;

  // Уведомления — побочный эффект: сбой доставки не должен откатывать уже засчитанный баг
  try {
    await notificationService.create({ receiverId: userId, type: 'bug_report_confirmed', refId: ticketId });
    const reached = bugHunterProgress(total);
    if (reached.level > bugHunterProgress(total - 1).level) {
      await notificationService.create({
        receiverId: userId, type: 'bug_hunter_level', refId: ticketId,
        meta: { level: BUG_HUNTER_LEVEL_NAMES[reached.levelKey], levelKey: reached.levelKey },
      });
    }
  } catch (err) {
    logger.error({ err }, '[SUPPORT] Failed to send bug hunter notification');
  }
}

export async function adminReplyTicket(ticketId: string, adminId: string, input: {
  status?: string; adminReply?: string;
}) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return null;

  const statusUpdate: any = { updated_at: new Date() };
  if (input.status && SUPPORT_TICKET_STATUSES.includes(input.status as SupportTicketStatus)) {
    statusUpdate.status = input.status;
  }

  const replyBody = input.adminReply?.trim().slice(0, 3000);
  if (replyBody) {
    let emailMessageId: string | null = null;
    const to = replyToAddress(ticket);
    if (to) {
      try {
        emailMessageId = await sendSupportEmail(to, `Re: ${ticket.subject}`, replyBody, {
          inReplyTo: ticket.email_message_id ?? undefined,
          references: ticket.email_message_id ? [ticket.email_message_id] : undefined,
        });
      } catch (err) {
        logger.error({ err }, '[SUPPORT_MAIL] Failed to send reply email');
      }
    }
    if (emailMessageId) statusUpdate.email_message_id = emailMessageId;

    await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: {
          ticket_id: ticket.id, sender_type: 'admin', sender_user_id: adminId,
          body: replyBody, email_message_id: emailMessageId,
        },
      }),
      prisma.supportTicket.update({ where: { id: ticket.id }, data: statusUpdate }),
    ]);
  } else if (Object.keys(statusUpdate).length > 1) {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: statusUpdate });
  }

  if (ticket.type === 'bug' && ticket.user_id && statusUpdate.status && BUG_REWARD_STATUSES.includes(statusUpdate.status)) {
    await awardBugReport(ticket.id, ticket.user_id);
  }

  return prisma.supportTicket.findUnique({ where: { id: ticket.id }, include: messagesOrder });
}
