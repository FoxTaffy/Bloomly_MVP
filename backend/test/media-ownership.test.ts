import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, getApp } from './helpers.js';
import {
  assertOwnedMedia, deleteFileByUrl, purgeMediaUrl, reserveStorage, releaseStorage, mediaUrlForKey,
} from '../src/modules/media/service.js';

/** Записывает объект в учёт: владелец, папка и размер. Сам файл в MinIO не создаётся (его нет в тестовом окружении). */
async function ownedObject(ownerId: string | null, folder = 'posts', size = 100) {
  const key = `${folder}/${randomUUID()}.webp`;
  await prisma.mediaObject.create({
    data: { object_key: key, owner_id: ownerId, folder, size_bytes: BigInt(size) },
  });
  return mediaUrlForKey(key);
}

const storageOf = async (userId: string) =>
  (await prisma.user.findUnique({ where: { id: userId }, select: { storage_used_bytes: true } }))!.storage_used_bytes;

describe('media: владелец файла', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('чужой файл нельзя прикрепить: 403', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const url = await ownedObject(owner.user.id);

    await expect(assertOwnedMedia(url, attacker.user.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(assertOwnedMedia(url, owner.user.id)).resolves.toBeUndefined();
  });

  it('файл без владельца (загружен до учёта) нельзя прикрепить никому', async () => {
    const someone = await createUser();
    const legacy = await ownedObject(null);
    await expect(assertOwnedMedia(legacy, someone.user.id)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('произвольный внешний URL отклоняется: 400', async () => {
    const someone = await createUser();
    await expect(assertOwnedMedia('https://evil.example/x.png', someone.user.id)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('пустое значение (очистка поля) разрешено', async () => {
    const someone = await createUser();
    await expect(assertOwnedMedia(null, someone.user.id)).resolves.toBeUndefined();
  });

  it('чужой вызов удаления не удаляет файл и не меняет квоту владельца', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    await prisma.user.update({ where: { id: owner.user.id }, data: { storage_used_bytes: BigInt(100) } });
    const url = await ownedObject(owner.user.id, 'posts', 100);

    await deleteFileByUrl(url, attacker.user.id);

    const rows = await prisma.mediaObject.findMany({ where: { owner_id: owner.user.id }, select: { deleted_at: true } });
    expect(rows.every((r) => r.deleted_at === null)).toBe(true);
    expect(await storageOf(owner.user.id)).toBe(BigInt(100));
  });

  it('владелец удаляет свой файл: квота уменьшается один раз, повтор ничего не меняет', async () => {
    const owner = await createUser();
    await prisma.user.update({ where: { id: owner.user.id }, data: { storage_used_bytes: BigInt(100) } });
    const url = await ownedObject(owner.user.id, 'posts', 100);

    await deleteFileByUrl(url, owner.user.id);
    await deleteFileByUrl(url, owner.user.id);
    await purgeMediaUrl(url);

    expect(await storageOf(owner.user.id)).toBe(BigInt(0));
    const rows = await prisma.mediaObject.findMany({ where: { owner_id: owner.user.id }, select: { deleted_at: true } });
    expect(rows.every((r) => r.deleted_at !== null)).toBe(true);
  });

  it('удаление файла без владельца не происходит (даже с произвольным ownerId)', async () => {
    const someone = await createUser();
    const legacy = await ownedObject(null);
    await deleteFileByUrl(legacy, someone.user.id);
    const row = await prisma.mediaObject.findFirst({ where: { owner_id: null }, select: { deleted_at: true } });
    expect(row?.deleted_at).toBeNull();
  });
});

describe('media: квота хранилища', () => {
  beforeEach(resetDb);

  it('параллельные резервирования не превышают лимит', async () => {
    const user = await createUser();
    // Лимит 100 байт, два параллельных запроса по 60 — пройти может только один
    const results = await Promise.all([
      reserveStorage(user.user.id, 60, 100),
      reserveStorage(user.user.id, 60, 100),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await storageOf(user.user.id)).toBe(BigInt(60));
  });

  it('освобождение не уводит квоту в минус', async () => {
    const user = await createUser();
    await reserveStorage(user.user.id, 60, null);
    await releaseStorage(user.user.id, 1000);
    expect(await storageOf(user.user.id)).toBe(BigInt(0));
  });

  it('резервирование без лимита (free) всё равно учитывается', async () => {
    const user = await createUser();
    expect(await reserveStorage(user.user.id, 500, null)).toBe(true);
    expect(await storageOf(user.user.id)).toBe(BigInt(500));
  });
});
