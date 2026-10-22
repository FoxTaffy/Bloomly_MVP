import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { resetDb, prisma } from './helpers.js';

// Ответ ЦБ: USD 95 нарочно отличается от курса BLM в базе (90) — проверяем, что побеждает BLM
const cbr = (usd: number) => ({
  Valute: {
    USD: { Value: usd, Nominal: 1 },
    EUR: { Value: 100, Nominal: 1 },
    KZT: { Value: 18, Nominal: 100 }, // ЦБ даёт тенге за 100 штук
  },
});
let cbrUsd = 95;

describe('rate: единый курс BLM/USD и тенге', () => {
  let rate: typeof import('../src/modules/payments/rate.js');

  beforeAll(async () => {
    await resetDb();
    await prisma.blmRate.create({ data: { usd_rub: 90 } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => cbr(cbrUsd) })));
    rate = await import('../src/modules/payments/rate.js');
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(() => { cbrUsd = 95; });

  it('USD в курсах показа равен курсу BLM, а не ответу ЦБ', async () => {
    const rates = await rate.getDisplayRates();
    expect(rates.USD).toBe(90);
    expect(rates.USD).toBe(await rate.getBlmRate());
    expect(rates.EUR).toBe(100);
  });

  it('тенге попадает в курсы с учётом номинала 100', async () => {
    expect((await rate.getDisplayRates()).KZT).toBeCloseTo(0.18, 6);
  });

  it('amountToBlm: BLM и USD — сумма как есть, округление вверх до сотых', async () => {
    expect(await rate.amountToBlm(10, 'BLM')).toBe(10);
    expect(await rate.amountToBlm(10, 'blm')).toBe(10);
    expect(await rate.amountToBlm(10, 'USD')).toBe(10);
    expect(await rate.amountToBlm(0.5, 'BLM')).toBe(0.5);
    expect(await rate.amountToBlm(1.234, 'BLM')).toBe(1.24);
  });

  it('amountToBlm: рубли и тенге по общему курсу', async () => {
    expect(await rate.amountToBlm(900, 'RUB')).toBe(10);
    expect(await rate.amountToBlm(1000, 'KZT')).toBe(2); // 1000 × 0.18 / 90
    expect(await rate.amountToBlm(100, 'EUR')).toBeCloseTo(111.12, 2); // 100 × 100 / 90, вверх
  });

  it('amountToBlm: неизвестная валюта и плохая сумма отклоняются', async () => {
    await expect(rate.amountToBlm(5, 'XYZ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(rate.amountToBlm(0, 'BLM')).rejects.toMatchObject({ statusCode: 400 });
    await expect(rate.amountToBlm(-1, 'BLM')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('после обновления курса BLM курсы показа не держат старый USD', async () => {
    cbrUsd = 100;
    expect(await rate.refreshBlmRate()).toBe(100);
    const rates = await rate.getDisplayRates();
    expect(rates.USD).toBe(100);
    expect(await rate.amountToBlm(1000, 'RUB')).toBe(10);
  });
});
