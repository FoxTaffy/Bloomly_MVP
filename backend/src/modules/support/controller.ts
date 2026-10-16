import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createTicket, getMyTickets, getTicketForUser, addUserMessage,
  adminGetTickets, adminReplyTicket, SUPPORT_TICKET_STATUSES,
} from './service.js';
import { isModerator } from '../../lib/roles.js';
import { canReadPrivateMedia, findPrivateMediaRow, openPrivateObject } from '../media/service.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';

// POST /api/support/tickets
export async function createTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const { type, subject, message, contact_email, attachment_urls } = request.body as any;
  if (!subject?.trim() || !message?.trim()) {
    return reply.code(400).send({ success: false, error: { message: 'Заполните тему и сообщение' } });
  }
  try {
    const ticket = await createTicket(userId, {
      type, subject, message, contactEmail: contact_email, attachmentUrls: attachment_urls,
    });
    return reply.code(201).send({ success: true, data: { ticket } });
  } catch (e) {
    const status = errStatus(e);
    if (!status) throw e;
    return reply.code(status).send({ success: false, error: { message: errMessage(e) } });
  }
}

// GET /api/support/tickets
export async function getMyTicketsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const tickets = await getMyTickets(userId);
  return reply.send({ success: true, data: { tickets } });
}

// GET /api/support/tickets/:id
export async function getMyTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const { id } = request.params as any;
  const ticket = await getTicketForUser(userId, id);
  if (!ticket) return reply.code(404).send({ success: false, error: { message: 'Обращение не найдено' } });
  return reply.send({ success: true, data: { ticket } });
}

// POST /api/support/tickets/:id/messages
export async function addTicketMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const { id } = request.params as any;
  const { message } = request.body as any;
  if (!message?.trim()) {
    return reply.code(400).send({ success: false, error: { message: 'Сообщение не может быть пустым' } });
  }
  const created = await addUserMessage(userId, id, message);
  if (!created) return reply.code(404).send({ success: false, error: { message: 'Обращение не найдено' } });
  return reply.code(201).send({ success: true, data: { message: created } });
}

// GET /api/support/admin/tickets
export async function adminGetTicketsHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!isModerator(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { status, type, page } = request.query as any;
  if (status && !SUPPORT_TICKET_STATUSES.includes(status)) {
    return reply.code(400).send({ success: false, error: { message: 'Invalid status' } });
  }
  const data = await adminGetTickets(status, type, parseInt(page) || 1);
  return reply.send({ success: true, data });
}

// PATCH /api/support/admin/tickets/:id
export async function adminReplyTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!isModerator(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { id } = request.params as any;
  const { status, admin_reply } = request.body as any;
  if (status !== undefined && !SUPPORT_TICKET_STATUSES.includes(status)) {
    return reply.code(400).send({ success: false, error: { message: 'Invalid status' } });
  }
  const ticket = await adminReplyTicket(id, user.id, { status, adminReply: admin_reply });
  if (!ticket) return reply.code(404).send({ success: false, error: { message: 'Ticket not found' } });
  return reply.send({ success: true, data: { ticket } });
}

// GET /api/support/attachment?url=… — вложение обращения из закрытого префикса private/reports/.
// Бакет его напрямую не отдаёт, поэтому раньше автор обращения не видел свои файлы.
// Доступ: автор загрузки и модераторы (canReadPrivateMedia).
export async function getAttachmentHandler(
  request: FastifyRequest<{ Querystring: { url?: string } }>,
  reply: FastifyReply,
) {
  const url = request.query.url;
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return reply.code(400).send({ success: false, error: { message: 'Некорректная ссылка' } });
  }
  const row = await findPrivateMediaRow(url);
  if (!row || row.folder !== 'reports' || !canReadPrivateMedia(row, request.user)) {
    return reply.code(404).send({ success: false, error: { message: 'Файл не найден' } });
  }
  let opened;
  try {
    opened = await openPrivateObject(row.object_key);
  } catch {
    return reply.code(404).send({ success: false, error: { message: 'Файл недоступен' } });
  }
  reply.header('Cache-Control', 'private, no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
  reply.header('Content-Type', opened.contentType);
  reply.header('Content-Length', opened.size);
  return reply.send(opened.stream);
}
