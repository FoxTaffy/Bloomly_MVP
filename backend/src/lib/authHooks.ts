import type { FastifyReply, FastifyRequest } from 'fastify';
import { isAdmin, isModerator, isOwner } from './roles.js';

/** onRequest hook (after `fastify.authenticate`): only admins and the owner may pass. */
export async function requireAdminRole(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user || !isAdmin(request.user.role)) {
    return reply.status(403).send({ success: false, error: 'Admin only' });
  }
}

// ── In-handler role guards ───────────────────────────────────────────────────
// Return false after sending a 403 when the caller's role is too low, e.g.
//   if (!requireModerator(req, reply)) return;

function guard(check: (role: string | undefined) => boolean, message: string) {
  return (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (check(request.user?.role)) return true;
    reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message } });
    return false;
  };
}

/** Moderator, admin or owner — day-to-day moderation endpoints. */
export const requireModerator = guard(isModerator, 'Requires moderator role or higher');
/** Admin or owner — operational endpoints not delegated to moderators. */
export const requireAdmin = guard(isAdmin, 'Requires admin role or higher');
/** Owner only — role management. */
export const requireOwner = guard(isOwner, 'Only the owner can manage roles');
