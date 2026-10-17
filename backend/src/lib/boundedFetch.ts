import { accessError } from './contentAccess.js';

/** Reads an upstream response with both a deadline and a hard streamed byte limit. */
export async function fetchBytes(url: string, maxBytes: number, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal });
    if (!response.ok) { await response.body?.cancel(); throw accessError('Upstream resource unavailable', 502); }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) { await response.body?.cancel(); throw accessError('Upstream resource is too large', 413); }
    if (!response.body) return { buffer: Buffer.alloc(0), contentType: response.headers.get('content-type') ?? 'application/octet-stream' };
    reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) { controller.abort(); throw accessError('Upstream resource is too large', 413); }
      chunks.push(Buffer.from(result.value));
    }
    return { buffer: Buffer.concat(chunks, bytes), contentType: response.headers.get('content-type') ?? 'application/octet-stream' };
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof Error && 'statusCode' in error)) throw accessError('Upstream request timed out', 504);
    throw error;
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
}
