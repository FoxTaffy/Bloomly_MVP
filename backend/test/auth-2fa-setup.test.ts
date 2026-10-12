import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { encryptTotpSecret, decryptTotpSecret } from '../src/lib/totpCrypto.js';

describe('2FA: setup TOTP', () => {
  beforeEach(resetDb);

  it('без активной 2FA setup выдаёт секрет', async () => {
    const { auth } = await createUser();
    const res = await api('POST', '/api/auth/2fa/totp/setup', { headers: auth });
    expect(res.status).toBe(200);
    expect(res.json.data.secret).toBeTruthy();
  });

  it('при активном TOTP setup не перезаписывает секрет (даже с access-токеном)', async () => {
    const original = 'JBSWY3DPEHPK3PXP';
    const { user, auth } = await createUser({
      two_factor_method: 'totp',
      totp_secret: encryptTotpSecret(original),
    });

    const res = await api('POST', '/api/auth/2fa/totp/setup', { headers: auth });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('TOTP_SETUP_ERROR');

    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { totp_secret: true, two_factor_method: true } });
    expect(after?.two_factor_method).toBe('totp');
    expect(decryptTotpSecret(after!.totp_secret!)).toBe(original);
  });

  it('при активной email-2FA setup тоже отклоняется', async () => {
    const { auth } = await createUser({ two_factor_method: 'email' });
    const res = await api('POST', '/api/auth/2fa/totp/setup', { headers: auth });
    expect(res.status).toBe(400);
  });
});
