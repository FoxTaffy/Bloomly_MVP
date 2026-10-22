import { createHash } from 'node:crypto';
import prisma from '../../../config/prisma.js';
import { sniffMatches } from '../../../lib/fileSniff.js';
import { readStoredObject } from '../../media/service.js';
import { checkCriteria, MIN_ACCOUNT_AGE, MIN_FOLLOWERS, MIN_POSTS } from '../../verification/service.js';
import type { GateInput } from './policy.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const VIDEO_URL_RE = /\.(?:mp4|webm|mov|m4v)(?:\?|$)/i;

export interface LoadedImage { mime: (typeof IMAGE_MIMES)[number]; base64: string }

export interface Dossier {
  requestId: string;
  userId: string;
  type: string;
  gate: GateInput;
  images: LoadedImage[];
  hashes: string[];
  /** Файлы, которые не удалось прочитать из хранилища (сбой хранилища, а не вина пользователя). */
  unreadable: number;
  profile: Record<string, unknown>;
}

/** Всё, что агент знает о заявке: данные для жёстких проверок и текст/картинки для модели. */
export async function buildDossier(requestId: string): Promise<Dossier | null> {
  const req = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      user: {
        select: {
          id: true, username: true, display_name: true, bio: true, website: true, social_links: true, created_at: true,
          is_verified: true, is_banned: true, frozen_at: true, deleted_at: true, deceased_at: true,
        },
      },
    },
  });
  if (!req?.user) return null;
  const type = req.verification_type ?? 'verified';
  const isLinks = type === 'popular';

  const images: LoadedImage[] = [];
  const hashes: string[] = [];
  let videos = 0, unreadable = 0;
  if (!isLinks) {
    for (const url of req.evidence_urls) {
      if (VIDEO_URL_RE.test(url)) { videos++; continue; }
      if (images.length >= MAX_IMAGES) break;
      try {
        const buf = await readStoredObject(url, MAX_IMAGE_BYTES);
        const mime = IMAGE_MIMES.find((m) => sniffMatches(buf, m));
        if (!mime) { videos++; continue; } // не изображение: видео/неизвестный формат — человеку
        images.push({ mime, base64: buf.toString('base64') });
        hashes.push(createHash('sha256').update(buf).digest('hex'));
      } catch (err) {
        // Слишком большой файл — не сбой: просто не картинка для разбора. Остальное — сбой хранилища.
        if ((err as { statusCode?: number }).statusCode === 413) videos++; else unreadable++;
      }
    }
  }

  const [criteria, dup, posts, past, flags, openReports, fursona] = await Promise.all([
    checkCriteria(req.user_id),
    hashes.length
      ? prisma.verificationRequest.count({ where: { evidence_hashes: { hasSome: hashes }, user_id: { not: req.user_id } } })
      : Promise.resolve(0),
    prisma.post.findMany({ where: { author_id: req.user_id, deleted_at: null }, orderBy: { created_at: 'desc' }, take: 5, select: { content: true } }),
    prisma.verificationRequest.findMany({
      where: { user_id: req.user_id, id: { not: requestId }, status: 'rejected' },
      orderBy: { created_at: 'desc' }, take: 3, select: { verification_type: true, reason: true },
    }),
    prisma.autoModLog.count({
      where: { user_id: req.user_id, action: { in: ['automod_warn', 'automod_ban', 'automod_freeze'] }, created_at: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    }),
    prisma.report.count({ where: { target_id: req.user_id, status: 'pending', deleted_at: null } }),
    prisma.fursona.findFirst({
      where: { user_id: req.user_id, deleted_at: null },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      select: { name: true, species: true },
    }),
  ]);

  const u = req.user;
  return {
    requestId, userId: req.user_id, type, images, hashes, unreadable,
    gate: {
      type,
      account: { deleted: !!u.deleted_at, banned: u.is_banned, frozen: !!u.frozen_at, deceased: !!u.deceased_at, alreadyVerified: u.is_verified },
      criteria: {
        accountAgeDays: criteria.accountAgeDays, postCount: criteria.postCount, followerCount: criteria.followerCount,
        hasAvatar: criteria.hasAvatar, hasBio: criteria.hasBio, hasEmail: criteria.hasEmail,
        completenessOk: criteria.profileCompleteness.canSubmit,
        minAge: MIN_ACCOUNT_AGE, minPosts: MIN_POSTS, minFollowers: MIN_FOLLOWERS,
      },
      evidence: { images: images.length, videos, links: isLinks ? req.evidence_urls.length : 0, hasText: !!req.evidence_text },
      duplicateEvidence: dup > 0,
    },
    profile: {
      username: u.username,
      display_name: u.display_name,
      bio: u.bio,
      website: u.website,
      social_links: u.social_links,
      fursona: fursona ? { name: fursona.name, species: fursona.species } : null,
      account_age_days: criteria.accountAgeDays,
      posts: criteria.postCount,
      followers: criteria.followerCount,
      recent_posts: posts.map((p) => p.content.slice(0, 200)),
      previous_rejections: past.map((p) => ({ type: p.verification_type, reason: p.reason })),
      moderation_actions_90d: flags,
      open_reports: openReports,
      evidence_text: req.evidence_text,
      evidence_links: isLinks ? req.evidence_urls : [],
      requested_type: type,
    },
  };
}
