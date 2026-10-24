import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const BASE = '/api/dealers-den';
const lot = (sellerId: string, over: Record<string, unknown> = {}) =>
  prisma.dealerListing.create({ data: { seller_id: sellerId, title: 'Lot', price: 5, ...over } as any });

describe('dealers den: защита побочных ручек и споров', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('черновик и 18+ лот закрыты для ставок, комментариев и избранного у посторонних', async () => {
    const seller = await createUser();
    const guest = await createUser();
    const draft = await lot(seller.user.id, { status: 'draft' });
    const nsfw = await lot(seller.user.id, { is_nsfw: true });

    for (const l of [draft, nsfw]) {
      expect((await api('GET', `${BASE}/${l.id}/comments`, { headers: guest.auth })).status).toBe(404);
      expect((await api('GET', `${BASE}/${l.id}/bids`, { headers: guest.auth })).status).toBe(404);
      expect((await api('POST', `${BASE}/${l.id}/wishlist`, { headers: guest.auth })).status).toBe(404);
      expect((await api('POST', `${BASE}/${l.id}/comments`, { headers: guest.auth, body: { body: 'hi' } })).status).toBe(404);
    }
    expect((await api('GET', `${BASE}/${draft.id}/comments`, { headers: seller.auth })).status).toBe(200);
  });

  it('ответ на комментарий другого лота отклоняется; продавец удаляет чужой комментарий под своим лотом', async () => {
    const seller = await createUser();
    const author = await createUser();
    const a = await lot(seller.user.id);
    const b = await lot(seller.user.id);
    const c = await api('POST', `${BASE}/${a.id}/comments`, { headers: author.auth, body: { body: 'first' } });
    expect(c.status).toBe(201);
    const cross = await api('POST', `${BASE}/${b.id}/comments`, { headers: author.auth, body: { body: 'x', parentId: c.json.data.comment.id } });
    expect(cross.status).toBe(404);
    const del = await api('DELETE', `${BASE}/comments/${c.json.data.comment.id}`, { headers: seller.auth });
    expect(del.status).toBe(200);
  });

  it('отзыв: только опознанный покупатель, один на лот; спор — тоже только покупатель', async () => {
    const seller = await createUser();
    const stranger = await createUser();
    const buyer = await createUser();
    const fixed = await lot(seller.user.id, { status: 'sold' });

    expect((await api('POST', `${BASE}/${fixed.id}/review`, { headers: stranger.auth, body: { rating: 1 } })).status).toBe(403);
    expect((await api('POST', `${BASE}/${fixed.id}/dispute`, { headers: stranger.auth, body: { reason: 'мошенник, не отправил' } })).status).toBe(403);

    // Принятая заявка делает человека опознанным покупателем фиксированного лота
    const group = await prisma.group.create({ data: { owner_id: seller.user.id, name: 'G', slug: `g-${seller.user.id.slice(0, 8)}`, type: 'creative', den_enabled: true } });
    await prisma.listingApplication.create({ data: { listing_id: fixed.id, group_id: group.id, applicant_id: buyer.user.id, message: 'хочу', status: 'accepted' } });

    expect((await api('POST', `${BASE}/${fixed.id}/review`, { headers: buyer.auth, body: { rating: 4.5 } })).status).toBe(422);
    expect((await api('POST', `${BASE}/${fixed.id}/review`, { headers: buyer.auth, body: { rating: 5, text: 'ok' } })).status).toBe(201);
    expect((await api('POST', `${BASE}/${fixed.id}/review`, { headers: buyer.auth, body: { rating: 5 } })).status).toBe(409);
    expect((await api('POST', `${BASE}/${fixed.id}/dispute`, { headers: buyer.auth, body: { reason: 'коротко' } })).status).toBe(422);
  });

  it('очередь комиссий: нельзя занять место у себя и дважды; обязательные поля анкеты', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const q = await lot(seller.user.id, {
      listing_kind: 'commission_queue', commission_slots_total: 3,
      commission_form_fields: [{ label: 'Идея', required: true, type: 'text' }],
    });
    expect((await api('POST', `${BASE}/${q.id}/booking`, { headers: seller.auth, body: {} })).status).toBe(403);
    expect((await api('POST', `${BASE}/${q.id}/booking`, { headers: buyer.auth, body: { formData: {} } })).status).toBe(422);
    const ok = await api('POST', `${BASE}/${q.id}/booking`, { headers: buyer.auth, body: { formData: { 'Идея': 'лиса', junk: 'x'.repeat(5000) } } });
    expect(ok.status).toBe(201);
    expect(ok.json.data.booking.form_data).toEqual({ 'Идея': 'лиса' });
    expect((await api('POST', `${BASE}/${q.id}/booking`, { headers: buyer.auth, body: { formData: { 'Идея': 'ещё' } } })).status).toBe(409);
    expect((await api('PATCH', `${BASE}/bookings/${ok.json.data.booking.id}`, { headers: seller.auth, body: { status: 'bogus' } })).status).toBe(422);
  });

  it('аукцион: ставка в последние минуты продлевает торги, продавец не может «продать» его вручную', async () => {
    const seller = await createUser();
    const bidder = await createUser();
    const ends = new Date(Date.now() + 60_000);
    const a = await lot(seller.user.id, { listing_kind: 'auction', auction_ends_at: ends });
    const bid = await api('POST', `${BASE}/${a.id}/bid`, { headers: bidder.auth, body: { amount: 6 } });
    expect(bid.status).toBe(201);
    expect(new Date(bid.json.data.listing.auction_ends_at).getTime()).toBeGreaterThan(ends.getTime() + 60_000);
    expect((await api('POST', `${BASE}/${a.id}/bid`, { headers: bidder.auth, body: { amount: Number.MAX_VALUE } })).status).toBe(422);

    const sold = await api('PATCH', `${BASE}/${a.id}`, { headers: seller.auth, body: { status: 'sold' } });
    expect(sold.status).toBe(409);
    expect((await api('PATCH', `${BASE}/${a.id}`, { headers: seller.auth, body: { price: 1 } })).status).toBe(409);
  });

  it('ярмарка: чужой лот не подставить, смена лота после одобрения возвращает на рассмотрение', async () => {
    const seller = await createUser({ is_verified: true });
    const other = await createUser();
    const mine = await lot(seller.user.id);
    const mine2 = await lot(seller.user.id);
    const foreign = await lot(other.user.id);
    const fair = await prisma.denFair.create({ data: { title: 'F', starts_at: new Date(Date.now() - 1000), ends_at: new Date(Date.now() + 86_400_000), status: 'open' } });

    expect((await api('POST', `${BASE}/fairs/${fair.id}/apply`, { headers: seller.auth, body: { listingId: foreign.id } })).status).toBe(422);
    expect((await api('POST', `${BASE}/fairs/${fair.id}/apply`, { headers: other.auth, body: {} })).status).toBe(403);
    expect((await api('POST', `${BASE}/fairs/${fair.id}/apply`, { headers: seller.auth, body: { listingId: mine.id } })).status).toBe(201);
    await prisma.denFairParticipant.updateMany({ where: { fair_id: fair.id }, data: { status: 'approved' } });
    const swap = await api('POST', `${BASE}/fairs/${fair.id}/apply`, { headers: seller.auth, body: { listingId: mine2.id } });
    expect(swap.json.data.participant.status).toBe('pending');
  });
});
