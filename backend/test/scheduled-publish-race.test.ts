import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb } from './helpers.js';
import { scheduledPostService } from '../src/modules/posts/scheduledService.js';

describe('scheduled posts: один пост публикуется один раз', () => {
  beforeEach(resetDb);

  it('ручная публикация и параллельный вызов не создают два поста', async () => {
    const author = await createUser();
    const row = await prisma.scheduledPost.create({
      data: { author_id: author.user.id, content: `scheduled-${randomUUID().slice(0, 6)}`, status: 'scheduled', scheduled_at: new Date() },
    });

    const results = await Promise.allSettled([
      scheduledPostService.publishNow(row.id, author.user.id),
      scheduledPostService.publishNow(row.id, author.user.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.post.count({ where: { author_id: author.user.id } })).toBe(1);

    const after = await prisma.scheduledPost.findUnique({ where: { id: row.id }, select: { status: true } });
    expect(after?.status).toBe('published');
  });
});
