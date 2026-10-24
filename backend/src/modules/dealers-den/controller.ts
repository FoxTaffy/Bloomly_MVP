import { FastifyRequest, FastifyReply } from 'fastify';
import { getSellerAccess, connectGroupToDen, getGroupDenStatus } from './access.js';
import { dealersDenService } from './service.js';
import { fairService } from './fair.service.js';
import { listingApplicationService } from './applications.service.js';
import { characterOptions } from '../../lib/orderCharacters.js';
import type {
  GetListingsQuery, CreateListingInput, UpdateListingInput, PlaceBidInput,
  CreateReviewInput, CreateBookingInput, UpdateBookingInput,
  CreateDisputeInput, ReplyDisputeInput, ResolveDisputeInput, CreateFairInput,
} from './types.js';
import { isAdmin as isAdminRole } from '../../lib/roles.js';
import { requestIsAdult } from '../../lib/age.js';
import { validateListingInput } from './validation.js';
import { errMessage, errStatus, errCode } from '../../lib/httpErrors.js';
import { getBumpInfo, bumpListing, setAutoBump } from './feed.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = (reply: FastifyReply, error = 'Объявление не найдено') => reply.status(404).send({ success: false, error });
const unprocessable = (reply: FastifyReply, error: string) => reply.status(422).send({ success: false, error });

/** Лот существует и виден зрителю (черновики, архив, 18+) — иначе побочные ручки раскрывали бы скрытые лоты. */
async function listingVisible(req: FastifyRequest, listingId: string): Promise<boolean> {
  return UUID_RE.test(listingId) && dealersDenService.canView(listingId, req.user?.id, requestIsAdult(req.user));
}

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
    const listing = await dealersDenService.getById(id, currentUserId, requestIsAdult(req.user), currentUserId ?? req.ip);
    if (!listing) return reply.status(404).send({ success: false, error: 'Listing not found' });
    return reply.send({ success: true, data: { listing } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load listing' });
  }
}

export async function sellerEligibilityHandler(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ success: true, data: await getSellerAccess(req.user.id) });
}

export async function connectGroupHandler(req: FastifyRequest, reply: FastifyReply) {
  const { groupId } = req.params as { groupId: string };
  if (!UUID_RE.test(groupId)) return reply.status(404).send({ success: false, error: 'Группа не найдена' });
  const { confirmNotScammer } = (req.body ?? {}) as { confirmNotScammer?: boolean };
  const result = await connectGroupToDen(req.user.id, groupId, confirmNotScammer === true);
  if (!result.ok) return reply.status(result.status).send({ success: false, error: result.error });
  return reply.send({ success: true });
}

export async function groupDenStatusHandler(req: FastifyRequest, reply: FastifyReply) {
  const { groupId } = req.params as { groupId: string };
  if (!UUID_RE.test(groupId)) return reply.status(404).send({ success: false, error: 'Группа не найдена' });
  const status = await getGroupDenStatus(groupId, req.user?.id);
  if (!status) return reply.status(404).send({ success: false, error: 'Группа не найдена' });
  return reply.send({ success: true, data: status });
}

export async function createListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const access = await getSellerAccess(user.id);
  if (access.frozen) {
    return reply.status(403).send({ success: false, error: 'Ваш аккаунт в Ярмарке заморожен' });
  }
  if (!access.canSell) {
    return reply.status(403).send({ success: false, error: 'Чтобы продавать, подключите Dealers Den в своей группе «Творческая» или «Магазин» (нужна верификация художника, мастера или владельца магазина)' });
  }
  const input = req.body as CreateListingInput;
  if (!input.groupId || !access.groups.some(g => g.id === input.groupId)) {
    return reply.status(400).send({ success: false, error: 'Выберите свою группу с подключённым Dealers Den, от имени которой создаётся лот' });
  }
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
    const status = errStatus(err);
    if (status && status < 500) return reply.status(status).send({ success: false, error: errMessage(err) });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update listing' });
  }
}

export async function deleteListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return reply.status(404).send({ success: false, error: 'Listing not found or not yours' });
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
  if (!(await listingVisible(req, id))) return notFound(reply);
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
    if (msg === 'DEN_FROZEN')         return reply.status(403).send({ success: false, error: 'Ваш аккаунт в Ярмарке заморожен' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to place bid' });
  }
}

export async function getBidsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  if (!(await listingVisible(req, id))) return notFound(reply);
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
  if (!(await listingVisible(req, id))) return notFound(reply, 'Розыгрыш не найден');
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
  if (!(await listingVisible(req, id))) return notFound(reply);
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
  if (typeof body !== 'string' || !body.trim()) return reply.status(400).send({ success: false, error: 'Body required' });
  if (body.length > 2000) return unprocessable(reply, 'Комментарий: не длиннее 2000 символов');
  if (parentId !== undefined && (typeof parentId !== 'string' || !UUID_RE.test(parentId))) return notFound(reply, 'Комментарий не найден');
  if (!(await listingVisible(req, id))) return notFound(reply);
  try {
    const comment = await dealersDenService.addComment(id, user.id, body.trim(), parentId);
    return reply.status(201).send({ success: true, data: { comment } });
  } catch (err) {
    if (errMessage(err) === 'PARENT_NOT_FOUND') return notFound(reply, 'Комментарий не найден');
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to add comment' });
  }
}

export async function deleteCommentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { commentId } = req.params as { commentId: string };
  try {
    if (!UUID_RE.test(commentId)) return notFound(reply, 'Комментарий не найден');
    await dealersDenService.deleteComment(commentId, user.id);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    if (errMessage(err) === 'NOT_FOUND') return notFound(reply, 'Комментарий не найден');
    if (errMessage(err) === 'FORBIDDEN') return reply.status(403).send({ success: false, error: 'No rights' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to delete comment' });
  }
}

// ── Trust ─────────────────────────────────────────────────────────────────────

export async function getTrustHandler(req: FastifyRequest, reply: FastifyReply) {
  const { userId } = req.params as { userId: string };
  if (!UUID_RE.test(userId)) return reply.send({ success: true, data: { trust: null } });
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
  const input = (req.body ?? {}) as CreateReviewInput;
  if (!(await listingVisible(req, listingId))) return notFound(reply);
  try {
    const review = await dealersDenService.createReview(listingId, user.id, input);
    return reply.status(201).send({ success: true, data: { review } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND')   return reply.status(404).send({ success: false, error: 'Объявление не найдено' });
    if (msg === 'NOT_SOLD')            return reply.status(409).send({ success: false, error: 'Можно оставить отзыв только после продажи' });
    if (msg === 'CANNOT_REVIEW_OWN')   return reply.status(403).send({ success: false, error: 'Нельзя оставлять отзыв на свой лот' });
    if (msg === 'INVALID_RATING')      return reply.status(422).send({ success: false, error: 'Рейтинг: 1-5' });
    if (msg === 'NOT_BUYER')           return reply.status(403).send({ success: false, error: 'Оставить отзыв может только покупатель этого лота (победитель, забронировавший или тот, чью заявку приняли)' });
    if (msg === 'ALREADY_REVIEWED')    return reply.status(409).send({ success: false, error: 'Вы уже оставили отзыв на этот лот' });
    if (msg === 'INVALID_TEXT')        return unprocessable(reply, 'Отзыв: не длиннее 1000 символов');
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create review' });
  }
}

export async function getListingReviewsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { listingId } = req.params as { listingId: string };
  if (!(await listingVisible(req, listingId))) return notFound(reply);
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
  if (!UUID_RE.test(userId)) return reply.send({ success: true, data: { reviews: [], avgRating: 0, totalCount: 0 } });
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
  const userIsAdmin = isAdminRole(user.role);
  if (!UUID_RE.test(reviewId)) return notFound(reply, 'Review not found');
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
  if (!(await listingVisible(req, listingId))) return notFound(reply);
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
    const listings = await dealersDenService.getMyWishlist(user.id, requestIsAdult(user));
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
  const input = (req.body ?? {}) as CreateBookingInput;
  if (!(await listingVisible(req, listingId))) return notFound(reply, 'Лот не найден');
  try {
    const result = await dealersDenService.createBooking(listingId, user.id, input);
    return reply.status(201).send({ success: true, data: result });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Лот не найден' });
    if (msg === 'DEN_FROZEN')        return reply.status(403).send({ success: false, error: 'Ваш аккаунт заморожен' });
    if (msg === 'SELLER_FROZEN')     return reply.status(403).send({ success: false, error: 'Аккаунт продавца заморожен в Ярмарке' });
    if (msg === 'SLOTS_FULL')        return reply.status(409).send({ success: false, error: 'Все слоты заняты' });
    if (msg === 'SLOTS_BUSY')        return reply.status(409).send({ success: false, error: 'Много желающих одновременно — попробуйте ещё раз' });
    if (msg === 'CANNOT_BOOK_OWN')   return reply.status(403).send({ success: false, error: 'Нельзя бронировать место в своей очереди' });
    if (msg === 'ALREADY_BOOKED')    return reply.status(409).send({ success: false, error: 'У вас уже есть бронь в этой очереди' });
    if (msg === 'FORM_INCOMPLETE')   return unprocessable(reply, 'Заполните обязательные поля анкеты');
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create booking' });
  }
}

export async function getBookingsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { listingId } = req.params as { listingId: string };
  if (!UUID_RE.test(listingId)) return notFound(reply, 'Лот не найден');
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
  const input = (req.body ?? {}) as UpdateBookingInput;
  if (!UUID_RE.test(bookingId)) return notFound(reply, 'Бронь не найдена');
  try {
    const booking = await dealersDenService.updateBooking(bookingId, user.id, input);
    return reply.send({ success: true, data: { booking } });
  } catch (err) {
    if (errMessage(err) === 'FORBIDDEN') return reply.status(403).send({ success: false, error: 'No rights' });
    if (errMessage(err) === 'INVALID_STATUS' || errMessage(err) === 'INVALID_NOTES') return unprocessable(reply, 'Некорректный статус или заметка');
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update booking' });
  }
}

export async function cancelBookingHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { bookingId } = req.params as { bookingId: string };
  if (!UUID_RE.test(bookingId)) return notFound(reply, 'Бронь не найдена');
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
  const input = (req.body ?? {}) as CreateDisputeInput;
  if (!UUID_RE.test(listingId)) return notFound(reply, 'Лот не найден или не продан');
  try {
    const dispute = await dealersDenService.createDispute(listingId, user.id, input);
    return reply.status(201).send({ success: true, data: { dispute } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'LISTING_NOT_FOUND')    return reply.status(404).send({ success: false, error: 'Лот не найден или не продан' });
    if (msg === 'CANNOT_DISPUTE_OWN')   return reply.status(403).send({ success: false, error: 'Нельзя открыть спор на свой лот' });
    if (msg === 'NOT_BUYER')            return reply.status(403).send({ success: false, error: 'Открыть спор может только покупатель этого лота' });
    if (msg === 'INVALID_REASON')       return unprocessable(reply, 'Опишите причину спора: от 10 до 2000 символов');
    if (msg === 'ALREADY_DISPUTED')     return reply.status(409).send({ success: false, error: 'Вы уже открыли спор по этому лоту' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create dispute' });
  }
}

export async function replyDisputeHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user;
  const { disputeId } = req.params as { disputeId: string };
  const input = (req.body ?? {}) as ReplyDisputeInput;
  if (!UUID_RE.test(disputeId)) return notFound(reply, 'Спор не найден');
  try {
    const dispute = await dealersDenService.replyDispute(disputeId, user.id, input);
    return reply.send({ success: true, data: { dispute } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'NOT_FOUND')     return reply.status(404).send({ success: false, error: 'Спор не найден' });
    if (msg === 'DISPUTE_CLOSED') return reply.status(409).send({ success: false, error: 'Спор уже закрыт' });
    if (msg === 'INVALID_REPLY')  return unprocessable(reply, 'Ответ: от 1 до 2000 символов');
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
  const { winner, resolution } = (req.body ?? {}) as ResolveDisputeInput;
  if (!UUID_RE.test(disputeId)) return notFound(reply, 'Спор не найден');
  if (winner !== 'buyer' && winner !== 'seller') return unprocessable(reply, 'winner: buyer или seller');
  if (typeof resolution !== 'string' || !resolution.trim() || resolution.length > 2000) return unprocessable(reply, 'Решение: от 1 до 2000 символов');
  try {
    await dealersDenService.resolveDispute(disputeId, user.id, winner, resolution);
    return reply.send({ success: true, data: { ok: true } });
  } catch (err) {
    if (errMessage(err) === 'NOT_FOUND') return reply.status(404).send({ success: false, error: 'Спор не найден' });
    if (errMessage(err) === 'DISPUTE_CLOSED') return reply.status(409).send({ success: false, error: 'Спор уже закрыт' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to resolve dispute' });
  }
}

// ── Seller page ───────────────────────────────────────────────────────────────

export async function getSellerPageHandler(req: FastifyRequest, reply: FastifyReply) {
  const { username } = req.params as { username: string };
  try {
    const data = await dealersDenService.getSellerPage(username, requestIsAdult(req.user));
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
    const result = await fairService.getCurrent(req.user?.id);
    return reply.send({ success: true, data: result });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load fair' });
  }
}

export async function getFairHandler(req: FastifyRequest, reply: FastifyReply) {
  const { fairId } = req.params as { fairId: string };
  if (!UUID_RE.test(fairId)) return reply.status(404).send({ success: false, error: 'Fair not found' });
  try {
    const result = await fairService.getById(fairId, req.user?.id);
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
  const { listingId } = (req.body ?? {}) as { listingId?: string };
  if (!UUID_RE.test(fairId) || (listingId !== undefined && !UUID_RE.test(listingId))) return reply.status(404).send({ success: false, error: 'Fair not found' });
  try {
    const participant = await fairService.apply(fairId, user.id, listingId);
    return reply.status(201).send({ success: true, data: { participant } });
  } catch (err) {
    const status = errStatus(err);
    if (status && status < 500) return reply.status(status).send({ success: false, error: errMessage(err) });
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
    const status = errStatus(err);
    if (status && status < 500) return reply.status(status).send({ success: false, error: errMessage(err) });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to create fair' });
  }
}

export async function updateFairParticipantAdminHandler(req: FastifyRequest, reply: FastifyReply) {
  const { fairId, userId } = req.params as { fairId: string; userId: string };
  const { status } = (req.body ?? {}) as { status: 'approved' | 'rejected' };
  if (!UUID_RE.test(fairId) || !UUID_RE.test(userId) || (status !== 'approved' && status !== 'rejected')) return reply.status(422).send({ success: false, error: 'Некорректный запрос' });
  try {
    const participant = await fairService.updateParticipant(fairId, userId, status);
    return reply.send({ success: true, data: { participant } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update participant' });
  }
}

// ── Listing applications (заявки на лот — только в группу) ─────────────────────

export async function createApplicationHandler(req: FastifyRequest, reply: FastifyReply) {
  const { listingId } = req.params as { listingId: string };
  const { message, characters } = (req.body ?? {}) as { message?: unknown; characters?: unknown };
  if (!UUID_RE.test(listingId)) return reply.status(404).send({ success: false, error: 'Лот не найден' });
  try {
    const application = await listingApplicationService.create(listingId, req.user.id, message, characters);
    return reply.status(201).send({ success: true, data: { application } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'EMPTY_MESSAGE')     return reply.status(422).send({ success: false, error: 'Напишите сообщение к заявке' });
    if (msg === 'LISTING_NOT_FOUND') return reply.status(404).send({ success: false, error: 'Лот не найден или недоступен' });
    if (msg === 'NO_GROUP')          return reply.status(409).send({ success: false, error: 'У лота нет группы-продавца' });
    if (msg === 'OWN_LISTING')       return reply.status(403).send({ success: false, error: 'Нельзя подать заявку на свой лот' });
    if (msg === 'DEN_FROZEN')        return reply.status(403).send({ success: false, error: 'Ваш аккаунт заморожен' });
    if (msg === 'INVALID_CHARACTERS' || msg === 'TOO_MANY_CHARACTERS') return reply.status(422).send({ success: false, error: 'Некорректный список персонажей (до 5, по 4 доп. референса)' });
    if (msg === 'CHARACTER_NOT_FRIEND') return reply.status(403).send({ success: false, error: 'Персонажей можно выбирать только из себя и своих друзей' });
    if (msg === 'ALREADY_APPLIED')   return reply.status(409).send({ success: false, error: 'Вы уже подавали заявку на этот лот' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Не удалось отправить заявку' });
  }
}

export async function getMyApplicationHandler(req: FastifyRequest, reply: FastifyReply) {
  const { listingId } = req.params as { listingId: string };
  if (!UUID_RE.test(listingId)) return reply.send({ success: true, data: { application: null } });
  try {
    const application = await listingApplicationService.getMine(listingId, req.user.id);
    return reply.send({ success: true, data: { application } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load application' });
  }
}

export async function listGroupApplicationsHandler(req: FastifyRequest, reply: FastifyReply) {
  const { groupId } = req.params as { groupId: string };
  const { status } = req.query as { status?: string };
  if (!UUID_RE.test(groupId)) return reply.status(404).send({ success: false, error: 'Группа не найдена' });
  try {
    const data = await listingApplicationService.listForGroup(groupId, req.user.id, status);
    return reply.send({ success: true, data });
  } catch (err) {
    if (errMessage(err) === 'FORBIDDEN') return reply.status(403).send({ success: false, error: 'Нет доступа' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load applications' });
  }
}

export async function groupApplicationsCountHandler(req: FastifyRequest, reply: FastifyReply) {
  const { groupId } = req.params as { groupId: string };
  if (!UUID_RE.test(groupId)) return reply.send({ success: true, data: { pending: 0 } });
  try {
    const pending = await listingApplicationService.pendingCount(groupId, req.user.id);
    return reply.send({ success: true, data: { pending } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load count' });
  }
}

export async function updateApplicationHandler(req: FastifyRequest, reply: FastifyReply) {
  const { applicationId } = req.params as { applicationId: string };
  const { status } = (req.body ?? {}) as { status?: string };
  if (!UUID_RE.test(applicationId)) return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
  try {
    const application = await listingApplicationService.setStatus(applicationId, req.user.id, String(status));
    return reply.send({ success: true, data: { application } });
  } catch (err) {
    const msg: string = errMessage(err) ?? '';
    if (msg === 'ALREADY_ACCEPTED') return reply.status(409).send({ success: false, error: 'Заявка принята — дальше работайте с ней в очереди заказов' });
    if (msg === 'INVALID_STATUS') return reply.status(422).send({ success: false, error: 'Неверный статус' });
    if (msg === 'NOT_FOUND')      return reply.status(404).send({ success: false, error: 'Заявка не найдена' });
    if (msg === 'FORBIDDEN')      return reply.status(403).send({ success: false, error: 'Нет доступа' });
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to update application' });
  }
}

export async function applicationCharacterOptionsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    return reply.send({ success: true, data: { options: await characterOptions(req.user.id) } });
  } catch (err) {
    req.log.error(err);
    return reply.status(500).send({ success: false, error: 'Failed to load characters' });
  }
}

// ── Общая лента: поднятия ─────────────────────────────────────────────────────

function feedError(req: FastifyRequest, reply: FastifyReply, err: unknown, fallback: string) {
  const status = errStatus(err);
  if (status && status < 500) {
    const details = (err as { details?: unknown }).details;
    return reply.status(status).send({ success: false, error: errMessage(err), code: errCode(err), ...(details ? { details } : {}) });
  }
  req.log.error(err);
  return reply.status(500).send({ success: false, error: fallback });
}

export async function getBumpInfoHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    return reply.send({ success: true, data: await getBumpInfo(req.user.id) });
  } catch (err) {
    return feedError(req, reply, err, 'Failed to load bump info');
  }
}

export async function bumpListingHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) return reply.status(404).send({ success: false, error: 'Listing not found or not yours' });
  try {
    return reply.send({ success: true, data: await bumpListing(req.user.id, id) });
  } catch (err) {
    return feedError(req, reply, err, 'Failed to bump listing');
  }
}

export async function setAutoBumpHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const { enabled } = (req.body ?? {}) as { enabled?: unknown };
  if (!UUID_RE.test(id)) return reply.status(404).send({ success: false, error: 'Listing not found or not yours' });
  if (typeof enabled !== 'boolean') return reply.status(400).send({ success: false, error: 'enabled must be boolean' });
  try {
    return reply.send({ success: true, data: { listing: await setAutoBump(req.user.id, id, enabled) } });
  } catch (err) {
    return feedError(req, reply, err, 'Failed to update auto-bump');
  }
}
