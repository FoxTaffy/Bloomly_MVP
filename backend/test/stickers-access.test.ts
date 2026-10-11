import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function makePack(authorId: string, over: Record<string, unknown> = {}) {
  return prisma.stickerPack.create({
    data: { author_id: authorId, name: `pack-${randomUUID().slice(0, 6)}`, stickers: [], status: 'published', price: 0, ...over } as any,
  });
}

describe('stickers: доступ к черновикам и платным пакам', () => {
  beforeEach(resetDb);

  it('черновик не читается по UUID ни анонимом, ни чужим пользователем', async () => {
    const author = await createUser();
    const other = await createUser();
    const draft = await makePack(author.user.id, { status: 'draft' });

    expect((await api('GET', `/api/stickers/${draft.id}`)).status).toBe(404);
    expect((await api('GET', `/api/stickers/${draft.id}`, { headers: other.auth })).status).toBe(404);
    expect((await api('GET', `/api/stickers/${draft.id}`, { headers: author.auth })).status).toBe(200);
  });

  it('платный пак нельзя добавить в коллекцию без покупки', async () => {
    const author = await createUser();
    const buyer = await createUser();
    const paid = await makePack(author.user.id, { price: 50 });

    const res = await api('POST', `/api/stickers/${paid.id}/collect`, { headers: buyer.auth });
    expect(res.status).toBe(402);
    expect(await prisma.userStickerPack.count({ where: { pack_id: paid.id } })).toBe(0);
  });

  it('счётчик скачиваний растёт один раз на пользователя', async () => {
    const author = await createUser();
    const buyer = await createUser();
    const free = await makePack(author.user.id);

    await api('POST', `/api/stickers/${free.id}/collect`, { headers: buyer.auth });
    await api('POST', `/api/stickers/${free.id}/collect`, { headers: buyer.auth });
    const after = await prisma.stickerPack.findUnique({ where: { id: free.id }, select: { downloads_count: true } });
    expect(after?.downloads_count).toBe(1);
  });
});
