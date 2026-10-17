import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBytes } from '../src/lib/boundedFetch.js';
import { redactedRequestUrl } from '../src/lib/logger.js';
import { errMessage } from '../src/lib/httpErrors.js';

afterEach(() => vi.unstubAllGlobals());

describe('security: ограниченный внешний fetch и диагностические данные', () => {
  it('сохраняет допустимое содержимое и запрещает переходы на другой адрес', async () => {
    const mocked = vi.fn(async () => new Response('hello', { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', mocked);
    const result = await fetchBytes('https://allowed.test/image', 10);
    expect(result.buffer.toString()).toBe('hello');
    expect(result.contentType).toBe('image/png');
    expect(mocked.mock.calls[0][1].redirect).toBe('error');
  });

  it('ограничивает фактический поток даже при отсутствующем Content-Length', async () => {
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } })));
    await expect(fetchBytes('https://allowed.test/image', 10)).rejects.toMatchObject({ statusCode: 413 });
  });

  it('прерывает зависший запрос по сроку', async () => {
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => new Promise((_, reject) => options.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(fetchBytes('https://allowed.test/image', 10, 10)).rejects.toMatchObject({ statusCode: 504 });
  });

  it('скрывает токены запроса и внутренности Prisma', () => {
    const url = redactedRequestUrl('/api/notifications/stream?token=secret&code=oauth-secret&mode=1');
    expect(url).not.toContain('secret'); expect(url).toContain('mode=1');
    const error = Object.assign(new Error('SQL and internal file path'), { code: 'P2002' });
    expect(errMessage(error)).toBe('Record already exists');
  });
});
