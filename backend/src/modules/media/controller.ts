import { FastifyReply, FastifyRequest } from 'fastify';
import { createWriteStream } from 'fs';
import { mkdtemp, open, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import {
  uploadFile, uploadStreamedFile, UploadValidationError, convertGifAvatarToWebm,
  reserveStorage, releaseStorage, recordMediaOwner, removeObjectByUrl,
  canReadPrivateMedia, findPrivateMediaRow, openPrivateObject,
} from './service.js';
import prisma from '../../config/prisma.js';
import { sniffMatches } from '../../lib/fileSniff.js';
import {
  FOLDER_MAX_BYTES, IMAGE_MAX_BYTES, MAX_CONCURRENT_UPLOADS_GLOBAL, MAX_CONCURRENT_UPLOADS_PER_USER,
  MESSAGE_LIMIT_BY_TIER, PLATFORM_MAX_UPLOAD_BYTES, STORAGE_QUOTA_BYTES_BY_TIER, STORAGE_TRACKED_FOLDERS,
  UPLOAD_TIMEOUT_MS, MULTIPART_OVERHEAD_BYTES,
} from '../../config/uploads.js';

// Счётчики активных загрузок на процесс. При нескольких инстансах лимит действует на каждый отдельно.
const activeUploads = new Map<string, number>();
let activeUploadsTotal = 0;

function acquireUploadSlot(userId: string): boolean {
  if (activeUploadsTotal >= MAX_CONCURRENT_UPLOADS_GLOBAL) return false;
  const current = activeUploads.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_UPLOADS_PER_USER) return false;
  activeUploads.set(userId, current + 1);
  activeUploadsTotal += 1;
  return true;
}

function releaseUploadSlot(userId: string): void {
  const current = activeUploads.get(userId) ?? 0;
  if (current <= 1) activeUploads.delete(userId);
  else activeUploads.set(userId, current - 1);
  activeUploadsTotal = Math.max(0, activeUploadsTotal - 1);
}

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

const DEFAULT_MAX_BYTES = PLATFORM_MAX_UPLOAD_BYTES;

function formatMaxSize(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  return bytes >= GB ? `${(bytes / GB).toFixed(0)} ГБ` : `${Math.round(bytes / (1024 * 1024))} МБ`;
}

/**
 * Лимиты для запроса: размер файла по папке и тарифу, квота хранилища.
 * Значения тарифа обрезаются до PLATFORM_MAX_UPLOAD_BYTES (см. config/uploads.ts).
 */
async function resolveUploadLimits(folder: Folder, userId: string): Promise<{
  maxBytes: number;
  storageQuotaBytes: number | null;
}> {
  const folderMax = Math.min(FOLDER_MAX_BYTES[folder] ?? DEFAULT_MAX_BYTES, PLATFORM_MAX_UPLOAD_BYTES);
  const needsTierInfo = folder === 'messages' || STORAGE_TRACKED_FOLDERS.has(folder);
  if (!needsTierInfo) return { maxBytes: folderMax, storageQuotaBytes: null };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true } });
  const tier = user?.subscription_tier ?? 'free';
  const maxBytes = folder === 'messages'
    ? Math.min(MESSAGE_LIMIT_BY_TIER[tier] ?? MESSAGE_LIMIT_BY_TIER.free, PLATFORM_MAX_UPLOAD_BYTES)
    : folderMax;
  const storageQuotaBytes = STORAGE_TRACKED_FOLDERS.has(folder) ? (STORAGE_QUOTA_BYTES_BY_TIER[tier] ?? null) : null;
  return { maxBytes, storageQuotaBytes };
}

/** Parses a 0..1 crop fraction from a query param; falls back to `def` if missing/invalid. */
function parseFraction(raw: unknown, def: number): number {
  const n = typeof raw === 'string' ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : def;
}

function isAllowedMime(mime: string, folder: Folder): boolean {
  return folder === 'reports' ? REPORTS_ALLOWED_MIME_TYPES.has(mime) : ALLOWED_MIME_TYPES.has(mime);
}

const tooLarge = (reply: FastifyReply, maxBytes: number) => reply.code(413).send({
  success: false,
  data: null,
  error: { code: 'FILE_TOO_LARGE', message: `Файл превышает максимальный размер (${formatMaxSize(maxBytes)})` },
});

/** Первые байты файла для проверки сигнатуры. Весь файл в память не читаем. */
async function readHead(filePath: string, length = 64): Promise<Buffer> {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export const uploadFileHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id: userId } = request.user as { id: string };
  const rawFolder = (request.query as any).folder ?? 'posts';
  const folder: Folder = ALLOWED_FOLDERS.includes(rawFolder as Folder) ? (rawFolder as Folder) : 'posts';

  const { maxBytes, storageQuotaBytes } = await resolveUploadLimits(folder, userId);

  // Отсекаем заведомо большой запрос по заголовку до приёма тела
  const declaredBytes = Number(request.headers['content-length'] ?? 0);
  if (declaredBytes > maxBytes + MULTIPART_OVERHEAD_BYTES) return tooLarge(reply, maxBytes);

  // Слоты ограничивают одновременную работу: и на пользователя, и на процесс целиком
  if (!acquireUploadSlot(userId)) {
    return reply.code(429).send({
      success: false,
      data: null,
      error: { code: 'TOO_MANY_UPLOADS', message: 'Слишком много одновременных загрузок. Попробуйте чуть позже' },
    });
  }

  let tmpDir: string | null = null;
  try {
    let data;
    try {
      data = await request.file({ limits: { fileSize: maxBytes } });
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') return tooLarge(reply, maxBytes);
      throw err;
    }

    if (!data) {
      return reply.code(400).send({
        success: false,
        data: null,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    if (!isAllowedMime(data.mimetype, folder)) {
      return reply.code(415).send({
        success: false,
        data: null,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: folder === 'reports' ? 'К жалобе можно приложить только изображение' : 'File type not allowed' },
      });
    }

    // Приём потоком во временный файл: память не растёт с размером, а таймаут обрывает зависшую отправку
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'upload-'));
    const filePath = path.join(tmpDir, 'payload');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      await pipeline(data.file, createWriteStream(filePath), { signal: controller.signal });
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') return tooLarge(reply, maxBytes);
      if (err?.name === 'AbortError') {
        return reply.code(408).send({
          success: false, data: null,
          error: { code: 'UPLOAD_TIMEOUT', message: 'Загрузка заняла слишком много времени' },
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (data.file.truncated) return tooLarge(reply, maxBytes);

    const { size: sizeBytes } = await stat(filePath);
    if (sizeBytes === 0) {
      return reply.code(400).send({
        success: false,
        data: null,
        error: { code: 'NO_FILE', message: 'Uploaded file is empty' },
      });
    }

    // Тип объявляет клиент: проверяем, что содержимое действительно этого формата
    if (!sniffMatches(await readHead(filePath), data.mimetype)) {
      return reply.code(415).send({
        success: false,
        data: null,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Содержимое файла не соответствует его типу' },
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

    const isImage = data.mimetype.startsWith('image/');

    // Изображения декодируются sharp в память, поэтому для них отдельный и меньший лимит
    if (isImage && sizeBytes > Math.min(IMAGE_MAX_BYTES, maxBytes)) {
      return tooLarge(reply, Math.min(IMAGE_MAX_BYTES, maxBytes));
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
      const { posterUrl, videoUrl } = await convertGifAvatarToWebm(await readFileBuffer(filePath), crop);
      // Оба файла принадлежат загрузившему: иначе аватар из GIF нельзя сохранить в профиль
      await recordMediaOwner(posterUrl, userId, folder, 0);
      await recordMediaOwner(videoUrl, userId, folder, 0);
      return reply.send({ success: true, data: { url: posterUrl, videoUrl }, error: null });
    }

    // Квота резервируется атомарно до записи в хранилище по размеру исходника.
    // После записи резерв сверяется с фактически сохранёнными объектами.
    const tracked = STORAGE_TRACKED_FOLDERS.has(folder);
    if (tracked && !(await reserveStorage(userId, sizeBytes, storageQuotaBytes))) {
      return reply.code(413).send({
        success: false,
        data: null,
        error: {
          code: 'STORAGE_QUOTA_EXCEEDED',
          message: `Хранилище заполнено (лимит ${formatMaxSize(storageQuotaBytes ?? 0)}). Освободите место или перейдите на тариф выше.`,
        },
      });
    }

    // Сколько места сейчас удерживается за этой загрузкой. Меняется при сверке с фактическим размером,
    // откат освобождает ровно это значение.
    let held = tracked ? sizeBytes : 0;
    const uploadedUrls: string[] = [];
    try {
      if (isImage) {
        const buf = await readFileBuffer(filePath);
        const uploaded = await uploadFile(buf, data.filename, data.mimetype, folder);
        uploadedUrls.push(uploaded.url);
        if (uploaded.originalUrl) uploadedUrls.push(uploaded.originalUrl);

        // Фактический размер: отображаемая копия (webp) и, если есть, оригинал — раздельно
        const displaySize = uploaded.sizeBytes;
        const originalSize = uploaded.originalUrl ? uploaded.originalSizeBytes : 0;
        if (tracked) {
          const delta = displaySize + originalSize - sizeBytes;
          if (delta > 0) {
            if (!(await reserveStorage(userId, delta, storageQuotaBytes))) {
              throw Object.assign(new Error('STORAGE_QUOTA_EXCEEDED'), { code: 'STORAGE_QUOTA_EXCEEDED' });
            }
            held += delta;
          } else if (delta < 0) {
            await releaseStorage(userId, -delta);
            held += delta;
          }
        }
        await recordMediaOwner(uploaded.url, userId, folder, displaySize);
        if (uploaded.originalUrl) await recordMediaOwner(uploaded.originalUrl, userId, folder, originalSize);

        return reply.send({ success: true, data: { url: uploaded.url, originalUrl: uploaded.originalUrl }, error: null });
      }

      const uploaded = await uploadStreamedFile({
        filePath,
        originalName: data.filename,
        mimeType: data.mimetype,
        folder,
      });
      uploadedUrls.push(uploaded.url);
      await recordMediaOwner(uploaded.url, userId, folder, uploaded.sizeBytes);
      return reply.send({ success: true, data: { url: uploaded.url, isSilentVideo: uploaded.isSilentVideo }, error: null });
    } catch (err) {
      // Откат: удаляем уже записанные объекты и возвращаем удерживаемое место
      await Promise.all(uploadedUrls.map((url) => removeObjectByUrl(url)));
      if (tracked && held > 0) await releaseStorage(userId, held);
      if ((err as any)?.code === 'STORAGE_QUOTA_EXCEEDED') {
        return reply.code(413).send({
          success: false,
          data: null,
          error: { code: 'STORAGE_QUOTA_EXCEEDED', message: 'Хранилище заполнено. Освободите место или перейдите на тариф выше.' },
        });
      }
      throw err;
    }
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
  } finally {
    releaseUploadSlot(userId);
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

const readFileBuffer = (filePath: string): Promise<Buffer> => readFile(filePath);

/**
 * GET /api/media/private?url=… — отдача закрытого файла (жалобы, верификация, поддержка).
 * Прямая ссылка на такой объект анонимно не работает: бакет запрещает чтение private/.
 * Права проверяются здесь. Не найдено и запрещено различаем, потому что сам факт
 * существования объекта владельцу-чужаку знать не нужно, поэтому оба случая — 404.
 */
export const getPrivateMediaHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const url = (request.query as any)?.url;
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_URL', message: 'Некорректная ссылка' } });
  }
  const row = await findPrivateMediaRow(url);
  const actor = request.user as { id: string; role: string };
  if (!row || !canReadPrivateMedia(row, actor)) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Файл не найден' } });
  }

  const { stream, size, contentType } = await openPrivateObject(row.object_key);
  reply.header('Cache-Control', 'private, no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  // Ответ не должен исполняться как документ: даже если тип ошибочен, в браузере он не отрисуется
  reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
  if (row.folder === 'support') {
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', 'attachment');
  } else {
    reply.header('Content-Type', contentType);
  }
  reply.header('Content-Length', size);
  return reply.send(stream);
};
