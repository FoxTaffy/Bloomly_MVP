import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb } from './helpers.js';
import { mediaUrlForKey } from '../src/modules/media/service.js';
import { messageService } from '../src/modules/messages/service.js';

const settle = () => new Promise((r) => setTimeout(r, 300));

describe('удаление сообщения не ломает пересланные копии его файла', () => {
  beforeEach(resetDb);

  it('файл оригинала остаётся, пока на него ссылается пересланное сообщение; без ссылок — удаляется', async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const key = `messages/${randomUUID()}.webp`;
    await prisma.mediaObject.create({ data: { object_key: key, owner_id: a.user.id, folder: 'messages', size_bytes: 10n } });
    const ab = await prisma.conversation.create({ data: { participants: { create: [{ user_id: a.user.id }, { user_id: b.user.id }] } } });
    const bc = await prisma.conversation.create({ data: { participants: { create: [{ user_id: b.user.id }, { user_id: c.user.id }] } } });
    const original = await prisma.message.create({ data: { conversation_id: ab.id, sender_id: a.user.id, type: 'image', file_url: mediaUrlForKey(key) } });
    await messageService.forwardMessage(original.id, bc.id, b.user.id);

    await messageService.deleteMessage(original.id, a.user.id); await settle();
    expect((await prisma.mediaObject.findUnique({ where: { object_key: key } }))?.deleted_at).toBeNull();

    // Альбом без других ссылок: файлы удаляются вместе с сообщением
    const keys = [`messages/${randomUUID()}.webp`, `messages/${randomUUID()}.webp`];
    for (const k of keys) await prisma.mediaObject.create({ data: { object_key: k, owner_id: a.user.id, folder: 'messages', size_bytes: 10n } });
    const album = await prisma.message.create({ data: { conversation_id: ab.id, sender_id: a.user.id, type: 'album', metadata: { files: keys.map((k) => ({ url: mediaUrlForKey(k), type: 'image' })) } } });
    await messageService.deleteMessage(album.id, a.user.id); await settle();
    for (const k of keys) expect((await prisma.mediaObject.findUnique({ where: { object_key: k } }))?.deleted_at).not.toBeNull();
  });
});
