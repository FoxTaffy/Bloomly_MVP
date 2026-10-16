import { FastifyReply, FastifyRequest } from 'fastify';
import { userLookup } from '../users/lookup.js';
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
import { sniffMatches } from '../../lib/fileSniff.js';
import {
  FOLDER_MAX_BYTES, IMAGE_MAX_BYTES, MAX_CONCURRENT_UPLOADS_GLOBAL, MAX_CONCURRENT_UPLOADS_PER_USER,
  MESSAGE_LIMIT_BY_TIER, PLATFORM_MAX_UPLOAD_BYTES, STORAGE_QUOTA_BYTES_BY_TIER, STORAGE_TRACKED_FOLDERS,
  UPLOAD_TIMEOUT_MS, MULTIPART_OVERHEAD_BYTES,
} from '../../config/uploads.js';
import { errCode, errMessage } from '../../lib/httpErrors.js';

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

  const tier = (await userLookup.subscriptionTier(userId)) ?? 'free';
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

/** A request the upload pipeline refuses; turned into `{ success: false, error }` with `status`. */
class UploadRejected extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const tooLarge = (maxBytes: number) =>
  new UploadRejected(413, 'FILE_TOO_LARGE', `Файл превышает максимальный размер (${formatMaxSize(maxBytes)})`);

const quotaExceeded = (message = 'Хранилище заполнено. Освободите место или перейдите на тариф выше.') =>
  new UploadRejected(413, 'STORAGE_QUOTA_EXCEEDED', message);

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

const readFileBuffer = (filePath: string): Promise<Buffer> => readFile(filePath);

type MultipartFile = NonNullable<Awaited<ReturnType<FastifyRequest['file']>>>;

/** Opens the multipart file part and checks its declared type is allowed for the folder. */
async function openUpload(request: FastifyRequest, folder: Folder, maxBytes: number): Promise<MultipartFile> {
  let data;
  try {
    data = await request.file({ limits: { fileSize: maxBytes } });
  } catch (err) {
    if (errCode(err) === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge(maxBytes);
    throw err;
  }
  if (!data) throw new UploadRejected(400, 'NO_FILE', 'No file uploaded');
  if (!isAllowedMime(data.mimetype, folder)) {
    throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', folder === 'reports' ? 'К жалобе можно приложить только изображение' : 'File type not allowed');
  }
  return data;
}

/**
 * Приём потоком во временный файл: память не растёт с размером, а таймаут обрывает зависшую отправку.
 * Returns the temp dir (the caller removes it) and the payload's path and size.
 */
async function receiveToTempFile(data: MultipartFile, maxBytes: number) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'upload-'));
  const filePath = path.join(tmpDir, 'payload');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    await pipeline(data.file, createWriteStream(filePath), { signal: controller.signal });
    if (data.file.truncated) throw tooLarge(maxBytes);
    const { size } = await stat(filePath);
    if (size === 0) throw new UploadRejected(400, 'NO_FILE', 'Uploaded file is empty');
    return { tmpDir, filePath, sizeBytes: size };
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (errCode(err) === 'FST_REQ_FILE_TOO_LARGE') throw tooLarge(maxBytes);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UploadRejected(408, 'UPLOAD_TIMEOUT', 'Загрузка заняла слишком много времени');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Content and per-folder format rules checked after the bytes have arrived. */
async function validateContent(filePath: string, mimetype: string, folder: Folder, sizeBytes: number, maxBytes: number) {
  // Тип объявляет клиент: проверяем, что содержимое действительно этого формата
  if (!sniffMatches(await readHead(filePath), mimetype)) {
    throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', 'Содержимое файла не соответствует его типу');
  }
  if (folder === 'stickers' && mimetype !== 'image/png') {
    throw new UploadRejected(422, 'STICKER_FORMAT', 'Стикер должен быть в формате PNG');
  }
  // Frame art needs an alpha channel to overlay over an avatar — only PNG guarantees that here.
  if (folder === 'avatar-frames' && mimetype !== 'image/png') {
    throw new UploadRejected(422, 'FRAME_FORMAT', 'Рамка должна быть в формате PNG с прозрачным фоном');
  }
  if (folder === 'avatars' && !mimetype.startsWith('image/')) {
    throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', 'Аватар может быть только изображением или GIF');
  }
  // Изображения декодируются sharp в память, поэтому для них отдельный и меньший лимит
  if (mimetype.startsWith('image/') && sizeBytes > Math.min(IMAGE_MAX_BYTES, maxBytes)) {
    throw tooLarge(Math.min(IMAGE_MAX_BYTES, maxBytes));
  }
}

/**
 * Animated GIF avatars are transcoded: a 1:1-cropped static poster (→ avatar_url)
 * plus a full-frame WebM (→ avatar_video_url), far smaller than the source GIF.
 */
async function storeGifAvatar(filePath: string, query: Record<string, unknown>, userId: string) {
  const crop = {
    x: parseFraction(query.cropX, 0),
    y: parseFraction(query.cropY, 0),
    w: parseFraction(query.cropW, 1),
    h: parseFraction(query.cropH, 1),
  };
  const { posterUrl, videoUrl } = await convertGifAvatarToWebm(await readFileBuffer(filePath), crop);
  // Оба файла принадлежат загрузившему: иначе аватар из GIF нельзя сохранить в профиль
  await recordMediaOwner(posterUrl, userId, 'avatars', 0);
  await recordMediaOwner(videoUrl, userId, 'avatars', 0);
  return { url: posterUrl, videoUrl };
}

/**
 * Writes the file to storage and records its owner. In tracked folders the quota is reserved
 * atomically up front by the source size, then reconciled with what was actually stored;
 * on any failure the written objects are deleted and the held space is returned.
 */
async function storeWithQuota(opts: {
  filePath: string; filename: string; mimetype: string; folder: Folder;
  userId: string; sizeBytes: number; storageQuotaBytes: number | null;
}) {
  const { filePath, filename, mimetype, folder, userId, sizeBytes, storageQuotaBytes } = opts;
  const tracked = STORAGE_TRACKED_FOLDERS.has(folder);
  if (tracked && !(await reserveStorage(userId, sizeBytes, storageQuotaBytes))) {
    throw quotaExceeded(`Хранилище заполнено (лимит ${formatMaxSize(storageQuotaBytes ?? 0)}). Освободите место или перейдите на тариф выше.`);
  }

  // Сколько места сейчас удерживается за этой загрузкой. Меняется при сверке с фактическим размером,
  // откат освобождает ровно это значение.
  let held = tracked ? sizeBytes : 0;
  const uploadedUrls: string[] = [];
  try {
    if (mimetype.startsWith('image/')) {
      const uploaded = await uploadFile(await readFileBuffer(filePath), filename, mimetype, folder);
      uploadedUrls.push(uploaded.url);
      if (uploaded.originalUrl) uploadedUrls.push(uploaded.originalUrl);

      // Фактический размер: отображаемая копия (webp) и, если есть, оригинал — раздельно
      const displaySize = uploaded.sizeBytes;
      const originalSize = uploaded.originalSizeBytes ?? 0;
      if (tracked) {
        const delta = displaySize + originalSize - sizeBytes;
        if (delta > 0) {
          if (!(await reserveStorage(userId, delta, storageQuotaBytes))) throw quotaExceeded();
          held += delta;
        } else if (delta < 0) {
          await releaseStorage(userId, -delta);
          held += delta;
        }
      }
      await recordMediaOwner(uploaded.url, userId, folder, displaySize);
      if (uploaded.originalUrl) await recordMediaOwner(uploaded.originalUrl, userId, folder, originalSize);
      return { url: uploaded.url, originalUrl: uploaded.originalUrl };
    }

    const uploaded = await uploadStreamedFile({ filePath, originalName: filename, mimeType: mimetype, folder });
    uploadedUrls.push(uploaded.url);
    await recordMediaOwner(uploaded.url, userId, folder, uploaded.sizeBytes);
    return { url: uploaded.url, isSilentVideo: uploaded.isSilentVideo };
  } catch (err) {
    // Откат: удаляем уже записанные объекты и возвращаем удерживаемое место
    await Promise.all(uploadedUrls.map((url) => removeObjectByUrl(url)));
    if (tracked && held > 0) await releaseStorage(userId, held);
    throw err;
  }
}

export const uploadFileHandler = async (
  request: FastifyRequest<{ Querystring: Record<string, unknown> & { folder?: string } }>,
  reply: FastifyReply,
) => {
  const { id: userId } = request.user;
  const rawFolder = request.query.folder ?? 'posts';
  const folder: Folder = ALLOWED_FOLDERS.includes(rawFolder as Folder) ? (rawFolder as Folder) : 'posts';
  const fail = (status: number, code: string, message: string) =>
    reply.code(status).send({ success: false, data: null, error: { code, message } });

  const { maxBytes, storageQuotaBytes } = await resolveUploadLimits(folder, userId);

  // Отсекаем заведомо большой запрос по заголовку до приёма тела
  const declaredBytes = Number(request.headers['content-length'] ?? 0);
  if (declaredBytes > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    const r = tooLarge(maxBytes);
    return fail(r.status, r.code, r.message);
  }

  // Слоты ограничивают одновременную работу: и на пользователя, и на процесс целиком
  if (!acquireUploadSlot(userId)) {
    return fail(429, 'TOO_MANY_UPLOADS', 'Слишком много одновременных загрузок. Попробуйте чуть позже');
  }

  let tmpDir: string | null = null;
  try {
    const data = await openUpload(request, folder, maxBytes);
    const received = await receiveToTempFile(data, maxBytes);
    tmpDir = received.tmpDir;
    const { filePath, sizeBytes } = received;

    await validateContent(filePath, data.mimetype, folder, sizeBytes, maxBytes);

    const result = folder === 'avatars' && data.mimetype === 'image/gif'
      ? await storeGifAvatar(filePath, request.query, userId)
      : await storeWithQuota({ filePath, filename: data.filename, mimetype: data.mimetype, folder, userId, sizeBytes, storageQuotaBytes });
    return reply.send({ success: true, data: result, error: null });
  } catch (err) {
    if (err instanceof UploadRejected) return fail(err.status, err.code, err.message);
    if (err instanceof UploadValidationError) return fail(422, err.code, err.message);
    request.log.error({ err }, 'Media upload failed');
    return fail(500, 'UPLOAD_ERROR', errMessage(err));
  } finally {
    releaseUploadSlot(userId);
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

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
