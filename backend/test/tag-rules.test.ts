import { describe, expect, it } from 'vitest';
import { normalizeTag } from '../src/lib/tagRules.js';

describe('normalizeTag', () => {
  it('пробелы внутри тега превращаются в «_», а не склеивают слова', () => {
    expect(normalizeTag('  Fursuit Photo  Shoot ')).toBe('fursuit_photo_shoot');
    expect(normalizeTag('#Тёплый вечер')).toBe('тёплый_вечер');
  });

  it('недопустимые символы по-прежнему удаляются', () => {
    expect(normalizeTag('#art!@ #1')).toBe('art_1');
    expect(normalizeTag('a-b_c')).toBe('a-b_c');
  });
});
