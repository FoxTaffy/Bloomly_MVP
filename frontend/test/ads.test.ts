import { describe, it, expect } from 'vitest'
import { adPrice } from '../src/lib/adPricing'
import { adsForPlacement, adSlotModeFor } from '../src/lib/adSlots'

describe('adPrice: цена баннера со скидкой тарифа', () => {
  it('Free 16 BLM, Pro 13.6, Business 11.2 за неделю в верху ленты', () => {
    expect(adPrice(16, 1, 0).price).toBe(16)
    expect(adPrice(16, 1, 15).price).toBe(13.6)
    expect(adPrice(16, 1, 30).price).toBe(11.2)
  })

  it('округление вверх до сотых и сумма за несколько периодов', () => {
    expect(adPrice(3.5, 1, 15).price).toBe(2.98) // 2.975
    expect(adPrice(3, 3, 30)).toEqual({ base: 9, price: 6.3 })
    expect(adPrice(1.5, 7, 0)).toEqual({ base: 10.5, price: 10.5 })
  })
})

describe('adSlotModeFor: кто что видит', () => {
  it('Free — реклама, Lite — ничего, Pro и Business — предложение разместить свою', () => {
    expect(['free', 'lite', 'pro', 'business'].map(adSlotModeFor)).toEqual(['ads', 'hidden', 'offer', 'offer'])
  })
})

describe('adsForPlacement: реклама по местам', () => {
  const feed = { id: 'a', placement: 'feed_top' }
  const right = { id: 'b', placement: 'right_column' }
  const old1 = { id: 'c', placement: null }
  const old2 = { id: 'd', placement: null }

  it('купленный баннер показывается только на своём месте', () => {
    expect(adsForPlacement([feed, right], 'feed_top')).toEqual([feed])
    expect(adsForPlacement([feed, right], 'right_column')).toEqual([right])
    expect(adsForPlacement([feed, right], 'groups_page')).toEqual([])
  })

  it('старая реклама без места показывается как раньше: лента — первая, колонка — вторая, меню — все', () => {
    const ads = [old1, old2]
    expect(adsForPlacement(ads, 'feed_top')).toEqual([old1])
    expect(adsForPlacement(ads, 'right_column')).toEqual([old2])
    expect(adsForPlacement([old1], 'right_column')).toEqual([old1])
    expect(adsForPlacement(ads, 'left_menu')).toEqual([old1, old2])
  })

  it('место с купленным баннером не занимают старые', () => {
    expect(adsForPlacement([old1, feed], 'feed_top')).toEqual([feed])
  })
})
