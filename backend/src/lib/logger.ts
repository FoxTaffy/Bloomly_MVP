import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

/**
 * App-wide logger — the same pino instance Fastify uses for request logs (see server.ts),
 * so background work (cron, fire-and-forget moderation, media cleanup) logs in the same
 * structured format. Silent under tests, like Fastify's request logging.
 */
export const logger: FastifyBaseLogger = pino({ enabled: process.env.NODE_ENV !== 'test' });

/** `.catch(logError('[tag] what failed'))` for fire-and-forget promises. */
export const logError = (msg: string) => (err: unknown) => logger.error({ err }, msg);
