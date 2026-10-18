/** Чёрный текст на светлом фоне, белый на тёмном (по относительной яркости WCAG). */
export function contrastText(color?: string | null): '#000000' | '#ffffff' {
  let hex = (color || '').trim().replace('#', '')
  if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return '#ffffff'
  const lin = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  return lum > 0.4 ? '#000000' : '#ffffff'
}
