import { FastifyRequest, FastifyReply } from 'fastify';
import { stickersService } from './service.js';
import type { GetPacksQuery, CreatePackInput, UpdatePackInput } from './types.js';
import { isAdmin } from '../../lib/roles.js';
import { requestIsAdult } from '../../lib/age.js';

export async function findByUrlHandler(req: FastifyRequest, reply: FastifyReply) {
  const { url } = req.query as { url?: string };
  if (!url) return reply.status(400).send({ success: false, data: null, error: { code: 'MISSING_URL', message: 'url query param required' } });
  try {
    const userId = (req as any).user?.id as string | undefined;
    const result = await stickersService.findByUrl(url, userId);
    if (!result) return reply.send({ success: true, data: { found: false }, error: null });
    if (result.private) return reply.send({ success: true, data: { found: true, private: true }, error: null });
    return reply.send({ success: true, data: { found: true, private: false, pack: result.pack }, error: null });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, data: null, error: { code: 'SERVER_ERROR', message: 'Failed to find sticker pack' } });
  }
}

export async function listPacksHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const query = req.query as GetPacksQuery;
    if (!requestIsAdult((req as any).user)) {
      query.excludeNsfw = '1';
      query.nsfw = undefined;
    }
    const result = await stickersService.list(query);
    return reply.send({ data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load sticker packs' });
  }
}

export async function getPackHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    // Черновик отдаём только автору; requesterId придёт из tryAuth, без токена — undefined
    const requesterId = (req as any).user?.id as string | undefined;
    const pack = await stickersService.getById(id, requesterId);
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
  } catch (err: any) {
    if (err?.statusCode) return reply.status(err.statusCode).send({ error: err.message });
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

export async function getPackStatsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string; role?: string };
  const { id } = req.params as { id: string };
  const { period } = req.query as { period?: string };
  try {
    const pack = await stickersService.getById(id, user.id);
    if (!pack) return reply.status(404).send({ error: 'Pack not found' });
    if (pack.author_id !== user.id && !isAdmin(user.role)) {
      return reply.status(403).send({ error: 'Only the pack owner can view its stats' });
    }
    const days = period === '30d' ? 30 : 7;
    const stats = await stickersService.getPackStats(id, days);
    return reply.send({ data: { stats } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load pack stats' });
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

export async function usePackHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    await stickersService.incrementUse(id);
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to track sticker use' });
  }
}

export async function trackUsageHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { stickerUrl, packId } = req.body as { stickerUrl: string; packId?: string };
  if (!stickerUrl) return reply.status(400).send({ error: 'stickerUrl required' });
  try {
    await stickersService.trackStickerUsage(user.id, stickerUrl, packId);
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to track sticker usage' });
  }
}

export async function getRecentUsedHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { type, limit } = req.query as { type?: string; limit?: string };
  const lim = Math.min(60, parseInt(limit ?? '50', 10));
  try {
    const stickers = type === 'frequent'
      ? await stickersService.getFrequentStickers(user.id, lim)
      : await stickersService.getRecentStickers(user.id, lim);
    return reply.send({ data: { stickers } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load usage history' });
  }
}

export async function getFavoritesHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  try {
    const stickers = await stickersService.getFavoriteStickers(user.id);
    return reply.send({ data: { stickers } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load favorites' });
  }
}

export async function addFavoriteHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { stickerUrl, packId } = req.body as { stickerUrl: string; packId?: string };
  if (!stickerUrl) return reply.status(400).send({ error: 'stickerUrl required' });
  try {
    await stickersService.addFavoriteSticker(user.id, stickerUrl, packId);
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to add favorite' });
  }
}

export async function removeFavoriteHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { stickerUrl } = req.body as { stickerUrl: string };
  if (!stickerUrl) return reply.status(400).send({ error: 'stickerUrl required' });
  try {
    await stickersService.removeFavoriteSticker(user.id, stickerUrl);
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to remove favorite' });
  }
}

export async function addStickersToPackHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const { urls } = req.body as { urls: string[] };
  if (!Array.isArray(urls) || urls.length === 0) return reply.status(400).send({ error: 'urls[] required' });
  try {
    const pack = await stickersService.addStickersToPack(id, user.id, urls);
    if (!pack) return reply.status(404).send({ error: 'Pack not found or not yours' });
    return reply.send({ data: { pack } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to add stickers to pack' });
  }
}

export async function importTelegramHandler(req: FastifyRequest, reply: FastifyReply) {
  const { link, maxStickers } = req.body as { link: string; maxStickers?: number };
  if (!link) return reply.status(400).send({ error: 'link is required' });
  try {
    const userId = (req as any).user.id as string;
    const result = await stickersService.importFromTelegram(link, maxStickers, userId);
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
