import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function makeGroup(ownerId: string) {
  const tag = randomUUID().slice(0, 8);
  return prisma.group.create({
    data: { slug: `g-${tag}`, name: `Group ${tag}`, type: 'static', owner_id: ownerId },
  });
}

describe('группа: ник владельца всегда актуальный', () => {
  beforeEach(resetDb);

  it('после смены ника отдаёт новый username владельца, а не старый', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const newName = `new_${randomUUID().slice(0, 8)}`;

    await prisma.user.update({ where: { id: owner.user.id }, data: { username: newName } });

    const res = await api('GET', `/api/groups/${group.slug}`);
    expect(res.status).toBe(200);
    expect(res.json.data.group.owner.username).toBe(newName);
    expect(res.json.data.group.owner_id).toBe(owner.user.id);
  });
});
