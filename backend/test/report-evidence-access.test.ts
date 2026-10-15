import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { createUser, prisma, resetDb, getApp, api } from './helpers.js';
import { mediaUrlForKey } from '../src/modules/media/service.js';

// В тестовом окружении MinIO нет: подменяем только чтение объекта, остальной сервис настоящий.
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const openPrivateObject = vi.hoisted(() => vi.fn());
vi.mock('../src/modules/media/service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/media/service.js')>();
  return { ...actual, openPrivateObject };
});

async function storedObject(ownerId: string | null, folder: string, deleted = false) {
  const key = `private/${folder}/${randomUUID()}.webp`;
  await prisma.mediaObject.create({
    data: { object_key: key, owner_id: ownerId, folder, size_bytes: BigInt(PNG.length), deleted_at: deleted ? new Date() : null },
  });
  return mediaUrlForKey(key);
}

const evidence = (url: string) => `/api/admin/reports/evidence?url=${encodeURIComponent(url)}`;

describe('жалобы: выдача фото через API', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    openPrivateObject.mockReset();
    openPrivateObject.mockImplementation(async () => ({ stream: Readable.from([PNG]), size: PNG.length, contentType: 'image/webp' }));
  });

  it('обычный пользователь получает 403, даже если это его собственная загрузка', async () => {
    const reporter = await createUser();
    const url = await storedObject(reporter.user.id, 'reports');
    const res = await api('GET', evidence(url), { headers: reporter.auth });
    expect(res.status).toBe(403);
    expect(openPrivateObject).not.toHaveBeenCalled();
  });

  it('без авторизации — 401', async () => {
    const reporter = await createUser();
    const url = await storedObject(reporter.user.id, 'reports');
    const res = await api('GET', evidence(url));
    expect(res.status).toBe(401);
  });

  it.each(['moderator', 'admin', 'owner'])('%s получает файл', async (role) => {
    const reporter = await createUser();
    const staff = await createUser({ role });
    const url = await storedObject(reporter.user.id, 'reports');
    const res = await api('GET', evidence(url), { headers: staff.auth });
    expect(res.status).toBe(200);
    expect(res.res.headers['content-type']).toBe('image/webp');
    expect(res.res.headers['cache-control']).toBe('private, no-store');
  });

  it('другие закрытые папки этим маршрутом не отдаются', async () => {
    const mod = await createUser({ role: 'moderator' });
    const url = await storedObject(null, 'verification');
    const res = await api('GET', evidence(url), { headers: mod.auth });
    expect(res.status).toBe(404);
    expect(openPrivateObject).not.toHaveBeenCalled();
  });

  it('удалённый файл и неизвестная ссылка — 404', async () => {
    const mod = await createUser({ role: 'moderator' });
    const gone = await storedObject(null, 'reports', true);
    expect((await api('GET', evidence(gone), { headers: mod.auth })).status).toBe(404);
    expect((await api('GET', evidence(mediaUrlForKey(`private/reports/${randomUUID()}.webp`)), { headers: mod.auth })).status).toBe(404);
  });

  it('объекта нет в хранилище — 404 FILE_MISSING (фронт покажет заглушку)', async () => {
    const mod = await createUser({ role: 'moderator' });
    const url = await storedObject(null, 'reports');
    openPrivateObject.mockRejectedValueOnce(new Error('NoSuchKey'));
    const res = await api('GET', evidence(url), { headers: mod.auth });
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('FILE_MISSING');
  });
});
