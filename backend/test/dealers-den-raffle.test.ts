import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { dealersDenService } from '../src/modules/dealers-den/service.js';

const ADULT = new Date('1990-01-01');
const future = () => new Date(Date.now() + 3600_000).toISOString();

async function makeRaffle(sellerId: string, over: Record<string, unknown> = {}) {
  return prisma.dealerListing.create({
    data: { seller_id: sellerId, title: 'Raffle', price: 5, listing_kind: 'raffle', ...over } as any,
  });
}

/** Продавец Dealers Den: верифицированный владелец группы с подключённым Dealers Den (лоты создаются от имени группы). */
async function seller() {
  const u = await createUser({ is_verified: true, verification_type: 'artist' });
  const group = await prisma.group.create({
    data: { owner_id: u.user.id, name: 'Shop', slug: `g-${u.user.id.slice(0, 8)}`, type: 'creative', den_enabled: true, den_agreed_at: new Date() },
  });
  return { ...u, group };
}
const createLot = (s: Awaited<ReturnType<typeof seller>>, body: Record<string, unknown>) =>
  api('POST', '/api/dealers-den', { headers: s.auth, body: { groupId: s.group.id, ...body } });

describe('dealers den: raffle tickets and draw', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('покупка пишет билет и увеличивает счётчик; свой розыгрыш купить нельзя', async () => {
    const s = await seller();
    const buyer = await createUser();
    const r = await makeRaffle(s.user.id);

    const ok = await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: buyer.auth });
    expect(ok.status).toBe(200);
    expect(await prisma.denRaffleTicket.count({ where: { listing_id: r.id } })).toBe(1);
    expect(ok.json.data.listing.raffle_tickets_sold).toBe(1);

    const own = await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: s.auth });
    expect(own.status).toBe(403);
    expect(await prisma.denRaffleTicket.count({ where: { listing_id: r.id } })).toBe(1);
  });

  it('продавец проводит розыгрыш вручную: победитель — владелец одного из билетов', async () => {
    const s = await seller();
    const buyer = await createUser();
    const r = await makeRaffle(s.user.id);
    await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: buyer.auth });

    const stranger = await api('POST', `/api/dealers-den/${r.id}/draw`, { headers: buyer.auth });
    expect(stranger.status).toBe(403);

    const drawn = await api('POST', `/api/dealers-den/${r.id}/draw`, { headers: s.auth });
    expect(drawn.status).toBe(200);
    expect(drawn.json.data.listing.winner_id).toBe(buyer.user.id);
    expect(drawn.json.data.listing.status).toBe('sold');

    const again = await api('POST', `/api/dealers-den/${r.id}/draw`, { headers: s.auth });
    expect(again.status).toBe(409);
  });

  it('без билетов розыгрыш не проводится', async () => {
    const s = await seller();
    const r = await makeRaffle(s.user.id);
    const res = await api('POST', `/api/dealers-den/${r.id}/draw`, { headers: s.auth });
    expect(res.status).toBe(409);
  });

  it('когда последний билет продан, победитель выбирается сразу', async () => {
    const s = await seller();
    const a = await createUser();
    const b = await createUser();
    const r = await makeRaffle(s.user.id, { raffle_max_tickets: 2 });

    await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: a.auth });
    const last = await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: b.auth });
    expect(last.status).toBe(200);

    const after = await prisma.dealerListing.findUnique({ where: { id: r.id } });
    expect(after?.status).toBe('sold');
    expect([a.user.id, b.user.id]).toContain(after?.winner_id);
    expect(await prisma.denRaffleTicket.count({ where: { listing_id: r.id } })).toBe(2);
  });

  it('один билет на человека: повторная покупка отклоняется, счётчик не растёт', async () => {
    const s = await seller();
    const buyer = await createUser();
    const r = await makeRaffle(s.user.id, { raffle_max_tickets: 5 });
    await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: buyer.auth });
    const again = await api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: buyer.auth });
    expect(again.status).toBe(409);

    expect(await prisma.denRaffleTicket.count({ where: { listing_id: r.id } })).toBe(1);
    const after = await prisma.dealerListing.findUnique({ where: { id: r.id } });
    expect(after?.raffle_tickets_sold).toBe(1);

    const res = await api('GET', `/api/dealers-den/${r.id}`, { headers: buyer.auth });
    expect(res.json.data.listing.my_raffle_tickets).toBe(1);
  });

  it('параллельные покупки одним человеком дают ровно один билет', async () => {
    const s = await seller();
    const buyer = await createUser();
    const r = await makeRaffle(s.user.id, { raffle_max_tickets: 5 });
    const results = await Promise.all([1, 2, 3].map(() =>
      api('POST', `/api/dealers-den/${r.id}/ticket`, { headers: buyer.auth })));
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(await prisma.denRaffleTicket.count({ where: { listing_id: r.id } })).toBe(1);
  });
});

describe('dealers den: input validation', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('аукцион без даты окончания отклоняется', async () => {
    const s = await seller();
    const res = await createLot(s, { title: 'A', price: 5, listingKind: 'auction' });
    expect(res.status).toBe(400);
  });

  it('очередь комиссий без слотов отклоняется, с слотами — создаётся', async () => {
    const s = await seller();
    const bad = await createLot(s, { title: 'C', price: 20, listingKind: 'commission_queue' });
    expect(bad.status).toBe(400);

    const ok = await createLot(s, {
      title: 'C', price: 20, listingKind: 'commission_queue', commissionSlotsTotal: 3,
      commissionFormFields: [{ label: 'Reference', required: true, type: 'text' }],
    });
    expect(ok.status).toBe(201);
  });

  it('пустое название, неизвестная категория и пустая цена дают 400, а не 500', async () => {
    const s = await seller();
    for (const body of [
      { title: '   ', price: 5 },
      { title: 'A', price: 5, category: 'weapons' },
      { title: 'A', price: '' },
      { title: 'A', price: 5, listingKind: 'lottery' },
    ]) {
      const res = await createLot(s, body);
      expect(res.status).toBe(400);
    }
  });

  it('некорректный id листинга даёт 404, а не 500', async () => {
    const res = await api('GET', '/api/dealers-den/not-a-uuid');
    expect(res.status).toBe(404);
  });

  it('у продавца нельзя поставить срок аукциона в прошлое при редактировании', async () => {
    const s = await seller();
    const created = await createLot(s, { title: 'A', price: 5, listingKind: 'auction', auctionEndsAt: future() });
    const res = await api('PATCH', `/api/dealers-den/${created.json.data.listing.id}`, {
      headers: s.auth, body: { auctionEndsAt: new Date(Date.now() - 1000).toISOString() },
    });
    expect(res.status).toBe(400);
  });
});

describe('dealers den: tag cloud and auctions', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('теги NSFW-лотов не видны несовершеннолетним и видны взрослым', async () => {
    const s = await seller();
    await prisma.dealerListing.create({
      data: { seller_id: s.user.id, title: 'x', price: 1, is_nsfw: true, tags: ['adultonly'] } as any,
    });
    await prisma.dealerListing.create({
      data: { seller_id: s.user.id, title: 'y', price: 1, tags: ['safe'] } as any,
    });

    const anon = await api('GET', '/api/dealers-den/tags/trending');
    expect(anon.json.data.tags.map((t: any) => t.tag)).toEqual(['safe']);

    const adult = await createUser({ birth_date: ADULT });
    const res = await api('GET', '/api/dealers-den/tags/trending', { headers: adult.auth });
    expect(res.json.data.tags.map((t: any) => t.tag).sort()).toEqual(['adultonly', 'safe']);
  });

  it('истёкший YCH закрывается победителем, уведомление получает победитель', async () => {
    const s = await seller();
    const bidder = await createUser();
    const ych = await prisma.dealerListing.create({
      data: { seller_id: s.user.id, title: 'YCH', price: 10, listing_kind: 'ych', auction_ends_at: new Date(Date.now() - 60_000) } as any,
    });
    await prisma.dealerBid.create({ data: { listing_id: ych.id, bidder_id: bidder.user.id, amount: 15 } });

    expect(await dealersDenService.closeExpiredAuctions()).toBe(1);
    const after = await prisma.dealerListing.findUnique({ where: { id: ych.id } });
    expect(after?.status).toBe('sold');
    expect(after?.winner_id).toBe(bidder.user.id);

    const note = await prisma.notification.findFirst({ where: { receiver_id: bidder.user.id, type: 'den_auction_won' } });
    expect(note).not.toBeNull();
  });
});
