import type { DealerListing } from '@/stores/dealersDen'

export interface ListingShop {
  name: string
  avatar: string | null
  verified: boolean
  /** Группа-продавец, если лот привязан к ней; иначе страница автора (старые лоты). */
  to: string
  isGroup: boolean
}

/** Витрина лота: группа, привязанная к Dealers Den, а при её отсутствии — сам автор. */
export function listingShop(l: Pick<DealerListing, 'group' | 'seller'>): ListingShop {
  if (l.group) {
    return { name: l.group.name, avatar: l.group.avatar_url, verified: false, to: `/groups/${l.group.slug}`, isGroup: true }
  }
  return {
    name: l.seller.display_name ?? l.seller.username,
    avatar: l.seller.avatar_url,
    verified: l.seller.is_verified,
    to: `/dealers-den/seller/${l.seller.username}`,
    isGroup: false,
  }
}
