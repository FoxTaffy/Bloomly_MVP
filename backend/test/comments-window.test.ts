import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, createUser, prisma, resetDb } from './helpers.js';

describe('comments window API contract', () => {
  beforeEach(resetDb);

  it('creates comments and replies, reads the thread and counts both on the post', async () => {
    const owner = await createUser();
    const reader = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Обсуждение осеннего рисунка' } });
    const created = await api('POST', `/api/posts/${post.id}/comments`, { headers: reader.auth, body: { content: 'Очень уютная работа!' } });
    expect(created.status).toBe(201);
    const commentId = created.json.data.comment.id;
    const reply = await api('POST', `/api/posts/${post.id}/comments`, { headers: owner.auth, body: { content: 'Спасибо за поддержку!', parentId: commentId } });
    expect(reply.status).toBe(201);
    const thread = await api('GET', `/api/posts/${post.id}/comments`, { headers: reader.auth });
    expect(thread.json.data.comments).toHaveLength(1);
    expect(thread.json.data.comments[0].replies[0].content).toBe('Спасибо за поддержку!');
    expect(thread.json.data.comments[0]._count.replies).toBe(1);
    expect((await api('GET', `/api/posts/${post.id}`, { headers: reader.auth })).json.data.post._count.comments).toBe(2);
  });

  it('votes toggle, moderation follows permissions, and deletion updates the count', async () => {
    const owner = await createUser();
    const reader = await createUser();
    const stranger = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Пост для обсуждения' } });
    const comment = await prisma.comment.create({ data: { post_id: post.id, author_id: reader.user.id, content: 'Мне нравится!' } });
    expect((await api('POST', `/api/posts/comments/${comment.id}/vote`, { headers: owner.auth, body: { value: 1 } })).json.data.rating).toBe(1);
    expect((await api('POST', `/api/posts/comments/${comment.id}/vote`, { headers: owner.auth, body: { value: 1 } })).json.data.rating).toBe(0);
    expect((await api('GET', `/api/posts/${post.id}/comments`, { headers: owner.auth })).json.data.canModerate).toBe(true);
    expect((await api('GET', `/api/posts/${post.id}/comments`, { headers: stranger.auth })).json.data.canModerate).toBe(false);
    expect((await api('DELETE', `/api/posts/comments/${comment.id}`, { headers: stranger.auth })).status).toBe(403);
    expect((await api('DELETE', `/api/posts/comments/${comment.id}`, { headers: owner.auth })).status).toBe(200);
    expect((await api('GET', `/api/posts/${post.id}`, { headers: owner.auth })).json.data.post._count.comments).toBe(0);
  });

  it('disabled comments remain readable; only the author can keep commenting', async () => {
    const owner = await createUser();
    const reader = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Пост с отключёнными комментариями', comments_disabled: true } });
    expect((await api('GET', `/api/posts/${post.id}/comments`)).status).toBe(200);
    expect((await api('POST', `/api/posts/${post.id}/comments`, { headers: reader.auth, body: { content: 'Ответ читателя' } })).status).toBe(403);
    expect((await api('POST', `/api/posts/${post.id}/comments`, { headers: owner.auth, body: { content: 'Уточнение автора' } })).status).toBe(201);
    expect((await api('POST', `/api/posts/${post.id}/comments`, { body: { content: 'Гостевой ответ' } })).status).toBe(401);
  });

  it('posting as a managed group preserves the public group identity', async () => {
    const owner = await createUser();
    const reader = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Работа мастерской' } });
    const group = await prisma.group.create({ data: { owner_id: reader.user.id, name: 'Тестовая мастерская', slug: `qa-${randomUUID()}`, type: 'community' } });
    await prisma.groupMember.create({ data: { group_id: group.id, user_id: reader.user.id, role: 'owner' } });
    const result = await api('POST', `/api/posts/${post.id}/comments`, { headers: reader.auth, body: { content: 'От имени мастерской', groupId: group.id } });
    expect(result.status).toBe(201);
    expect(result.json.data.comment.group.id).toBe(group.id);
    expect(result.json.data.comment.author).toBeNull();
    const thread = await api('GET', `/api/posts/${post.id}/comments`, { headers: owner.auth });
    expect(thread.json.data.comments[0].group.name).toBe('Тестовая мастерская');
    expect((await api('POST', `/api/posts/${post.id}/comments`, { headers: owner.auth, body: { content: 'Попытка подмены', groupId: group.id } })).status).toBe(403);
  });

  it('rejects a reply to a comment from a different post', async () => {
    const owner = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Первая публикация' } });
    const other = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Вторая публикация' } });
    const comment = await prisma.comment.create({ data: { author_id: owner.user.id, post_id: post.id, content: 'Первое обсуждение' } });
    expect((await api('POST', `/api/posts/${other.id}/comments`, { headers: owner.auth, body: { content: 'Неправильная ветка', parentId: comment.id } })).status).toBe(400);
  });
});
