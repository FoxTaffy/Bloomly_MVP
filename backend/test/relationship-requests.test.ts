import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb } from './helpers.js';
import { relationshipsService } from '../src/modules/relationships/service.js';

describe('relationships: заявки', () => {
  beforeEach(resetDb);

  it('заявка тому, кто уже в отношениях, отклоняется', async () => {
    const sender = await createUser();
    const taken = await createUser();
    const partner = await createUser();
    await prisma.user.update({ where: { id: taken.user.id }, data: { relationship_with: partner.user.id } });

    await expect(relationshipsService.sendRequest(sender.user.id, taken.user.id))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.relationshipRequest.count()).toBe(0);
  });

  it('исходящая заявка видна отправителю и не видна третьим лицам', async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    await relationshipsService.sendRequest(a.user.id, b.user.id);

    const out = await relationshipsService.getOutgoing(a.user.id);
    expect(out).toHaveLength(1);
    expect(out[0].to.id).toBe(b.user.id);
    expect(await relationshipsService.getOutgoing(c.user.id)).toHaveLength(0);
    expect(await relationshipsService.getPending(c.user.id)).toHaveLength(0);

    await relationshipsService.cancelRequest(a.user.id, b.user.id);
    expect(await relationshipsService.getOutgoing(a.user.id)).toHaveLength(0);
  });
});
