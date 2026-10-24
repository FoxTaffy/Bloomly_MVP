import type { ShopItem } from '@/stores/shop'

export interface ShopTypeMeta {
  label: string
  icon: string
  /** chip поверх превью */
  badge: string
  hover: string
  /** фон превью, когда у товара нет картинки */
  fallback: string
}

// Классы записаны целиком — иначе Tailwind не найдёт их при сборке
export const TYPE_META: Record<string, ShopTypeMeta> = {
  theme: {
    label: 'Тема', icon: 'Palette',
    badge: 'bg-brand-purple/20 border-brand-purple/40 text-brand-purple',
    hover: 'hover:border-brand-purple/50 hover:shadow-brand-purple/10',
    fallback: 'from-brand-purple/25 to-brand-bg',
  },
  background: {
    label: 'Фон', icon: 'Image',
    badge: 'bg-brand-accent/20 border-brand-accent/40 text-brand-accent',
    hover: 'hover:border-brand-accent/50 hover:shadow-brand-accent/10',
    fallback: 'from-brand-accent/25 to-brand-bg',
  },
  frame: {
    label: 'Рамка', icon: 'CircleDot',
    badge: 'bg-brand-yellow/20 border-brand-yellow/40 text-brand-yellow',
    hover: 'hover:border-brand-yellow/50 hover:shadow-brand-yellow/10',
    fallback: 'from-brand-yellow/20 to-brand-bg',
  },
  sticker_pack: {
    label: 'Стикеры', icon: 'Smile',
    badge: 'bg-brand-pink/20 border-brand-pink/40 text-brand-pink',
    hover: 'hover:border-brand-pink/50 hover:shadow-brand-pink/10',
    fallback: 'from-brand-pink/20 to-brand-bg',
  },
}

export const DEFAULT_TYPE_META: ShopTypeMeta = {
  label: 'Товар', icon: 'Tag',
  badge: 'bg-white/10 border-white/15 text-white/80',
  hover: 'hover:border-brand-purple/50 hover:shadow-brand-purple/10',
  fallback: 'from-brand-card to-brand-bg',
}

export const typeMeta = (type: string): ShopTypeMeta => TYPE_META[type] ?? DEFAULT_TYPE_META

export const isFreeItem = (i: Pick<ShopItem, 'is_free' | 'price'>) => i.is_free || !Number(i.price)

/** Кошелёк в BLM (1 BLM = $1), поэтому и цены в магазине — в BLM, а не в рублях. */
export function fmtPrice(price: string | number | null | undefined): string {
  const n = Number(price)
  if (!n) return 'Бесплатно'
  return `${Number.isInteger(n) ? n : n.toFixed(2)} BLM`
}
