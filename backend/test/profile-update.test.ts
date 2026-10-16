import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { mediaUrlForKey } from '../src/modules/media/service.js';

async function ownedFile(ownerId: string, folder = 'avatars') {
  const key = `${folder}/${randomUUID()}.webp`;
  await prisma.mediaObject.create({ data: { object_key: key, owner_id: ownerId, folder, size_bytes: BigInt(10) } });
  return mediaUrlForKey(key);
}

describe('обновление профиля', () => {
  beforeEach(resetDb);
  const patch = (auth: Record<string, string>, body: Record<string, unknown>) => api('PATCH', '/api/users/me', { headers: auth, body });

  it('архивирует прежний аватар, не принимает чужой файл', async () => {
    const me = await createUser();
    const other = await createUser();
    const first = await ownedFile(me.user.id);
    const second = await ownedFile(me.user.id);
    expect((await patch(me.auth, { avatar_url: first })).status).toBe(200);
    expect((await patch(me.auth, { avatar_url: second })).status).toBe(200);
    const history = await prisma.mediaHistory.findMany({ where: { user_id: me.user.id } });
    expect(history.map((h) => [h.type, h.url])).toEqual([['avatar', first]]);
    expect((await patch(me.auth, { avatar_url: await ownedFile(other.user.id) })).status).toBe(403);
  });

  it('даты, тарифные ограничения и чистка текста', async () => {
    const free = await createUser();
    expect((await patch(free.auth, { profile_theme: 'violet' })).status).toBe(402);
    expect((await patch(free.auth, { profile_theme: 'default' })).status).toBe(200);
    expect((await patch(free.auth, { artist_since: '2999-01-01' })).status).not.toBe(200);

    const ok = await patch(free.auth, { birth_date: '2000-05-06', artist_since: '2015-01-01', display_name: 'A​nna' });
    expect(ok.status).toBe(200);
    const row = await prisma.user.findUnique({ where: { id: free.user.id } });
    expect(row?.birth_date?.toISOString()).toBe('2000-05-06T00:00:00.000Z');
    expect(row?.artist_since?.toISOString()).toBe('2015-01-01T00:00:00.000Z');
    expect(row?.display_name).toBe('Anna');

    const pro = await createUser({ subscription_tier: 'pro', is_verified: true });
    expect((await patch(pro.auth, { profile_frame: 'gold' })).status).toBe(200);
    expect((await patch(pro.auth, { artist_since: '2010-01-01' })).status).not.toBe(200);
  });
});
