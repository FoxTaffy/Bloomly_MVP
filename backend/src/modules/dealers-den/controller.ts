import { FastifyRequest, FastifyReply } from 'fastify';
import { dealersDenService } from './service.js';
import type { GetListingsQuery, CreateListingInput, UpdateListingInput, PlaceBidInput } from './types.js';
import prisma from '../../config/prisma.js';

export async function listListingsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await dealersDenService.list(req.query as GetListingsQuery);
    return reply.send({ data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load listings' });
  }
}

export async function getListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const listing = await dealersDenService.getById(id);
    if (!listing) return reply.status(404).send({ error: 'Listing not found' });
    return reply.send({ data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load listing' });
  }
}

export async function createListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { is_verified: true, verification_type: true } });
  if (!dbUser?.is_verified || !['artist', 'master'].includes(dbUser.verification_type ?? '')) {
    return reply.status(403).send({ error: 'Только верифицированные художники и мастера могут создавать объявления' });
  }
  const input = req.body as CreateListingInput;
  try {
    const listing = await dealersDenService.create(user.id, input);
    return reply.status(201).send({ data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to create listing' });
  }
}

export async function updateListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const input = req.body as UpdateListingInput;
  try {
    const listing = await dealersDenService.update(id, user.id, input);
    if (!listing) return reply.status(404).send({ error: 'Listing not found or not yours' });
    return reply.send({ data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to update listing' });
  }
}

export async function deleteListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    const result = await dealersDenService.delete(id, user.id);
    if (!result) return reply.status(404).send({ error: 'Listing not found or not yours' });
    return reply.send({ data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to delete listing' });
  }
}

export async function getMyListingsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  try {
    const listings = await dealersDenService.getMyListings(user.id);
    return reply.send({ data: { listings } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load your listings' });
  }
}

export async function placeBidHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const input = req.body as PlaceBidInput;
  try {
    const result = await dealersDenService.placeBid(id, user.id, input);
    return reply.status(201).send({ data: result });
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg === 'LISTING_NOT_FOUND')  return reply.status(404).send({ error: 'Объявление не найдено' });
    if (msg === 'CANNOT_BID_OWN')     return reply.status(403).send({ error: 'Нельзя ставить ставку на своё объявление' });
    if (msg === 'LISTING_INACTIVE')   return reply.status(409).send({ error: 'Аукцион не активен' });
    if (msg === 'AUCTION_ENDED')      return reply.status(409).send({ error: 'Аукцион завершён' });
    if (msg.startsWith('MIN_BID:'))   return reply.status(422).send({ error: `Минимальная ставка: ${msg.split(':')[1]}` });
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to place bid' });
  }
}

export async function getBidsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const bids = await dealersDenService.getBids(id);
    return reply.send({ data: { bids } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load bids' });
  }
}

export async function buyRaffleTicketHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  try {
    const listing = await dealersDenService.buyRaffleTicket(id, user.id);
    return reply.send({ data: { listing } });
  } catch (err: any) {
    const msg: string = err?.message ?? '';
    if (msg === 'RAFFLE_FULL') return reply.status(409).send({ error: 'Все билеты разобраны' });
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to buy ticket' });
  }
}

// ── Comments ─────────────────────────────────────────────────────────────────
export async function getCommentsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const comments = await dealersDenService.getComments(id);
    return reply.send({ data: { comments } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to load comments' });
  }
}

export async function addCommentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { id } = req.params as { id: string };
  const { body, parentId } = req.body as { body: string; parentId?: string };
  if (!body?.trim()) return reply.status(400).send({ error: 'Body required' });
  try {
    const comment = await dealersDenService.addComment(id, user.id, body.trim(), parentId);
    return reply.status(201).send({ data: { comment } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to add comment' });
  }
}

export async function deleteCommentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user as { id: string };
  const { commentId } = req.params as { commentId: string };
  try {
    await dealersDenService.deleteComment(commentId, user.id);
    return reply.send({ ok: true });
  } catch (err: any) {
    if (err?.message === 'FORBIDDEN') return reply.status(403).send({ error: 'No rights' });
    req.log.error(err);
    return reply.status(500).send({ error: 'Failed to delete comment' });
  }
}
