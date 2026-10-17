import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../config/prisma.js';
import { getSetting } from '../lib/settings.js';
import { resolveAccountIdentity } from '../lib/accountAccess.js';
import { isModerator } from '../lib/roles.js';

/**
 * Request authentication: the maintenance-mode gate and the `authenticate` /
 * `tryAuthenticate` decorators used as onRequest hooks by the route modules.
 * Called directly (not via fastify.register) so the hook and decorators apply app-wide.
 */
export function registerAuth(fastify: FastifyInstance) {
  // Maintenance mode — toggled from the admin panel (SiteSetting). Auth and
  // admin routes stay open so staff can still log in and manage the platform;
  // staff (moderator+) are also let through everywhere else so they can use the
  // site normally while it's closed to regular users.
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/auth') || request.url.startsWith('/api/admin')) return;
    // Уведомления платёжного шлюза: деньги уже списаны, их нужно зачислить и во время обслуживания
    if (request.url.startsWith('/api/payments/yoomoney/notify')) return;
    if (!(await getSetting('maintenance_mode'))) return;

    try {
      await request.jwtVerify();
      const payload = request.user as { id: string };
      const dbUser = await prisma.user.findUnique({ where: { id: payload.id }, select: { role: true, deleted_at: true } });
      if (dbUser && !dbUser.deleted_at && isModerator(dbUser.role)) return;
    } catch {
      // no/invalid token — fall through and block below
    }

    reply.code(503).send({ success: false, data: null, error: { code: 'MAINTENANCE', message: 'Платформа временно на обслуживании' } });
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        Object.assign(request.user, await resolveAccountIdentity(request.user.id));
      } catch (err) {
        reply.send(err);
      }
    },
  );

  fastify.decorate(
    'tryAuthenticate',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        Object.assign(request.user, await resolveAccountIdentity(request.user.id));
      } catch {
        (request as { user?: unknown }).user = undefined; // guest: no user on the request
      }
    },
  );
}
