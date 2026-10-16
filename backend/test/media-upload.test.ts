import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUser, resetDb, getApp, freshIp } from './helpers.js';

// Storage is MinIO in production; here every write is faked so the upload pipeline
// (limits, validation, quota bookkeeping, rollback) can be exercised end to end.
const stored: string[] = [];
vi.mock('../src/modules/media/service.js', async (orig) => {
  const actual = await orig<typeof import('../src/modules/media/service.js')>();
  return {
    ...actual,
    uploadFile: vi.fn(async (_buf: Buffer, name: string) => {
      const url = `https://s3.test/posts/${name}.webp`; stored.push(url);
      return { url, sizeBytes: 10, originalUrl: null, originalSizeBytes: 0 };
    }),
    uploadStreamedFile: vi.fn(async ({ originalName }: { originalName: string }) => {
      const url = `https://s3.test/posts/${originalName}`; stored.push(url);
      return { url, sizeBytes: 20, isSilentVideo: false };
    }),
    recordMediaOwner: vi.fn(async () => {}),
    removeObjectByUrl: vi.fn(async () => {}),
  };
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64, 2)]);

async function upload(auth: Record<string, string>, folder: string, file: { name: string; type: string; body: Buffer } | null) {
  const boundary = '----bloomlytest';
  const parts: Buffer[] = [];
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(file.body, Buffer.from('\r\n'));
  } else {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="other"\r\n\r\nx\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const app = await getApp();
  const res = await app.inject({
    method: 'POST', url: `/api/media/upload?folder=${folder}`,
    headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-forwarded-for': freshIp() },
    payload: Buffer.concat(parts),
  });
  return { status: res.statusCode, json: res.json() };
}

describe('загрузка медиа', () => {
  beforeEach(async () => { await resetDb(); stored.length = 0; });

  it('отклоняет: нет файла, чужой тип, подмену содержимого, не-PNG стикер, пустой файл', async () => {
    const { auth } = await createUser();
    expect((await upload(auth, 'posts', null)).json.error.code).toBe('NO_FILE');
    expect((await upload(auth, 'posts', { name: 'a.exe', type: 'application/x-msdownload', body: PNG })).status).toBe(415);
    const spoof = await upload(auth, 'posts', { name: 'a.png', type: 'image/png', body: Buffer.from('not really a png, just text............') });
    expect(spoof.status).toBe(415);
    expect(spoof.json.error.message).toContain('не соответствует');
    expect((await upload(auth, 'stickers', { name: 'a.mp4', type: 'video/mp4', body: MP4 })).json.error.code).toBe('STICKER_FORMAT');
    // К обращениям и жалобам можно прикладывать видео, но не аудио
    expect((await upload(auth, 'reports', { name: 'a.mp3', type: 'audio/mpeg', body: Buffer.alloc(64, 1) })).status).toBe(415);
    const empty = await upload(auth, 'posts', { name: 'a.png', type: 'image/png', body: Buffer.alloc(0) });
    expect(empty.status).toBe(400);
    expect(empty.json.error.code).toBe('NO_FILE');
    expect(stored).toEqual([]);
  });

  it('сохраняет картинку и видео и отдаёт URL', async () => {
    const { auth } = await createUser();
    const img = await upload(auth, 'posts', { name: 'pic.png', type: 'image/png', body: PNG });
    expect(img.status).toBe(200);
    expect(img.json.data.url).toBe('https://s3.test/posts/pic.png.webp');
    const vid = await upload(auth, 'posts', { name: 'clip.mp4', type: 'video/mp4', body: MP4 });
    expect(vid.status).toBe(200);
    expect(vid.json.data).toMatchObject({ url: 'https://s3.test/posts/clip.mp4', isSilentVideo: false });
  });
});
