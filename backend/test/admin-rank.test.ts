import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

describe('admin: модератор не действует на того, кто выше по рангу', () => {
  beforeEach(resetDb);

  it('модератор не снимает заморозку, наложенную на админа', async () => {
    const mod = await createUser({ role: 'moderator' });
    const admin = await createUser({ role: 'admin', frozen_at: new Date(), frozen_reason: 'тест' });

    const res = await api('POST', `/api/admin/users/${admin.user.id}/unfreeze`, { headers: mod.auth });
    expect(res.status).toBe(403);
    const after = await prisma.user.findUnique({ where: { id: admin.user.id }, select: { frozen_at: true } });
    expect(after?.frozen_at).not.toBeNull();
  });

  it('модератор не отмечает владельца как умершего', async () => {
    const mod = await createUser({ role: 'moderator' });
    const owner = await createUser({ role: 'owner' });

    const res = await api('POST', `/api/admin/users/${owner.user.id}/deceased`, { headers: mod.auth, body: { note: 'x' } });
    expect(res.status).toBe(403);
    const after = await prisma.user.findUnique({ where: { id: owner.user.id }, select: { deceased_at: true } });
    expect(after?.deceased_at).toBeNull();
  });
});
