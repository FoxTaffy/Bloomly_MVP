import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

/**
 * App-wide logger — the same pino instance Fastify uses for request logs (see server.ts),
 * so background work (cron, fire-and-forget moderation, media cleanup) logs in the same
 * structured format. Silent under tests, like Fastify's request logging.
 */
export function redactedRequestUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://local.invalid');
    for (const key of ['token', 'access_token', 'refreshToken', 'mfaToken', 'code']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    return parsed.pathname + parsed.search;
  } catch { return '[invalid URL]'; }
}

export const logger: FastifyBaseLogger = pino({
  enabled: process.env.NODE_ENV !== 'test',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', 'password', 'token', 'refreshToken', 'secret', 'authorization'],
  serializers: {
    req: request => ({ id: request.id, method: request.method, url: redactedRequestUrl(request.url ?? ''), remoteAddress: request.ip }),
  },
});

/** `.catch(logError('[tag] what failed'))` for fire-and-forget promises. */
export const logError = (msg: string) => (err: unknown) => logger.error({ err }, msg);
