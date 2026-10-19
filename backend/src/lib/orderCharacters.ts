import prisma from '../config/prisma.js';
import { assertOwnedMedia } from '../modules/media/service.js';

// Персонажи в заявке на лот / заказе. В базе хранятся только ссылки (кто, какой персонаж, доп. референсы
// заявителя), а референсы из профилей подтягиваются на лету — реф друга всегда актуален.

export interface CharacterRef { userId: string; fursonaId: string | null; extraImages: string[] }

const MAX_CHARACTERS = 5;
const MAX_EXTRA_IMAGES = 4;
const USER_SELECT = { id: true, username: true, display_name: true, avatar_url: true } as const;

/** Друг = принятая заявка в друзья или взаимная подписка (как в списке друзей). */
async function friendIdsOf(userId: string): Promise<Set<string>> {
  const [friendships, following, followers] = await Promise.all([
    prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ requester_id: userId }, { addressee_id: userId }] },
      select: { requester_id: true, addressee_id: true },
    }),
    prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true } }),
    prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true } }),
  ]);
  const ids = new Set<string>();
  for (const f of friendships) ids.add(f.requester_id === userId ? f.addressee_id : f.requester_id);
  const followersSet = new Set(followers.map(f => f.follower_id));
  for (const f of following) if (followersSet.has(f.following_id)) ids.add(f.following_id);
  return ids;
}

/** Проверяет присланных персонажей: только сам заявитель или его друзья, персонаж — именно этого пользователя. */
export async function sanitizeCharacters(applicantId: string, raw: unknown): Promise<CharacterRef[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('INVALID_CHARACTERS');
  if (raw.length > MAX_CHARACTERS) throw new Error('TOO_MANY_CHARACTERS');

  const friends = raw.some(c => c?.userId && c.userId !== applicantId) ? await friendIdsOf(applicantId) : new Set<string>();
  const seen = new Set<string>();
  const result: CharacterRef[] = [];

  for (const c of raw as Array<Record<string, unknown>>) {
    const userId = typeof c?.userId === 'string' ? c.userId : '';
    if (!userId) throw new Error('INVALID_CHARACTERS');
    if (userId !== applicantId && !friends.has(userId)) throw new Error('CHARACTER_NOT_FRIEND');

    let fursonaId: string | null = typeof c.fursonaId === 'string' && c.fursonaId ? c.fursonaId : null;
    if (fursonaId) {
      const owned = await prisma.fursona.findFirst({ where: { id: fursonaId, user_id: userId, deleted_at: null }, select: { id: true } });
      if (!owned) throw new Error('INVALID_CHARACTERS');
    }
    const key = `${userId}:${fursonaId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const extra = Array.isArray(c.extraImages) ? c.extraImages.filter((u): u is string => typeof u === 'string') : [];
    if (extra.length > MAX_EXTRA_IMAGES) throw new Error('TOO_MANY_CHARACTERS');
    for (const url of extra) await assertOwnedMedia(url, applicantId);
    result.push({ userId, fursonaId, extraImages: extra });
  }
  return result;
}

/** Достраивает персонажей: профиль, сам персонаж и его референсы. Без персонажа/рефа остаётся профиль. */
export async function resolveCharacters(refs: unknown) {
  const list = (Array.isArray(refs) ? refs : []) as CharacterRef[];
  if (!list.length) return [];
  const userIds = [...new Set(list.map(r => r.userId))];
  const [users, fursonas] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: USER_SELECT }),
    prisma.fursona.findMany({
      where: { user_id: { in: userIds }, deleted_at: null },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      select: {
        id: true, user_id: true, name: true, species: true, colors: true, is_primary: true,
        referenceImages: { where: { deleted_at: null }, orderBy: { created_at: 'asc' }, take: 12, select: { image_url: true, is_nsfw: true } },
      },
    }),
  ]);
  const userById = new Map(users.map(u => [u.id, u]));
  return list.flatMap(r => {
    const user = userById.get(r.userId);
    if (!user) return [];
    const mine = fursonas.filter(f => f.user_id === r.userId);
    const fursona = (r.fursonaId ? mine.find(f => f.id === r.fursonaId) : mine[0]) ?? null;
    return [{
      user,
      fursona: fursona ? { id: fursona.id, name: fursona.name, species: fursona.species, colors: fursona.colors } : null,
      images: (fursona?.referenceImages ?? []).map(i => ({ url: i.image_url, is_nsfw: i.is_nsfw })),
      extraImages: r.extraImages ?? [],
    }];
  });
}

/** Кого можно поставить в заявку: сам заявитель и его друзья, с их персонажами и количеством референсов. */
export async function characterOptions(userId: string) {
  const friendIds = [...(await friendIdsOf(userId))].slice(0, 200);
  const ids = [userId, ...friendIds];
  const [users, fursonas] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, deleted_at: null }, select: USER_SELECT }),
    prisma.fursona.findMany({
      where: { user_id: { in: ids }, deleted_at: null },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      select: {
        id: true, user_id: true, name: true,
        referenceImages: { where: { deleted_at: null }, orderBy: { created_at: 'asc' }, take: 1, select: { image_url: true } },
        _count: { select: { referenceImages: { where: { deleted_at: null } } } },
      },
    }),
  ]);
  const byId = new Map(users.map(u => [u.id, u]));
  return ids.flatMap(id => {
    const user = byId.get(id);
    if (!user) return [];
    return [{
      user,
      isSelf: id === userId,
      fursonas: fursonas.filter(f => f.user_id === id).map(f => ({
        id: f.id, name: f.name, cover: f.referenceImages[0]?.image_url ?? null, refCount: f._count.referenceImages,
      })),
    }];
  });
}
