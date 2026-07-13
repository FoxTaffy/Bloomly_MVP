import { FastifyRequest, FastifyReply } from 'fastify';
import { updatesService } from './service.js';
import { isAdmin } from '../../lib/roles.js';

export const getActiveUpdatesHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  const updates = await updatesService.getActiveUpdates();
  return reply.send({ success: true, data: { updates } });
};

export const getAllUpdatesHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const role = (req.user as any)?.role;
  if (!isAdmin(role)) {
    return reply.status(403).send({ success: false, error: 'Forbidden' });
  }
  const updates = await updatesService.getAllUpdates();
  return reply.send({ success: true, data: { updates } });
};

export const createUpdateHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const role = (req.user as any)?.role;
  if (!isAdmin(role)) {
    return reply.status(403).send({ success: false, error: 'Forbidden' });
  }
  const { title, body, image_url } = req.body as any;
  if (!title?.trim()) return reply.status(400).send({ success: false, error: 'title is required' });
  const update = await updatesService.createUpdate({ title: title.trim(), body: body?.trim() || undefined, image_url: image_url || undefined });
  return reply.status(201).send({ success: true, data: { update } });
};

export const deleteUpdateHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const role = (req.user as any)?.role;
  if (!isAdmin(role)) {
    return reply.status(403).send({ success: false, error: 'Forbidden' });
  }
  try {
    await updatesService.deleteUpdate(req.params.id);
    return reply.send({ success: true });
  } catch {
    return reply.status(404).send({ success: false, error: 'Not found' });
  }
};

export const toggleUpdateHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const role = (req.user as any)?.role;
  if (!isAdmin(role)) {
    return reply.status(403).send({ success: false, error: 'Forbidden' });
  }
  const { is_active } = req.body as any;
  const update = await updatesService.toggleUpdate(req.params.id, Boolean(is_active));
  return reply.send({ success: true, data: { update } });
};
