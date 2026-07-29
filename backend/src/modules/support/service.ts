import prisma from '../../config/prisma.js';
import { isTrustedMediaUrl } from '../media/service.js';
import { sendSupportEmail } from './mail.service.js';

const MAX_ATTACHMENT_FILES = 5;

export const SUPPORT_TICKET_TYPES = ['bug', 'feedback', 'question', 'other'] as const;
export type SupportTicketType = (typeof SUPPORT_TICKET_TYPES)[number];

export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
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

export async function createTicket(userId: string, input: {
  type: string; subject: string; message: string; contactEmail?: string;
  attachmentUrls?: string[];
}) {
  const ticket = await prisma.supportTicket.create({
    data: {
      user_id: userId,
      type: SUPPORT_TICKET_TYPES.includes(input.type as SupportTicketType) ? input.type : 'question',
      subject: input.subject.trim().slice(0, 150),
      contact_email: input.contactEmail?.trim().slice(0, 255) || null,
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

  const to = replyToAddress(ticket);
  if (to) {
    sendSupportEmail(to, `Обращение принято: ${ticket.subject}`, input.message.trim().slice(0, 3000))
      .catch((err) => console.error('[SUPPORT_MAIL] Failed to send ack email:', err));
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
      data: (ticket.status === 'resolved' || ticket.status === 'closed') ? { status: 'open' } : {},
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
        console.error('[SUPPORT_MAIL] Failed to send reply email:', err);
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

  return prisma.supportTicket.findUnique({ where: { id: ticket.id }, include: messagesOrder });
}
