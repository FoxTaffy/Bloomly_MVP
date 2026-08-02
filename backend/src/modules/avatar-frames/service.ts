import prisma from '../../config/prisma.js';
import { isAdmin as isAdminRole } from '../../lib/roles.js';
import { notificationService } from '../notifications/service.js';
import { deleteFileByUrl } from '../media/service.js';
import type { CreateAvatarFrameInput, CalibrationInput } from './types.js';

const FRAME_SELECT = {
  id: true,
  listing_id: true,
  creator_id: true,
  name: true,
  image_url: true,
  price: true,
  default_offset_x: true,
  default_offset_y: true,
  default_scale: true,
  default_rotation: true,
  status: true,
  rejection_reason: true,
  reviewed_by: true,
  reviewed_at: true,
  created_at: true,
  creator: { select: { id: true, username: true, display_name: true, avatar_url: true } },
};

export const avatarFramesService = {
  // ── create (admin: auto-approved; artist: pending review) ──────────────────
  async create(userId: string, role: string | null | undefined, input: CreateAvatarFrameInput) {
    if (!input.name?.trim()) throw new Error('INVALID_NAME');
    if (!input.imageUrl) throw new Error('INVALID_IMAGE');
    if (input.price !== undefined && input.price < 0) throw new Error('INVALID_PRICE');

    const admin = isAdminRole(role);
    if (!admin) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { is_verified: true, verification_type: true, den_frozen: true } });
      if (!user?.is_verified || user.verification_type !== 'artist') {
        throw new Error('ARTIST_VERIFICATION_REQUIRED');
      }
      if (user.den_frozen) throw new Error('DEN_FROZEN');
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.dealerListing.create({
        data: {
          seller_id: userId,
          title: input.name.trim(),
          price: input.price ?? 0,
          category: 'avatar_frame',
          type: 'digital',
          listing_kind: 'fixed',
          images: [input.imageUrl],
          tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
          status: admin ? 'active' : 'draft',
        },
      });

      const frame = await tx.avatarFrame.create({
        data: {
          listing_id: listing.id,
          creator_id: userId,
          name: input.name.trim(),
          image_url: input.imageUrl,
          price: input.price ?? 0,
          default_offset_x: input.defaultOffsetX ?? 0,
          default_offset_y: input.defaultOffsetY ?? 0,
          default_scale: input.defaultScale ?? 1,
          default_rotation: input.defaultRotation ?? 0,
          status: admin ? 'approved' : 'pending',
          reviewed_by: admin ? userId : null,
          reviewed_at: admin ? now : null,
        },
        select: FRAME_SELECT,
      });

      return frame;
    });

    return result;
  },

  // ── claim (free instant grant, once approved) ───────────────────────────────
  async claim(frameId: string, userId: string) {
    const frame = await prisma.avatarFrame.findFirst({ where: { id: frameId, deleted_at: null } });
    if (!frame) throw new Error('FRAME_NOT_FOUND');
    if (frame.status !== 'approved') throw new Error('FRAME_NOT_APPROVED');

    const existing = await prisma.userAvatarFrame.findUnique({
      where: { user_id_frame_id: { user_id: userId, frame_id: frameId } },
    });
    if (existing) return existing;

    return prisma.userAvatarFrame.create({
      data: {
        user_id: userId,
        frame_id: frameId,
        offset_x: frame.default_offset_x,
        offset_y: frame.default_offset_y,
        scale: frame.default_scale,
        rotation: frame.default_rotation,
      },
    });
  },

  // ── caller's own calibration ─────────────────────────────────────────────────
  async updateCalibration(frameId: string, userId: string, input: CalibrationInput) {
    const owned = await prisma.userAvatarFrame.findUnique({
      where: { user_id_frame_id: { user_id: userId, frame_id: frameId } },
    });
    if (!owned) throw new Error('NOT_OWNED');

    return prisma.userAvatarFrame.update({
      where: { user_id_frame_id: { user_id: userId, frame_id: frameId } },
      data: {
        offset_x: input.offsetX ?? owned.offset_x,
        offset_y: input.offsetY ?? owned.offset_y,
        scale: input.scale ?? owned.scale,
        rotation: input.rotation ?? owned.rotation,
      },
    });
  },

  // ── frames owned by the current user ────────────────────────────────────────
  async getMine(userId: string) {
    const owned = await prisma.userAvatarFrame.findMany({
      where: { user_id: userId, frame: { deleted_at: null } },
      include: { frame: { select: FRAME_SELECT } },
      orderBy: { acquired_at: 'desc' },
    });
    return owned
      .filter((o) => o.frame.status === 'approved')
      .map((o) => ({
        ...o.frame,
        offset_x: o.offset_x,
        offset_y: o.offset_y,
        scale: o.scale,
        rotation: o.rotation,
      }));
  },

  // ── admin review queue ───────────────────────────────────────────────────────
  async adminGetSubmissions(status?: string, page = 1, limit = 20) {
    const where = status ? { status, deleted_at: null } : { deleted_at: null };
    const orderBy = status === 'pending' ? { created_at: 'asc' as const } : { created_at: 'desc' as const };
    const [submissions, total] = await Promise.all([
      prisma.avatarFrame.findMany({
        where,
        select: FRAME_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.avatarFrame.count({ where }),
    ]);
    return { submissions, total, page, limit };
  },

  async adminReview(frameId: string, action: 'approve' | 'reject', reviewerId: string, reason?: string) {
    const frame = await prisma.avatarFrame.findUnique({ where: { id: frameId } });
    if (!frame) throw new Error('FRAME_NOT_FOUND');
    if (frame.status !== 'pending') throw new Error('ALREADY_REVIEWED');

    const status = action === 'approve' ? 'approved' : 'rejected';
    const listingStatus = action === 'approve' ? 'active' : 'archived';

    const updated = await prisma.$transaction(async (tx) => {
      const f = await tx.avatarFrame.update({
        where: { id: frameId },
        data: {
          status,
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
          rejection_reason: action === 'reject' ? (reason || null) : null,
        },
        select: FRAME_SELECT,
      });
      if (frame.listing_id) {
        await tx.dealerListing.update({ where: { id: frame.listing_id }, data: { status: listingStatus } });
      }
      return f;
    });

    // A rejected frame is never claimable, so its uploaded art would otherwise sit
    // orphaned in storage forever (same cleanup dealersDenService.delete does on removal).
    if (action === 'reject') {
      deleteFileByUrl(frame.image_url).catch((err) => console.error('[avatarFrames.adminReview] media cleanup failed:', err));
    }

    await notificationService.create({
      receiverId: frame.creator_id,
      senderId: reviewerId,
      type: action === 'approve' ? 'avatar_frame_approved' : 'avatar_frame_rejected',
      refId: frameId,
      meta: { name: frame.name, reason: reason || undefined },
    });

    return updated;
  },
};
