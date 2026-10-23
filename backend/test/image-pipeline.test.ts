import { describe, it, expect, beforeAll, vi } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

// Реальный sharp и реальные файлы на диске; подменено только объектное хранилище, чтобы увидеть, ЧТО в него уходит
const puts: { key: string; body: unknown; size: number; type?: string }[] = [];
vi.mock('../src/lib/objectStorage.js', () => ({
  ObjectStorage: class {
    async bucketExists() { return true; }
    async makeBucket() {}
    async setBucketPolicy() {}
    async putObject(_bucket: string, key: string, body: unknown, size: number, meta: Record<string, string> = {}) {
      if (body instanceof Readable) for await (const _ of body) { /* вычитываем поток как настоящее хранилище */ }
      puts.push({ key, body, size, type: meta['Content-Type'] });
    }
  },
}));

describe('конвейер фото: с диска, без Buffer на весь файл', () => {
  let dir: string;
  let file: string;
  let uploadFile: typeof import('../src/modules/media/service.js').uploadFile;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pipe-test-'));
    file = path.join(dir, 'photo.png');
    // 3000×2000 с шумом: больше, чем размер отображаемой копии у любого тарифа
    const raw = Buffer.alloc(3000 * 2000 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 31 + (i >> 7)) & 255;
    await writeFile(file, await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } }).png().toBuffer());
    ({ uploadFile } = await import('../src/modules/media/service.js'));
    return async () => { await rm(dir, { recursive: true, force: true }); };
  });

  it('Free: отображаемая копия — webp до 2000 px; оригинал уходит потоком без изменений', async () => {
    puts.length = 0;
    const res = await uploadFile({ filePath: file }, 'photo.png', 'image/png', 'posts', { uncompressed: false });
    const display = puts.find((p) => p.key.endsWith('.webp'))!;
    const original = puts.find((p) => p.key.startsWith('posts/originals/'))!;
    expect(display.type).toBe('image/webp');
    expect(original.type).toBe('image/png');
    expect(original.body).toBeInstanceOf(Readable); // поток с диска, а не Buffer
    const { statSync } = await import('fs');
    expect(original.size).toBe(statSync(file).size);
    expect(res.originalSizeBytes).toBe(original.size);
    const meta = await sharp(display.body as Buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(2000);
  });

  it('Lite+ «без сжатия»: копия крупнее (до 3840 px) и качественнее, оригинал тот же', async () => {
    puts.length = 0;
    await uploadFile({ filePath: file }, 'photo.png', 'image/png', 'posts', { uncompressed: true });
    const display = puts.find((p) => p.key.endsWith('.webp'))!;
    const meta = await sharp(display.body as Buffer).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(3000); // исходник меньше 3840 — не увеличивается
    expect(puts.some((p) => p.key.startsWith('posts/originals/') && p.body instanceof Readable)).toBe(true);
  });

  it('копия «без сжатия» весит больше стандартной (качество 92 против 85)', async () => {
    puts.length = 0;
    await uploadFile({ filePath: file }, 'photo.png', 'image/png', 'comments', { uncompressed: false });
    const std = (puts.find((p) => p.key.endsWith('.webp'))!.body as Buffer).length;
    puts.length = 0;
    await uploadFile({ filePath: file }, 'photo.png', 'image/png', 'comments', { uncompressed: true });
    const hq = (puts.find((p) => p.key.endsWith('.webp'))!.body as Buffer).length;
    expect(hq).toBeGreaterThan(std);
    expect(puts.some((p) => p.key.includes('originals'))).toBe(false); // оригинал хранится только у постов
  });

  it('буферный вызов (служебные файлы) работает как раньше', async () => {
    puts.length = 0;
    const buf = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#fa0' } }).png().toBuffer();
    const res = await uploadFile(buf, 'a.png', 'image/png', 'avatars');
    expect(res.url).toContain('.webp');
    const meta = await sharp(puts[0].body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([500, 500]);
  });

  it('битый файл отклоняется 400, а не роняет процесс', async () => {
    const bad = path.join(dir, 'bad.png');
    await writeFile(bad, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 3)]));
    await expect(uploadFile({ filePath: bad }, 'bad.png', 'image/png', 'posts')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('GIF не перекодируется и уходит потоком как есть', async () => {
    puts.length = 0;
    const gif = path.join(dir, 'a.gif');
    await writeFile(gif, Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(300, 1)]));
    const res = await uploadFile({ filePath: gif }, 'a.gif', 'image/gif', 'posts');
    expect(res.url.endsWith('.gif')).toBe(true);
    expect(puts[0].body).toBeInstanceOf(Readable);
    expect(puts[0].size).toBe(306);
  });
});
