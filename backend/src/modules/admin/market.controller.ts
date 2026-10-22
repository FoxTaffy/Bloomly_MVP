import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireAdmin } from '../../lib/authHooks.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';
import { shopAdminService, denAdminService, type ShopItemInput } from './market.service.js';

const ok = (reply: FastifyReply, data: unknown) => reply.send({ success: true, data, error: null });
const fail = (reply: FastifyReply, e: unknown, code: string) => {
  const status = errStatus(e) ?? 500;
  return reply.code(status).send({ success: false, data: null, error: { code, message: status === 500 ? 'Внутренняя ошибка' : errMessage(e) } });
};
type Q = Record<string, string | undefined>;
const pageOf = (q: Q) => parseInt(q.page || '1') || 1;

/** Обёртка: проверка роли admin+ и единый разбор ошибок. */
function admin<T extends FastifyRequest = FastifyRequest>(code: string, fn: (req: T, reply: FastifyReply) => Promise<unknown>) {
  return async (req: T, reply: FastifyReply) => {
    if (!requireAdmin(req, reply)) return;
    try { return await fn(req, reply); } catch (e) { req.log.error(e); return fail(reply, e, code); }
  };
}

// ── Shop ─────────────────────────────────────────────────────────────────────
export const shopOverviewHandler = admin('SHOP_OVERVIEW', async (_req, reply) => ok(reply, await shopAdminService.overview()));
export const shopTypeStatsHandler = admin<FastifyRequest<{ Params: { type: string } }>>('SHOP_TYPE_STATS', async (req, reply) => ok(reply, await shopAdminService.typeStats(req.params.type)));
export const shopItemsHandler = admin<FastifyRequest<{ Querystring: Q }>>('SHOP_ITEMS', async (req, reply) => {
  const q = req.query;
  return ok(reply, await shopAdminService.listItems({ type: q.type || undefined, status: q.status || undefined, search: q.search?.trim() || undefined, page: pageOf(q) }));
});
export const shopCreateItemHandler = admin<FastifyRequest<{ Body: ShopItemInput }>>('SHOP_CREATE', async (req, reply) =>
  reply.code(201).send({ success: true, data: { item: await shopAdminService.createItem(req.body ?? {}) }, error: null }));
export const shopUpdateItemHandler = admin<FastifyRequest<{ Params: { id: string }; Body: ShopItemInput }>>('SHOP_UPDATE', async (req, reply) =>
  ok(reply, { item: await shopAdminService.updateItem(req.params.id, req.body ?? {}) }));
export const shopDeleteItemHandler = admin<FastifyRequest<{ Params: { id: string } }>>('SHOP_DELETE', async (req, reply) => {
  await shopAdminService.deleteItem(req.params.id);
  return ok(reply, { deleted: true });
});
export const shopPacksHandler = admin<FastifyRequest<{ Querystring: Q }>>('SHOP_PACKS', async (req, reply) => {
  const q = req.query;
  return ok(reply, await shopAdminService.listPacks({ search: q.search?.trim() || undefined, status: q.status || undefined, page: pageOf(q) }));
});
export const shopPackStatusHandler = admin<FastifyRequest<{ Params: { id: string }; Body: { status: string } }>>('SHOP_PACK_STATUS', async (req, reply) => {
  const status = req.body?.status;
  if (status !== 'published' && status !== 'draft') return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID', message: 'Неизвестный статус' } });
  await shopAdminService.setPackStatus(req.params.id, status);
  return ok(reply, { status });
});
export const shopAccessRequestsHandler = admin('SHOP_ACCESS', async (_req, reply) => ok(reply, { requests: await shopAdminService.listAccessRequests() }));

// ── Dealers' Den ─────────────────────────────────────────────────────────────
export const denOverviewHandler = admin('DEN_OVERVIEW', async (_req, reply) => ok(reply, await denAdminService.overview()));
export const denListingsHandler = admin<FastifyRequest<{ Querystring: Q }>>('DEN_LISTINGS', async (req, reply) => {
  const q = req.query;
  return ok(reply, await denAdminService.listListings({
    status: q.status || undefined, kind: q.kind || undefined, category: q.category || undefined, search: q.search?.trim() || undefined, page: pageOf(q),
  }));
});
export const denListingStatusHandler = admin<FastifyRequest<{ Params: { id: string }; Body: { status: string } }>>('DEN_LISTING_STATUS', async (req, reply) => {
  await denAdminService.setListingStatus(req.params.id, req.body?.status);
  return ok(reply, { status: req.body.status });
});
export const denListingDeleteHandler = admin<FastifyRequest<{ Params: { id: string } }>>('DEN_LISTING_DELETE', async (req, reply) => {
  await denAdminService.deleteListing(req.params.id);
  return ok(reply, { deleted: true });
});
export const denDisputesHandler = admin<FastifyRequest<{ Querystring: Q }>>('DEN_DISPUTES', async (req, reply) =>
  ok(reply, { disputes: await denAdminService.listDisputes(req.query.status) }));
export const denFairsHandler = admin('DEN_FAIRS', async (_req, reply) => ok(reply, { fairs: await denAdminService.listFairs() }));
export const denFairStatusHandler = admin<FastifyRequest<{ Params: { id: string }; Body: { status: string } }>>('DEN_FAIR_STATUS', async (req, reply) => {
  await denAdminService.setFairStatus(req.params.id, req.body?.status);
  return ok(reply, { status: req.body.status });
});
export const denGroupsHandler = admin('DEN_GROUPS', async (_req, reply) => ok(reply, { groups: await denAdminService.listDenGroups() }));
export const denGroupDisconnectHandler = admin<FastifyRequest<{ Params: { id: string } }>>('DEN_GROUP_DISCONNECT', async (req, reply) => {
  await denAdminService.disconnectGroup(req.params.id);
  return ok(reply, { disconnected: true });
});
