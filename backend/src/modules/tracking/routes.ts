import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdmin } from '../../lib/authHooks.js';
import { logStaffAction } from '../automod/logs.service.js';
import { trackingService, TrackingError, type LinkInput, type Touch } from './service.js';

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

const fail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof TrackingError) {
    return reply.code(e.status).send({ success: false, data: null, error: { code: e.code, message: e.message } });
  }
  throw e;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badId = (reply: FastifyReply) =>
  reply.code(400).send({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Некорректный id' } });

const parseDays = (raw: string | undefined) => {
  const n = parseInt(raw ?? '30', 10);
  return [7, 14, 30, 90].includes(n) ? n : 30;
};

/** Рекламные ссылки и учёт трафика: публичная часть (/t/:code, /track/*) и админка (/admin/tracking/*, только admin+). */
export async function trackingRoutes(fastify: FastifyInstance) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /api/t/:code — клик по рекламной ссылке: пишем на сервере и перенаправляем на сайт с метками
  fastify.get<{ Params: { code: string } }>('/t/:code', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    let target: string | null = null;
    try {
      target = await trackingService.registerClick(
        req.params.code,
        { ip: req.ip, userAgent: req.headers['user-agent'], referrer: req.headers.referer },
        FRONTEND_URL(),
      );
    } catch (e) {
      // Ошибка учёта не должна ронять переход: человек всё равно должен попасть на сайт
      req.log.error({ err: e }, 'tracking click failed');
    }
    return reply.redirect(target ?? FRONTEND_URL(), 302);
  });

  // POST /api/track/visit — сайт открыт с меткой (шлёт фронтенд)
  fastify.post<{ Body: { visitor_id?: string; touch?: Touch; path?: string } }>('/track/visit', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    try {
      const data = await trackingService.registerVisit(req.body ?? {});
      return reply.send({ success: true, data, error: null });
    } catch (e) { return fail(reply, e); }
  });

  // POST /api/track/claim — после регистрации/входа привязывает аккаунт к рекламе
  fastify.post<{ Body: { visitor_id?: string; first?: Touch; last?: Touch } }>('/track/claim', {
    ...auth,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    try {
      const data = await trackingService.claim((req.user as { id: string }).id, req.body ?? {});
      return reply.send({ success: true, data, error: null });
    } catch (e) { return fail(reply, e); }
  });

  // ── Админка ────────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { days?: string } }>('/admin/tracking/overview', auth, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const data = await trackingService.overview(parseDays(req.query.days));
    return reply.send({ success: true, data: { ...data, public_origin: FRONTEND_URL().replace(/\/+$/, '') }, error: null });
  });

  fastify.get<{ Params: { id: string }; Querystring: { days?: string } }>('/admin/tracking/links/:id/series', auth, async (req: FastifyRequest<{ Params: { id: string }; Querystring: { days?: string } }>, reply) => {
    if (!requireAdmin(req, reply)) return;
    if (!UUID_RE.test(req.params.id)) return badId(reply);
    try {
      const series = await trackingService.series(req.params.id, parseDays(req.query.days));
      return reply.send({ success: true, data: { series }, error: null });
    } catch (e) { return fail(reply, e); }
  });

  fastify.post<{ Body: LinkInput }>('/admin/tracking/links', auth, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    try {
      const link = await trackingService.createLink(req.body ?? {}, req.user.id);
      await logStaffAction(req.user.id, req.user.id, 'tracking_link_create', `Рекламная ссылка «${link.name}» (${link.code})`).catch(() => {});
      return reply.code(201).send({ success: true, data: { link }, error: null });
    } catch (e) { return fail(reply, e); }
  });

  fastify.patch<{ Params: { id: string }; Body: { name?: string; is_active?: boolean } }>('/admin/tracking/links/:id', auth, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    if (!UUID_RE.test(req.params.id)) return badId(reply);
    try {
      const link = await trackingService.updateLink(req.params.id, req.body ?? {});
      return reply.send({ success: true, data: { link }, error: null });
    } catch (e) { return fail(reply, e); }
  });

  fastify.delete<{ Params: { id: string } }>('/admin/tracking/links/:id', auth, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    if (!UUID_RE.test(req.params.id)) return badId(reply);
    try {
      await trackingService.deleteLink(req.params.id);
      await logStaffAction(req.user.id, req.user.id, 'tracking_link_delete', `Удалена рекламная ссылка ${req.params.id}`).catch(() => {});
      return reply.send({ success: true, data: null, error: null });
    } catch (e) { return fail(reply, e); }
  });
}
