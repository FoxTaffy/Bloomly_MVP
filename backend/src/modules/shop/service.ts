import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { ITEM_SELECT } from './types.js';
import { debitWallet } from '../wallet/ledger.js';

export const SORTS = ['newest', 'free', 'price_asc'] as const;
export type ShopSort = (typeof SORTS)[number];

const isFree = (item: { is_free: boolean; price: Prisma.Decimal | number | string }) => item.is_free || !(Number(item.price) > 0);

/**
 * Тело товара (css темы, ссылка на фон) — то, за что платят: чужим отдаём только у бесплатных,
 * иначе платную тему можно забрать из ответа каталога, не купив её.
 */
function publicView<T extends { content_data: unknown; is_free: boolean; price: Prisma.Decimal | number | string; deleted_at?: Date | null }>(
  item: T,
  owned: boolean,
) {
  const { deleted_at: _deletedAt, ...rest } = item;
  return { ...rest, content_data: owned || isFree(item) ? item.content_data : {}, owned };
}

export async function listItems(opts: {
  type?: string;
  search?: string;
  sort?: ShopSort;
  page: number;
  limit: number;
  userId?: string;
}) {
  const { type, page, limit, userId } = opts;
  const search = opts.search?.trim().slice(0, 100);
  const where: Prisma.ShopItemWhereInput = { deleted_at: null, status: 'published' };
  if (type && type !== 'all') where.type = type;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { tags: { has: search.toLowerCase() } },
    ];
  }
  if (opts.sort === 'free') where.AND = [{ OR: [{ is_free: true }, { price: { lte: 0 } }] }];

  const orderBy: Prisma.ShopItemOrderByWithRelationInput[] =
    opts.sort === 'price_asc' ? [{ price: 'asc' }, { created_at: 'desc' }] : [{ created_at: 'desc' }];

  const [items, total] = await Promise.all([
    prisma.shopItem.findMany({ where, select: ITEM_SELECT, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.shopItem.count({ where }),
  ]);

  // Только записи этой страницы, а не вся коллекция пользователя
  const ownedIds = userId && items.length
    ? new Set(
        (await prisma.userShopItem.findMany({
          where: { user_id: userId, item_id: { in: items.map((i) => i.id) } },
          select: { item_id: true },
        })).map((r) => r.item_id),
      )
    : new Set<string>();
  return { items: items.map((i) => publicView(i, ownedIds.has(i.id))), total };
}

export async function getItem(id: string, userId?: string) {
  const item = await prisma.shopItem.findFirst({
    where: { id, deleted_at: null, status: 'published' },
    select: ITEM_SELECT,
  });
  if (!item) return null;
  const owned = userId
    ? !!(await prisma.userShopItem.findUnique({ where: { user_id_item_id: { user_id: userId, item_id: id } } }))
    : false;
  return publicView(item, owned);
}

export async function purchaseItem(userId: string, itemId: string) {
  const item = await prisma.shopItem.findFirst({
    where: { id: itemId, deleted_at: null, status: 'published' },
    select: { id: true },
  });
  if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });

  try {
    // Всё внутри одной транзакции: цену и владение проверяем по свежим данным, а не по чтению до неё.
    // Деньги списывает debitWallet условным UPDATE, поэтому две параллельные покупки не уведут баланс в минус;
    // повторную выдачу отсекает уникальный индекс (user_id, item_id) — его нарушение откатывает и списание.
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.shopItem.findFirst({
        where: { id: itemId, deleted_at: null, status: 'published' },
        select: { is_free: true, price: true },
      });
      if (!fresh) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
      // Prisma Decimal сравнивается как строка ("5" < "100" — false), поэтому только через Number()
      if (!isFree(fresh)) {
        await debitWallet(tx, userId, Number(fresh.price), { kind: 'shop_purchase', refId: itemId }, 'Insufficient balance');
      }
      await tx.userShopItem.create({ data: { user_id: userId, item_id: itemId } });
      await tx.shopItem.update({ where: { id: itemId }, data: { downloads_count: { increment: 1 } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw Object.assign(new Error('Already owned'), { statusCode: 409 });
    }
    throw e;
  }
}

export async function getMyItems(userId: string, type?: string) {
  const rows = await prisma.userShopItem.findMany({
    where: {
      user_id: userId,
      item: { deleted_at: null, ...(type && type !== 'all' ? { type } : {}) },
    },
    include: { item: { select: ITEM_SELECT } },
    orderBy: { purchased_at: 'desc' },
  });
  return rows.map((r) => ({ ...publicView(r.item, true), purchased_at: r.purchased_at }));
}
