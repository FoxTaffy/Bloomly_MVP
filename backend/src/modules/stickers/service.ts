import prisma from '../../config/prisma.js';
import { uploadRawToMinIO } from '../media/service.js';
import type { CreatePackInput, UpdatePackInput, GetPacksQuery } from './types.js';

// ── Telegram import helpers ───────────────────────────────────────────────
const TG_API = (token: string) => `https://api.telegram.org/bot${token}`;
const TG_FILE = (token: string, path: string) => `https://api.telegram.org/file/bot${token}/${path}`;

function parseTgPackName(input: string): string {
  // accepts full link https://t.me/addstickers/Name  or  t.me/addstickers/Name  or  just Name
  const match = input.match(/addstickers\/([A-Za-z0-9_]+)/);
  return match ? match[1] : input.trim();
}

async function tgJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram API HTTP ${res.status}`);
  const body = await res.json() as any;
  if (!body.ok) throw new Error(body.description ?? 'Telegram API error');
  return body.result;
}

async function downloadStickerUrl(token: string, fileId: string): Promise<string | null> {
  try {
    const fileInfo = await tgJson(`${TG_API(token)}/getFile?file_id=${fileId}`);
    const filePath: string = fileInfo.file_path;
    const res = await fetch(TG_FILE(token, filePath));
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext  = filePath.endsWith('.webm') ? '.webm' : '.webp';
    const mime = ext === '.webm' ? 'video/webm' : 'image/webp';
    return await uploadRawToMinIO(buf, ext, mime, 'stickers');
  } catch {
    return null;
  }
}

async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const chunk = await Promise.all(batch.map(fn));
    results.push(...chunk);
  }
  return results;
}

const PACK_SELECT = {
  id: true,
  author_id: true,
  name: true,
  description: true,
  cover_url: true,
  cover_bg_color: true,
  cover_sticker_idx: true,
  stickers: true,
  nsfw_stickers: true,
  price: true,
  currency: true,
  tags: true,
  is_nsfw: true,
  hide_author: true,
  status: true,
  downloads_count: true,
  use_count: true,
  created_at: true,
  updated_at: true,
  author: {
    select: {
      id: true,
      username: true,
      display_name: true,
      avatar_url: true,
      is_verified: true,
      verification_type: true,
    },
  },
  _count: { select: { userCollections: true } },
};

// Mask author for non-admin viewers when hide_author=true
function maskAuthor(pack: any, requestingUserId?: string, isAdmin = false): any {
  if (!pack || !pack.hide_author) return pack
  if (isAdmin || pack.author_id === requestingUserId) return pack
  return { ...pack, author: null }
}

export const stickersService = {
  // ── list ─────────────────────────────────────────────────────────────────
  async list(query: GetPacksQuery) {
    const page  = Math.max(1, parseInt(query.page  ?? '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '24', 10)));
    const skip  = (page - 1) * limit;

    const where: any = { deleted_at: null };

    if (query.status) {
      where.status = query.status;
    } else if (!query.authorId) {
      where.status = 'published';
    }

    if (query.authorId) where.author_id = query.authorId;
    if (query.free === '1') where.price = 0;
    if (query.nsfw === '1' || query.nsfw === 'true') where.is_nsfw = true;
    if (query.excludeNsfw === '1' || query.excludeNsfw === 'true') where.is_nsfw = false;
    if (query.tag) where.tags = { has: query.tag.toLowerCase() };

    if (query.search) {
      where.OR = [
        { name:        { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { tags:        { has: query.search.toLowerCase() } },
      ];
    }

    const orderBy: any =
      query.sort === 'popular' ? { downloads_count: 'desc' } :
      query.sort === 'new'     ? { created_at: 'desc' } :
                                 { downloads_count: 'desc' };

    const [packs, total] = await Promise.all([
      prisma.stickerPack.findMany({
        where,
        select: PACK_SELECT,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.stickerPack.count({ where }),
    ]);

    return { packs, total, page, limit };
  },

  // ── get by id ─────────────────────────────────────────────────────────────
  async getById(id: string) {
    return prisma.stickerPack.findFirst({
      where: { id, deleted_at: null },
      select: PACK_SELECT,
    });
  },

  // ── create ────────────────────────────────────────────────────────────────
  async create(authorId: string, input: CreatePackInput) {
    return prisma.stickerPack.create({
      data: {
        author_id:         authorId,
        name:              input.name,
        description:       input.description,
        cover_url:         input.coverUrl,
        cover_bg_color:    input.coverBgColor,
        cover_sticker_idx: input.coverStickerIdx ?? null,
        stickers:          input.stickers     ?? [],
        nsfw_stickers:     input.nsfwStickers  ?? [],
        price:             input.price         ?? 0,
        currency:          input.currency      ?? 'USD',
        tags:              input.tags          ?? [],
        is_nsfw:           input.isNsfw        ?? false,
        hide_author:       input.hideAuthor    ?? false,
        status:            input.status        ?? 'published',
        downloads_count:   0,
        use_count:         0,
      },
      select: PACK_SELECT,
    });
  },

  // ── update ────────────────────────────────────────────────────────────────
  async update(id: string, authorId: string, input: UpdatePackInput) {
    const existing = await prisma.stickerPack.findFirst({ where: { id, author_id: authorId, deleted_at: null } });
    if (!existing) return null;

    const data: any = {};
    if (input.name             !== undefined) data.name              = input.name;
    if (input.description      !== undefined) data.description       = input.description;
    if (input.coverUrl         !== undefined) data.cover_url         = input.coverUrl;
    if (input.coverBgColor     !== undefined) data.cover_bg_color    = input.coverBgColor;
    if (input.coverStickerIdx  !== undefined) data.cover_sticker_idx = input.coverStickerIdx;
    if (input.stickers         !== undefined) data.stickers          = input.stickers;
    if (input.nsfwStickers     !== undefined) data.nsfw_stickers     = input.nsfwStickers;
    if (input.price            !== undefined) data.price             = input.price;
    if (input.currency         !== undefined) data.currency          = input.currency;
    if (input.tags             !== undefined) data.tags              = input.tags;
    if (input.isNsfw           !== undefined) data.is_nsfw           = input.isNsfw;
    if (input.hideAuthor       !== undefined) data.hide_author       = input.hideAuthor;
    if (input.status           !== undefined) data.status            = input.status;

    return prisma.stickerPack.update({ where: { id }, data, select: PACK_SELECT });
  },

  // ── delete ────────────────────────────────────────────────────────────────
  async delete(id: string, authorId: string) {
    const existing = await prisma.stickerPack.findFirst({ where: { id, author_id: authorId, deleted_at: null } });
    if (!existing) return null;
    return prisma.stickerPack.update({ where: { id }, data: { deleted_at: new Date() } });
  },

  // ── my packs ──────────────────────────────────────────────────────────────
  async getMyPacks(authorId: string) {
    return prisma.stickerPack.findMany({
      where: { author_id: authorId, deleted_at: null },
      select: PACK_SELECT,
      orderBy: { created_at: 'desc' },
    });
  },

  // ── increment use count (called when sticker is sent in message) ──────────
  async incrementUse(packId: string) {
    await prisma.stickerPack.updateMany({
      where: { id: packId, deleted_at: null },
      data:  { use_count: { increment: 1 } },
    });
  },

  // ── add to collection ─────────────────────────────────────────────────────
  async addToCollection(userId: string, packId: string) {
    const pack = await prisma.stickerPack.findFirst({ where: { id: packId, deleted_at: null, status: 'published' } });
    if (!pack) return null;

    await prisma.$transaction([
      prisma.userStickerPack.upsert({
        where:  { user_id_pack_id: { user_id: userId, pack_id: packId } },
        create: { user_id: userId, pack_id: packId },
        update: {},
      }),
      prisma.stickerPack.update({
        where: { id: packId },
        data:  { downloads_count: { increment: 1 } },
      }),
    ]);
    return true;
  },

  // ── remove from collection ────────────────────────────────────────────────
  async removeFromCollection(userId: string, packId: string) {
    await prisma.userStickerPack.deleteMany({ where: { user_id: userId, pack_id: packId } });
    return true;
  },

  // ── my collection ─────────────────────────────────────────────────────────
  async getCollection(userId: string) {
    const rows = await prisma.userStickerPack.findMany({
      where:   { user_id: userId },
      select:  { pack_id: true, added_at: true, pack: { select: PACK_SELECT } },
      orderBy: { added_at: 'desc' },
    });
    return rows.map(r => ({ ...r.pack, added_at: r.added_at }));
  },

  // ── find pack by sticker URL ─────────────────────────────────────────────
  async findByUrl(url: string, requestingUserId?: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { deleted_at: null, stickers: { has: url } },
      select: PACK_SELECT,
    });
    if (!pack) return null;
    // If draft, only return full data to the author; otherwise mark as private
    if (pack.status === 'draft' && pack.author_id !== requestingUserId) {
      return { private: true as const, pack_id: pack.id, author_id: pack.author_id };
    }
    // Attach in_collection flag if user known
    let in_collection = false;
    if (requestingUserId) {
      const row = await prisma.userStickerPack.findUnique({
        where: { user_id_pack_id: { user_id: requestingUserId, pack_id: pack.id } },
      });
      in_collection = !!row;
    }
    return { private: false as const, pack: { ...pack, in_collection } };
  },

  // ── check if user has pack ────────────────────────────────────────────────
  async hasInCollection(userId: string, packId: string) {
    const row = await prisma.userStickerPack.findUnique({
      where: { user_id_pack_id: { user_id: userId, pack_id: packId } },
    });
    return !!row;
  },

  // ── track per-sticker usage (real statistics) ──────────────────────────
  async trackStickerUsage(userId: string, stickerUrl: string, packId?: string) {
    await prisma.stickerUsage.upsert({
      where:  { user_id_sticker_url: { user_id: userId, sticker_url: stickerUrl } },
      create: { user_id: userId, sticker_url: stickerUrl, pack_id: packId ?? null, use_count: 1 },
      update: { use_count: { increment: 1 }, last_used_at: new Date(), pack_id: packId ?? undefined },
    });
    // also bump pack-level use_count
    if (packId) {
      await prisma.stickerPack.updateMany({
        where: { id: packId, deleted_at: null },
        data:  { use_count: { increment: 1 } },
      });
    }
  },

  // ── get recent/frequent stickers for user ─────────────────────────────
  async getRecentStickers(userId: string, limit = 30) {
    const rows = await prisma.stickerUsage.findMany({
      where:   { user_id: userId },
      orderBy: { last_used_at: 'desc' },
      take:    limit,
      select:  { sticker_url: true, pack_id: true, use_count: true, last_used_at: true },
    });
    return rows.map(r => ({ url: r.sticker_url, packId: r.pack_id ?? undefined, use_count: r.use_count, last_used: r.last_used_at }));
  },

  async getFrequentStickers(userId: string, limit = 30) {
    const rows = await prisma.stickerUsage.findMany({
      where:   { user_id: userId },
      orderBy: { use_count: 'desc' },
      take:    limit,
      select:  { sticker_url: true, pack_id: true, use_count: true },
    });
    return rows.map(r => ({ url: r.sticker_url, packId: r.pack_id ?? undefined, use_count: r.use_count }));
  },

  // ── server-side favorites ─────────────────────────────────────────────
  async getFavoriteStickers(userId: string) {
    const rows = await prisma.stickerFavorite.findMany({
      where:   { user_id: userId },
      orderBy: { added_at: 'desc' },
      select:  { sticker_url: true, pack_id: true, added_at: true },
    });
    return rows.map(r => ({ url: r.sticker_url, packId: r.pack_id ?? undefined, added_at: r.added_at }));
  },

  async addFavoriteSticker(userId: string, stickerUrl: string, packId?: string) {
    await prisma.stickerFavorite.upsert({
      where:  { user_id_sticker_url: { user_id: userId, sticker_url: stickerUrl } },
      create: { user_id: userId, sticker_url: stickerUrl, pack_id: packId ?? null },
      update: { pack_id: packId ?? null },
    });
  },

  async removeFavoriteSticker(userId: string, stickerUrl: string) {
    await prisma.stickerFavorite.deleteMany({ where: { user_id: userId, sticker_url: stickerUrl } });
  },

  // ── add stickers to existing pack (append) ────────────────────────────
  async addStickersToPack(packId: string, authorId: string, urls: string[]) {
    const existing = await prisma.stickerPack.findFirst({ where: { id: packId, author_id: authorId, deleted_at: null } });
    if (!existing) return null;
    const merged = Array.from(new Set([...existing.stickers, ...urls]));
    return prisma.stickerPack.update({
      where:  { id: packId },
      data:   { stickers: merged },
      select: PACK_SELECT,
    });
  },

  // ── popularity score for sorting (downloads + use_count weighted) ─────
  async getPopularityStats(packIds: string[]) {
    return prisma.stickerPack.findMany({
      where:  { id: { in: packIds }, deleted_at: null },
      select: { id: true, downloads_count: true, use_count: true },
    });
  },

  // ── Telegram import ────────────────────────────────────────────────────
  async importFromTelegram(input: string, maxStickers = 60) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw Object.assign(new Error('Telegram Bot Token не настроен на сервере'), { code: 'NO_TOKEN' });
    }

    const packName = parseTgPackName(input);
    if (!packName) {
      throw Object.assign(new Error('Укажите ссылку или название пака'), { code: 'BAD_INPUT' });
    }

    const packInfo = await tgJson(`${TG_API(token)}/getStickerSet?name=${encodeURIComponent(packName)}`);

    // Only static (non-animated, non-video) stickers
    const candidates: any[] = (packInfo.stickers as any[]).filter(
      (s) => s.type === 'regular' && !s.is_animated && !s.is_video,
    );

    const limited = candidates.slice(0, maxStickers);

    // Download + upload in batches of 5
    const urls = await batchProcess(limited, 5, (s) => downloadStickerUrl(token, s.file_id));
    const validUrls = urls.filter(Boolean) as string[];

    return {
      title:        packInfo.title   as string,
      tg_name:      packInfo.name    as string,
      total:        candidates.length,
      imported:     validUrls.length,
      sticker_urls: validUrls,
    };
  },
};
