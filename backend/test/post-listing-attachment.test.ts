import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

async function makeGroup(ownerId: string, over: Record<string, unknown> = {}) {
  const group = await prisma.group.create({
    data: { owner_id: ownerId, name: 'Мастерская', slug: `qa-${randomUUID()}`, type: 'creative', den_enabled: true, ...over } as any,
  });
  await prisma.groupMember.create({ data: { group_id: group.id, user_id: ownerId, role: 'owner' } });
  return group;
}

async function makeListing(sellerId: string, groupId: string | null, over: Record<string, unknown> = {}) {
  return prisma.dealerListing.create({
    data: { seller_id: sellerId, group_id: groupId, title: 'Арт на заказ', price: 25, currency: 'USD', images: ['https://cdn.test/a.png'], ...over } as any,
  });
}

const post = (groupId: string, auth: Record<string, string>, body: Record<string, unknown>) =>
  api('POST', `/api/groups/${groupId}/posts`, { headers: auth, body: { content: 'Готово!', postType: 'commission_update', ...body } });

describe('group post: прикреплённый лот Dealers\' Den', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('прикрепляет активный лот своей группы и отдаёт превью без лишних полей', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const listing = await makeListing(owner.user.id, group.id);

    const res = await post(group.id, owner.auth, { listingId: listing.id });
    expect(res.status).toBe(201);
    const created = res.json.data.post;
    expect(created.listing).toMatchObject({ id: listing.id, title: 'Арт на заказ', status: 'active', listing_kind: 'fixed' });
    expect(created.listing.images).toEqual(['https://cdn.test/a.png']);
    expect(created.listing).not.toHaveProperty('description');
    expect(created.listing).not.toHaveProperty('seller_id');
    expect(created.listing).not.toHaveProperty('deleted_at');
  });

  it('лот отдаётся в ленте группы', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const listing = await makeListing(owner.user.id, group.id);
    await post(group.id, owner.auth, { listingId: listing.id });

    const feed = await api('GET', `/api/groups/${group.id}/posts`, { headers: owner.auth });
    expect(feed.status).toBe(200);
    const rows = feed.json.data.posts ?? feed.json.data;
    const p = (rows[0].post ?? rows[0]);
    expect(p.listing?.id).toBe(listing.id);
  });

  it('пост без лота работает как раньше (listing = null)', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const res = await post(group.id, owner.auth, {});
    expect(res.status).toBe(201);
    expect(res.json.data.post.listing).toBeNull();
  });

  it('отклоняет лот чужой группы', async () => {
    const owner = await createUser();
    const other = await createUser();
    const group = await makeGroup(owner.user.id);
    const otherGroup = await makeGroup(other.user.id);
    const foreign = await makeListing(other.user.id, otherGroup.id);

    const res = await post(group.id, owner.auth, { listingId: foreign.id });
    expect(res.status).toBe(422);
    expect(await prisma.post.count()).toBe(0);
  });

  it('отклоняет лот без группы, черновик, проданный, удалённый и несуществующий', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const bad = [
      await makeListing(owner.user.id, null),
      await makeListing(owner.user.id, group.id, { status: 'draft' }),
      await makeListing(owner.user.id, group.id, { status: 'sold' }),
      await makeListing(owner.user.id, group.id, { deleted_at: new Date() }),
    ].map((l) => l.id);
    for (const listingId of [...bad, randomUUID(), 'не-uuid']) {
      const res = await post(group.id, owner.auth, { listingId });
      expect(res.status, String(listingId)).toBe(422);
    }
    expect(await prisma.post.count()).toBe(0);
  });

  it('отклоняет лот, если у группы не подключён Dealers\' Den', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id, { den_enabled: false });
    const listing = await makeListing(owner.user.id, group.id);
    expect((await post(group.id, owner.auth, { listingId: listing.id })).status).toBe(422);
  });

  it('участник без права публикации не прикрепляет лот', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const listing = await makeListing(owner.user.id, group.id);
    const stranger = await createUser();
    const res = await post(group.id, stranger.auth, { listingId: listing.id });
    expect([401, 403]).toContain(res.status);
  });

  it('после снятия лота с публикации карточка пропадает из ленты, пост остаётся', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const listing = await makeListing(owner.user.id, group.id);
    const created = (await post(group.id, owner.auth, { listingId: listing.id })).json.data.post;

    await prisma.dealerListing.update({ where: { id: listing.id }, data: { status: 'draft' } });
    const viewer = await createUser();
    const single = await api('GET', `/api/posts/${created.id}`, { headers: viewer.auth });
    expect(single.status).toBe(200);
    expect(single.json.data.post.listing).toBeNull();

    // проданный лот остаётся видимым — карточка показывает «Продано»
    await prisma.dealerListing.update({ where: { id: listing.id }, data: { status: 'sold' } });
    const sold = await api('GET', `/api/posts/${created.id}`, { headers: viewer.auth });
    expect(sold.json.data.post.listing).toMatchObject({ id: listing.id, status: 'sold' });
  });

  it('автор может открепить лот при редактировании', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const listing = await makeListing(owner.user.id, group.id);
    const created = (await post(group.id, owner.auth, { listingId: listing.id })).json.data.post;

    const edit = await api('PATCH', `/api/posts/${created.id}`, { headers: owner.auth, body: { listingId: null } });
    expect(edit.status).toBe(200);
    expect(edit.json.data.post.listing).toBeNull();
    expect((await prisma.post.findUniqueOrThrow({ where: { id: created.id } })).listing_id).toBeNull();
  });

  it('при правке нельзя подставить чужой лот', async () => {
    const owner = await createUser();
    const other = await createUser();
    const group = await makeGroup(owner.user.id);
    const otherGroup = await makeGroup(other.user.id);
    const foreign = await makeListing(other.user.id, otherGroup.id);
    const created = (await post(group.id, owner.auth, {})).json.data.post;

    const edit = await api('PATCH', `/api/posts/${created.id}`, { headers: owner.auth, body: { listingId: foreign.id } });
    expect(edit.status).toBe(422);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: created.id } })).listing_id).toBeNull();
  });
});
