import { FastifyRequest, FastifyReply } from 'fastify';
import { dealersDenService } from './service.js';
import type { GetListingsQuery, CreateListingInput, UpdateListingInput } from './types.js';

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
