import prisma from '../../config/prisma.js';
import { userLookup } from '../users/lookup.js';
import { canConnectDen, DEN_GROUP_TYPES } from '../../lib/verificationPolicy.js';

const GROUP_SELECT = { id: true, slug: true, name: true, avatar_url: true, type: true, den_enabled: true } as const;

/**
 * Продавать в Dealers Den можно только от имени группы с подключённым Dealers Den, чей владелец
 * верифицирован (художник / мастер / владелец магазина). `groups` — группы, от имени которых
 * можно создавать лоты; `connectable` — подходящие группы, где Dealers Den ещё не подключён.
 */
export async function getSellerAccess(userId: string) {
  const user = await userLookup.denSellerStatus(userId);
  const owned = user?.is_verified ? await prisma.group.findMany({
    where: { owner_id: userId, type: { in: [...DEN_GROUP_TYPES] }, deleted_at: null },
    select: GROUP_SELECT,
    orderBy: { created_at: 'asc' },
  }) : [];
  const eligible = owned.filter(g => canConnectDen(user, g.type));
  const strip = ({ den_enabled: _d, ...g }: typeof owned[number]) => g;
  const groups = eligible.filter(g => g.den_enabled).map(strip);
  return {
    isVerified: user?.is_verified === true,
    ownsShop: owned.some(g => g.type === 'shop'),
    frozen: user?.den_frozen === true,
    groups,
    connectable: eligible.filter(g => !g.den_enabled).map(strip),
    canSell: groups.length > 0 && user?.den_frozen !== true,
  };
}

export type DenConnectResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/** Подключает Dealers Den к группе владельца после подтверждения, что он не скамер. */
export async function connectGroupToDen(userId: string, groupId: string, confirmed: boolean): Promise<DenConnectResult> {
  if (confirmed !== true) {
    return { ok: false, status: 400, error: 'Подтвердите, что вы не мошенник и принимаете правила Dealers Den' };
  }
  const [user, group] = await Promise.all([
    userLookup.denSellerStatus(userId),
    prisma.group.findFirst({ where: { id: groupId, deleted_at: null }, select: { id: true, owner_id: true, type: true, den_enabled: true } }),
  ]);
  if (!group) return { ok: false, status: 404, error: 'Группа не найдена' };
  if (group.owner_id !== userId) return { ok: false, status: 403, error: 'Подключить Dealers Den может только владелец группы' };
  if (user?.den_frozen) return { ok: false, status: 403, error: 'Ваш аккаунт в Ярмарке заморожен' };
  if (!canConnectDen(user, group.type)) {
    return { ok: false, status: 403, error: 'Нужна верификация художника, мастера или владельца магазина и группа «Творческая» или «Магазин»' };
  }
  if (!group.den_enabled) {
    await prisma.group.update({ where: { id: group.id }, data: { den_enabled: true, den_agreed_at: new Date() } });
  }
  return { ok: true };
}

/** Состояние Dealers Den в группе глазами зрителя: подключён ли он и может ли зритель его подключить. */
export async function getGroupDenStatus(groupId: string, viewerId?: string) {
  const group = await prisma.group.findFirst({
    where: { id: groupId, deleted_at: null },
    select: { id: true, owner_id: true, type: true, den_enabled: true },
  });
  if (!group) return null;
  const isOwner = !!viewerId && group.owner_id === viewerId;
  const owner = isOwner ? await userLookup.denSellerStatus(viewerId!) : null;
  return {
    denEnabled: group.den_enabled,
    isOwner,
    canConnect: isOwner && !group.den_enabled && canConnectDen(owner, group.type),
    isVerified: owner?.is_verified === true,
    typeSupported: (DEN_GROUP_TYPES as readonly string[]).includes(group.type),
  };
}
