import { describe, it, expect } from 'vitest';
import { idList, pagination } from '../src/lib/pagination.js';

describe('лента: границы входных параметров', () => {
  it('idList отбрасывает пустые значения и повторы', () => {
    expect(idList('a, b,,a,c ')).toEqual(['a', 'b', 'c']);
    expect(idList(undefined)).toEqual([]);
    expect(idList(['a', 'b'])).toEqual([]);
  });

  it('idList не пропускает больше max id (иначе IN (...) раздувается до любого размера)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => `id${i}`).join(',');
    expect(idList(many)).toHaveLength(100);
    expect(idList(many, 10)).toHaveLength(10);
  });

  it('персональная лента: limit не больше 50, page не меньше 1, мусор → значения по умолчанию', () => {
    expect(pagination('1000000', '99999', 30, 50)).toMatchObject({ page: 100_000, limit: 50 });
    expect(pagination('-5', '0', 30, 50)).toMatchObject({ page: 1, limit: 1 });
    expect(pagination('abc', 'NaN', 30, 50)).toMatchObject({ page: 1, limit: 30, skip: 0 });
  });
});
