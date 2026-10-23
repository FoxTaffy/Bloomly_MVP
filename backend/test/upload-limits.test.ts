import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync } from 'fs';
import os from 'os';
import { Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { createUser, resetDb, getApp, freshIp } from './helpers.js';
import {
  ByteLimiter, LimitExceeded, uploadKind, limitFor, tierLimitBytes, maxAnyBytes, requiredTierFor, nextTierFor, formatBytes,
} from '../src/modules/media/limits.js';
import { PLAN_PERKS } from '../src/modules/payments/plan-perks.js';

const MB = 1024 * 1024;
const GB = 1024 * MB;

// Хранилище подменено: проверяем приём, лимиты и параметры обработки, а не MinIO
const calls: { fn: string; args: unknown[] }[] = [];
vi.mock('../src/modules/media/service.js', async (orig) => {
  const actual = await orig<typeof import('../src/modules/media/service.js')>();
  return {
    ...actual,
    uploadFile: vi.fn(async (...args: unknown[]) => {
      calls.push({ fn: 'uploadFile', args });
      return { url: 'https://s3.test/posts/x.webp', sizeBytes: 10, originalUrl: 'https://s3.test/posts/originals/x.png', originalSizeBytes: 20 };
    }),
    uploadStreamedFile: vi.fn(async (...args: unknown[]) => {
      calls.push({ fn: 'uploadStreamedFile', args });
      return { url: 'https://s3.test/messages/x', sizeBytes: 20, isSilentVideo: false };
    }),
    recordMediaOwner: vi.fn(async () => {}),
    removeObjectByUrl: vi.fn(async () => {}),
  };
});

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42')]);
const ZIP_HEAD = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
const PSD_HEAD = Buffer.concat([Buffer.from('8BPS'), Buffer.alloc(16)]);
const sized = (head: Buffer, total: number) => Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 7)]);

async function upload(auth: Record<string, string>, folder: string, file: { name: string; type: string; body: Buffer }) {
  const boundary = '----bloomlylimits';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
    file.body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const app = await getApp();
  const res = await app.inject({
    method: 'POST', url: `/api/media/upload?folder=${folder}`,
    headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-forwarded-for': freshIp() },
    payload,
  });
  return { status: res.statusCode, json: res.json(), headers: res.headers };
}

const exp = () => new Date(Date.now() + 10 * 86_400_000);
const user = (tier: string) => createUser({ subscription_tier: tier, subscription_expires_at: tier === 'free' ? null : exp() });
const tmpUploadDirs = () => readdirSync(os.tmpdir()).filter((n) => n.startsWith('upload-')).length;

describe('лимиты загрузки: расчёт по тарифам', () => {
  it('значения из ТЗ: фото 15 / 50 МБ, видео 100 МБ / 500 МБ / 1 ГБ / 2 ГБ', () => {
    expect(PLAN_PERKS.free).toMatchObject({ maxPhotoBytes: 15 * MB, maxVideoBytes: 100 * MB, uncompressedPhotos: false });
    expect(PLAN_PERKS.lite).toMatchObject({ maxPhotoBytes: 50 * MB, maxVideoBytes: 500 * MB, uncompressedPhotos: true });
    expect(PLAN_PERKS.pro).toMatchObject({ maxPhotoBytes: 50 * MB, maxVideoBytes: 1 * GB, maxAttachmentBytes: 1 * GB, uncompressedPhotos: true });
    expect(PLAN_PERKS.business).toMatchObject({ maxPhotoBytes: 50 * MB, maxVideoBytes: 2 * GB, maxAttachmentBytes: 2 * GB, uncompressedPhotos: true });
    expect([PLAN_PERKS.free.maxAttachmentBytes, PLAN_PERKS.lite.maxAttachmentBytes]).toEqual([0, 0]);
  });

  it('вид файла по типу содержимого', () => {
    expect(uploadKind('image/jpeg')).toBe('photo');
    expect(uploadKind('image/gif')).toBe('photo');
    expect(uploadKind('video/mp4')).toBe('video');
    expect(uploadKind('audio/mpeg')).toBe('video');
    expect(uploadKind('application/zip')).toBe('document');
    expect(uploadKind('image/vnd.adobe.photoshop')).toBe('document'); // PSD — исходник, а не фото
  });

  it('в папках с тарифными лимитами решает тариф, в служебных — их жёсткий потолок', () => {
    expect(limitFor('business', 'video', 'posts')).toBe(2 * GB);
    expect(limitFor('business', 'photo', 'messages')).toBe(50 * MB);
    expect(limitFor('business', 'photo', 'avatars', 10 * MB)).toBe(10 * MB); // тариф потолок аватара не поднимает
    expect(limitFor('free', 'document', 'messages')).toBe(0);
  });

  it('самый большой лимит тарифа для отсечки по Content-Length', () => {
    expect([maxAnyBytes('free'), maxAnyBytes('lite'), maxAnyBytes('pro'), maxAnyBytes('business')]).toEqual([100 * MB, 500 * MB, 1 * GB, 2 * GB]);
    expect(maxAnyBytes('unknown')).toBe(100 * MB);
  });

  it('какой тариф нужен: по размеру и следующий уровень', () => {
    expect(requiredTierFor('photo', 20 * MB)).toBe('lite');
    expect(requiredTierFor('photo', 60 * MB)).toBeNull();
    expect(requiredTierFor('video', 300 * MB)).toBe('lite');
    expect(requiredTierFor('video', 800 * MB)).toBe('pro');
    expect(requiredTierFor('video', 1.5 * GB)).toBe('business');
    expect(requiredTierFor('document', 10 * MB)).toBe('pro'); // free и lite документов не принимают
    expect(nextTierFor('free', 'video')).toBe('lite');
    expect(nextTierFor('lite', 'photo')).toBeNull();
    expect(nextTierFor('business', 'video')).toBeNull();
    expect(tierLimitBytes('lite', 'document')).toBe(0);
  });

  it('формат размера для сообщений', () => {
    expect(formatBytes(15 * MB)).toBe('15 МБ');
    expect(formatBytes(2 * GB)).toBe('2 ГБ');
    expect(formatBytes(1.5 * GB)).toBe('1.5 ГБ');
  });
});

describe('ByteLimiter: обрыв потока на лету', () => {
  it('пропускает поток в пределах лимита целиком', async () => {
    const written: Buffer[] = [];
    const limiter = new ByteLimiter(10 * 1024);
    await pipeline(Readable.from(Array.from({ length: 10 }, () => Buffer.alloc(1024, 1))), limiter,
      new Writable({ write(c, _e, cb) { written.push(c); cb(); } }));
    expect(Buffer.concat(written).length).toBe(10 * 1024);
    expect(limiter.received).toBe(10 * 1024);
  });

  it('обрывает, как только набралось больше лимита: лишнее до записи не доходит', async () => {
    const written: Buffer[] = [];
    let produced = 0;
    const source = new Readable({ read() { produced += 1; this.push(produced > 1000 ? null : Buffer.alloc(1024, 1)); } });
    const limiter = new ByteLimiter(3 * 1024);
    await expect(pipeline(source, limiter, new Writable({ write(c, _e, cb) { written.push(c); cb(); } }))).rejects.toBeInstanceOf(LimitExceeded);
    expect(Buffer.concat(written).length).toBeLessThanOrEqual(3 * 1024);
    expect(produced).toBeLessThan(100); // источник остановлен, а не вычитан до конца
  });

  it('сообщает лимит и сколько успело прийти; сбрасывает таймер простоя на каждом куске', async () => {
    let ticks = 0;
    const limiter = new ByteLimiter(2048, () => { ticks += 1; });
    const err = await pipeline(Readable.from([Buffer.alloc(1024), Buffer.alloc(1024), Buffer.alloc(1024)]), limiter, new Writable({ write(_c, _e, cb) { cb(); } })).catch((e) => e);
    expect(err).toBeInstanceOf(LimitExceeded);
    expect(err.limitBytes).toBe(2048);
    expect(err.receivedBytes).toBe(3072);
    expect(ticks).toBe(3);
  });
});

describe('загрузка: лимиты тарифа на лету (413)', () => {
  beforeEach(async () => { await resetDb(); calls.length = 0; });

  it('Free: фото сверх 15 МБ отсекается с 413 и подсказкой тарифа Lite, временные файлы убраны', async () => {
    const { auth } = await user('free');
    const before = tmpUploadDirs();
    const res = await upload(auth, 'posts', { name: 'big.png', type: 'image/png', body: sized(PNG_HEAD, 15 * MB + 1) });
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe('FILE_LIMIT_EXCEEDED');
    expect(res.json.error.details).toMatchObject({ kind: 'photo', limitBytes: 15 * MB, tier: 'free', requiredTier: 'lite' });
    expect(res.json.error.message).toContain('15 МБ');
    expect(res.json.error.message).toContain('Lite');
    expect(calls).toHaveLength(0);
    expect(tmpUploadDirs()).toBe(before);
  });

  it('Free: ровно 15 МБ проходит, фото обрабатывается со стандартным сжатием', async () => {
    const { auth } = await user('free');
    const res = await upload(auth, 'posts', { name: 'ok.png', type: 'image/png', body: sized(PNG_HEAD, 15 * MB) });
    expect(res.status).toBe(200);
    expect(calls[0].fn).toBe('uploadFile');
    expect(calls[0].args[0]).toMatchObject({ filePath: expect.any(String) }); // с диска, а не Buffer
    expect(calls[0].args[4]).toEqual({ uncompressed: false });
  });

  it('Lite, Pro, Business: фото до 50 МБ принимается, флаг «без сжатия» включён', async () => {
    for (const tier of ['lite', 'pro', 'business']) {
      calls.length = 0;
      const { auth } = await user(tier);
      const res = await upload(auth, 'posts', { name: 'big.png', type: 'image/png', body: sized(PNG_HEAD, 20 * MB) });
      expect(res.status, tier).toBe(200);
      expect(calls[0].args[4], tier).toEqual({ uncompressed: true });
      expect(res.json.data.originalUrl).toBeTruthy(); // оригинал сохраняется отдельно
    }
  });

  it('Business: фото сверх 50 МБ отсекается, выше тарифа нет — подсказки нет', async () => {
    const { auth } = await user('business');
    const res = await upload(auth, 'posts', { name: 'huge.png', type: 'image/png', body: sized(PNG_HEAD, 50 * MB + 1) });
    expect(res.status).toBe(413);
    expect(res.json.error.details).toMatchObject({ kind: 'photo', limitBytes: 50 * MB, requiredTier: null });
    expect(res.json.error.message).not.toContain('Нужен тариф');
  });

  it('Free: видео сверх 100 МБ отсекается на лету с подсказкой Lite', async () => {
    const { auth } = await user('free');
    const before = tmpUploadDirs();
    const res = await upload(auth, 'posts', { name: 'v.mp4', type: 'video/mp4', body: sized(MP4_HEAD, 100 * MB + 1) });
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe('FILE_LIMIT_EXCEEDED');
    expect(res.json.error.details).toMatchObject({ kind: 'video', limitBytes: 100 * MB, requiredTier: 'lite' });
    expect(calls).toHaveLength(0);
    expect(tmpUploadDirs()).toBe(before);
  });

  it('видео в пределах лимита уходит в хранилище потоком с диска', async () => {
    const { auth } = await user('lite');
    const res = await upload(auth, 'posts', { name: 'v.mp4', type: 'video/mp4', body: sized(MP4_HEAD, 120 * MB) }); // больше лимита Free
    expect(res.status).toBe(200);
    expect(calls[0].fn).toBe('uploadStreamedFile');
    expect(calls[0].args[0]).toMatchObject({ filePath: expect.any(String), mimeType: 'video/mp4' });
  });

  it('заведомо огромный запрос по Content-Length отсекается до приёма тела', async () => {
    const { auth } = await user('free');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: '/api/media/upload?folder=posts',
      headers: { ...auth, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(3 * GB), 'x-forwarded-for': freshIp() },
      payload: Buffer.from('--x--\r\n'),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_LIMIT_EXCEEDED');
  });

  it('служебные папки держат свой потолок независимо от тарифа: аватар Business до 10 МБ', async () => {
    const { auth } = await user('business');
    const res = await upload(auth, 'avatars', { name: 'a.png', type: 'image/png', body: sized(PNG_HEAD, 10 * MB + 1) });
    expect(res.status).toBe(413);
    expect(res.json.error.details.limitBytes).toBe(10 * MB);
  });
});

describe('вложения чата: PSD и архивы (Pro и Business)', () => {
  beforeEach(async () => { await resetDb(); calls.length = 0; });

  it('Free и Lite: 403 FILE_TYPE_NOT_IN_PLAN с подсказкой тарифа Pro', async () => {
    for (const tier of ['free', 'lite']) {
      const { auth } = await user(tier);
      const res = await upload(auth, 'messages', { name: 'src.zip', type: 'application/zip', body: sized(ZIP_HEAD, 1 * MB) });
      expect(res.status, tier).toBe(403);
      expect(res.json.error.code, tier).toBe('FILE_TYPE_NOT_IN_PLAN');
      expect(res.json.error.details.requiredTier, tier).toBe('pro');
    }
    expect(calls).toHaveLength(0);
  });

  it('Pro и Business: архив и PSD принимаются, сохраняются как скачиваемый octet-stream с безопасным расширением', async () => {
    for (const tier of ['pro', 'business']) {
      calls.length = 0;
      const { auth } = await user(tier);
      const zip = await upload(auth, 'messages', { name: '../../evil<script>.zip', type: 'application/zip', body: sized(ZIP_HEAD, 2 * MB) });
      expect(zip.status, tier).toBe(200);
      const args = calls[0].args[0] as { mimeType: string; originalName: string; asAttachment?: string };
      expect(args.mimeType).toBe('application/octet-stream');
      expect(args.originalName).toBe('file.zip');
      expect(args.asAttachment).toBe('evil<script>.zip'); // только базовое имя, без пути

      calls.length = 0;
      const psd = await upload(auth, 'messages', { name: 'art.psd', type: 'image/vnd.adobe.photoshop', body: sized(PSD_HEAD, 2 * MB) });
      expect(psd.status, tier).toBe(200);
      expect((calls[0].args[0] as { originalName: string }).originalName).toBe('file.psd');
    }
  });

  it('документы принимают чат и посты (Pro+), но не комментарии и оформление; подмена содержимого отклоняется', async () => {
    const { auth } = await user('business');
    for (const folder of ['comments', 'avatars', 'banners', 'backgrounds']) {
      expect((await upload(auth, folder, { name: 's.zip', type: 'application/zip', body: sized(ZIP_HEAD, 1 * MB) })).status, folder).toBe(415);
    }
    expect((await upload(auth, 'posts', { name: 's.zip', type: 'application/zip', body: sized(ZIP_HEAD, 1 * MB) })).status).toBe(200);
    const free = await user('free');
    const denied = await upload(free.auth, 'posts', { name: 's.zip', type: 'application/zip', body: sized(ZIP_HEAD, 1 * MB) });
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe('FILE_TYPE_NOT_IN_PLAN');
    const spoof = await upload(auth, 'messages', { name: 's.zip', type: 'application/zip', body: Buffer.from('<html><script>alert(1)</script></html>......') });
    expect(spoof.status).toBe(415);
  });

  it('Pro: документ сверх 1 ГБ отсекается подсказкой Business (проверка лимитом тарифа, без гигабайтного буфера)', () => {
    expect(limitFor('pro', 'document', 'messages')).toBe(1 * GB);
    expect(requiredTierFor('document', 1 * GB + 1)).toBe('business');
  });
});

describe('зеркало лимитов на фронте совпадает с перками тарифов', () => {
  it('frontend/src/lib/uploadLimits.ts == plan-perks.ts', async () => {
    const mirror = await import('../../frontend/src/lib/uploadLimits.ts');
    for (const tier of ['free', 'lite', 'pro', 'business'] as const) {
      const p = PLAN_PERKS[tier];
      expect(mirror.FILE_LIMITS[tier], tier).toEqual({
        maxPhotoBytes: p.maxPhotoBytes, maxVideoBytes: p.maxVideoBytes,
        maxAttachmentBytes: p.maxAttachmentBytes, uncompressedPhotos: p.uncompressedPhotos,
      });
    }
  });

  it('те же типы документов и те же виды файлов', async () => {
    const mirror = await import('../../frontend/src/lib/uploadLimits.ts');
    const { DOCUMENT_MIME_TYPES } = await import('../src/modules/media/limits.js');
    expect([...mirror.DOCUMENT_TYPES].sort()).toEqual([...DOCUMENT_MIME_TYPES].sort());
    for (const mime of ['image/png', 'image/gif', 'video/mp4', 'audio/mpeg', 'application/zip', 'image/vnd.adobe.photoshop']) {
      expect(mirror.uploadKind(mime), mime).toBe(uploadKind(mime));
    }
  });
});
