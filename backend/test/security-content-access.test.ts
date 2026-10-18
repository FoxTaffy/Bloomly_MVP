import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, createUser, prisma, resetDb } from './helpers.js';

async function groupFor(ownerId: string, isPublic = false) {
  return prisma.group.create({ data: {
    name: 'Confidential group', slug: 'audit-' + randomUUID().slice(0, 8), type: 'community', owner_id: ownerId,
    is_public: isPublic, members_count: 1,
    members: { create: { user_id: ownerId, role: 'owner' } },
  } });
}

describe('security: приватность контента во всех каналах чтения', () => {
  beforeEach(resetDb);

  it('закрытая группа: по ссылке видна только шапка; контент, участники, задачи и посты скрыты, вступление — только заявкой', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const group = await groupFor(owner.user.id);
    const secret = 'group-secret-' + randomUUID();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: secret, post_type: 'commission_update', groupPosts: { create: { group_id: group.id } } } });
    const header = await api('GET', `/api/groups/${group.id}`, { headers: outsider.auth });
    expect(header.status).toBe(200);
    expect(header.res.body).not.toContain(secret);
    expect(header.json.data.group?.events ?? header.json.data.events ?? []).toEqual([]);
    for (const path of [`/api/groups/${group.id}/posts`, `/api/groups/${group.id}/members`, `/api/groups/${group.id}/kanban`, `/api/posts/${post.id}`, `/api/posts/${post.id}/comments`]) {
      const response = await api('GET', path, { headers: outsider.auth });
      expect([403, 404], path).toContain(response.status);
      expect(response.res.body).not.toContain(secret);
    }
    const catalogue = await api('GET', '/api/groups', { headers: outsider.auth });
    expect(catalogue.res.body).not.toContain(group.id);
    const join = await api('POST', `/api/groups/${group.id}/join`, { headers: outsider.auth });
    expect(join.status).toBe(200);
    expect(join.json.data.pending).toBe(true);
    expect([400, 403]).toContain((await api('POST', `/api/groups/${group.id}/subscribe`, { headers: outsider.auth })).status);
    expect(await prisma.groupSubscriber.count({ where: { group_id: group.id } })).toBe(0);
    expect(await prisma.groupMember.count({ where: { group_id: group.id } })).toBe(1);
    expect((await api('GET', `/api/groups/${group.id}/posts`, { headers: owner.auth })).res.body).toContain(secret);
    expect((await api('GET', `/api/groups/${group.id}`, { headers: owner.auth })).status).toBe(200);
  });

  it('публичные группы остаются читаемыми и доступными для вступления', async () => {
    const owner = await createUser();
    const visitor = await createUser();
    const group = await groupFor(owner.user.id, true);
    expect((await api('GET', `/api/groups/${group.id}`)).status).toBe(200);
    expect((await api('POST', `/api/groups/${group.id}/join`, { headers: visitor.auth })).status).toBe(200);
  });

  it('пост подписчикам не раскрывается в ленте, поиске, OG и комментариях постороннему, но доступен подписчику', async () => {
    const owner = await createUser();
    const follower = await createUser();
    const outsider = await createUser();
    const secret = 'subsecret' + randomUUID().replace(/-/g, '');
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: secret, subscriber_only: true } });
    await prisma.follow.create({ data: { follower_id: follower.user.id, following_id: owner.user.id } });
    for (const path of [`/api/posts/${post.id}`, '/api/posts?limit=100', `/api/posts/search?q=${secret}`, `/api/posts/user/${owner.user.id}`, `/og/post/${post.id}`]) {
      const response = await api('GET', path, { headers: outsider.auth });
      expect(response.res.body, path).not.toContain(secret);
    }
    const comments = await api('GET', `/api/posts/${post.id}/comments`, { headers: outsider.auth });
    expect([403, 404]).toContain(comments.status);
    expect((await api('GET', `/api/posts/${post.id}`, { headers: follower.auth })).res.body).toContain(secret);
    expect((await api('GET', `/api/posts/${post.id}`, { headers: owner.auth })).res.body).toContain(secret);
  });

  it('закрытые профили не раскрываются через истории, публичный альбом, OG и sitemap', async () => {
    const owner = await createUser({ profile_visibility: 'nobody', bio: 'private-bio-secret' });
    const outsider = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'private-post-secret' } });
    const story = await prisma.story.create({ data: { user_id: owner.user.id, image_url: 'https://bloomly.fun/s3/bloomly/private-story-secret.png', expires_at: new Date(Date.now() + 86_400_000) } });
    const album = await prisma.album.create({ data: { user_id: owner.user.id, title: 'private-album-secret', privacy: 'public' } });
    const list = await api('GET', '/api/stories', { headers: outsider.auth });
    expect(list.res.body).not.toContain(story.id);
    expect((await api('GET', `/api/albums/${album.id}`, { headers: outsider.auth })).status).toBe(404);
    expect((await api('GET', `/og/profile/${owner.user.username}`)).status).toBe(404);
    expect((await api('GET', `/og/post/${post.id}`)).status).toBe(404);
    const sitemap = await api('GET', '/sitemap.xml');
    expect(sitemap.res.body).not.toContain(`/profile/${owner.user.username}`);
    expect(sitemap.res.body).not.toContain(`/post/${post.id}`);
    expect((await api('GET', `/api/albums/${album.id}`, { headers: owner.auth })).status).toBe(200);
    for (const path of [`/api/users/${owner.user.id}/fursonas`, `/api/users/${owner.user.id}/fursuits`]) {
      expect((await api('GET', path, { headers: outsider.auth })).status).toBe(403);
      expect((await api('GET', path, { headers: owner.auth })).status).toBe(200);
    }
  });

  it('нельзя менять подсобытие чужого события, подставив eventId своего', async () => {
    const first = await createUser(); const second = await createUser();
    const a = await groupFor(first.user.id, true); const b = await groupFor(second.user.id, true);
    const dates = { starts_at: new Date('2030-01-01T10:00:00Z'), ends_at: new Date('2030-01-01T20:00:00Z') };
    const own = await prisma.event.create({ data: { group_id: a.id, title: 'Owned', short_code: 'OWN', ...dates } });
    const other = await prisma.event.create({ data: { group_id: b.id, title: 'Other', short_code: 'OTH', ...dates } });
    const child = await prisma.subEvent.create({ data: { event_id: other.id, title: 'Protected child', type: 'panel', ...dates } });
    const path = `/api/groups/events/${own.id}/subevents/${child.id}`;
    expect([403, 404]).toContain((await api('PATCH', path, { headers: first.auth, body: { title: 'Hijacked' } })).status);
    expect([403, 404]).toContain((await api('DELETE', path, { headers: first.auth })).status);
    expect((await prisma.subEvent.findUniqueOrThrow({ where: { id: child.id } })).title).toBe('Protected child');
  });

  it('интерактив нельзя создать в чужой группе и повторное участие не сбрасывает решение', async () => {
    const owner = await createUser(); const outsider = await createUser();
    const group = await groupFor(owner.user.id, true);
    const denied = await api('POST', '/api/activities', { headers: outsider.auth, body: { title: 'Unauthorized', type: 'collab', group_id: group.id } });
    expect(denied.status).toBe(403);
    const activity = await prisma.activity.create({ data: { owner_id: owner.user.id, title: 'Audit activity', type: 'collab', max_participants: 1 } });
    await prisma.activityParticipant.create({ data: { activity_id: activity.id, user_id: outsider.user.id, status: 'completed' } });
    await api('POST', `/api/activities/${activity.id}/join`, { headers: outsider.auth });
    expect((await prisma.activityParticipant.findUniqueOrThrow({ where: { activity_id_user_id: { activity_id: activity.id, user_id: outsider.user.id } } })).status).toBe('completed');
  });

  it('замороженная учётная запись не получает SSE по действующему токену', async () => {
    const frozen = await createUser({ frozen_at: new Date() });
    const response = await api('GET', `/api/notifications/stream?token=${frozen.token}`);
    expect(response.status).toBe(403);
  });

  it('одновременные оценки не расходятся со счётчиками группы', async () => {
    const owner = await createUser();
    const first = await createUser(); const second = await createUser();
    const group = await groupFor(owner.user.id, true);
    const responses = await Promise.all([first, second].map(user => api('POST', `/api/groups/${group.id}/rate`, { headers: user.auth, body: { value: 1 } })));
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    let current = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect([current.rating, current.rating_count]).toEqual([2, 2]);
    await Promise.all([1, 1].map(value => api('POST', `/api/groups/${group.id}/rate`, { headers: first.auth, body: { value } })));
    current = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    const votes = await prisma.groupRating.aggregate({ where: { group_id: group.id }, _sum: { value: true }, _count: true });
    expect([current.rating, current.rating_count]).toEqual([votes._sum.value, votes._count]);
  });

  it('закрытая группа не раскрывается через профиль, бейдж события и список участников', async () => {
    const owner = await createUser(); const outsider = await createUser();
    const group = await groupFor(owner.user.id);
    const event = await prisma.event.create({ data: { group_id: group.id, title: 'private-event-secret', short_code: 'PRIV', starts_at: new Date('2030-01-01'), ends_at: new Date('2030-01-02') } });
    await prisma.soonBadge.create({ data: { user_id: owner.user.id, event_id: event.id } });
    for (const path of [`/api/groups/user/${owner.user.id}`, `/api/groups/soon/user/${owner.user.id}`]) {
      const response = await api('GET', path, { headers: outsider.auth });
      expect(response.res.body).not.toContain(group.id);
      expect(response.res.body).not.toContain('private-event-secret');
    }
    expect((await api('GET', `/api/groups/events/${event.id}/attendees`, { headers: outsider.auth })).status).toBe(403);
    expect((await api('GET', `/api/groups/events/${event.id}/attendees`, { headers: owner.auth })).status).toBe(200);
  });

  it('последнее место интерактива нельзя занять одновременно двум людям', async () => {
    const owner = await createUser(); const first = await createUser(); const second = await createUser();
    const activity = await prisma.activity.create({ data: { owner_id: owner.user.id, title: 'Last seat', type: 'collab', max_participants: 1 } });
    const results = await Promise.all([first, second].map(user => api('POST', `/api/activities/${activity.id}/join`, { headers: user.auth })));
    expect(results.filter(response => response.status === 201)).toHaveLength(1);
    expect(await prisma.activityParticipant.count({ where: { activity_id: activity.id } })).toBe(1);
  });

  it('параллельные открытия прошедшей афиши выполняют завершение один раз', async () => {
    const owner = await createUser(); const member = await createUser();
    const group = await groupFor(owner.user.id, true);
    await prisma.group.update({ where: { id: group.id }, data: { type: 'event', event_date: new Date('2020-01-01'), members_count: 2 } });
    await prisma.groupMember.create({ data: { group_id: group.id, user_id: member.user.id } });
    const event = await prisma.event.create({ data: { group_id: group.id, title: 'Expired', short_code: 'OLD', starts_at: new Date('2020-01-01'), ends_at: new Date('2020-01-02'), attendee_count: 1 } });
    await prisma.soonBadge.create({ data: { user_id: member.user.id, event_id: event.id } });
    const responses = await Promise.all([1, 2, 3].map(() => api('GET', `/api/groups/${group.id}`)));
    expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).members_count).toBe(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).attendee_count).toBe(0);
    expect(await prisma.groupSubscriber.count({ where: { group_id: group.id } })).toBe(1);
  });
});
