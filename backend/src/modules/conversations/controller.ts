import { FastifyReply, FastifyRequest } from 'fastify';
import { conversationService } from './service.js';

interface JwtUser { id: string; role: string; }
type AuthReq = FastifyRequest & { user: JwtUser };

export const getConversationsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const conversations = await conversationService.getConversations(userId);
    return reply.send({ success: true, data: { conversations }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_CONVERSATIONS_ERROR', message: error.message } });
  }
};

export const createConversationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { participant_id } = request.body as { participant_id: string };
    const conversation = await conversationService.createConversation(userId, participant_id);
    return reply.code(201).send({ success: true, data: { conversation }, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'CREATE_CONVERSATION_ERROR', message: error.message } });
  }
};

export const getMessagesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    const { page, limit } = request.query as any;
    const messages = await conversationService.getMessages(id, userId, parseInt(page) || 1, parseInt(limit) || 50);
    return reply.send({ success: true, data: { messages }, error: null });
  } catch (error: any) {
    const code = error.message.includes('доступ') ? 403 : 500;
    return reply.code(code).send({ success: false, error: { code: 'GET_MESSAGES_ERROR', message: error.message } });
  }
};

export const sendMessageHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: senderId } = (request as AuthReq).user;
    const { id: conversationId } = request.params as { id: string };
    const { content } = request.body as { content: string };
    const message = await conversationService.sendMessage(conversationId, senderId, content);
    return reply.code(201).send({ success: true, data: { message }, error: null });
  } catch (error: any) {
    const code = error.message.includes('доступ') ? 403 : 400;
    return reply.code(code).send({ success: false, error: { code: 'SEND_MESSAGE_ERROR', message: error.message } });
  }
};

export const markReadHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id: conversationId } = request.params as { id: string };
    const result = await conversationService.markAsRead(conversationId, userId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'MARK_READ_ERROR', message: error.message } });
  }
};
