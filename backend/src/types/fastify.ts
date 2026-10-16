// App-wide Fastify type augmentations (decorators from server.ts, JWT user shape).
import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /** Requires a valid access token; refreshes role / is_adult from the DB. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Like authenticate, but leaves `request.user` undefined for guests instead of failing. */
    tryAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** Access-token claims after `authenticate` (role and is_adult re-read from the DB). */
    user: { id: string; role: string; is_adult?: boolean };
  }
}

export {};
