import prisma from '../config/prisma.js';

/**
 * Лот Dealers' Den, прикреплённый к посту «Обновление заказа». В ленту отдаём только то, что нужно
 * для плоской карточки: превью, название, цену и состояние — без описания, заявок и данных продавца.
 */
export const LISTING_PREVIEW_SELECT = {
  id: true,
  title: true,
  images: true,
  price: true,
  discount_percent: true,
  currency: true,
  listing_kind: true,
  status: true,
  is_nsfw: true,
  current_bid: true,
  deleted_at: true,
} as const;

export const POST_LISTING_INCLUDE = { select: LISTING_PREVIEW_SELECT } as const;

/** Лоты, которые читатель вправе видеть в ленте: черновики и архив принадлежат только продавцу. */
const PUBLIC_LISTING_STATUSES = new Set(['active', 'sold']);

/** Превью для ответа API либо null, если лот удалён, снят с публикации или это не лот. */
export function publicListingPreview(listing: any): any {
  if (!listing || listing.deleted_at || !PUBLIC_LISTING_STATUSES.has(listing.status)) return null;
  const { deleted_at: _deleted, ...preview } = listing;
  return preview;
}

/** Пост с `listing` в безопасном для зрителя виде. Посты без лота возвращаются как есть. */
export function withPublicListing<T extends { listing?: unknown }>(post: T): T {
  if (!post || !('listing' in post)) return post;
  return { ...post, listing: publicListingPreview(post.listing) };
}

export class ListingAttachError extends Error {
  statusCode = 422;
  constructor(code: 'LISTING_NOT_FOUND' | 'LISTING_NOT_ALLOWED' | 'LISTING_NOT_ACTIVE') {
    super(code);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = Pick<typeof prisma, 'dealerListing' | 'group'>;

/**
 * Проверка перед прикреплением: лот существует, не удалён, активен и продаётся от имени ЭТОЙ группы,
 * а у группы подключён Dealers' Den. Прикрепить чужой лот или лот другой группы нельзя —
 * иначе пост можно было бы использовать как рекламную витрину чужого товара.
 */
export async function assertListingAttachable(db: Db, listingId: string, groupId: string): Promise<void> {
  if (!UUID_RE.test(listingId)) throw new ListingAttachError('LISTING_NOT_FOUND');
  const listing = await db.dealerListing.findFirst({
    where: { id: listingId, deleted_at: null },
    select: { id: true, group_id: true, status: true },
  });
  if (!listing) throw new ListingAttachError('LISTING_NOT_FOUND');
  if (listing.group_id !== groupId) throw new ListingAttachError('LISTING_NOT_ALLOWED');
  if (listing.status !== 'active') throw new ListingAttachError('LISTING_NOT_ACTIVE');
  const group = await db.group.findFirst({
    where: { id: groupId, deleted_at: null, den_enabled: true },
    select: { id: true },
  });
  if (!group) throw new ListingAttachError('LISTING_NOT_ALLOWED');
}
