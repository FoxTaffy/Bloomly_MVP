// Какая реклама показывается в каком месте. Баннеры, купленные за BLM, привязаны к месту (placement);
// старая реклама без места показывается как раньше — в ленте, колонке и меню по порядку.

export type AdPlacementKey = 'feed_top' | 'groups_page' | 'left_menu' | 'right_column'

export function adsForPlacement<T extends { placement?: string | null }>(ads: readonly T[], placement: AdPlacementKey): T[] {
  const placed = ads.filter(a => a.placement === placement)
  if (placed.length) return placed
  const legacy = ads.filter(a => !a.placement)
  if (placement === 'left_menu') return legacy
  if (placement === 'right_column') return legacy.slice(1, 2).concat(legacy.slice(0, 1)).slice(0, 1)
  return legacy.slice(0, 1)
}

/** Free видит рекламу, Lite скрывает её совсем, Pro и Business не видят чужой, но получают предложение разместить свою. */
export function adSlotModeFor(tier: string): 'ads' | 'offer' | 'hidden' {
  if (tier === 'lite') return 'hidden'
  if (tier === 'pro' || tier === 'business') return 'offer'
  return 'ads'
}
