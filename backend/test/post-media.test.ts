import { describe, it, expect } from 'vitest';
import { firstVisualMedia, isDocUrl } from '../src/lib/postMedia.js';

describe('превью поста не берёт вложение-файл', () => {
  it('первая визуальная картинка, даже если архив или PSD стоят первыми', () => {
    expect(firstVisualMedia(['https://s3/p/src.psd', 'https://s3/p/a.webp'])).toBe('https://s3/p/a.webp');
    expect(firstVisualMedia(['https://s3/p/pack.zip', 'https://s3/p/b.mp4'])).toBe('https://s3/p/b.mp4');
  });
  it('только файлы или пусто — превью нет', () => {
    expect(firstVisualMedia(['https://s3/p/src.psd', 'https://s3/p/pack.7z'])).toBeUndefined();
    expect(firstVisualMedia([])).toBeUndefined();
    expect(firstVisualMedia(null)).toBeUndefined();
  });
  it('расширения без учёта регистра и параметров', () => {
    expect(isDocUrl('https://s3/p/A.RAR?x=1')).toBe(true);
    expect(isDocUrl('https://s3/p/zip.png')).toBe(false);
  });
});
