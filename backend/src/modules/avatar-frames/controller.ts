import { FastifyRequest, FastifyReply } from 'fastify';
import { avatarFramesService } from './service.js';
import type { CreateAvatarFrameInput, CalibrationInput } from './types.js';

export async function createFrameHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string; role?: string };
  const input = req.body as CreateAvatarFrameInput;
  try {
    const frame = await avatarFramesService.create(user.id, user.role, input);
    return reply.status(201).send({ success: true, data: { frame } });
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg === 'ARTIST_VERIFICATION_REQUIRED') {
      return reply.status(403).send({ success: false, error: 'Загружать рамки могут только верифицированные художники или админы' });
    }
    if (msg === 'DEN_FROZEN') return reply.status(403).send({ success: false, error: 'Ваш аккаунт в Ярмарке заморожен' });
    if (msg === 'INVALID_NAME')  return reply.status(422).send({ success: false, error: 'Укажите название рамки' });
    if (msg === 'INVALID_IMAGE') return reply.status(422).send({ success: false, error: 'Загрузите изображение рамки' });
    if (msg === 'INVALID_PRICE') return reply.status(422).send({ success: false, error: 'Некорректная цена' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create avatar frame' });
  }
}

export async function claimFrameHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    const owned = await avatarFramesService.claim(id, user.id);
    return reply.send({ success: true, data: { owned } });
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg === 'FRAME_NOT_FOUND')    return reply.status(404).send({ success: false, error: 'Рамка не найдена' });
    if (msg === 'FRAME_NOT_APPROVED') return reply.status(409).send({ success: false, error: 'Рамка ещё на модерации' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to claim avatar frame' });
  }
}

export async function updateCalibrationHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const input = req.body as CalibrationInput;
  try {
    const owned = await avatarFramesService.updateCalibration(id, user.id, input);
    return reply.send({ success: true, data: { owned } });
  } catch (err: any) {
    if (err?.message === 'NOT_OWNED') return reply.status(403).send({ success: false, error: 'Рамка вам не принадлежит' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update calibration' });
  }
}

export async function getMyFramesHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  try {
    const frames = await avatarFramesService.getMine(user.id);
    return reply.send({ success: true, data: { frames } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load your frames' });
  }
}

// ── Admin ──────────────────────────────────────────────────────────────────────

export async function adminGetSubmissionsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { status, page } = req.query as { status?: string; page?: string };
  try {
    const data = await avatarFramesService.adminGetSubmissions(status, parseInt(page ?? '1', 10) || 1);
    return reply.send({ success: true, data });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load submissions' });
  }
}

export async function adminReviewHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const { action, reason } = req.body as { action: 'approve' | 'reject'; reason?: string };
  if (!['approve', 'reject'].includes(action)) {
    return reply.status(400).send({ success: false, error: 'Invalid action' });
  }
  try {
    const frame = await avatarFramesService.adminReview(id, action, user.id, reason);
    return reply.send({ success: true, data: { frame } });
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg === 'FRAME_NOT_FOUND')   return reply.status(404).send({ success: false, error: 'Рамка не найдена' });
    if (msg === 'ALREADY_REVIEWED') return reply.status(409).send({ success: false, error: 'Заявка уже рассмотрена' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to review submission' });
  }
}
