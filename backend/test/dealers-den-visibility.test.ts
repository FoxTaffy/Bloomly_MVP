import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { dealersDenService } from '../src/modules/dealers-den/service.js';

const ADULT = new Date('1990-01-01');

async function makeListing(sellerId: string, over: Record<string, unknown> = {}) {
  return prisma.dealerListing.create({
    data: { seller_id: sellerId, title: 'Test lot', price: 10, currency: 'USD', ...over } as any,
  });
}

describe('dealers den: catalogue visibility', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('анонимный список не отдаёт черновики и архив, даже по явному status', async () => {
    const { user } = await createUser({ is_verified: true, verification_type: 'artist' });
    const active = await makeListing(user.id, { status: 'active' });
    await makeListing(user.id, { status: 'draft' });
    await makeListing(user.id, { status: 'archived' });

    const all = await api('GET', '/api/dealers-den');
    expect(all.json.data.listings.map((l: any) => l.id)).toEqual([active.id]);

    // Asking for a private status falls back to the public default (active only).
    const draft = await api('GET', '/api/dealers-den?status=draft');
    expect(draft.json.data.listings.map((l: any) => l.id)).toEqual([active.id]);
  });

  it('публичная страница продавца показывает active и sold, но не draft', async () => {
    const { user } = await createUser({ is_verified: true, verification_type: 'artist' });
    await makeListing(user.id, { status: 'active' });
    await makeListing(user.id, { status: 'sold' });
    await makeListing(user.id, { status: 'draft' });

    const res = await api('GET', `/api/dealers-den?sellerId=${user.id}`);
    const statuses = res.json.data.listings.map((l: any) => l.status).sort();
    expect(statuses).toEqual(['active', 'sold']);
  });

  it('владелец видит свои черновики в собственном списке', async () => {
    const { user, auth } = await createUser({ is_verified: true, verification_type: 'artist' });
    await makeListing(user.id, { status: 'draft' });

    const res = await api('GET', `/api/dealers-den?sellerId=${user.id}&status=draft`, { headers: auth });
    expect(res.json.data.listings).toHaveLength(1);
  });

  it('чужой черновик по id отдаётся 404, владельцу — 200', async () => {
    const { user, auth } = await createUser({ is_verified: true, verification_type: 'artist' });
    const draft = await makeListing(user.id, { status: 'draft' });

    const anon = await api('GET', `/api/dealers-den/${draft.id}`);
    expect(anon.status).toBe(404);

    const owner = await api('GET', `/api/dealers-den/${draft.id}`, { headers: auth });
    expect(owner.status).toBe(200);
  });

  it('NSFW-лот по id недоступен несовершеннолетнему, взрослому — доступен', async () => {
    const { user } = await createUser({ is_verified: true, verification_type: 'artist' });
    const nsfw = await makeListing(user.id, { is_nsfw: true });

    const anon = await api('GET', `/api/dealers-den/${nsfw.id}`);
    expect(anon.status).toBe(404);

    const { auth: adultAuth } = await createUser({ birth_date: ADULT });
    const adult = await api('GET', `/api/dealers-den/${nsfw.id}`, { headers: adultAuth });
    expect(adult.status).toBe(200);
  });
});

describe('dealers den: tags', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('теги при создании приводятся к нижнему регистру, пробелы и дубли убираются', async () => {
    const { auth } = await createUser({ is_verified: true, verification_type: 'artist' });
    const res = await api('POST', '/api/dealers-den', {
      headers: auth,
      body: { title: 'Lot', price: 5, tags: ['Fursuit', ' fursuit ', 'Art'] },
    });
    expect(res.status).toBe(201);
    expect(res.json.data.listing.tags).toEqual(['fursuit', 'art']);
  });
});

describe('dealers den: auction closing', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('закрывает истёкший аукцион: победитель — максимальная ставка, без ставок — archived', async () => {
    const seller = await createUser({ is_verified: true, verification_type: 'artist' });
    const bidderA = await createUser();
    const bidderB = await createUser();
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3600_000);

    const withBids = await makeListing(seller.user.id, { listing_kind: 'auction', auction_ends_at: past, current_bid: 30, bid_count: 2 });
    await prisma.dealerBid.create({ data: { listing_id: withBids.id, bidder_id: bidderA.user.id, amount: 20 } });
    await prisma.dealerBid.create({ data: { listing_id: withBids.id, bidder_id: bidderB.user.id, amount: 30 } });

    const noBids = await makeListing(seller.user.id, { listing_kind: 'auction', auction_ends_at: past });
    const running = await makeListing(seller.user.id, { listing_kind: 'auction', auction_ends_at: future });

    const closed = await dealersDenService.closeExpiredAuctions();
    expect(closed).toBe(2);

    const a = await prisma.dealerListing.findUnique({ where: { id: withBids.id } });
    expect(a?.status).toBe('sold');
    expect(a?.winner_id).toBe(bidderB.user.id);

    const b = await prisma.dealerListing.findUnique({ where: { id: noBids.id } });
    expect(b?.status).toBe('archived');
    expect(b?.winner_id).toBeNull();

    const c = await prisma.dealerListing.findUnique({ where: { id: running.id } });
    expect(c?.status).toBe('active');
  });

  it('после окончания срока ставка отклоняется', async () => {
    const seller = await createUser({ is_verified: true, verification_type: 'artist' });
    const bidder = await createUser();
    const ended = await makeListing(seller.user.id, { listing_kind: 'auction', auction_ends_at: new Date(Date.now() - 60_000) });

    const res = await api('POST', `/api/dealers-den/${ended.id}/bid`, { headers: bidder.auth, body: { amount: 50 } });
    expect(res.status).toBe(409);
  });
});
