import prisma from '../../config/prisma.js';
import { isTrustedMediaUrl } from '../media/service.js';
import { groupService } from '../groups/service.js';
import { assertGroupReadable, readableProfilesWhere } from '../../lib/contentAccess.js';
import { isBlockedBy } from '../../lib/blocks.js';

export const ALBUM_PRIVACIES = ['public', 'friends', 'private'] as const;
const MAX_ITEMS = 200;

type Owner = { userId: string } | { groupId: string };

const albumInclude = { items: { orderBy: { position: 'asc' as const } } };

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

async function canManage(album: { user_id: string | null; group_id: string | null }, viewerId: string | null): Promise<boolean> {
  if (!viewerId) return false;
  if (album.user_id) return album.user_id === viewerId;
  return album.group_id ? groupService.isAtLeastModerator(album.group_id, viewerId) : false;
}

/** Может ли зритель видеть альбом (владелец/модерация видят всё). */
export async function canViewAlbum(album: { user_id: string | null; group_id: string | null; privacy: string }, viewerId: string | null): Promise<boolean> {
  if (await canManage(album, viewerId)) return true;
  if (album.group_id) {
    try { await assertGroupReadable(album.group_id, viewerId); } catch { return false; }
  } else if (album.user_id) {
    if (await isBlockedBy(album.user_id, viewerId ?? undefined)) return false;
    const owner = await prisma.user.findFirst({ where: { id: album.user_id, AND: [readableProfilesWhere(viewerId)] }, select: { id: true } });
    if (!owner) return false;
  }
  if (album.privacy === 'public') return true;
  if (album.privacy !== 'friends' || !viewerId) return false;
  if (album.group_id) {
    const member = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: album.group_id, user_id: viewerId } },
      select: { user_id: true },
    });
    return !!member;
  }
  const [a, b] = await Promise.all([
    prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: viewerId, following_id: album.user_id! } }, select: { follower_id: true } }),
    prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: album.user_id!, following_id: viewerId } }, select: { follower_id: true } }),
  ]);
  return !!a && !!b;
}

function cleanTitle(title: unknown): string {
  const t = typeof title === 'string' ? title.trim().slice(0, 80) : '';
  if (!t) throw httpError('Введите название альбома', 400);
  return t;
}

function cleanPrivacy(p: unknown): string {
  return ALBUM_PRIVACIES.includes(p as typeof ALBUM_PRIVACIES[number]) ? (p as string) : 'public';
}

function cleanItems(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const seen = new Set<string>();
  for (const u of urls) {
    // Только файлы нашего хранилища и не из закрытых папок (reports, verification, support)
    if (typeof u === 'string' && isTrustedMediaUrl(u) && !u.includes('/private/')) seen.add(u);
    if (seen.size >= MAX_ITEMS) break;
  }
  return [...seen];
}

export const albumService = {
  async list(owner: Owner, viewerId: string | null) {
    const albums = await prisma.album.findMany({
      where: 'userId' in owner ? { user_id: owner.userId } : { group_id: owner.groupId },
      orderBy: { created_at: 'desc' },
      include: { ...albumInclude, _count: { select: { items: true } } },
    });
    const visible = [];
    for (const a of albums) {
      if (await canViewAlbum(a, viewerId)) visible.push({ ...a, items: a.items.slice(0, 4), can_edit: await canManage(a, viewerId) });
    }
    return visible;
  },

  async get(id: string, viewerId: string | null) {
    const album = await prisma.album.findUnique({ where: { id }, include: albumInclude });
    if (!album || !(await canViewAlbum(album, viewerId))) return null;
    return { ...album, can_edit: await canManage(album, viewerId) };
  },

  async create(viewerId: string, input: { groupId?: string; title?: unknown; description?: unknown; privacy?: unknown; items?: unknown }) {
    if (input.groupId && !(await groupService.isAtLeastModerator(input.groupId, viewerId))) {
      throw httpError('Недостаточно прав для создания альбома в группе', 403);
    }
    const urls = cleanItems(input.items);
    return prisma.album.create({
      data: {
        ...(input.groupId ? { group_id: input.groupId } : { user_id: viewerId }),
        title: cleanTitle(input.title),
        description: typeof input.description === 'string' ? input.description.trim().slice(0, 500) || null : null,
        privacy: cleanPrivacy(input.privacy),
        items: { create: urls.map((media_url, position) => ({ media_url, position })) },
      },
      include: albumInclude,
    });
  },

  /** Обновляет поля и, если передан items, целиком заменяет состав и порядок медиа. */
  async update(id: string, viewerId: string, input: { title?: unknown; description?: unknown; privacy?: unknown; items?: unknown }) {
    const album = await prisma.album.findUnique({ where: { id } });
    if (!album) return null;
    if (!(await canManage(album, viewerId))) throw httpError('Нет доступа к альбому', 403);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = cleanTitle(input.title);
    if (input.description !== undefined) {
      data.description = typeof input.description === 'string' ? input.description.trim().slice(0, 500) || null : null;
    }
    if (input.privacy !== undefined) data.privacy = cleanPrivacy(input.privacy);

    const urls = input.items !== undefined ? cleanItems(input.items) : null;
    await prisma.$transaction([
      ...(urls ? [
        prisma.albumItem.deleteMany({ where: { album_id: id } }),
        prisma.albumItem.createMany({ data: urls.map((media_url, position) => ({ album_id: id, media_url, position })) }),
      ] : []),
      prisma.album.update({ where: { id }, data: { ...data, updated_at: new Date() } }),
    ]);
    return albumService.get(id, viewerId);
  },

  async remove(id: string, viewerId: string) {
    const album = await prisma.album.findUnique({ where: { id } });
    if (!album) return false;
    if (!(await canManage(album, viewerId))) throw httpError('Нет доступа к альбому', 403);
    await prisma.album.delete({ where: { id } });
    return true;
  },
};
