import { FastifyRequest, FastifyReply } from 'fastify';
import { dealersDenService } from './service.js';
import { fairService } from './fair.service.js';
import type {
  GetListingsQuery, CreateListingInput, UpdateListingInput, PlaceBidInput,
  CreateReviewInput, CreateBookingInput, UpdateBookingInput,
  CreateDisputeInput, ReplyDisputeInput, ResolveDisputeInput, CreateFairInput,
} from './types.js';
import prisma from '../../config/prisma.js';
import { isAdmin as isAdminRole } from '../../lib/roles.js';
import { requestIsAdult } from '../../lib/age.js';
import { validateListingInput } from './validation.js';
import { errMessage } from '../../lib/httpErrors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Listings ──────────────────────────────────────────────────────────────────

export async function listListingsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const query = req.query as GetListingsQuery;
    if (!requestIsAdult(req.user)) query.excludeNsfw = '1';
    const viewerId = req.user?.id;
    const result = await dealersDenService.list(query, viewerId);
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load listings' });
  }
}

export async function getListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return reply.status(404).send({ success: false, error: 'Listing not found' });
  const currentUserId = req.user?.id;
  try {
    const listing = await dealersDenService.getById(id, currentUserId, requestIsAdult(req.user));
    if (!listing) return reply.status(404).send({ success: false, error: 'Listing not found' });
    return reply.send({ success: true, data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load listing' });
  }
}

export async function createListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { is_verified: true, verification_type: true, den_frozen: true } });
  if (!dbUser?.is_verified || !['artist', 'master'].includes(dbUser.verification_type ?? '')) {
    return reply.status(403).send({ success: false, error: 'Только верифицированные художники и мастера могут создавать объявления' });
  }
  if (dbUser.den_frozen) {
    return reply.status(403).send({ success: false, error: 'Ваш аккаунт в Ярмарке заморожен' });
  }
  const input = req.body as CreateListingInput;
  // Avatar frames have their own approval-gated pipeline (POST /api/avatar-frames) that
  // creates the linked AvatarFrame row and enforces admin-vs-artist review — creating this
  // category through the generic listing endpoint would produce an unreviewable listing
  // with no AvatarFrame behind it at all.
  if (input.category === 'avatar_frame') {
    return reply.status(400).send({ success: false, error: 'Рамки для аватара создаются через отдельную форму загрузки рамки' });
  }
  const invalid = validateListingInput(req.body as Record<string, any>, 'create');
  if (invalid) return reply.status(400).send({ success: false, error: invalid });
  try {
    const listing = await dealersDenService.create(user.id, input);
    return reply.status(201).send({ success: true, data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create listing' });
  }
}

export async function updateListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return reply.status(404).send({ success: false, error: 'Listing not found or not yours' });
  const input = req.body as UpdateListingInput;
  const invalid = validateListingInput(input as Record<string, any>, 'update');
  if (invalid) return reply.status(400).send({ success: false, error: invalid });
  try {
    const listing = await dealersDenService.update(id, user.id, input);
    if (!listing) return reply.status(404).send({ success: false, error: 'Listing not found or not yours' });
    return reply.send({ success: true, data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update listing' });
  }
}

export async function deleteListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  try {
    const result = await dealersDenService.delete(id, user.id);
    if (!result) return reply.status(404).send({ success: false, error: 'Listing not found or not yours' });
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to delete listing' });
  }
}

export async function getMyListingsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  try {
    const listings = await dealersDenService.getMyListings(user.id);
    return reply.send({ success: true, data: { listings } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load your listings' });
  }
}

// ── Auction / Raffle ──────────────────────────────────────────────────────────

export async function placeBidHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  const input = req.body as PlaceBidInput;
  try {
    const result = await dealersDenService.placeBid(id, user.id, input);
    return reply.status(201).send({ success: true, data: result });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND')  return reply.status(404).send({ success: false, error: 'Объявление не найдено' });
    if (msg === 'CANNOT_BID_OWN')     return reply.status(403).send({ success: false, error: 'Нельзя ставить ставку на своё объявление' });
    if (msg === 'LISTING_INACTIVE')   return reply.status(409).send({ success: false, error: 'Аукцион не активен' });
    if (msg === 'AUCTION_ENDED')      return reply.status(409).send({ success: false, error: 'Аукцион завершён' });
    if (msg.startsWith('MIN_BID:'))   return reply.status(422).send({ success: false, error: `Минимальная ставка: ${msg.split(':')[1]}` });
    if (msg === 'INVALID_BID_AMOUNT') return reply.status(422).send({ success: false, error: 'Некорректная сумма ставки' });
    if (msg === 'BID_CONFLICT')       return reply.status(409).send({ success: false, error: 'Кто-то только что сделал ставку раньше вас, попробуйте снова' });
    if (msg === 'SELLER_FROZEN')      return reply.status(403).send({ success: false, error: 'Аккаунт продавца заморожен в Ярмарке' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to place bid' });
  }
}

export async function getBidsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const bids = await dealersDenService.getBids(id);
    return reply.send({ success: true, data: { bids } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load bids' });
  }
}

export async function buyRaffleTicketHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  try {
    const listing = await dealersDenService.buyRaffleTicket(id, user.id);
    return reply.send({ success: true, data: { listing } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Розыгрыш не найден' });
    if (msg === 'CANNOT_BUY_OWN') return reply.status(403).send({ success: false, error: 'Нельзя купить билет в свой розыгрыш' });
    if (msg === 'ALREADY_HAS_TICKET') return reply.status(409).send({ success: false, error: 'Вы уже купили билет в этом розыгрыше: один билет на человека' });
    if (msg === 'RAFFLE_FULL') return reply.status(409).send({ success: false, error: 'Все билеты разобраны' });
    if (msg === 'SELLER_FROZEN') return reply.status(403).send({ success: false, error: 'Аккаунт продавца заморожен в Ярмарке' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to buy ticket' });
  }
}

export async function drawRaffleHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return reply.status(404).send({ success: false, error: 'Розыгрыш не найден' });
  try {
    const listing = await dealersDenService.drawRaffle(id, user.id);
    return reply.send({ success: true, data: { listing } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Розыгрыш не найден' });
    if (msg === 'NOT_SELLER') return reply.status(403).send({ success: false, error: 'Провести розыгрыш может только продавец' });
    if (msg === 'LISTING_INACTIVE') return reply.status(409).send({ success: false, error: 'Розыгрыш уже завершён или не активен' });
    if (msg === 'NO_TICKETS') return reply.status(409).send({ success: false, error: 'Пока никто не купил билет' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to draw raffle' });
  }
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getCommentsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  try {
    const comments = await dealersDenService.getComments(id);
    return reply.send({ success: true, data: { comments } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load comments' });
  }
}

export async function addCommentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  const { body, parentId } = req.body as { body: string; parentId?: string };
  if (!body?.trim()) return reply.status(400).send({ success: false, error: 'Body required' });
  try {
    const comment = await dealersDenService.addComment(id, user.id, body.trim(), parentId);
    return reply.status(201).send({ success: true, data: { comment } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to add comment' });
  }
}

export async function deleteCommentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { commentId } = req.params as { commentId: string };
  try {
    await dealersDenService.deleteComment(commentId, user.id);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    if (errMessage(err) === 'FORBIDDEN') return reply.status(403).send({ success: false, error: 'No rights' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to delete comment' });
  }
}

// ── Trust ─────────────────────────────────────────────────────────────────────

export async function getTrustHandler(req: FastifyRequest, reply: FastifyReply) {
  const { userId } = req.params as { userId: string };
  try {
    const trust = await dealersDenService.getTrust(userId);
    return reply.send({ success: true, data: { trust } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load trust score' });
  }
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function createReviewHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  const input = req.body as CreateReviewInput;
  try {
    const review = await dealersDenService.createReview(listingId, user.id, input);
    return reply.status(201).send({ success: true, data: { review } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND')   return reply.status(404).send({ success: false, error: 'Объявление не найдено' });
    if (msg === 'NOT_SOLD')            return reply.status(409).send({ success: false, error: 'Можно оставить отзыв только после продажи' });
    if (msg === 'CANNOT_REVIEW_OWN')   return reply.status(403).send({ success: false, error: 'Нельзя оставлять отзыв на свой лот' });
    if (msg === 'INVALID_RATING')      return reply.status(422).send({ success: false, error: 'Рейтинг: 1-5' });
    if (msg === 'NOT_BUYER')           return reply.status(403).send({ success: false, error: 'Оставить отзыв может только покупатель этого лота' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create review' });
  }
}

export async function getListingReviewsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { listingId } = req.params as { listingId: string };
  try {
    const reviews = await dealersDenService.getListingReviews(listingId);
    return reply.send({ success: true, data: { reviews } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load reviews' });
  }
}

export async function getSellerReviewsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { userId } = req.params as { userId: string };
  try {
    const result = await dealersDenService.getSellerReviews(userId);
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load reviews' });
  }
}

export async function deleteReviewHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { reviewId } = req.params as { reviewId: string };
  const userIsAdmin = isAdminRole((user as any).role);
  try {
    await dealersDenService.deleteReview(reviewId, user.id, userIsAdmin);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    if (errMessage(err) === 'NOT_FOUND')  return reply.status(404).send({ success: false, error: 'Review not found' });
    if (errMessage(err) === 'FORBIDDEN')  return reply.status(403).send({ success: false, error: 'No rights' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to delete review' });
  }
}

// ── Weekly Top ────────────────────────────────────────────────────────────────

export async function getTrendingTagsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const tags = await dealersDenService.getTrendingTags(requestIsAdult(req.user));
    return reply.send({ success: true, data: { tags } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load trending tags' });
  }
}

export async function getWeeklyTopHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await dealersDenService.getWeeklyTop();
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load weekly top' });
  }
}

export async function recalcWeeklyTopHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await dealersDenService.recalcWeeklyTop();
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to recalculate weekly top' });
  }
}

// ── Wishlist ──────────────────────────────────────────────────────────────────

export async function addToWishlistHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  try {
    const result = await dealersDenService.addToWishlist(listingId, user.id);
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to add to wishlist' });
  }
}

export async function removeFromWishlistHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  try {
    await dealersDenService.removeFromWishlist(listingId, user.id);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to remove from wishlist' });
  }
}

export async function getMyWishlistHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  try {
    const listings = await dealersDenService.getMyWishlist(user.id);
    return reply.send({ success: true, data: { listings } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load wishlist' });
  }
}

// ── Commission Bookings ───────────────────────────────────────────────────────

export async function createBookingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  const input = req.body as CreateBookingInput;
  try {
    const result = await dealersDenService.createBooking(listingId, user.id, input);
    return reply.status(201).send({ success: true, data: result });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Лот не найден' });
    if (msg === 'DEN_FROZEN')        return reply.status(403).send({ success: false, error: 'Ваш аккаунт заморожен' });
    if (msg === 'SELLER_FROZEN')     return reply.status(403).send({ success: false, error: 'Аккаунт продавца заморожен в Ярмарке' });
    if (msg === 'SLOTS_FULL')        return reply.status(409).send({ success: false, error: 'Все слоты заняты' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create booking' });
  }
}

export async function getBookingsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  try {
    const bookings = await dealersDenService.getBookings(listingId, user.id);
    return reply.send({ success: true, data: { bookings } });
  } catch (err) {
    if (errMessage(err) === 'FORBIDDEN') return reply.status(403).send({ success: false, error: 'No rights' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load bookings' });
  }
}

export async function updateBookingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { bookingId } = req.params as { bookingId: string };
  const input = req.body as UpdateBookingInput;
  try {
    const booking = await dealersDenService.updateBooking(bookingId, user.id, input);
    return reply.send({ success: true, data: { booking } });
  } catch (err) {
    if (errMessage(err) === 'FORBIDDEN') return reply.status(403).send({ success: false, error: 'No rights' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update booking' });
  }
}

export async function cancelBookingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { bookingId } = req.params as { bookingId: string };
  try {
    await dealersDenService.cancelBooking(bookingId, user.id);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'NOT_FOUND')     return reply.status(404).send({ success: false, error: 'Бронь не найдена' });
    if (msg === 'CANNOT_CANCEL') return reply.status(409).send({ success: false, error: 'Нельзя отменить не pending бронь' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to cancel booking' });
  }
}

// ── Disputes ──────────────────────────────────────────────────────────────────

export async function createDisputeHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  const input = req.body as CreateDisputeInput;
  try {
    const dispute = await dealersDenService.createDispute(listingId, user.id, input);
    return reply.status(201).send({ success: true, data: { dispute } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND')    return reply.status(404).send({ success: false, error: 'Лот не найден или не продан' });
    if (msg === 'CANNOT_DISPUTE_OWN')   return reply.status(403).send({ success: false, error: 'Нельзя открыть спор на свой лот' });
    if (msg === 'NOT_BUYER')            return reply.status(403).send({ success: false, error: 'Открыть спор может только покупатель этого лота' });
    if (msg === 'ALREADY_DISPUTED')     return reply.status(409).send({ success: false, error: 'Вы уже открыли спор по этому лоту' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create dispute' });
  }
}

export async function replyDisputeHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { disputeId } = req.params as { disputeId: string };
  const input = req.body as ReplyDisputeInput;
  try {
    const dispute = await dealersDenService.replyDispute(disputeId, user.id, input);
    return reply.send({ success: true, data: { dispute } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'NOT_FOUND')     return reply.status(404).send({ success: false, error: 'Спор не найден' });
    if (msg === 'DISPUTE_CLOSED') return reply.status(409).send({ success: false, error: 'Спор уже закрыт' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to reply to dispute' });
  }
}

export async function getMyDisputesHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  try {
    const disputes = await dealersDenService.getMyDisputes(user.id);
    return reply.send({ success: true, data: { disputes } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load disputes' });
  }
}

export async function getAllDisputesHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const disputes = await dealersDenService.getAllDisputes();
    return reply.send({ success: true, data: { disputes } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load disputes' });
  }
}

export async function resolveDisputeHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { disputeId } = req.params as { disputeId: string };
  const { winner, resolution } = req.body as ResolveDisputeInput;
  try {
    await dealersDenService.resolveDispute(disputeId, user.id, winner, resolution);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    if (errMessage(err) === 'NOT_FOUND') return reply.status(404).send({ success: false, error: 'Спор не найден' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to resolve dispute' });
  }
}

// ── Seller page ───────────────────────────────────────────────────────────────

export async function getSellerPageHandler(req: FastifyRequest, reply: FastifyReply) {
  const { username } = req.params as { username: string };
  try {
    const data = await dealersDenService.getSellerPage(username);
    return reply.send({ success: true, data });
  } catch (err) {
    if (errMessage(err) === 'USER_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Пользователь не найден' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load seller page' });
  }
}

// ── Fairs ─────────────────────────────────────────────────────────────────────

export async function getCurrentFairHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await fairService.getCurrent();
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load fair' });
  }
}

export async function getFairHandler(req: FastifyRequest, reply: FastifyReply) {
  const { fairId } = req.params as { fairId: string };
  try {
    const result = await fairService.getById(fairId);
    if (!result) return reply.status(404).send({ success: false, error: 'Fair not found' });
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load fair' });
  }
}

export async function applyToFairHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { fairId } = req.params as { fairId: string };
  const { listingId } = req.body as { listingId?: string };
  try {
    const participant = await fairService.apply(fairId, user.id, listingId);
    return reply.status(201).send({ success: true, data: { participant } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to apply to fair' });
  }
}

export async function listFairsAdminHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const fairs = await fairService.listAll();
    return reply.send({ success: true, data: { fairs } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load fairs' });
  }
}

export async function createFairAdminHandler(req: FastifyRequest, reply: FastifyReply) {
  const input = req.body as CreateFairInput;
  try {
    const fair = await fairService.create(input);
    return reply.status(201).send({ success: true, data: { fair } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create fair' });
  }
}

export async function updateFairParticipantAdminHandler(req: FastifyRequest, reply: FastifyReply) {
  const { fairId, userId } = req.params as { fairId: string; userId: string };
  const { status } = req.body as { status: 'approved' | 'rejected' };
  try {
    const participant = await fairService.updateParticipant(fairId, userId, status);
    return reply.send({ success: true, data: { participant } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update participant' });
  }
}
