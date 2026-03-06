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
  status: true,
  downloads_count: true,
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

    if (query.search) {
      where.OR = [
        { name:        { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { tags:        { has: query.search.toLowerCase() } },
      ];
    }

    const [packs, total] = await Promise.all([
      prisma.stickerPack.findMany({
        where,
        select: PACK_SELECT,
        orderBy: { created_at: 'desc' },
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
        status:            input.status        ?? 'published',
        downloads_count:   0,
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

  // ── check if user has pack ────────────────────────────────────────────────
  async hasInCollection(userId: string, packId: string) {
    const row = await prisma.userStickerPack.findUnique({
      where: { user_id_pack_id: { user_id: userId, pack_id: packId } },
    });
    return !!row;
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
