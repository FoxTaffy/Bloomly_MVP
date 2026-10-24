import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { mediaUrlForKey } from '../src/modules/media/service.js';
import { normalizeStickerEmojis } from '../src/modules/stickers/service.js';

async function ownedStickers(ownerId: string, n: number) {
  const urls: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = `stickers/${randomUUID()}.webp`;
    await prisma.mediaObject.create({ data: { object_key: key, owner_id: ownerId, folder: 'stickers', size_bytes: 10n } });
    urls.push(mediaUrlForKey(key));
  }
  return urls;
}

describe('стикеры: эмодзи для подсказок (тикет c6c33b46)', () => {
  beforeEach(resetDb);

  it('normalizeStickerEmojis оставляет только эмодзи, без повторов и не больше пяти', () => {
    expect(normalizeStickerEmojis('😂 smile 😂👍')).toBe('😂👍');
    expect(normalizeStickerEmojis('❤️🇷🇺👩‍💻')).toBe('❤️🇷🇺👩‍💻');
    expect(normalizeStickerEmojis('😀😁😂🤣😃😄😅')).toBe('😀😁😂🤣😃');
    expect(normalizeStickerEmojis('abc 123')).toBe('');
    expect(normalizeStickerEmojis(42)).toBe('');
  });

  it('создание: эмодзи по индексу, мусор отбрасывается, длина = числу стикеров', async () => {
    const author = await createUser();
    const urls = await ownedStickers(author.user.id, 3);
    const res = await api('POST', '/api/stickers', { headers: author.auth, body: { name: 'Pack', stickers: urls, stickerEmojis: ['😂', 'text', '👍❤️', '🔥'] } });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.data.pack.sticker_emojis).toEqual(['😂', '', '👍❤️']);
  });

  it('изменение порядка без эмодзи в запросе переносит эмодзи вместе со стикерами; добавление — пустые', async () => {
    const author = await createUser();
    const urls = await ownedStickers(author.user.id, 3);
    const created = await api('POST', '/api/stickers', { headers: author.auth, body: { name: 'Pack', stickers: urls, stickerEmojis: ['😂', '👍', '🔥'] } });
    const id = created.json.data.pack.id;
    const reordered = [urls[2], urls[0]];
    const upd = await api('PATCH', `/api/stickers/${id}`, { headers: author.auth, body: { stickers: reordered } });
    expect(upd.status).toBe(200);
    expect(upd.json.data.pack.sticker_emojis).toEqual(['🔥', '😂']);
    const [extra] = await ownedStickers(author.user.id, 1);
    const add = await api('POST', `/api/stickers/${id}/stickers`, { headers: author.auth, body: { urls: [extra] } });
    expect(add.status, JSON.stringify(add.json)).toBeLessThan(300);
    const pack = await prisma.stickerPack.findUnique({ where: { id } });
    expect(pack?.stickers).toEqual([...reordered, extra]);
    expect(pack?.sticker_emojis).toEqual(['🔥', '😂', '']);
  });

  it('явные эмодзи в PATCH заменяют прежние', async () => {
    const author = await createUser();
    const urls = await ownedStickers(author.user.id, 2);
    const created = await api('POST', '/api/stickers', { headers: author.auth, body: { name: 'Pack', stickers: urls } });
    expect(created.json.data.pack.sticker_emojis).toEqual(['', '']);
    const upd = await api('PATCH', `/api/stickers/${created.json.data.pack.id}`, { headers: author.auth, body: { stickerEmojis: ['🐺', '🦊'] } });
    expect(upd.json.data.pack.sticker_emojis).toEqual(['🐺', '🦊']);
  });
});
