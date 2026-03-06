import { FastifyRequest, FastifyReply } from 'fastify';
import { stickersService } from './service.js';
import type { GetPacksQuery, CreatePackInput, UpdatePackInput } from './types.js';

export async function listPacksHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await stickersService.list(req.query as GetPacksQuery);
    return reply.send({ data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load sticker packs' });
  }
}

export async function getPackHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const pack = await stickersService.getById(id);
    if (!pack) return reply.status(404).send({ error: 'Pack not found' });
    return reply.send({ data: { pack } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load sticker pack' });
  }
}

export async function createPackHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const input = req.body as CreatePackInput;
  try {
    const pack = await stickersService.create(user.id, input);
    return reply.status(201).send({ data: { pack } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to create sticker pack' });
  }
}

export async function updatePackHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const input = req.body as UpdatePackInput;
  try {
    const pack = await stickersService.update(id, user.id, input);
    if (!pack) return reply.status(404).send({ error: 'Pack not found or not yours' });
    return reply.send({ data: { pack } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to update sticker pack' });
  }
}

export async function deletePackHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    const result = await stickersService.delete(id, user.id);
    if (!result) return reply.status(404).send({ error: 'Pack not found or not yours' });
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to delete sticker pack' });
  }
}

export async function getMyPacksHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  try {
    const packs = await stickersService.getMyPacks(user.id);
    return reply.send({ data: { packs } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load your packs' });
  }
}

export async function getCollectionHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  try {
    const packs = await stickersService.getCollection(user.id);
    return reply.send({ data: { packs } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load collection' });
  }
}

export async function addToCollectionHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    const result = await stickersService.addToCollection(user.id, id);
    if (!result) return reply.status(404).send({ error: 'Pack not found' });
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to add to collection' });
  }
}

export async function removeFromCollectionHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    await stickersService.removeFromCollection(user.id, id);
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to remove from collection' });
  }
}

export async function checkCollectionHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    const has = await stickersService.hasInCollection(user.id, id);
    return reply.send({ data: { has } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to check collection' });
  }
}

export async function importTelegramHandler(req: FastifyRequest, reply: FastifyReply) {
  const { link, maxStickers } = req.body as { link: string; maxStickers?: number };
  if (!link) return reply.status(400).send({ error: 'link is required' });
  try {
    const result = await stickersService.importFromTelegram(link, maxStickers);
    return reply.send({ data: result });
  } catch (err: any) {
    if (err.code === 'NO_TOKEN') {
      return reply.status(503).send({ error: err.message });
    }
    if (err.code === 'BAD_INPUT') {
      return reply.status(400).send({ error: err.message });
    }
    // Telegram API errors (pack not found, etc.)
    const msg: string = err.message ?? String(err);
    if (msg.includes('STICKERSET_INVALID') || msg.includes('StickerSet') || msg.includes('not found')) {
      return reply.status(404).send({ error: 'Стикерпак не найден. Проверьте ссылку и убедитесь, что пак публичный.' });
    }
    req.log.error(err);
    return reply.status(502).send({ error: 'Ошибка при обращении к Telegram: ' + msg });
  }
}
