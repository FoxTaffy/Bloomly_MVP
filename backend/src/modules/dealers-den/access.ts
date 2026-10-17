import prisma from '../../config/prisma.js';
import { userLookup } from '../users/lookup.js';
import { canSellInDen } from '../../lib/verificationPolicy.js';

export async function getSellerAccess(userId: string) {
  const user = await userLookup.denSellerStatus(userId);
  const shop = user?.is_verified ? await prisma.group.findFirst({
    where: { owner_id: userId, type: 'shop', deleted_at: null },
    select: { id: true },
  }) : null;
  return {
    isVerified: user?.is_verified === true,
    ownsShop: !!shop,
    frozen: user?.den_frozen === true,
    canSell: canSellInDen(user, !!shop) && !user?.den_frozen,
  };
}
