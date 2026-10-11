import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createTicket, getMyTickets, getTicketForUser, addUserMessage,
  adminGetTickets, adminReplyTicket,
} from './service.js';
import { isModerator } from '../../lib/roles.js';

// POST /api/support/tickets
export async function createTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const { type, subject, message, contact_email, attachment_urls } = request.body as any;
  if (!subject?.trim() || !message?.trim()) {
    return reply.code(400).send({ success: false, error: { message: 'Заполните тему и сообщение' } });
  }
  try {
    const ticket = await createTicket(userId, {
      type, subject, message, contactEmail: contact_email, attachmentUrls: attachment_urls,
    });
    return reply.code(201).send({ success: true, data: { ticket } });
  } catch (e: any) {
    if (!e?.statusCode) throw e;
    return reply.code(e.statusCode).send({ success: false, error: { message: e.message } });
  }
}

// GET /api/support/tickets
export async function getMyTicketsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const tickets = await getMyTickets(userId);
  return reply.send({ success: true, data: { tickets } });
}

// GET /api/support/tickets/:id
export async function getMyTicketHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const { id } = request.params as any;
  const ticket = await getTicketForUser(userId, id);
  if (!ticket) return reply.code(404).send({ success: false, error: { message: 'Обращение не найдено' } });
  return reply.send({ success: true, data: { ticket } });
}

// POST /api/support/tickets/:id/messages
export async function addTicketMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
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
  const ticket = await adminReplyTicket(id, user.id, { status, adminReply: admin_reply });
  return reply.send({ success: true, data: { ticket } });
}
