import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

/**
 * App-wide logger — the same pino instance Fastify uses for request logs (see server.ts),
 * so background work (cron, fire-and-forget moderation, media cleanup) logs in the same
 * structured format. Silent under tests, like Fastify's request logging.
 */
/**
 * EventSource не умеет слать заголовки, поэтому JWT приходит в query (/notifications/stream?token=…).
 * В логи такие значения попадать не должны: любой, кто читает логи, мог бы войти под пользователем.
 */
export const redactUrlSecrets = (v: unknown) =>
  typeof v === 'string' ? v.replace(/([?&](?:token|refreshToken|access_token)=)[^&#\s]*/gi, '$1[redacted]') : v;

export const logger: FastifyBaseLogger = pino({
  enabled: process.env.NODE_ENV !== 'test',
  // Сериализатор req у Fastify строит поле url — чистим его уже после сериализации
  redact: { paths: ['req.url'], censor: redactUrlSecrets },
});

/** `.catch(logError('[tag] what failed'))` for fire-and-forget promises. */
export const logError = (msg: string) => (err: unknown) => logger.error({ err }, msg);
