import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, PASSWORD } from './helpers.js';

const CONSENT = { personalData: true, cookies: true };

describe('ник удалённого аккаунта освобождается, бан и email остаются', () => {
  beforeEach(resetDb);

  it('ник админ-забаненного удалённого аккаунта доступен для регистрации с другой почтой', async () => {
    const { user: old } = await createUser({ email: 'ban_old@test.local', username: 'banned_nick', deleted_at: new Date(), is_banned: true });

    const reg = await api('POST', '/api/auth/register', { body: { username: 'banned_nick', email: 'ban_new@test.local', password: PASSWORD, consent: CONSENT } });
    expect(reg.status).toBe(201);

    const fresh = await prisma.user.findUniqueOrThrow({ where: { username: 'banned_nick' } });
    expect(fresh.email).toBe('ban_new@test.local');

    const renamed = await prisma.user.findUniqueOrThrow({ where: { id: old.id } });
    expect(renamed.username).toContain('banned_nick_del_');
    expect(renamed.is_banned).toBe(true);
    expect(renamed.deleted_at).not.toBeNull();
    expect(renamed.email).toBe('ban_old@test.local');
  });

  it('почта забаненного аккаунта по-прежнему не освобождается, даже если ник освобождён', async () => {
    await createUser({ email: 'ban_mail@test.local', username: 'ban_mail_old', deleted_at: new Date(), is_banned: true });

    const reg = await api('POST', '/api/auth/register', { body: { username: 'ban_mail_new', email: 'ban_mail@test.local', password: PASSWORD, consent: CONSENT } });
    expect(reg.status).toBe(400);
    expect(await prisma.user.count({ where: { username: 'ban_mail_new' } })).toBe(0);
  });

  it('смена ника на ник админ-забаненного удалённого аккаунта проходит', async () => {
    const { user: old } = await createUser({ email: 'upd_old@test.local', username: 'upd_nick', deleted_at: new Date(), is_banned: true });
    const { user: _me, token } = await createUser({ email: 'upd_me@test.local', username: 'upd_me' });

    const res = await api('PATCH', '/api/users/me/username', {
      headers: { authorization: `Bearer ${token}` },
      body: { username: 'upd_nick' },
    });
    expect(res.status).toBe(200);

    const me = await prisma.user.findUniqueOrThrow({ where: { username: 'upd_nick' } });
    expect(me.email).toBe('upd_me@test.local');

    const renamed = await prisma.user.findUniqueOrThrow({ where: { id: old.id } });
    expect(renamed.username).toContain('upd_nick_del_');
    expect(renamed.is_banned).toBe(true);
  });
});
