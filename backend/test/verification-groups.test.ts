import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { api, createUser, prisma, resetDb } from './helpers.js';
import { ROLE_GROUPS, canCreateGroup } from '../src/lib/verificationPolicy.js';
import { adminReviewRequest } from '../src/modules/verification/service.js';

describe('ручная верификация и тематические группы', () => {
  beforeEach(resetDb);

  it('матрица фронтенда и API совпадает, общие группы остаются открыты', () => {
    const backend = readFileSync(new URL('../src/lib/verificationPolicy.ts', import.meta.url), 'utf8');
    const frontend = readFileSync(new URL('../../frontend/src/lib/verificationPolicy.ts', import.meta.url), 'utf8');
    expect(frontend.replace(/\r\n/g, '\n')).toBe(backend.replace(/\r\n/g, '\n'));
    for (const [role, groups] of Object.entries(ROLE_GROUPS)) {
      for (const type of ['creative', 'event', 'shop', 'news', 'brand']) {
        expect(canCreateGroup({ is_verified: true, verification_type: role }, type)).toBe(groups.includes(type));
        expect(canCreateGroup({ is_verified: false, verification_type: role }, type)).toBe(false);
      }
    }
    expect(canCreateGroup(null, 'community')).toBe(true);
    expect(canCreateGroup(null, 'static')).toBe(true);
    expect(canCreateGroup({ is_verified: true, verification_type: 'artist' }, 'unknown')).toBe(false);
  });

  it('нельзя обойти проверку роли прямым запросом API', async () => {
    const owner = await createUser({ verification_type: 'artist', is_verified: false });
    const create = (type: string) => api('POST', '/api/groups', { headers: owner.auth, body: { name: 'Test', slug: `test-${type}`, type } });
    expect((await create('creative')).status).toBe(403);
    expect((await create('community')).status).toBe(201);
    expect((await create('static')).status).toBe(201);
    await prisma.user.update({ where: { id: owner.user.id }, data: { is_verified: true } });
    expect((await create('creative')).status).toBe(201);
    expect((await create('shop')).status).toBe(201);
    expect((await create('event')).status).toBe(403);
  });

  it('цены магазина и творческой группы сохраняются, очищаются и видны в публичном ответе', async () => {
    const owner = await createUser({ is_verified: true, verification_type: 'artist' });
    const stranger = await createUser();
    for (const type of ['creative', 'shop']) {
      const created = await api('POST', '/api/groups', { headers: owner.auth, body: { name: type, slug: `prices-${type}`, type } });
      expect(created.status).toBe(201);
      const id = created.json.data.group.id;
      const body = { currency: 'USD', priceList: [{ name: ' Portrait ', price: 125.5, description: 'Layers included' }] };
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: stranger.auth, body })).status).toBe(403);
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: owner.auth, body })).status).toBe(200);
      const publicGroup = await api('GET', `/api/groups/${id}`);
      expect(publicGroup.json.data.group.commissionInfo).toMatchObject({ currency: 'USD', price_list: [{ name: 'Portrait', price: 125.5, description: 'Layers included' }] });
      const invalid = { priceList: [{ name: 'Bad', price: -10 }] };
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: owner.auth, body: invalid })).status).toBe(400);
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: owner.auth, body: { basePrices: { headshot: -1 } } })).status).toBe(400);
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: owner.auth, body: { currency: 'invalid' } })).status).toBe(400);
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: owner.auth, body: { basePrices: { headshot: 50 } } })).status).toBe(200);
      expect((await api('GET', `/api/groups/${id}`)).json.data.group.commissionInfo.base_prices).toEqual({ headshot: 50 });
      expect((await api('PUT', `/api/groups/${id}/commission`, { headers: owner.auth, body: { priceList: [] } })).status).toBe(200);
      expect((await api('GET', `/api/groups/${id}`)).json.data.group.commissionInfo.price_list).toEqual([]);
    }
  });

  it('заявка ожидает решения человека, одобрение открывает только выбранные типы', async () => {
    const user = await createUser({ avatar_url: 'https://test.local/avatar.png', bio: 'Photographer', fursona_name: 'Fox', persona: 'fox', fursona_gender: 'other', fursona_description: 'Description' });
    const moderator = await createUser({ role: 'moderator' });
    const submitted = await api('POST', '/api/verification/request', { headers: user.auth, body: { verificationType: 'photographer', evidenceText: 'Portfolio ownership and RAW files are attached for a human reviewer.' } });
    expect(submitted.status).toBe(200);
    expect(submitted.json.data.autoApproved).toBe(false);
    expect(submitted.json.data.request.status).toBe('pending');
    const id = submitted.json.data.request.id;
    expect((await api('PATCH', `/api/verification/admin/requests/${id}`, { headers: user.auth, body: { action: 'approve' } })).status).toBe(403);
    expect((await api('PATCH', `/api/verification/admin/requests/${id}`, { headers: moderator.auth, body: { action: 'approve' } })).status).toBe(200);
    const status = await api('GET', '/api/verification/status', { headers: user.auth });
    expect(status.json.data).toMatchObject({ isVerified: true, verificationType: 'photographer' });
    expect(status.json.data.verifiedAt).toBeTruthy();
    expect((await api('POST', '/api/groups', { headers: user.auth, body: { name: 'Photo', slug: 'photo', type: 'creative' } })).status).toBe(201);
    expect((await api('POST', '/api/groups', { headers: user.auth, body: { name: 'Event', slug: 'event', type: 'event' } })).status).toBe(403);
  });

  it('два модератора не могут принять противоречащие решения', async () => {
    const user = await createUser();
    const moderator = await createUser({ role: 'moderator' });
    const request = await prisma.verificationRequest.create({ data: { user_id: user.user.id, verification_type: 'artist', badge_type: 'artist' } });
    const results = await Promise.allSettled([
      adminReviewRequest(request.id, 'approve', moderator.user.id),
      adminReviewRequest(request.id, 'reject', moderator.user.id, 'Review'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const saved = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: request.id } });
    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.user.id } });
    expect(account.is_verified).toBe(saved.status === 'approved');
  });

  it('доступ продавца: верифицированный владелец магазина, без доступа обычному участнику и замороженному', async () => {
    const owner = await createUser({ is_verified: true, verification_type: 'fursuiter' });
    const member = await createUser({ is_verified: true, verification_type: 'photographer' });
    const created = await api('POST', '/api/groups', { headers: owner.auth, body: { name: 'Shop', slug: 'shop', type: 'shop' } });
    const groupId = created.json.data.group.id;
    await prisma.groupMember.create({ data: { group_id: groupId, user_id: member.user.id, role: 'admin' } });
    expect((await api('GET', '/api/dealers-den/eligibility', { headers: owner.auth })).json.data.canSell).toBe(true);
    expect((await api('GET', '/api/dealers-den/eligibility', { headers: member.auth })).json.data.canSell).toBe(false);
    const body = { title: 'Handmade', description: 'Craft', price: 100, category: 'craft', type: 'physical', listingKind: 'fixed', images: [] };
    expect((await api('POST', '/api/dealers-den', { headers: owner.auth, body })).status).toBe(201);
    expect((await api('POST', '/api/dealers-den', { headers: member.auth, body })).status).toBe(403);
    await prisma.user.update({ where: { id: owner.user.id }, data: { den_frozen: true } });
    expect((await api('POST', '/api/dealers-den', { headers: owner.auth, body })).status).toBe(403);
    await prisma.user.update({ where: { id: owner.user.id }, data: { den_frozen: false, is_verified: false } });
    expect((await api('GET', '/api/dealers-den/eligibility', { headers: owner.auth })).json.data.canSell).toBe(false);
  });
});
