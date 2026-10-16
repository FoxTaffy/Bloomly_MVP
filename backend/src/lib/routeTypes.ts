import type { FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify';

/**
 * Route generic (Params / Querystring / Body …) declared by a handler's own `request` type.
 *
 * When a route has options with `onRequest` hooks, Fastify infers the route generic from the
 * hooks instead of the handler, so a handler typed as `FastifyRequest<{ Params: … }>` no longer
 * fits and used to be registered `as any`. Passing the generic explicitly keeps it type-checked:
 *
 *   fastify.get<RouteGenericOf<typeof getGroupHandler>>('/:id', auth, getGroupHandler);
 */
export type RouteGenericOf<H> = H extends (request: FastifyRequest<infer G>, reply: FastifyReply) => unknown
  ? G extends RouteGenericInterface ? G : never
  : never;
