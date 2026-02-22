import { FastifyReply, FastifyRequest } from 'fastify';
import { notificationService } from './service.js';

interface JwtUser { id: string; role: string; }
type AuthReq = FastifyRequest & { user: JwtUser };

export const getNotificationsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { unread } = request.query as { unread?: string };
    const notifications = await notificationService.getNotifications(userId, unread === 'true');
    return reply.send({ success: true, data: { notifications }, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'GET_NOTIFICATIONS_ERROR', message: error.message } });
  }
};

export const markReadHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const { id } = request.params as { id: string };
    const notification = await notificationService.markRead(id, userId);
    return reply.send({ success: true, data: { notification }, error: null });
  } catch (error: any) {
    return reply.code(400).send({ success: false, error: { code: 'MARK_READ_ERROR', message: error.message } });
  }
};

export const markAllReadHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const result = await notificationService.markAllRead(userId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'MARK_ALL_READ_ERROR', message: error.message } });
  }
};

export const getUnreadCountHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id: userId } = (request as AuthReq).user;
    const result = await notificationService.getUnreadCount(userId);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: any) {
    return reply.code(500).send({ success: false, error: { code: 'UNREAD_COUNT_ERROR', message: error.message } });
  }
};
