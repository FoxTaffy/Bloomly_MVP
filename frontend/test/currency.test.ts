import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectRegionFromLocale, displayCurrency, displayRates, setDisplayRegion } from '../src/lib/displayCurrency'
import { blmLocal, formatBlm, formatPrice } from '../src/lib/format'

// ₽ за единицу валюты: 1 BLM = 1 $ = 90 ₽
const RATES = { RUB: 1, USD: 90, EUR: 100, CNY: 12.5, INR: 1.1, BRL: 16, KZT: 0.18 }
/** toLocaleString ставит неразрывные пробелы — для сравнения приводим к обычным. */
const plain = (s: string) => s.replace(/\s/g, ' ')

function show(region: string | null) {
  displayRates.value = { ...RATES }
  setDisplayRegion(region)
}

describe('formatBlm: BLM → валюта региона', () => {
  afterEach(() => { vi.unstubAllGlobals(); displayCurrency.value = null; displayRates.value = {} })

  it('рубли целыми: 2 BLM ≈ 180 ₽', () => {
    show('RU')
    expect(plain(formatBlm(2))).toBe('2 BLM ≈ 180 ₽')
  })

  it('тенге целыми, с разделителем тысяч', () => {
    show('KZ')
    expect(plain(formatBlm(2))).toBe('2 BLM ≈ 1 000 ₸')
  })

  it('юань и рупии целыми', () => {
    show('CN')
    expect(formatBlm(2)).toBe('2 BLM ≈ ¥14')
    show('IN')
    expect(formatBlm(2)).toBe('2 BLM ≈ ₹164')
  })

  it('доллар, евро и реал — два знака', () => {
    show('US')
    expect(formatBlm(2)).toBe('2 BLM ≈ $2.00')
    show('EU')
    expect(formatBlm(2)).toBe('2 BLM ≈ €1,80')
    show('BR')
    expect(plain(formatBlm(2))).toBe('2 BLM ≈ R$ 11,25')
  })

  it('дробные BLM: 0.5 → 45 ₽, 1.25 без лишних нулей', () => {
    show('RU')
    expect(plain(formatBlm(0.5))).toBe('0.5 BLM ≈ 45 ₽')
    expect(plain(formatBlm('1.25'))).toBe('1.25 BLM ≈ 113 ₽') // 112.5 → 113
  })

  it('без валюты показа, без курсов и для нуля — просто BLM', () => {
    displayRates.value = { ...RATES }
    displayCurrency.value = null
    expect(formatBlm(2)).toBe('2 BLM')
    displayCurrency.value = 'RUB'
    displayRates.value = {}
    expect(formatBlm(2)).toBe('2 BLM')
    displayRates.value = { ...RATES }
    expect(formatBlm(0)).toBe('0 BLM')
  })

  it('«Другое» (GLOBAL) не конвертирует', () => {
    show('GLOBAL')
    expect(formatBlm(2)).toBe('2 BLM')
  })
})

describe('formatPrice: округление пересчитанной суммы', () => {
  afterEach(() => { displayCurrency.value = null; displayRates.value = {} })

  it('₸ и ¥ целыми, € с копейками', () => {
    show('KZ')
    expect(plain(formatPrice(10, 'USD'))).toBe('≈ 5 000 ₸')
    show('CN')
    expect(formatPrice(10, 'USD')).toBe('≈ ¥72')
    show('EU')
    expect(formatPrice(10, 'USD')).toBe('≈ €9,00')
  })
})

describe('detectRegionFromLocale: регион по языку браузера', () => {
  it.each([
    [['ru-RU'], 'RU'],
    [['ru'], 'RU'],
    [['kk'], 'KZ'],
    [['kk-KZ'], 'KZ'],
    [['ru-KZ'], 'KZ'], // страна важнее языка
    [['de'], 'EU'],
    [['de-DE'], 'EU'],
    [['fr-FR'], 'EU'],
    [['pt-PT'], 'EU'],
    [['pt-BR'], 'BR'],
    [['en-US'], 'US'],
    [['en'], 'US'],
    [['zh-CN'], 'CN'],
    [['hi-IN'], 'IN'],
    [['en_US'], 'US'],
  ])('%j → %s', (langs, region) => {
    expect(detectRegionFromLocale(langs)).toBe(region)
  })

  it('неподдерживаемая страна пропускается, берётся следующий тег', () => {
    expect(detectRegionFromLocale(['en-GB', 'de-DE'])).toBe('EU')
    expect(detectRegionFromLocale(['en-GB'])).toBeNull()
    expect(detectRegionFromLocale(['ja'])).toBeNull()
    expect(detectRegionFromLocale([])).toBeNull()
  })
})

describe('setDisplayRegion: явный регион против автоопределения', () => {
  beforeEach(() => { displayRates.value = { ...RATES } })
  afterEach(() => { vi.unstubAllGlobals(); displayCurrency.value = null; displayRates.value = {} })

  it('нет региона — валюта по navigator.languages', () => {
    vi.stubGlobal('navigator', { languages: ['kk-KZ', 'ru'], language: 'kk-KZ' })
    setDisplayRegion(null)
    expect(displayCurrency.value).toBe('KZT')
  })

  it('явно выбранный регион главнее языка браузера', () => {
    vi.stubGlobal('navigator', { languages: ['ru-RU'], language: 'ru-RU' })
    setDisplayRegion('EU')
    expect(displayCurrency.value).toBe('EUR')
  })

  it('явное «Другое» отключает конвертацию, автоопределение не вмешивается', () => {
    vi.stubGlobal('navigator', { languages: ['ru-RU'], language: 'ru-RU' })
    setDisplayRegion('GLOBAL')
    expect(displayCurrency.value).toBeNull()
  })

  it('язык не распознан — цены как есть', () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP'], language: 'ja-JP' })
    setDisplayRegion(undefined)
    expect(displayCurrency.value).toBeNull()
  })
})

describe('blmLocal: цена BLM только в валюте региона', () => {
  afterEach(() => { displayCurrency.value = null; displayRates.value = {} })

  it('для страницы тарифов: 3.75 BLM → 338 ₽, без валюты или для нуля — null', () => {
    show('RU')
    expect(plain(blmLocal(3.75)!)).toBe('338 ₽') // 337.5 округляется вверх
    expect(blmLocal(0)).toBeNull()
    show('GLOBAL')
    expect(blmLocal(3.75)).toBeNull()
  })
})
