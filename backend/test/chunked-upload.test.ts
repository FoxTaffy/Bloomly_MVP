import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { createReadStream, existsSync, mkdtempSync, utimesSync } from 'fs';
import { readdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createUser, resetDb, getApp, freshIp } from './helpers.js';
import { CHUNK_BYTES, MAX_UPLOAD_SESSIONS_PER_USER } from '../src/config/uploads.js';

// Сессии — во временном каталоге теста; хранилище подменено, но файл читаем в момент записи, чтобы сверить сборку
process.env.UPLOAD_SESSIONS_DIR = mkdtempSync(path.join(os.tmpdir(), 'chunked-test-'));
const MB = 1024 * 1024;

const stored: { fn: string; sha: string; size: number; args: Record<string, unknown> }[] = [];
async function hashFile(p: string) {
  const h = createHash('sha256');
  let size = 0;
  for await (const c of createReadStream(p)) { h.update(c as Buffer); size += (c as Buffer).length; }
  return { sha: h.digest('hex'), size };
}
vi.mock('../src/modules/media/service.js', async (orig) => {
  const actual = await orig<typeof import('../src/modules/media/service.js')>();
  return {
    ...actual,
    uploadFile: vi.fn(async (source: { filePath: string }, name: string) => {
      const { sha, size } = await hashFile(source.filePath);
      stored.push({ fn: 'uploadFile', sha, size, args: { name } });
      return { url: 'https://s3.test/posts/x.webp', sizeBytes: 10, originalUrl: undefined, originalSizeBytes: 0 };
    }),
    uploadStreamedFile: vi.fn(async (args: { filePath: string; originalName: string }) => {
      const { sha, size } = await hashFile(args.filePath);
      stored.push({ fn: 'uploadStreamedFile', sha, size, args });
      return { url: `https://s3.test/posts/${args.originalName}`, sizeBytes: size, isSilentVideo: false };
    }),
    recordMediaOwner: vi.fn(async () => {}),
    removeObjectByUrl: vi.fn(async () => {}),
  };
});

const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42')]);
const makeFile = (total: number) => {
  const b = Buffer.alloc(total);
  for (let i = 0; i < total; i += 4096) b.writeUInt32LE((i * 2654435761) >>> 0, i); // не однородный: перепутанные части поменяют хэш
  MP4_HEAD.copy(b, 0);
  return b;
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const exp = () => new Date(Date.now() + 10 * 86_400_000);
const user = (tier = 'free') => createUser({ subscription_tier: tier, subscription_expires_at: tier === 'free' ? null : exp() });
const sessionDirs = async () => (await readdir(process.env.UPLOAD_SESSIONS_DIR!).catch(() => [])).filter((n) => /^[0-9a-f-]{36}$/.test(n));

async function call(method: string, url: string, auth: Record<string, string>, opts: { body?: unknown; chunk?: Buffer; offset?: number; headers?: Record<string, string> } = {}) {
  const app = await getApp();
  const headers: Record<string, string> = { ...auth, 'x-forwarded-for': freshIp(), ...(opts.headers ?? {}) };
  let payload: Buffer | string | undefined;
  if (opts.chunk) {
    headers['content-type'] = 'application/octet-stream';
    headers['upload-offset'] = String(opts.offset ?? 0);
    payload = opts.chunk;
  } else if (opts.body !== undefined) {
    payload = JSON.stringify(opts.body);
    headers['content-type'] = 'application/json';
  }
  const res = await app.inject({ method: method as 'GET', url, headers, payload });
  let json: any = null;
  try { json = res.json(); } catch { /* пусто */ }
  return { status: res.statusCode, json };
}
const init = (auth: Record<string, string>, over: Record<string, unknown> = {}) =>
  call('POST', '/api/media/upload/init', auth, { body: { fileName: 'clip.mp4', mimeType: 'video/mp4', totalSize: 60 * MB, folder: 'posts', ...over } });

describe('чанковая загрузка: протокол', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    stored.length = 0;
    await rm(process.env.UPLOAD_SESSIONS_DIR!, { recursive: true, force: true }); // каталог сессий общий на файл — чистим между тестами
  });

  it('init → три части → complete: файл собран без искажений и сохранён тем же пайплайном', async () => {
    const { auth } = await user('free'); // видео 60 МБ в пределах лимита Free (100 МБ), но больше порога чанков
    const file = makeFile(60 * MB);
    const i = await init(auth);
    expect(i.status).toBe(201);
    const { uploadId, chunkSize } = i.json.data;
    expect(chunkSize).toBe(CHUNK_BYTES);

    let offset = 0;
    while (offset < file.length) {
      const part = file.subarray(offset, offset + chunkSize);
      const r = await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: part, offset });
      expect(r.status).toBe(200);
      offset += part.length;
      expect(r.json.data.received).toBe(offset);
    }
    expect((await call('GET', `/api/media/upload/${uploadId}`, auth)).json.data).toMatchObject({ received: 60 * MB, totalSize: 60 * MB });

    const done = await call('POST', `/api/media/upload/${uploadId}/complete`, auth);
    expect(done.status).toBe(200);
    // Ответ той же формы, что у обычной загрузки
    expect(done.json).toMatchObject({ success: true, error: null, data: { url: expect.stringContaining('clip.mp4'), isSilentVideo: false } });
    expect(stored).toHaveLength(1);
    expect(stored[0].fn).toBe('uploadStreamedFile');
    expect(stored[0].size).toBe(60 * MB);
    expect(stored[0].sha).toBe(sha(file)); // собранный файл бит-в-бит равен исходному
    expect(await sessionDirs()).toHaveLength(0); // временные файлы удалены
  });

  it('init: превышение лимита тарифа отсекается до пересылки данных, сессия не создаётся', async () => {
    const { auth } = await user('free');
    const big = await init(auth, { totalSize: 101 * MB });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe('FILE_LIMIT_EXCEEDED');
    expect(big.json.error.details).toMatchObject({ kind: 'video', limitBytes: 100 * MB, requiredTier: 'lite' });

    const doc = await init(auth, { fileName: 'src.zip', mimeType: 'application/zip', totalSize: 5 * MB });
    expect(doc.status).toBe(403);
    expect(doc.json.error.code).toBe('FILE_TYPE_NOT_IN_PLAN');
    expect(doc.json.error.details.requiredTier).toBe('pro');

    const photo = await init(auth, { fileName: 'a.png', mimeType: 'image/png', totalSize: 16 * MB });
    expect(photo.status).toBe(413);
    expect(photo.json.error.details).toMatchObject({ kind: 'photo', limitBytes: 15 * MB });
    expect(await sessionDirs()).toHaveLength(0);
  });

  it('init: Lite принимает 400 МБ, Business — 1.5 ГБ (только заявка, данные не шлём), Pro на 1.5 ГБ отказ с подсказкой Business', async () => {
    expect((await init((await user('lite')).auth, { totalSize: 400 * MB })).status).toBe(201);
    expect((await init((await user('business')).auth, { totalSize: 1536 * MB })).status).toBe(201);
    const pro = await init((await user('pro')).auth, { totalSize: 1536 * MB });
    expect(pro.status).toBe(413);
    expect(pro.json.error.details.requiredTier).toBe('business');
  });

  it('init: неверные параметры, чужие папки и типы', async () => {
    const { auth } = await user('business');
    expect((await call('POST', '/api/media/upload/init', auth, { body: { fileName: 'a.mp4' } })).status).toBe(400);
    expect((await init(auth, { totalSize: 0 })).status).toBe(400);
    expect((await init(auth, { totalSize: 1.5 })).status).toBe(400);
    expect((await init(auth, { folder: 'avatars' })).json.error.code).toBe('CHUNKED_NOT_SUPPORTED');
    expect((await init(auth, { folder: 'nope' })).json.error.code).toBe('CHUNKED_NOT_SUPPORTED');
    expect((await init(auth, { mimeType: 'application/x-msdownload' })).status).toBe(415);
    expect((await call('POST', '/api/media/upload/init', {}, { body: {} })).status).toBe(401);
  });

  it('не больше трёх незавершённых сессий на пользователя', async () => {
    const { auth } = await user('business');
    for (let n = 0; n < MAX_UPLOAD_SESSIONS_PER_USER; n++) expect((await init(auth)).status).toBe(201);
    const extra = await init(auth);
    expect(extra.status).toBe(429);
    expect(extra.json.error.code).toBe('TOO_MANY_UPLOADS');
  });

  it('часть: неверное смещение → 409 с принятым; повтор уже принятой части не портит файл', async () => {
    const { auth } = await user('free');
    const file = makeFile(60 * MB);
    const { uploadId } = (await init(auth)).json.data;
    const first = file.subarray(0, CHUNK_BYTES);
    expect((await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: first, offset: 0 })).status).toBe(200);

    // Ответ потерялся, клиент шлёт ту же часть ещё раз
    const dup = await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: first, offset: 0 });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('OFFSET_MISMATCH');
    expect(dup.json.error.details.received).toBe(CHUNK_BYTES);
    // Перескок вперёд
    const skip = await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: file.subarray(0, 1024), offset: 40 * MB });
    expect(skip.json.error.details.received).toBe(CHUNK_BYTES);

    // Клиент спрашивает состояние и продолжает с принятого — итог цел
    const status = (await call('GET', `/api/media/upload/${uploadId}`, auth)).json.data.received;
    for (let off = status; off < file.length; off += CHUNK_BYTES) {
      expect((await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: file.subarray(off, off + CHUNK_BYTES), offset: off })).status).toBe(200);
    }
    expect((await call('POST', `/api/media/upload/${uploadId}/complete`, auth)).status).toBe(200);
    expect(stored[0].sha).toBe(sha(file));
  });

  it('часть: сверх заявленного размера и сверх размера части — 413, принятое не меняется', async () => {
    const { auth } = await user('free');
    const { uploadId } = (await init(auth, { totalSize: 30 * MB })).json.data;
    const tooLong = await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: Buffer.alloc(CHUNK_BYTES + 1, 1), offset: 0 });
    expect(tooLong.status).toBe(413);
    expect(tooLong.json.error.code).toBe('CHUNK_TOO_LARGE');

    expect((await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: Buffer.alloc(CHUNK_BYTES, 1), offset: 0 })).status).toBe(200);
    const over = await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: Buffer.alloc(6 * MB, 1), offset: CHUNK_BYTES }); // 25 + 6 > 30
    expect(over.status).toBe(413);
    expect(over.json.error.code).toBe('UPLOAD_SIZE_EXCEEDED');
    expect((await call('GET', `/api/media/upload/${uploadId}`, auth)).json.data.received).toBe(CHUNK_BYTES);
  });

  it('complete раньше времени → 409, сессия жива и её можно доослать', async () => {
    const { auth } = await user('free');
    const { uploadId } = (await init(auth, { totalSize: 30 * MB })).json.data;
    await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: Buffer.concat([MP4_HEAD, Buffer.alloc(CHUNK_BYTES - MP4_HEAD.length, 1)]), offset: 0 });
    const early = await call('POST', `/api/media/upload/${uploadId}/complete`, auth);
    expect(early.status).toBe(409);
    expect(early.json.error.code).toBe('UPLOAD_INCOMPLETE');
    expect(await sessionDirs()).toHaveLength(1);
    expect((await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: Buffer.alloc(5 * MB, 1), offset: CHUNK_BYTES })).status).toBe(200);
    expect((await call('POST', `/api/media/upload/${uploadId}/complete`, auth)).status).toBe(200);
  });

  it('complete: подмена содержимого (не видео) отклоняется по сигнатуре, сессия удаляется', async () => {
    const { auth } = await user('free');
    const { uploadId } = (await init(auth, { totalSize: 5 * MB })).json.data;
    await call('PATCH', `/api/media/upload/${uploadId}`, auth, { chunk: Buffer.from('<html><script>alert(1)</script></html>'.padEnd(5 * MB, ' ')), offset: 0 });
    const done = await call('POST', `/api/media/upload/${uploadId}/complete`, auth);
    expect(done.status).toBe(415);
    expect(stored).toHaveLength(0);
    expect(await sessionDirs()).toHaveLength(0);
  });

  it('чужая сессия, не-uuid и отсутствующая — 404; отмена удаляет временные файлы', async () => {
    const a = await user('free');
    const b = await user('free');
    const { uploadId } = (await init(a.auth)).json.data;
    expect((await call('GET', `/api/media/upload/${uploadId}`, b.auth)).status).toBe(404);
    expect((await call('PATCH', `/api/media/upload/${uploadId}`, b.auth, { chunk: Buffer.alloc(10), offset: 0 })).status).toBe(404);
    expect((await call('POST', `/api/media/upload/${uploadId}/complete`, b.auth)).status).toBe(404);
    expect((await call('DELETE', `/api/media/upload/${uploadId}`, b.auth)).status).toBe(404);
    expect((await call('GET', '/api/media/upload/not-a-uuid', a.auth)).status).toBe(404);
    expect((await call('GET', '/api/media/upload/..%2F..%2Fetc', a.auth)).status).toBe(404);
    expect(await sessionDirs()).toHaveLength(1);

    expect((await call('DELETE', `/api/media/upload/${uploadId}`, a.auth)).status).toBe(200);
    expect(await sessionDirs()).toHaveLength(0);
  });
});

describe('чанковая загрузка: уборка брошенных сессий', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    stored.length = 0;
    await rm(process.env.UPLOAD_SESSIONS_DIR!, { recursive: true, force: true }); // каталог сессий общий на файл — чистим между тестами
  });

  it('сессии без активности дольше 3 часов удаляются вместе с файлами, свежие остаются', async () => {
    const { cleanupStaleUploadSessions } = await import('../src/modules/media/chunked.js');
    const { auth } = await user('business');
    const old = (await init(auth)).json.data.uploadId as string;
    const fresh = (await init(auth)).json.data.uploadId as string;
    const root = process.env.UPLOAD_SESSIONS_DIR!;
    const longAgo = new Date(Date.now() - 4 * 3_600_000);
    utimesSync(path.join(root, old, 'meta.json'), longAgo, longAgo);

    expect(await cleanupStaleUploadSessions()).toBe(1);
    expect(existsSync(path.join(root, old))).toBe(false);
    expect(existsSync(path.join(root, fresh))).toBe(true);
    expect((await call('GET', `/api/media/upload/${old}`, auth)).status).toBe(404);

    // Активность продлевает жизнь: принятая часть обновляет meta.json
    await call('PATCH', `/api/media/upload/${fresh}`, auth, { chunk: Buffer.alloc(1024, 1), offset: 0 });
    expect(await cleanupStaleUploadSessions(Date.now() + 2 * 3_600_000)).toBe(0);
    expect(await cleanupStaleUploadSessions(Date.now() + 4 * 3_600_000)).toBe(1);
    expect(await sessionDirs()).toHaveLength(0);
  });

  it('каталог без meta.json тоже убирается по возрасту', async () => {
    const { cleanupStaleUploadSessions } = await import('../src/modules/media/chunked.js');
    const { mkdirSync } = await import('fs');
    const dir = path.join(process.env.UPLOAD_SESSIONS_DIR!, '11111111-1111-4111-8111-111111111111');
    mkdirSync(dir, { recursive: true });
    const longAgo = new Date(Date.now() - 5 * 3_600_000);
    utimesSync(dir, longAgo, longAgo);
    expect(await cleanupStaleUploadSessions()).toBe(1);
    expect(existsSync(dir)).toBe(false);
  });
});
