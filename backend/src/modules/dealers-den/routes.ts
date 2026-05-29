import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  listListingsHandler, getListingHandler, createListingHandler, updateListingHandler,
  deleteListingHandler, getMyListingsHandler, placeBidHandler, getBidsHandler,
  buyRaffleTicketHandler, getCommentsHandler, addCommentHandler, deleteCommentHandler,
  getTrustHandler, createReviewHandler, getListingReviewsHandler, getSellerReviewsHandler,
  deleteReviewHandler, getWeeklyTopHandler, recalcWeeklyTopHandler,
  addToWishlistHandler, removeFromWishlistHandler, getMyWishlistHandler,
  createBookingHandler, getBookingsHandler, updateBookingHandler, cancelBookingHandler,
  createDisputeHandler, replyDisputeHandler, getMyDisputesHandler,
  getAllDisputesHandler, resolveDisputeHandler, getSellerPageHandler,
  getCurrentFairHandler, getFairHandler, applyToFairHandler,
  listFairsAdminHandler, createFairAdminHandler, updateFairParticipantAdminHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function isAdmin(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    reply.status(403).send({ success: false, error: 'Admin only' });
    return;
  }
  done();
}

export async function dealersDenRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const adminOnly: RouteShorthandOptions = { onRequest: [fastify.authenticate, isAdmin as any] };

  // ── Listings ──
  fastify.get('/',              listListingsHandler as any);
  fastify.get('/me',    auth,   getMyListingsHandler as any);
  fastify.get('/:id',           getListingHandler as any);
  fastify.post('/',     auth,   createListingHandler as any);
  fastify.patch('/:id', auth,   updateListingHandler as any);
  fastify.delete('/:id', auth,  deleteListingHandler as any);

  // ── Auction / Raffle ──
  fastify.post('/:id/bid',    auth, placeBidHandler as any);
  fastify.get('/:id/bids',         getBidsHandler as any);
  fastify.post('/:id/ticket', auth, buyRaffleTicketHandler as any);

  // ── Comments ──
  fastify.get('/:id/comments',         getCommentsHandler as any);
  fastify.post('/:id/comments', auth,  addCommentHandler as any);
  fastify.delete('/comments/:commentId', auth, deleteCommentHandler as any);

  // ── Trust ──
  fastify.get('/trust/:userId', getTrustHandler as any);

  // ── Reviews ──
  fastify.post('/:listingId/review',         auth, createReviewHandler as any);
  fastify.get('/:listingId/reviews',               getListingReviewsHandler as any);
  fastify.get('/seller/:userId/reviews',           getSellerReviewsHandler as any);
  fastify.delete('/reviews/:reviewId',       auth, deleteReviewHandler as any);

  // ── Weekly Top ──
  fastify.get('/weekly-top',              getWeeklyTopHandler as any);
  fastify.post('/weekly-top/recalc', adminOnly, recalcWeeklyTopHandler as any);

  // ── Wishlist ──
  fastify.post('/:listingId/wishlist',   auth, addToWishlistHandler as any);
  fastify.delete('/:listingId/wishlist', auth, removeFromWishlistHandler as any);
  fastify.get('/wishlist/my',            auth, getMyWishlistHandler as any);

  // ── Commission Bookings ──
  fastify.post('/:listingId/booking',        auth, createBookingHandler as any);
  fastify.get('/:listingId/bookings',        auth, getBookingsHandler as any);
  fastify.patch('/bookings/:bookingId',      auth, updateBookingHandler as any);
  fastify.delete('/bookings/:bookingId',     auth, cancelBookingHandler as any);

  // ── Disputes ──
  fastify.post('/:listingId/dispute',             auth, createDisputeHandler as any);
  fastify.post('/disputes/:disputeId/reply',      auth, replyDisputeHandler as any);
  fastify.get('/disputes/my',                     auth, getMyDisputesHandler as any);

  // ── Seller page ──
  fastify.get('/seller/:username', getSellerPageHandler as any);

  // ── Fairs ──
  fastify.get('/fairs/current',                         getCurrentFairHandler as any);
  fastify.get('/fairs/:fairId',                         getFairHandler as any);
  fastify.post('/fairs/:fairId/apply',          auth,   applyToFairHandler as any);
}

export async function dealersDenAdminRoutes(fastify: FastifyInstance) {
  const adminOnly: RouteShorthandOptions = { onRequest: [fastify.authenticate, isAdmin as any] };

  fastify.get('/den-disputes',                              adminOnly, getAllDisputesHandler as any);
  fastify.patch('/den-disputes/:disputeId/resolve',         adminOnly, resolveDisputeHandler as any);
  fastify.get('/den-fairs',                                 adminOnly, listFairsAdminHandler as any);
  fastify.post('/den-fairs',                                adminOnly, createFairAdminHandler as any);
  fastify.patch('/den-fairs/:fairId/participants/:userId',  adminOnly, updateFairParticipantAdminHandler as any);
}
