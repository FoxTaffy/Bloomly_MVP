import { describe, it, expect } from 'vitest';
import { sniffMatches } from '../src/lib/fileSniff.js';

const pad = (head: Buffer, size = 32) => Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length))]);

describe('file sniff: содержимое соответствует объявленному типу', () => {
  it('принимает настоящие заголовки форматов', () => {
    expect(sniffMatches(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')).toBe(true);
    expect(sniffMatches(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')).toBe(true);
    expect(sniffMatches(pad(Buffer.from('GIF89a')), 'image/gif')).toBe(true);
    expect(sniffMatches(pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'image/webp')).toBe(true);
    expect(sniffMatches(pad(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom')])), 'video/mp4')).toBe(true);
    expect(sniffMatches(pad(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), 'video/webm')).toBe(true);
    expect(sniffMatches(pad(Buffer.from('OggS')), 'audio/ogg')).toBe(true);
    expect(sniffMatches(pad(Buffer.from('ID3')), 'audio/mpeg')).toBe(true);
  });

  it('отклоняет HTML или скрипт, объявленные как видео или изображение', () => {
    const html = pad(Buffer.from('<html><script>alert(1)</script></html>'));
    expect(sniffMatches(html, 'video/mp4')).toBe(false);
    expect(sniffMatches(html, 'image/png')).toBe(false);
    expect(sniffMatches(html, 'image/jpeg')).toBe(false);
    expect(sniffMatches(html, 'audio/mpeg')).toBe(false);
  });

  it('отклоняет слишком короткий файл и неизвестный тип', () => {
    expect(sniffMatches(Buffer.from('GIF8'), 'image/gif')).toBe(false);
    expect(sniffMatches(pad(Buffer.from('GIF89a')), 'application/x-msdownload')).toBe(false);
  });
});
