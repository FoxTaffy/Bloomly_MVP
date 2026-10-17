import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../config/prisma.js';
import { getSetting } from '../lib/settings.js';
import { isAdult } from '../lib/age.js';
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
    if (request.url.startsWith('/api/payments/yookassa/notify')) return;
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
        // Always refresh role from DB so role changes take effect without re-login
        const payload = request.user as { id: string; role: string };
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.id },
          select: { role: true, deleted_at: true, frozen_at: true, frozen_reason: true, birth_date: true },
        });
        if (!dbUser || dbUser.deleted_at) {
          return reply.code(401).send({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
        }
        request.user.role = dbUser.role;
        request.user.is_adult = isAdult(dbUser.birth_date);
        // Frozen accounts are force-logged-out on their very next authenticated request
        // (frontend's response interceptor catches ACCOUNT_FROZEN and clears the session).
        if (dbUser.frozen_at) {
          return reply.code(403).send({
            success: false,
            data: null,
            error: { code: 'ACCOUNT_FROZEN', message: dbUser.frozen_reason || 'Аккаунт временно заморожен за подозрительную активность' },
          });
        }
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
        const payload = request.user as { id: string; role: string };
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.id },
          select: { role: true, deleted_at: true, birth_date: true },
        });
        if (!dbUser || dbUser.deleted_at) {
          (request as { user?: unknown }).user = undefined; // guest: no user on the request
        } else {
          request.user.role = dbUser.role;
          request.user.is_adult = isAdult(dbUser.birth_date);
        }
      } catch {
        (request as { user?: unknown }).user = undefined; // guest: no user on the request
      }
    },
  );
}
