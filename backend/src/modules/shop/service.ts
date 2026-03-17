import prisma from '../../config/prisma.js';
import { ITEM_SELECT } from './types.js';

export async function listItems(opts: {
  type?: string;
  page: number;
  limit: number;
  userId?: string;
}) {
  const { type, page, limit, userId } = opts;
  const where: Record<string, unknown> = { deleted_at: null, status: 'published' };
  if (type && type !== 'all') where.type = type;

  const [items, total] = await Promise.all([
    prisma.shopItem.findMany({
      where,
      select: ITEM_SELECT,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.shopItem.count({ where }),
  ]);

  if (!userId) return { items, total };

  // Attach owned flag
  const ownedIds = new Set(
    (await prisma.userShopItem.findMany({ where: { user_id: userId }, select: { item_id: true } }))
      .map((r) => r.item_id),
  );
  return { items: items.map((i) => ({ ...i, owned: ownedIds.has(i.id) })), total };
}

export async function getItem(id: string, userId?: string) {
  const item = await prisma.shopItem.findFirst({
    where: { id, deleted_at: null, status: 'published' },
    select: ITEM_SELECT,
  });
  if (!item) return null;
  if (!userId) return { ...item, owned: false };
  const owned = await prisma.userShopItem.findUnique({
    where: { user_id_item_id: { user_id: userId, item_id: id } },
  });
  return { ...item, owned: !!owned };
}

export async function purchaseItem(userId: string, itemId: string) {
  const item = await prisma.shopItem.findFirst({
    where: { id: itemId, deleted_at: null, status: 'published' },
    select: { id: true, is_free: true, price: true },
  });
  if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });

  const alreadyOwned = await prisma.userShopItem.findUnique({
    where: { user_id_item_id: { user_id: userId, item_id: itemId } },
  });
  if (alreadyOwned) throw Object.assign(new Error('Already owned'), { statusCode: 409 });

  // For paid items we'd charge wallet here — for MVP just allow free items or handle payment externally
  if (!item.is_free && Number(item.price) > 0) {
    // Deduct from wallet
    const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } });
    if (!wallet || wallet.balance < item.price) {
      throw Object.assign(new Error('Insufficient balance'), { statusCode: 402 });
    }
    await prisma.$transaction([
      prisma.wallet.update({
        where: { user_id: userId },
        data: { balance: { decrement: item.price } },
      }),
      prisma.userShopItem.create({ data: { user_id: userId, item_id: itemId } }),
      prisma.shopItem.update({ where: { id: itemId }, data: { downloads_count: { increment: 1 } } }),
    ]);
  } else {
    // Free item
    await prisma.$transaction([
      prisma.userShopItem.create({ data: { user_id: userId, item_id: itemId } }),
      prisma.shopItem.update({ where: { id: itemId }, data: { downloads_count: { increment: 1 } } }),
    ]);
  }
}

export async function getMyItems(userId: string, type?: string) {
  const rows = await prisma.userShopItem.findMany({
    where: { user_id: userId },
    include: { item: { select: ITEM_SELECT } },
    orderBy: { purchased_at: 'desc' },
  });
  const items = rows
    .filter((r) => !r.item.deleted_at && (!type || type === 'all' || r.item.type === type))
    .map((r) => ({ ...r.item, owned: true, purchased_at: r.purchased_at }));
  return items;
}
