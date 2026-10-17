import prisma from '../../config/prisma.js';
import { isModerator } from '../../lib/roles.js';
import { isBlockedBy } from '../../lib/blocks.js';
import { readablePostsWhere, readableProfilesWhere } from '../../lib/contentAccess.js';
import { PRIVATE_KEY_PREFIX } from '../../config/uploads.js';
import { canViewAlbum } from '../albums/service.js';
import { mediaUrlForKey } from './service.js';

/**
 * Решение о чтении файла по прямой ссылке /s3/<bucket>/<key>. Его запрашивает внешний nginx
 * (auth_request) перед каждой отдачей объекта, поэтому приватность поста, профиля, альбома
 * или переписки действует и на уже известные ссылки на файлы.
 *
 *  - private/… по прямой ссылке не отдаётся никогда (только /api/media/private);
 *  - posts/, comments/, messages/ — по связям с контентом: файл виден, если зритель видит
 *    хотя бы одну запись, которая на него ссылается; загрузивший и модераторы видят всегда;
 *  - аватары, баннеры, фоны, стикеры, рамки — публичные элементы оформления.
 */
export const PROTECTED_MEDIA_FOLDERS = new Set(['posts', 'comments', 'messages']);

export type MediaViewer = { id: string; role: string | null | undefined; is_adult: boolean } | null;

export async function canViewMedia(key: string, viewer: MediaViewer): Promise<boolean> {
  if (key.startsWith(PRIVATE_KEY_PREFIX)) return false;
  const folder = key.split('/', 1)[0];
  if (!PROTECTED_MEDIA_FOLDERS.has(folder)) return true;
  if (viewer && isModerator(viewer.role)) return true;

  if (viewer) {
    const own = await prisma.mediaObject.findFirst({
      where: { object_key: key, owner_id: viewer.id, deleted_at: null }, select: { id: true },
    });
    if (own) return true;
  }

  const url = mediaUrlForKey(key);
  if (folder === 'messages') return messageAllows(url, viewer);
  if (folder === 'comments') return commentAllows(url, viewer);
  // posts/ — общая папка: посты, отложенные посты, альбомы, истории, персонажи, фурсьюты, история аватаров
  for (const check of [postAllows, albumAllows, storyAllows, profileMediaAllows, scheduledAllows]) {
    if (await check(url, viewer)) return true;
  }
  return false;
}

// Сначала записи со ссылкой на файл — по индексу (обычно одна), затем политика чтения только
// для них. Без take: Prisma добавляет к take ORDER BY id, и планировщик шёл по первичному ключу
// вместо GIN-индекса по media_urls (28 мс против 0.2 мс на 50 тыс. постов).
async function readablePostExists(postIds: string[], viewer: MediaViewer) {
  if (!postIds.length) return false;
  const count = await prisma.post.count({ where: { id: { in: postIds }, AND: [await readablePostsWhere(viewer?.id)] } });
  return count > 0;
}

async function postAllows(url: string, viewer: MediaViewer) {
  const posts = await prisma.post.findMany({
    where: { OR: [{ media_urls: { has: url } }, { media_original_urls: { has: url } }] },
    select: { id: true },
  });
  return readablePostExists(posts.map((p) => p.id), viewer);
}

async function commentAllows(url: string, viewer: MediaViewer) {
  const comments = await prisma.comment.findMany({ where: { file_url: url, deleted_at: null }, select: { post_id: true } });
  return readablePostExists([...new Set(comments.map((c) => c.post_id))], viewer);
}

/** Вложение переписки видят только её участники. Пересылка копирует file_url в новый чат. */
async function messageAllows(url: string, viewer: MediaViewer) {
  if (!viewer) return false;
  const count = await prisma.message.count({
    where: {
      file_url: url, deleted_at: null,
      conversation: { deleted_at: null, participants: { some: { user_id: viewer.id } } },
    },
  });
  return count > 0;
}

async function albumAllows(url: string, viewer: MediaViewer) {
  const albums = await prisma.album.findMany({
    where: { items: { some: { media_url: url } } },
    select: { user_id: true, group_id: true, privacy: true },
  });
  for (const album of albums) if (await canViewAlbum(album, viewer?.id ?? null)) return true;
  return false;
}

async function storyAllows(url: string, viewer: MediaViewer) {
  const stories = await prisma.story.findMany({
    where: { OR: [{ image_url: url }, { video_url: url }], deleted_at: null, expires_at: { gt: new Date() } },
    select: { user_id: true },
  });
  for (const s of stories) if (await profileReadable(s.user_id, viewer)) return true;
  return false;
}

/** Референсы персонажей, фурсьюты и история аватаров показываются в профиле: правило профиля + 18+. */
async function profileMediaAllows(url: string, viewer: MediaViewer) {
  const adultOk = (nsfw: boolean, ownerId: string) => !nsfw || viewer?.is_adult || viewer?.id === ownerId;
  const [refs, suits, history] = await Promise.all([
    prisma.fursonaReferenceImage.findMany({ where: { image_url: url, deleted_at: null }, select: { user_id: true, is_nsfw: true } }),
    prisma.fursuit.findMany({ where: { image_url: url, deleted_at: null }, select: { user_id: true, is_nsfw: true } }),
    prisma.mediaHistory.findMany({ where: { OR: [{ url }, { video_url: url }] }, select: { user_id: true } }),
  ]);
  const owners = [
    ...refs.filter((r) => adultOk(r.is_nsfw, r.user_id)).map((r) => r.user_id),
    ...suits.filter((s) => adultOk(s.is_nsfw, s.user_id)).map((s) => s.user_id),
    ...history.map((h) => h.user_id),
  ];
  for (const ownerId of new Set(owners)) if (await profileReadable(ownerId, viewer)) return true;
  return false;
}

/** Отложенный пост ещё не опубликован: виден только автору (и модераторам выше). */
async function scheduledAllows(url: string, viewer: MediaViewer) {
  if (!viewer) return false;
  const count = await prisma.scheduledPost.count({
    where: { author_id: viewer.id, OR: [{ media_urls: { has: url } }, { media_original_urls: { has: url } }] },
  });
  return count > 0;
}

async function profileReadable(userId: string, viewer: MediaViewer) {
  if (viewer?.id === userId) return true;
  if (await isBlockedBy(userId, viewer?.id)) return false;
  const owner = await prisma.user.findFirst({ where: { id: userId, AND: [readableProfilesWhere(viewer?.id)] }, select: { id: true } });
  return !!owner;
}

// ── Кэш решений ─────────────────────────────────────────────────────────────
// Страница ленты запрашивает десятки файлов подряд; без кэша каждый — несколько запросов к БД.
// Смена приватности/удаление поста начинает действовать не позже чем через DECISION_TTL_MS.

const DECISION_TTL_MS = 30_000;
const MAX_CACHED_DECISIONS = 20_000;
const decisions = new Map<string, { allow: boolean; at: number }>();

export async function canViewMediaCached(key: string, viewer: MediaViewer): Promise<boolean> {
  const cacheKey = `${viewer?.id ?? '-'}|${viewer?.is_adult ? 1 : 0}|${key}`;
  const now = Date.now();
  const hit = decisions.get(cacheKey);
  if (hit && now - hit.at < DECISION_TTL_MS) return hit.allow;
  const allow = await canViewMedia(key, viewer);
  if (decisions.size >= MAX_CACHED_DECISIONS) {
    // Map хранит порядок вставки: удаляем самую старую десятую часть
    let drop = Math.ceil(MAX_CACHED_DECISIONS / 10);
    for (const k of decisions.keys()) { decisions.delete(k); if (--drop === 0) break; }
  }
  decisions.delete(cacheKey);
  decisions.set(cacheKey, { allow, at: now });
  return allow;
}

/** Для тестов: сбросить кэш решений. */
export function clearMediaDecisionCache() {
  decisions.clear();
}
