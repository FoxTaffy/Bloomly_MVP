import prisma from '../../config/prisma.js';
import { uploadRawToMinIO, recordMediaOwner, assertOwnedMedia } from '../media/service.js';
import { randomBytes } from 'crypto';
import type { CreatePackInput, UpdatePackInput, GetPacksQuery, PackVisibility } from './types.js';

export const MAX_STICKERS_PER_PACK = 120; // как в Telegram
const VISIBILITIES: readonly PackVisibility[] = ['own', 'public', 'invite', 'paid'];

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const newInviteCode = () => randomBytes(9).toString('base64url');

async function isBusiness(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true } });
  return u?.subscription_tier === 'business';
}

/**
 * Приводит видимость, цену и стикеры к допустимому виду.
 * Платный пак доступен только с подпиской Business; у остальных видимостей цена всегда 0.
 */
async function normalizePolicy(
  authorId: string,
  next: { visibility: string; price: number; stickers: string[]; nsfw: number[]; coverIdx: number | null },
) {
  if (!VISIBILITIES.includes(next.visibility as PackVisibility)) throw httpError('Неизвестный тип публикации', 400);
  if (next.stickers.length > MAX_STICKERS_PER_PACK) {
    throw httpError(`В паке не может быть больше ${MAX_STICKERS_PER_PACK} стикеров`, 400);
  }
  if (next.visibility === 'paid') {
    if (!(await isBusiness(authorId))) throw httpError('Платные паки доступны с подпиской Business', 402);
    if (!(next.price > 0)) throw httpError('Укажите цену платного пака', 400);
  }
  const n = next.stickers.length;
  return {
    price: next.visibility === 'paid' ? next.price : 0,
    nsfw: Array.from(new Set(next.nsfw.filter(i => Number.isInteger(i) && i >= 0 && i < n))),
    coverIdx: next.coverIdx !== null && next.coverIdx >= 0 && next.coverIdx < n ? next.coverIdx : null,
  };
}

/** Скрывает invite_code от всех, кроме автора */
function redact<T extends { author_id?: string; invite_code?: string | null }>(pack: T, requesterId?: string): T {
  if (!pack || pack.author_id === requesterId) return pack;
  return { ...pack, invite_code: null };
}

/** Видит ли пользователь пак: свой/по приглашению — только автор и те, кто уже добавил его */
async function canView(pack: { id: string; author_id: string; visibility: string; status: string }, requesterId?: string, code?: string, inviteCode?: string | null) {
  if (pack.author_id === requesterId) return true;
  if (pack.status === 'draft') return false;
  if (pack.visibility === 'own') return false;
  if (pack.visibility === 'invite') {
    if (code && inviteCode && code === inviteCode) return true;
    if (!requesterId) return false;
    const row = await prisma.userStickerPack.findUnique({
      where: { user_id_pack_id: { user_id: requesterId, pack_id: pack.id } }, select: { user_id: true },
    });
    return !!row;
  }
  return true;
}

// Цвет обложки уходит в style-строку: допускаем только hex, иначе можно внедрить url() и лишние свойства
function checkCoverColor(color: string | null | undefined): string | null | undefined {
  if (color === undefined || color === null || color === '') return color === '' ? null : color;
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) throw Object.assign(new Error('Некорректный цвет обложки'), { statusCode: 400 });
  return color;
}

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

async function downloadStickerUrl(token: string, fileId: string, ownerId: string): Promise<string | null> {
  try {
    const fileInfo = await tgJson(`${TG_API(token)}/getFile?file_id=${fileId}`);
    const filePath: string = fileInfo.file_path;
    const res = await fetch(TG_FILE(token, filePath));
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ext  = filePath.endsWith('.webm') ? '.webm' : '.webp';
    const mime = ext === '.webm' ? 'video/webm' : 'image/webp';
    const url = await uploadRawToMinIO(buf, ext, mime, 'stickers');
    // Импортированный стикер принадлежит тому, кто импортировал пак
    await recordMediaOwner(url, ownerId, 'stickers', buf.length);
    return url;
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
  visibility: true,
  invite_code: true,
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
  async list(query: GetPacksQuery, requesterId?: string) {
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
    // Свои паки и паки по приглашению не попадают в каталог; автор видит всё своё
    if (!(query.authorId && query.authorId === requesterId)) where.visibility = { in: ['public', 'paid'] };
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

    return { packs: packs.map(p => redact(p, requesterId)), total, page, limit };
  },

  // ── get by id ─────────────────────────────────────────────────────────────
  async getById(id: string, requesterId?: string, code?: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { id, deleted_at: null },
      select: PACK_SELECT,
    });
    if (!pack) return null;
    // Черновик, «свой» и пак по приглашению не отдаём посторонним: раньше всё читалось по одному UUID
    if (!(await canView(pack, requesterId, code, pack.invite_code))) return null;
    return redact(pack, requesterId);
  },

  // ── get by invite code ────────────────────────────────────────────────────
  async getByInviteCode(code: string, requesterId?: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { invite_code: code, visibility: 'invite', status: 'published', deleted_at: null },
      select: PACK_SELECT,
    });
    return pack ? redact(pack, requesterId) : null;
  },

  // ── create ────────────────────────────────────────────────────────────────
  async create(authorId: string, input: CreatePackInput) {
    await assertOwnedMedia(input.coverUrl, authorId);
    for (const url of input.stickers ?? []) await assertOwnedMedia(url, authorId);
    const visibility = input.visibility ?? 'public';
    const stickers = input.stickers ?? [];
    const policy = await normalizePolicy(authorId, {
      visibility, price: input.price ?? 0, stickers,
      nsfw: input.nsfwStickers ?? [], coverIdx: input.coverStickerIdx ?? null,
    });
    const pack = await prisma.stickerPack.create({
      data: {
        author_id:         authorId,
        name:              input.name,
        description:       input.description,
        cover_url:         input.coverUrl,
        cover_bg_color:    checkCoverColor(input.coverBgColor),
        cover_sticker_idx: policy.coverIdx,
        stickers,
        nsfw_stickers:     policy.nsfw,
        price:             policy.price,
        currency:          input.currency      ?? 'USD',
        tags:              input.tags          ?? [],
        is_nsfw:           input.isNsfw        ?? false,
        hide_author:       input.hideAuthor    ?? false,
        visibility,
        invite_code:       visibility === 'invite' ? newInviteCode() : null,
        status:            input.status        ?? 'published',
        downloads_count:   0,
        use_count:         0,
      },
      select: PACK_SELECT,
    });
    return pack;
  },

  // ── update ────────────────────────────────────────────────────────────────
  async update(id: string, authorId: string, input: UpdatePackInput) {
    const existing = await prisma.stickerPack.findFirst({ where: { id, author_id: authorId, deleted_at: null } });
    if (!existing) return null;
    if (input.coverUrl && input.coverUrl !== existing.cover_url) await assertOwnedMedia(input.coverUrl, authorId);
    for (const url of input.stickers ?? []) if (!existing.stickers.includes(url)) await assertOwnedMedia(url, authorId);

    const visibility = input.visibility ?? existing.visibility;
    const stickers = input.stickers ?? existing.stickers;
    const policy = await normalizePolicy(authorId, {
      visibility,
      price: input.price ?? Number(existing.price),
      stickers,
      nsfw: input.nsfwStickers ?? existing.nsfw_stickers,
      coverIdx: input.coverStickerIdx !== undefined ? input.coverStickerIdx : existing.cover_sticker_idx,
    });

    const data: any = {
      price: policy.price,
      nsfw_stickers: policy.nsfw,
      cover_sticker_idx: policy.coverIdx,
      visibility,
    };
    if (visibility === 'invite') {
      if (!existing.invite_code || input.regenerateInvite) data.invite_code = newInviteCode();
    } else {
      data.invite_code = null;
    }
    if (input.name             !== undefined) data.name              = input.name;
    if (input.description      !== undefined) data.description       = input.description;
    if (input.coverUrl         !== undefined) data.cover_url         = input.coverUrl;
    if (input.coverBgColor     !== undefined) data.cover_bg_color    = checkCoverColor(input.coverBgColor);
    if (input.stickers         !== undefined) data.stickers          = input.stickers;
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
  async addToCollection(userId: string, packId: string, code?: string) {
    const pack = await prisma.stickerPack.findFirst({ where: { id: packId, deleted_at: null, status: 'published' } });
    if (!pack) return null;
    const isAuthor = pack.author_id === userId;
    if (!isAuthor) {
      if (pack.visibility === 'own') return null;
      if (pack.visibility === 'invite' && !(code && pack.invite_code && code === pack.invite_code)) return null;
      // Платный пак добавляется только через покупку (purchase)
      if (pack.visibility === 'paid' || Number(pack.price) > 0) throw httpError('Платный пак нужно купить', 402);
    }
    return this._collect(userId, packId);
  },

  async _collect(userId: string, packId: string) {
    // Счётчик скачиваний растёт только при первом добавлении, а не на каждый повторный запрос
    const existing = await prisma.userStickerPack.findUnique({
      where: { user_id_pack_id: { user_id: userId, pack_id: packId } },
      select: { user_id: true },
    });
    if (existing) return true;

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

  // ── вход по приглашению ───────────────────────────────────────────────────
  async joinByInvite(userId: string, code: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { invite_code: code, visibility: 'invite', status: 'published', deleted_at: null },
      select: { id: true },
    });
    if (!pack) return null;
    await this._collect(userId, pack.id);
    return pack.id;
  },

  // ── покупка платного пака за баланс кошелька ──────────────────────────────
  async purchase(userId: string, packId: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, deleted_at: null, status: 'published', visibility: 'paid' },
      select: { id: true, author_id: true, price: true },
    });
    if (!pack) return null;
    if (pack.author_id === userId) return this._collect(userId, packId);
    const already = await prisma.userStickerPack.findUnique({
      where: { user_id_pack_id: { user_id: userId, pack_id: packId } }, select: { user_id: true },
    });
    if (already) return true;

    // Баланс — Decimal; сравниваем и списываем в одном условии UPDATE, чтобы два параллельных платежа не увели кошелёк в минус
    const price = Number(pack.price);
    await prisma.$transaction(async (tx) => {
      const debited = await tx.wallet.updateMany({
        where: { user_id: userId, balance: { gte: price } },
        data:  { balance: { decrement: price } },
      });
      if (debited.count === 0) throw httpError('Недостаточно средств на балансе', 402);
      await tx.wallet.upsert({
        where:  { user_id: pack.author_id },
        create: { user_id: pack.author_id, balance: price },
        update: { balance: { increment: price } },
      });
      await tx.userStickerPack.create({ data: { user_id: userId, pack_id: packId } });
      await tx.stickerPack.update({ where: { id: packId }, data: { downloads_count: { increment: 1 } } });
    });
    return true;
  },

  // ── remove from collection ────────────────────────────────────────────────
  async removeFromCollection(userId: string, packId: string) {
    await prisma.userStickerPack.deleteMany({ where: { user_id: userId, pack_id: packId } });
    return true;
  },

  // ── real analytics for the pack owner (no fabricated numbers) ─────────────
  async getPackStats(packId: string, days: 7 | 30) {
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 86_400_000);

    type DayRow = { day: Date; cnt: bigint };
    const installRows = await prisma.$queryRaw<DayRow[]>`
      SELECT DATE_TRUNC('day', added_at) AS day, COUNT(*)::bigint AS cnt
      FROM "UserStickerPack"
      WHERE pack_id = ${packId}::uuid AND added_at >= ${periodStart}
      GROUP BY 1
      ORDER BY 1
    `;
    const installsByDay = new Map(installRows.map(r => [r.day.toISOString().slice(0, 10), Number(r.cnt)]));

    const installs: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      installs.push({ date: key, count: installsByDay.get(key) ?? 0 });
    }

    const half = Math.floor(days / 2);
    const prevSum = installs.slice(0, half).reduce((a, b) => a + b.count, 0);
    const currSum = installs.slice(half).reduce((a, b) => a + b.count, 0);
    const trendPct = prevSum > 0 ? Math.round(((currSum - prevSum) / prevSum) * 100) : (currSum > 0 ? 100 : 0);

    const [pack, totalSends, usageRows] = await Promise.all([
      prisma.stickerPack.findUnique({ where: { id: packId }, select: { stickers: true } }),
      prisma.stickerUsage.aggregate({ where: { pack_id: packId }, _sum: { use_count: true } }),
      prisma.stickerUsage.findMany({ where: { pack_id: packId }, select: { sticker_url: true, use_count: true } }),
    ]);

    const usageByUrl = new Map(usageRows.map(r => [r.sticker_url, r.use_count]));
    const topStickers = (pack?.stickers ?? [])
      .map(url => ({ url, useCount: usageByUrl.get(url) ?? 0 }))
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 5);

    return {
      days,
      installs,
      trendPct,
      totalSends: totalSends._sum.use_count ?? 0,
      topStickers,
    };
  },

  // ── my collection ─────────────────────────────────────────────────────────
  async getCollection(userId: string) {
    const rows = await prisma.userStickerPack.findMany({
      where:   { user_id: userId },
      select:  { pack_id: true, added_at: true, pack: { select: PACK_SELECT } },
      orderBy: { added_at: 'desc' },
    });
    return rows.map(r => ({ ...redact(r.pack, userId), added_at: r.added_at }));
  },

  // ── find pack by sticker URL ─────────────────────────────────────────────
  async findByUrl(url: string, requestingUserId?: string) {
    const pack = await prisma.stickerPack.findFirst({
      where: { deleted_at: null, stickers: { has: url } },
      select: PACK_SELECT,
    });
    if (!pack) return null;
    // If draft, only return full data to the author; otherwise mark as private
    if (!(await canView(pack, requestingUserId, undefined, pack.invite_code))) {
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
    return { private: false as const, pack: { ...redact(pack, requestingUserId), in_collection } };
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
    for (const url of urls) if (!existing.stickers.includes(url)) await assertOwnedMedia(url, authorId);
    const merged = Array.from(new Set([...existing.stickers, ...urls]));
    if (merged.length > MAX_STICKERS_PER_PACK) {
      throw httpError(`В паке не может быть больше ${MAX_STICKERS_PER_PACK} стикеров`, 400);
    }
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
  async importFromTelegram(input: string, maxStickers = 60, ownerId: string) {
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

    const limited = candidates.slice(0, Math.min(maxStickers, MAX_STICKERS_PER_PACK));

    // Download + upload in batches of 5
    const urls = await batchProcess(limited, 5, (s) => downloadStickerUrl(token, s.file_id, ownerId));
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
