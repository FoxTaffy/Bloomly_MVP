import type { ListingKind } from '@/stores/dealersDen'

export interface DenKindMeta {
  icon: string
  /** ключ перевода названия вида продажи; у YCH перевода нет — берётся label */
  labelKey?: string
  label?: string
  text: string
  border: string
  bg: string
  /** плашка с данными вида под названием лота */
  panel: string
  /** градиент главной кнопки действия */
  btn: string
}

// Классы записаны целиком — иначе Tailwind не найдёт их при сборке
export const KIND_META: Record<ListingKind, DenKindMeta> = {
  fixed: {
    icon: 'Tag', labelKey: 'dealersDenKindFixed',
    text: 'text-brand-accent', border: 'border-brand-accent/40', bg: 'bg-brand-accent/15',
    panel: 'bg-brand-accent/8 border-brand-accent/20', btn: 'bg-brand-gradient',
  },
  auction: {
    icon: 'Hammer', labelKey: 'dealersDenKindAuction',
    text: 'text-brand-yellow', border: 'border-brand-yellow/40', bg: 'bg-brand-yellow/15',
    panel: 'bg-brand-yellow/8 border-brand-yellow/20', btn: 'bg-linear-to-br from-brand-yellow to-brand-warning',
  },
  ych: {
    icon: 'Paintbrush', label: 'YCH',
    text: 'text-brand-purple', border: 'border-brand-purple/40', bg: 'bg-brand-purple/15',
    panel: 'bg-brand-purple/8 border-brand-purple/20', btn: 'bg-linear-to-br from-brand-purple to-violet-600',
  },
  raffle: {
    icon: 'Gift', labelKey: 'dealersDenKindRaffle',
    text: 'text-brand-success', border: 'border-brand-success/40', bg: 'bg-brand-success/15',
    panel: 'bg-brand-success/8 border-brand-success/20', btn: 'bg-linear-to-br from-brand-success to-emerald-600',
  },
  commission_queue: {
    icon: 'ListOrdered', labelKey: 'dealersDenKindCommissions',
    text: 'text-brand-pink', border: 'border-brand-pink/40', bg: 'bg-brand-pink/15',
    panel: 'bg-brand-pink/8 border-brand-pink/20', btn: 'bg-linear-to-br from-brand-pink to-pink-600',
  },
}

export const KIND_ORDER: ListingKind[] = ['fixed', 'auction', 'ych', 'raffle', 'commission_queue']

export const kindMeta = (kind: string | null | undefined): DenKindMeta => KIND_META[(kind ?? 'fixed') as ListingKind] ?? KIND_META.fixed

/** Лоты, чей исход решают ставки или билеты: продавец не может вручную перевести их в «продано». */
export const isResultDriven = (kind: string | null | undefined) => kind === 'auction' || kind === 'ych' || kind === 'raffle'
