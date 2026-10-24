import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function fund(userId: string, amount: number) {
  await prisma.wallet.upsert({ where: { user_id: userId }, create: { user_id: userId, balance: amount }, update: { balance: amount } });
}
const balance = async (userId: string) => Number((await prisma.wallet.findUniqueOrThrow({ where: { user_id: userId } })).balance);

describe('магазин: покупки и каталог', () => {
  beforeEach(resetDb);

  it('каталог отдаёт owned залогиненному и прячет тело платного товара от чужих', async () => {
    const buyer = await createUser();
    const item = await prisma.shopItem.create({ data: { type: 'theme', name: 'Neon', price: 5, content_data: { css: 'secret' } } });
    const guest = await api('GET', '/api/shop/items');
    expect(guest.json.data.items[0].content_data).toEqual({});
    expect(guest.json.data.items[0].deleted_at).toBeUndefined();

    await fund(buyer.user.id, 10);
    expect((await api('POST', `/api/shop/items/${item.id}/purchase`, { headers: buyer.auth })).status).toBe(200);
    const mine = await api('GET', '/api/shop/items', { headers: buyer.auth });
    expect(mine.json.data.items[0].owned).toBe(true);
    expect(mine.json.data.items[0].content_data).toEqual({ css: 'secret' });
    expect(await balance(buyer.user.id)).toBe(5);
  });

  it('повторная покупка — 409 без второго списания', async () => {
    const buyer = await createUser();
    const item = await prisma.shopItem.create({ data: { type: 'theme', name: 'Neon', price: 5 } });
    await fund(buyer.user.id, 10);
    await api('POST', `/api/shop/items/${item.id}/purchase`, { headers: buyer.auth });
    const again = await api('POST', `/api/shop/items/${item.id}/purchase`, { headers: buyer.auth });
    expect(again.status).toBe(409);
    expect(await balance(buyer.user.id)).toBe(5);
  });

  it('платная рамка списывает BLM у покупателя и зачисляет автору; без денег — 402', async () => {
    const author = await createUser();
    const buyer = await createUser();
    const frame = await prisma.avatarFrame.create({
      data: { creator_id: author.user.id, name: 'Gold', image_url: '/x.png', price: 3, status: 'approved' },
    });
    const poor = await api('POST', `/api/avatar-frames/${frame.id}/claim`, { headers: buyer.auth });
    expect(poor.status).toBe(402);
    expect(await prisma.userAvatarFrame.count()).toBe(0);

    await fund(buyer.user.id, 5);
    const ok = await api('POST', `/api/avatar-frames/${frame.id}/claim`, { headers: buyer.auth });
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
    expect(await balance(buyer.user.id)).toBe(2);
    expect(await balance(author.user.id)).toBe(3);
  });
});
