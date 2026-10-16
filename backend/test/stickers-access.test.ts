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

  it('«свой» пак и пак по приглашению не видны посторонним и не попадают в каталог', async () => {
    const author = await createUser();
    const other = await createUser();
    const own = await makePack(author.user.id, { visibility: 'own' });
    const invite = await makePack(author.user.id, { visibility: 'invite', invite_code: 'secret-code' });

    for (const p of [own, invite]) {
      expect((await api('GET', `/api/stickers/${p.id}`, { headers: other.auth })).status).toBe(404);
      expect((await api('GET', `/api/stickers/${p.id}`, { headers: author.auth })).status).toBe(200);
    }
    const catalog = await api('GET', '/api/stickers', { headers: other.auth });
    expect(catalog.json.data.packs.map((p: any) => p.id)).not.toContain(own.id);
    expect(catalog.json.data.packs.map((p: any) => p.id)).not.toContain(invite.id);
    expect((await api('POST', `/api/stickers/${own.id}/collect`, { headers: other.auth })).status).toBe(404);
  });

  it('по коду приглашения пак добавляется, а код скрыт от не-авторов', async () => {
    const author = await createUser();
    const guest = await createUser();
    const invite = await makePack(author.user.id, { visibility: 'invite', invite_code: 'abc123' });

    expect((await api('POST', '/api/stickers/invite/wrong/join', { headers: guest.auth })).status).toBe(404);
    expect((await api('POST', '/api/stickers/invite/abc123/join', { headers: guest.auth })).status).toBe(200);
    expect(await prisma.userStickerPack.count({ where: { pack_id: invite.id, user_id: guest.user.id } })).toBe(1);

    const asGuest = await api('GET', `/api/stickers/${invite.id}`, { headers: guest.auth });
    expect(asGuest.status).toBe(200);
    expect(asGuest.json.data.pack.invite_code).toBeNull();
  });

  it('платный пак создаёт только Business', async () => {
    const free = await createUser();
    const biz = await createUser();
    await prisma.user.update({ where: { id: biz.user.id }, data: { subscription_tier: 'business' } });
    const body = { name: 'paid', visibility: 'paid', price: 100, stickers: [] };

    expect((await api('POST', '/api/stickers', { headers: free.auth, body })).status).toBe(402);
    expect((await api('POST', '/api/stickers', { headers: biz.auth, body })).status).toBe(201);
  });

  it('покупка платного пака списывает баланс и зачисляет автору', async () => {
    const author = await createUser();
    const buyer = await createUser();
    const paid = await makePack(author.user.id, { visibility: 'paid', price: 50 });

    expect((await api('POST', `/api/stickers/${paid.id}/purchase`, { headers: buyer.auth })).status).toBe(402);
    await prisma.wallet.upsert({ where: { user_id: buyer.user.id }, create: { user_id: buyer.user.id, balance: 80 }, update: { balance: 80 } });
    expect((await api('POST', `/api/stickers/${paid.id}/purchase`, { headers: buyer.auth })).status).toBe(200);
    expect(Number((await prisma.wallet.findUnique({ where: { user_id: buyer.user.id } }))!.balance)).toBe(30);
    expect(Number((await prisma.wallet.findUnique({ where: { user_id: author.user.id } }))!.balance)).toBe(50);
  });
});
