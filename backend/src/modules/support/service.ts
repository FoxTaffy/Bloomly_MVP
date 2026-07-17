import prisma from '../../config/prisma.js';

export const SUPPORT_TICKET_TYPES = ['bug', 'feedback', 'question', 'other'] as const;
export type SupportTicketType = (typeof SUPPORT_TICKET_TYPES)[number];

export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

const ticketAuthorSelect = {
  id: true, username: true, display_name: true, avatar_url: true,
} as const;

export async function createTicket(userId: string, input: {
  type: string; subject: string; message: string; contactEmail?: string;
  attachmentUrls?: string[];
}) {
  return prisma.supportTicket.create({
    data: {
      user_id: userId,
      type: SUPPORT_TICKET_TYPES.includes(input.type as SupportTicketType) ? input.type : 'question',
      subject: input.subject.trim().slice(0, 150),
      message: input.message.trim().slice(0, 3000),
      contact_email: input.contactEmail?.trim().slice(0, 255) || null,
      attachment_urls: input.attachmentUrls?.slice(0, 5) ?? [],
    },
  });
}

export async function getMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 50,
  });
}

export async function getTicketForUser(userId: string, ticketId: string) {
  return prisma.supportTicket.findFirst({ where: { id: ticketId, user_id: userId } });
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
        replier: { select: { id: true, username: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { tickets, total, page, pages: Math.ceil(total / limit) };
}

export async function adminReplyTicket(ticketId: string, adminId: string, input: {
  status?: string; adminReply?: string;
}) {
  const data: any = { updated_at: new Date() };
  if (input.status && SUPPORT_TICKET_STATUSES.includes(input.status as SupportTicketStatus)) {
    data.status = input.status;
  }
  if (input.adminReply !== undefined) {
    data.admin_reply = input.adminReply.trim().slice(0, 3000);
    data.replied_by = adminId;
    data.replied_at = new Date();
  }
  return prisma.supportTicket.update({ where: { id: ticketId }, data });
}
