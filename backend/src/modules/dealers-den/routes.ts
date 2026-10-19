import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  sellerEligibilityHandler, connectGroupHandler, groupDenStatusHandler,
  listListingsHandler, getListingHandler, createListingHandler, updateListingHandler,
  deleteListingHandler, getMyListingsHandler, placeBidHandler, getBidsHandler,
  buyRaffleTicketHandler, drawRaffleHandler, getCommentsHandler, addCommentHandler, deleteCommentHandler,
  getTrustHandler, createReviewHandler, getListingReviewsHandler, getSellerReviewsHandler,
  deleteReviewHandler, getWeeklyTopHandler, recalcWeeklyTopHandler, getTrendingTagsHandler,
  addToWishlistHandler, removeFromWishlistHandler, getMyWishlistHandler,
  createBookingHandler, getBookingsHandler, updateBookingHandler, cancelBookingHandler,
  createDisputeHandler, replyDisputeHandler, getMyDisputesHandler,
  getAllDisputesHandler, resolveDisputeHandler, getSellerPageHandler,
  getCurrentFairHandler, getFairHandler, applyToFairHandler,
  listFairsAdminHandler, createFairAdminHandler, updateFairParticipantAdminHandler,
  createApplicationHandler, getMyApplicationHandler, listGroupApplicationsHandler,
  groupApplicationsCountHandler, updateApplicationHandler, applicationCharacterOptionsHandler,
} from './controller.js';
import { requireAdminRole } from '../../lib/authHooks.js';

export async function dealersDenRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const tryAuth: RouteShorthandOptions = { onRequest: [fastify.tryAuthenticate] };
  const adminOnly: RouteShorthandOptions = { onRequest: [fastify.authenticate, requireAdminRole] };

  // ── Listings ──
  fastify.get<RouteGenericOf<typeof listListingsHandler>>('/',              tryAuth, listListingsHandler);
  fastify.get('/eligibility', auth, sellerEligibilityHandler);
  fastify.get<{ Params: { groupId: string } }>('/groups/:groupId/status', tryAuth, groupDenStatusHandler);
  fastify.post<{ Params: { groupId: string }; Body: { confirmNotScammer?: boolean } }>('/groups/:groupId/connect', auth, connectGroupHandler);
  fastify.get<RouteGenericOf<typeof getMyListingsHandler>>('/me',    auth,   getMyListingsHandler);
  fastify.get<RouteGenericOf<typeof getListingHandler>>('/:id',           tryAuth, getListingHandler);
  fastify.post<RouteGenericOf<typeof createListingHandler>>('/',     auth,   createListingHandler);
  fastify.patch<RouteGenericOf<typeof updateListingHandler>>('/:id', { onRequest: [fastify.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, updateListingHandler);
  fastify.delete<RouteGenericOf<typeof deleteListingHandler>>('/:id', auth,  deleteListingHandler);

  // ── Applications: заявка на лот уходит только в группу-продавца ──
  fastify.post('/:listingId/application', { onRequest: [fastify.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, createApplicationHandler);
  fastify.get('/application-characters', auth, applicationCharacterOptionsHandler);
  fastify.get('/:listingId/application/mine', auth, getMyApplicationHandler);
  fastify.get('/groups/:groupId/applications', auth, listGroupApplicationsHandler);
  fastify.get('/groups/:groupId/applications/count', auth, groupApplicationsCountHandler);
  fastify.patch('/applications/:applicationId', auth, updateApplicationHandler);

  // ── Auction / Raffle ──
  fastify.post<RouteGenericOf<typeof placeBidHandler>>('/:id/bid',    auth, placeBidHandler);
  fastify.get<RouteGenericOf<typeof getBidsHandler>>('/:id/bids',         getBidsHandler);
  fastify.post<RouteGenericOf<typeof buyRaffleTicketHandler>>('/:id/ticket', auth, buyRaffleTicketHandler);
  fastify.post<RouteGenericOf<typeof drawRaffleHandler>>('/:id/draw',   auth, drawRaffleHandler);

  // ── Comments ──
  fastify.get<RouteGenericOf<typeof getCommentsHandler>>('/:id/comments',         getCommentsHandler);
  fastify.post<RouteGenericOf<typeof addCommentHandler>>('/:id/comments', auth,  addCommentHandler);
  fastify.delete<RouteGenericOf<typeof deleteCommentHandler>>('/comments/:commentId', auth, deleteCommentHandler);

  // ── Trust ──
  fastify.get<RouteGenericOf<typeof getTrustHandler>>('/trust/:userId', getTrustHandler);

  // ── Reviews ──
  fastify.post<RouteGenericOf<typeof createReviewHandler>>('/:listingId/review',         auth, createReviewHandler);
  fastify.get<RouteGenericOf<typeof getListingReviewsHandler>>('/:listingId/reviews',               getListingReviewsHandler);
  fastify.get<RouteGenericOf<typeof getSellerReviewsHandler>>('/seller/:userId/reviews',           getSellerReviewsHandler);
  fastify.delete<RouteGenericOf<typeof deleteReviewHandler>>('/reviews/:reviewId',       auth, deleteReviewHandler);

  // ── Weekly Top ──
  fastify.get<RouteGenericOf<typeof getTrendingTagsHandler>>('/tags/trending',           tryAuth, getTrendingTagsHandler);
  fastify.get<RouteGenericOf<typeof getWeeklyTopHandler>>('/weekly-top',              getWeeklyTopHandler);
  fastify.post<RouteGenericOf<typeof recalcWeeklyTopHandler>>('/weekly-top/recalc', adminOnly, recalcWeeklyTopHandler);

  // ── Wishlist ──
  fastify.post<RouteGenericOf<typeof addToWishlistHandler>>('/:listingId/wishlist',   auth, addToWishlistHandler);
  fastify.delete<RouteGenericOf<typeof removeFromWishlistHandler>>('/:listingId/wishlist', auth, removeFromWishlistHandler);
  fastify.get<RouteGenericOf<typeof getMyWishlistHandler>>('/wishlist/my',            auth, getMyWishlistHandler);

  // ── Commission Bookings ──
  fastify.post<RouteGenericOf<typeof createBookingHandler>>('/:listingId/booking',        auth, createBookingHandler);
  fastify.get<RouteGenericOf<typeof getBookingsHandler>>('/:listingId/bookings',        auth, getBookingsHandler);
  fastify.patch<RouteGenericOf<typeof updateBookingHandler>>('/bookings/:bookingId',      auth, updateBookingHandler);
  fastify.delete<RouteGenericOf<typeof cancelBookingHandler>>('/bookings/:bookingId',     auth, cancelBookingHandler);

  // ── Disputes ──
  fastify.post<RouteGenericOf<typeof createDisputeHandler>>('/:listingId/dispute',             auth, createDisputeHandler);
  fastify.post<RouteGenericOf<typeof replyDisputeHandler>>('/disputes/:disputeId/reply',      auth, replyDisputeHandler);
  fastify.get<RouteGenericOf<typeof getMyDisputesHandler>>('/disputes/my',                     auth, getMyDisputesHandler);

  // ── Seller page ──
  fastify.get<RouteGenericOf<typeof getSellerPageHandler>>('/seller/:username', getSellerPageHandler);

  // ── Fairs ──
  fastify.get<RouteGenericOf<typeof getCurrentFairHandler>>('/fairs/current',                         getCurrentFairHandler);
  fastify.get<RouteGenericOf<typeof getFairHandler>>('/fairs/:fairId',                         getFairHandler);
  fastify.post<RouteGenericOf<typeof applyToFairHandler>>('/fairs/:fairId/apply',          auth,   applyToFairHandler);
}

export async function dealersDenAdminRoutes(fastify: FastifyInstance) {
  const adminOnly: RouteShorthandOptions = { onRequest: [fastify.authenticate, requireAdminRole] };

  fastify.get<RouteGenericOf<typeof getAllDisputesHandler>>('/den-disputes',                              adminOnly, getAllDisputesHandler);
  fastify.patch<RouteGenericOf<typeof resolveDisputeHandler>>('/den-disputes/:disputeId/resolve',         adminOnly, resolveDisputeHandler);
  fastify.get<RouteGenericOf<typeof listFairsAdminHandler>>('/den-fairs',                                 adminOnly, listFairsAdminHandler);
  fastify.post<RouteGenericOf<typeof createFairAdminHandler>>('/den-fairs',                                adminOnly, createFairAdminHandler);
  fastify.patch<RouteGenericOf<typeof updateFairParticipantAdminHandler>>('/den-fairs/:fairId/participants/:userId',  adminOnly, updateFairParticipantAdminHandler);
}
