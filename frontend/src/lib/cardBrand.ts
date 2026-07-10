export interface CardBrandInfo {
  label: string
  color: string
}

const BRANDS: Record<string, CardBrandInfo> = {
  visa:       { label: 'VISA',       color: '#5B7CFA' },
  mastercard: { label: 'Mastercard', color: '#EB6B3D' },
  mir:        { label: 'МИР',        color: '#4CAF50' },
  card:       { label: 'Card',       color: '#8B93A7' },
}

export function cardBrandInfo(brand: string): CardBrandInfo {
  return BRANDS[brand] ?? BRANDS.card
}
