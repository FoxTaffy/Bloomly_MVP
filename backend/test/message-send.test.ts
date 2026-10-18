import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { mediaUrlForKey } from '../src/modules/media/service.js';

async function ownedFile(ownerId: string, ext: string) {
  const key = `messages/${randomUUID()}.${ext}`;
  await prisma.mediaObject.create({ data: { object_key: key, owner_id: ownerId, folder: 'messages', size_bytes: BigInt(10) } });
  return mediaUrlForKey(key);
}

async function setup() {
  const a = await createUser({ subscription_tier: 'pro' });
  const b = await createUser();
  const conv = await api('POST', '/api/messages/conversations', { headers: a.auth, body: { userId: b.user.id } });
  const convId = conv.json.data.id ?? conv.json.data.conversation.id;
  const send = (body: Record<string, unknown>, who = a) =>
    api('POST', `/api/messages/conversations/${convId}/messages`, { headers: who.auth, body });
  return { a, b, convId, send };
}

describe('отправка сообщений', () => {
  beforeEach(resetDb);

  it('тип сообщения определяется по содержимому', async () => {
    const { a, send } = await setup();
    const text = await send({ content: '  hi  ' });
    expect(text.status).toBe(201);
    expect(text.json.data.message).toMatchObject({ type: 'text', text: 'hi', file_url: null });
    expect(text.json.data.message.sender.id).toBe(a.user.id);

    expect((await send({ file_url: await ownedFile(a.user.id, 'mp4') })).json.data.message.type).toBe('video');
    expect((await send({ file_url: await ownedFile(a.user.id, 'mp3') })).json.data.message.type).toBe('audio');
    expect((await send({ file_url: await ownedFile(a.user.id, 'webp') })).json.data.message.type).toBe('image');
    expect((await send({ file_url: await ownedFile(a.user.id, 'webm'), media_type: 'voice' })).json.data.message.type).toBe('voice');

    const reply = await send({ content: 'reply', reply_to_id: text.json.data.message.id });
    expect(reply.json.data.message.reply_to).toMatchObject({ id: text.json.data.message.id, text: 'hi' });
  });

  it('альбом, лимит альбома и одиночное вложение', async () => {
    const { a, send } = await setup();
    const files = [await ownedFile(a.user.id, 'webp'), await ownedFile(a.user.id, 'mp4')];
    const album = await send({ content: 'pics', attachments: files.map((url) => ({ url })) });
    expect(album.json.data.message.type).toBe('album');
    expect(album.json.data.message.metadata.files).toEqual([{ url: files[0], type: 'image' }, { url: files[1], type: 'video' }]);

    const single = await send({ attachments: [{ url: files[1] }] });
    expect(single.json.data.message).toMatchObject({ type: 'video', file_url: files[1] });

    const many = await Promise.all(Array.from({ length: 11 }, () => ownedFile(a.user.id, 'webp')));
    expect((await send({ attachments: many.map((url) => ({ url })) })).status).toBe(400);
  });

  it('карточка поста, чужой файл, пустое сообщение, блокировка', async () => {
    const { a, b, send } = await setup();
    expect((await send({ type: 'post_share', metadata: { postId: randomUUID() } })).status).toBe(404);
    const post = await prisma.post.create({ data: { content: 'p', author_id: b.user.id } as never });
    const share = await send({ type: 'post_share', metadata: { postId: post.id } });
    expect(share.json.data.message).toMatchObject({ type: 'post_share', metadata: { postId: post.id } });

    expect((await send({ file_url: await ownedFile(b.user.id, 'webp') })).status).toBe(403);
    expect((await send({ content: '   ' })).status).toBe(400);

    await prisma.block.create({ data: { blocker_id: b.user.id, blocked_id: a.user.id } });
    const blocked = await send({ content: 'hey' });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.message).toBe('MESSAGES_DISABLED');
  });

  it('стикер: автор пака и владелец пака в библиотеке отправляют, остальные получают 403', async () => {
    const { a, b, convId } = await setup();
    const url = await ownedFile(b.user.id, 'webp');
    const pack = await prisma.stickerPack.create({ data: { author_id: b.user.id, name: 'pack', stickers: [url] } });
    const send = (who: typeof a, file_url: string) =>
      api('POST', `/api/messages/conversations/${convId}/messages`, { headers: who.auth, body: { file_url, media_type: 'sticker' } });

    // a не автор и пака в библиотеке нет
    expect((await send(a, url)).status).toBe(403);
    expect((await send(b, url)).json.data.message.type).toBe('sticker');

    await prisma.userStickerPack.create({ data: { user_id: a.user.id, pack_id: pack.id } });
    const viaLibrary = await send(a, url);
    expect(viaLibrary.status).toBe(201);
    expect(viaLibrary.json.data.message).toMatchObject({ type: 'sticker', file_url: url });

    // файл, который не входит ни в один пак, стикером не отправить (даже свой)
    expect((await send(a, await ownedFile(a.user.id, 'webp'))).status).toBe(403);
    // удалённый пак больше не даёт доступ
    await prisma.stickerPack.update({ where: { id: pack.id }, data: { deleted_at: new Date() } });
    expect((await send(a, url)).status).toBe(403);
  });
});

describe('отправка сообщений: пустые и лимиты', () => {
  beforeEach(resetDb);

  it('неизвестный type без содержимого не создаёт пустое сообщение', async () => {
    const { convId, send } = await setup();
    expect((await send({ type: 'bogus' })).status).toBe(400);
    expect(await prisma.message.count({ where: { conversation_id: convId } })).toBe(0);
  });
});
