import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb } from './helpers.js';
import { relationshipsService } from '../src/modules/relationships/service.js';

describe('relationships: параллельное принятие заявок', () => {
  beforeEach(resetDb);

  it('два человека принимают заявки одного пользователя одновременно — отношения только с одним', async () => {
    const target = await createUser();
    const a = await createUser();
    const b = await createUser();

    const reqA = await relationshipsService.sendRequest(a.user.id, target.user.id);
    const reqB = await relationshipsService.sendRequest(b.user.id, target.user.id);
    const idA = (reqA as any).request.id;
    const idB = (reqB as any).request.id;

    // Принимаем заявки от двух разных людей параллельно: проверка «никто не в отношениях» пройдёт у обоих
    const results = await Promise.allSettled([
      relationshipsService.acceptRequest(idA, target.user.id),
      relationshipsService.acceptRequest(idB, target.user.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const t = await prisma.user.findUnique({ where: { id: target.user.id }, select: { relationship_with: true } });
    const partnerA = await prisma.user.findUnique({ where: { id: a.user.id }, select: { relationship_with: true } });
    const partnerB = await prisma.user.findUnique({ where: { id: b.user.id }, select: { relationship_with: true } });
    // Взаимность: если у цели партнёр X, то и у X партнёр — цель
    const pairs = [partnerA, partnerB].filter((p) => p?.relationship_with === target.user.id);
    expect(pairs).toHaveLength(1);
    expect([a.user.id, b.user.id]).toContain(t?.relationship_with);
  });
});
