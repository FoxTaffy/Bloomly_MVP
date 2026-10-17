import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import prisma from '../../config/prisma.js';
import { requireModerator } from '../../lib/authHooks.js';
import { normalizeTag } from '../../lib/tagRules.js';
import { invalidateTagSynonyms, tagKey } from '../../lib/tagSynonyms.js';

type SynonymBody = { alias?: string; canonical?: string };

const bad = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ success: false, data: null, error: { code: 'BAD_REQUEST', message } });

/** Синонимы хештегов (админка → «Синонимы тегов»). Список могут смотреть и менять модераторы. */
export async function tagRoutes(fastify: FastifyInstance) {
  const auth = () => ({ onRequest: [fastify.authenticate] });

  // GET /api/tags/synonyms — все пары, сгруппированные по каноническому тегу
  fastify.get('/synonyms', auth(), async (req: FastifyRequest, reply) => {
    if (!requireModerator(req, reply)) return;
    const rows = await prisma.tagSynonym.findMany({ orderBy: [{ canonical: 'asc' }, { alias: 'asc' }] });
    return reply.send({ success: true, data: { synonyms: rows }, error: null });
  });

  // POST /api/tags/synonyms { alias, canonical } — добавить или перенаправить синоним
  fastify.post<{ Body: SynonymBody }>('/synonyms', auth(), async (req, reply) => {
    if (!requireModerator(req, reply)) return;
    const alias = normalizeTag(req.body?.alias ?? '').slice(0, 100);
    let canonical = normalizeTag(req.body?.canonical ?? '').slice(0, 100);
    if (!alias || !canonical) return bad(reply, 'Укажите синоним и основной тег');
    if (tagKey(alias) === tagKey(canonical)) {
      return bad(reply, 'Варианты с «_» и «-» объединяются автоматически — синоним не нужен');
    }

    // Без цепочек: если основной тег сам чей-то синоним — берём его основной.
    const parent = await prisma.tagSynonym.findUnique({ where: { alias: canonical } });
    if (parent) canonical = parent.canonical;
    if (tagKey(alias) === tagKey(canonical)) return bad(reply, 'Этот тег уже основной для указанного');

    await prisma.$transaction([
      // Тег, который был основным для других, сам становится синонимом — переносим его группу.
      prisma.tagSynonym.updateMany({ where: { canonical: alias }, data: { canonical } }),
      prisma.tagSynonym.upsert({
        where: { alias },
        create: { alias, canonical, created_by: (req.user as { id: string }).id },
        update: { canonical },
      }),
    ]);
    invalidateTagSynonyms();
    return reply.code(201).send({ success: true, data: { alias, canonical }, error: null });
  });

  // DELETE /api/tags/synonyms/:alias
  fastify.delete<{ Params: { alias: string } }>('/synonyms/:alias', auth(), async (req, reply) => {
    if (!requireModerator(req, reply)) return;
    await prisma.tagSynonym.deleteMany({ where: { alias: normalizeTag(req.params.alias) } });
    invalidateTagSynonyms();
    return reply.send({ success: true, data: null, error: null });
  });
}
