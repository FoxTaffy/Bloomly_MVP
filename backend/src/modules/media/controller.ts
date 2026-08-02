import { FastifyReply, FastifyRequest } from 'fastify';
import { uploadFile, UploadValidationError, convertGifAvatarToWebm } from './service.js';
import prisma from '../../config/prisma.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4',
]);

// Evidence attached to a complaint/support ticket is a screenshot, not media —
// keep it to still images so a "жалоба" can't be used to smuggle large video/audio.
const REPORTS_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
]);

const ALLOWED_FOLDERS = ['posts', 'comments', 'avatars', 'banners', 'messages', 'backgrounds', 'stickers', 'reports', 'verification', 'avatar-frames'] as const;
type Folder = typeof ALLOWED_FOLDERS[number];

const GB = 1024 * 1024 * 1024;
// Unchanged behavior for every folder except chat attachments, which get a
// per-subscription-tier cap instead (large videos/music sent as chat attachments).
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const REPORTS_MAX_BYTES = 10 * 1024 * 1024;
const FRAME_MAX_BYTES = 5 * 1024 * 1024;
const MESSAGE_UPLOAD_LIMITS_BY_TIER: Record<string, number> = {
  free: 2 * GB,
  lite: 4 * GB,
  pro: 8 * GB,
  business: 16 * GB,
};

// Cumulative "media storage" quota advertised on the subscription page (5/20/100 GB).
// Free has no marketed storage allowance and stays uncapped at this layer — it's
// already bounded by the per-file limits above.
const STORAGE_QUOTA_BYTES_BY_TIER: Record<string, number | null> = {
  free: null,
  lite: 5 * GB,
  pro: 20 * GB,
  business: 100 * GB,
};
// Folders that count toward that quota — the content people actually upload.
// Avatars/banners/stickers/reports/verification are small, system-managed assets.
const STORAGE_TRACKED_FOLDERS = new Set<Folder>(['posts', 'comments', 'messages', 'backgrounds']);

async function resolveUploadLimits(folder: Folder, userId: string): Promise<{
  maxBytes: number;
  storageQuotaBytes: number | null;
  storageUsedBytes: bigint;
}> {
  if (folder === 'reports') return { maxBytes: REPORTS_MAX_BYTES, storageQuotaBytes: null, storageUsedBytes: 0n };
  if (folder === 'avatar-frames') return { maxBytes: FRAME_MAX_BYTES, storageQuotaBytes: null, storageUsedBytes: 0n };
  const needsTierInfo = folder === 'messages' || STORAGE_TRACKED_FOLDERS.has(folder);
  if (!needsTierInfo) return { maxBytes: DEFAULT_MAX_BYTES, storageQuotaBytes: null, storageUsedBytes: 0n };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true, storage_used_bytes: true } });
  const tier = user?.subscription_tier ?? 'free';
  const maxBytes = folder === 'messages'
    ? (MESSAGE_UPLOAD_LIMITS_BY_TIER[tier] ?? MESSAGE_UPLOAD_LIMITS_BY_TIER.free)
    : DEFAULT_MAX_BYTES;
  const storageQuotaBytes = STORAGE_TRACKED_FOLDERS.has(folder) ? (STORAGE_QUOTA_BYTES_BY_TIER[tier] ?? null) : null;
  return { maxBytes, storageQuotaBytes, storageUsedBytes: user?.storage_used_bytes ?? 0n };
}

function formatMaxSize(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(0)} ГБ` : `${Math.round(bytes / (1024 * 1024))} МБ`;
}

/** Parses a 0..1 crop fraction from a query param; falls back to `def` if missing/invalid. */
function parseFraction(raw: unknown, def: number): number {
  const n = typeof raw === 'string' ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : def;
}

function isAllowedMime(mime: string, folder: Folder): boolean {
  return folder === 'reports' ? REPORTS_ALLOWED_MIME_TYPES.has(mime) : ALLOWED_MIME_TYPES.has(mime);
}

export const uploadFileHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const data = await request.file();

  if (!data) {
    return reply.code(400).send({
      success: false,
      data: null,
      error: { code: 'NO_FILE', message: 'No file uploaded' },
    });
  }

  const rawFolder = (request.query as any).folder ?? 'posts';
  const folder: Folder = ALLOWED_FOLDERS.includes(rawFolder as Folder) ? (rawFolder as Folder) : 'posts';

  if (!isAllowedMime(data.mimetype, folder)) {
    return reply.code(415).send({
      success: false,
      data: null,
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: folder === 'reports' ? 'К жалобе можно приложить только изображение' : 'File type not allowed' },
    });
  }

  const { id: userId } = request.user as { id: string };
  const { maxBytes, storageQuotaBytes, storageUsedBytes } = await resolveUploadLimits(folder, userId);

  try {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    for await (const chunk of data.file as AsyncIterable<Buffer>) {
      total += chunk.length;
      // Keep draining instead of breaking early so the multipart parser finishes
      // reading the request body cleanly; just stop buffering past the cap.
      if (total > maxBytes) { tooLarge = true; continue; }
      chunks.push(chunk as Buffer);
    }

    if (tooLarge) {
      return reply.code(413).send({
        success: false,
        data: null,
        error: { code: 'FILE_TOO_LARGE', message: `Файл превышает максимальный размер (${formatMaxSize(maxBytes)})` },
      });
    }

    const buf = Buffer.concat(chunks);

    if (buf.length === 0) {
      return reply.code(400).send({
        success: false,
        data: null,
        error: { code: 'NO_FILE', message: 'Uploaded file is empty' },
      });
    }

    if (storageQuotaBytes !== null && storageUsedBytes + BigInt(buf.length) > BigInt(storageQuotaBytes)) {
      return reply.code(413).send({
        success: false,
        data: null,
        error: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: `Хранилище заполнено (лимит ${formatMaxSize(storageQuotaBytes)}). Освободите место или перейдите на тариф выше.`,
        },
      });
    }

    if (folder === 'stickers' && data.mimetype !== 'image/png') {
      return reply.code(422).send({
        success: false,
        data: null,
        error: { code: 'STICKER_FORMAT', message: 'Стикер должен быть в формате PNG' },
      });
    }

    // Frame art needs an alpha channel to overlay over an avatar — only PNG guarantees that here.
    if (folder === 'avatar-frames' && data.mimetype !== 'image/png') {
      return reply.code(422).send({
        success: false,
        data: null,
        error: { code: 'FRAME_FORMAT', message: 'Рамка должна быть в формате PNG с прозрачным фоном' },
      });
    }

    if (folder === 'avatars' && !data.mimetype.startsWith('image/')) {
      return reply.code(415).send({
        success: false,
        data: null,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Аватар может быть только изображением или GIF' },
      });
    }

    // Animated GIF avatars are transcoded: a 1:1-cropped static poster (→ avatar_url)
    // plus a full-frame WebM (→ avatar_video_url), far smaller than the source GIF.
    if (folder === 'avatars' && data.mimetype === 'image/gif') {
      const query = request.query as any;
      const crop = {
        x: parseFraction(query.cropX, 0),
        y: parseFraction(query.cropY, 0),
        w: parseFraction(query.cropW, 1),
        h: parseFraction(query.cropH, 1),
      };
      const { posterUrl, videoUrl } = await convertGifAvatarToWebm(buf, crop);
      return reply.send({ success: true, data: { url: posterUrl, videoUrl }, error: null });
    }

    const { url, originalUrl, isSilentVideo } = await uploadFile(buf, data.filename, data.mimetype, folder);

    if (STORAGE_TRACKED_FOLDERS.has(folder)) {
      // Best-effort metering: the upload already succeeded, so a failure here
      // shouldn't fail the request — it would just under-count this user's usage.
      prisma.user.update({
        where: { id: userId },
        data: { storage_used_bytes: { increment: buf.length } },
      }).catch((err) => (request.server as any).log.error({ err }, 'Failed to update storage usage'));
    }

    return reply.send({ success: true, data: { url, originalUrl, isSilentVideo }, error: null });
  } catch (err: any) {
    if (err instanceof UploadValidationError) {
      return reply.code(422).send({
        success: false,
        data: null,
        error: { code: err.code, message: err.message },
      });
    }
    (request.server as any).log.error({ err }, 'Media upload failed');
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'UPLOAD_ERROR', message: err?.message ?? String(err) },
    });
  }
};
