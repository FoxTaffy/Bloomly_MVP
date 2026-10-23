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
  canReadPrivateMedia, findPrivateMediaRow, openPrivateObject, objectKeyFromRequestPath,
} from './service.js';
import { canViewMediaCached, type MediaViewer } from './access.js';
import { viewerFromMediaCookie } from '../../lib/mediaCookie.js';
import { resolveAccountIdentity } from '../../lib/accountAccess.js';
import { sniffMatches } from '../../lib/fileSniff.js';
import {
  FOLDER_MAX_BYTES, MAX_CONCURRENT_UPLOADS_GLOBAL, MAX_CONCURRENT_UPLOADS_PER_USER,
  STORAGE_QUOTA_BYTES_BY_TIER, STORAGE_TRACKED_FOLDERS,
  UPLOAD_IDLE_TIMEOUT_MS, UPLOAD_MAX_DURATION_MS, MULTIPART_OVERHEAD_BYTES,
} from '../../config/uploads.js';
import {
  ByteLimiter, LimitExceeded, DOCUMENT_MIME_TYPES, TIER_GOVERNED_FOLDERS, uploadKind, limitFor, maxAnyBytes,
  nextTierFor, requiredTierFor, formatBytes, type UploadKind,
} from './limits.js';
import { perksFor } from '../payments/plan-perks.js';
import { errCode, errMessage } from '../../lib/httpErrors.js';

// Счётчики активных загрузок на процесс. При нескольких инстансах лимит действует на каждый отдельно.
const activeUploads = new Map<string, number>();
let activeUploadsTotal = 0;

export function acquireUploadSlot(userId: string): boolean {
  if (activeUploadsTotal >= MAX_CONCURRENT_UPLOADS_GLOBAL) return false;
  const current = activeUploads.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_UPLOADS_PER_USER) return false;
  activeUploads.set(userId, current + 1);
  activeUploadsTotal += 1;
  return true;
}

export function releaseUploadSlot(userId: string): void {
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

// Evidence attached to a complaint/support ticket: screenshots and short screen recordings
// (сложные баги не показать картинкой). Аудио не принимаем.
const REPORTS_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

export const ALLOWED_FOLDERS = ['posts', 'comments', 'avatars', 'banners', 'messages', 'backgrounds', 'stickers', 'reports', 'verification', 'avatar-frames'] as const;
export type Folder = typeof ALLOWED_FOLDERS[number];

export const formatMaxSize = formatBytes;

/**
 * Что можно загружать этому пользователю: тариф, самый большой его лимит (грубая отсечка по Content-Length до
 * разбора тела) и квота хранилища. Лимит конкретного файла считается позже — когда известен его тип.
 */
export async function resolveUploadLimits(folder: Folder, userId: string): Promise<{
  tier: string;
  maxAny: number;
  uncompressed: boolean;
  storageQuotaBytes: number | null;
}> {
  const tier = (await userLookup.subscriptionTier(userId)) ?? 'free';
  // Папки с жёстким потолком: он и есть максимум. Тарифные папки: самый большой лимит тарифа.
  const maxAny = TIER_GOVERNED_FOLDERS.has(folder) ? maxAnyBytes(tier) : (FOLDER_MAX_BYTES[folder] ?? maxAnyBytes(tier));
  return {
    tier,
    maxAny,
    uncompressed: perksFor(tier).uncompressedPhotos,
    storageQuotaBytes: STORAGE_TRACKED_FOLDERS.has(folder) ? (STORAGE_QUOTA_BYTES_BY_TIER[tier] ?? null) : null,
  };
}

/** Parses a 0..1 crop fraction from a query param; falls back to `def` if missing/invalid. */
function parseFraction(raw: unknown, def: number): number {
  const n = typeof raw === 'string' ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : def;
}

export function isAllowedMime(mime: string, folder: Folder): boolean {
  if (folder === 'reports') return REPORTS_ALLOWED_MIME_TYPES.has(mime);
  // PSD и архивы принимают чат и посты (вложения), и только тарифы с maxAttachmentBytes > 0 — это проверяет лимит
  if ((folder === 'messages' || folder === 'posts') && DOCUMENT_MIME_TYPES.has(mime)) return true;
  return ALLOWED_MIME_TYPES.has(mime);
}

const DOCUMENT_EXT: Record<string, string> = {
  'application/zip': '.zip', 'application/x-7z-compressed': '.7z', 'application/vnd.rar': '.rar',
  'application/x-rar-compressed': '.rar', 'application/gzip': '.gz', 'image/vnd.adobe.photoshop': '.psd',
};

/** A request the upload pipeline refuses; turned into `{ success: false, error }` with `status`. */
export class UploadRejected extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) { super(message); }
}

const KIND_LABEL: Record<UploadKind, string> = { photo: 'Фото', video: 'Видео и аудио', document: 'Файлы и архивы' };
const TIER_LABEL: Record<string, string> = { lite: 'Lite', pro: 'Pro', business: 'Business' };

/**
 * Файл больше лимита тарифа: 413 FILE_LIMIT_EXCEEDED с подсказкой, какой тариф нужен (по размеру, если он известен,
 * иначе — следующий уровень). Тариф без такого типа файлов (лимит 0) получает 403 FILE_TYPE_NOT_IN_PLAN.
 */
export function limitError(tier: string, kind: UploadKind, folder: string, limitBytes: number, sizeBytes?: number) {
  const required = sizeBytes !== undefined ? requiredTierFor(kind, sizeBytes) : null;
  const needTier = TIER_GOVERNED_FOLDERS.has(folder) ? (required ?? nextTierFor(tier, kind)) : null;
  const details = { kind, limitBytes, tier, requiredTier: needTier };
  const upgrade = needTier && needTier !== tier ? `. Нужен тариф ${TIER_LABEL[needTier] ?? needTier}` : '';
  if (limitBytes === 0) {
    return new UploadRejected(403, 'FILE_TYPE_NOT_IN_PLAN', `${KIND_LABEL[kind]} недоступны на вашем тарифе${upgrade}`, details);
  }
  return new UploadRejected(413, 'FILE_LIMIT_EXCEEDED',
    `${KIND_LABEL[kind]}: максимум ${formatMaxSize(limitBytes)} на вашем тарифе${upgrade}`, details);
}

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
async function openUpload(request: FastifyRequest, folder: Folder, maxAny: number): Promise<MultipartFile> {
  let data;
  try {
    // Верхняя граница для busboy — самый большой лимит тарифа; точный лимит по виду файла держит ByteLimiter
    data = await request.file({ limits: { fileSize: maxAny } });
  } catch (err) {
    if (errCode(err) === 'FST_REQ_FILE_TOO_LARGE') throw new UploadRejected(413, 'FILE_LIMIT_EXCEEDED', `Файл превышает максимальный размер (${formatMaxSize(maxAny)})`);
    throw err;
  }
  if (!data) throw new UploadRejected(400, 'NO_FILE', 'No file uploaded');
  if (!isAllowedMime(data.mimetype, folder)) {
    throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', folder === 'reports' ? 'К жалобе можно приложить только изображение или видео' : 'File type not allowed');
  }
  return data;
}

/**
 * Приём потоком во временный файл: память не растёт с размером. Байты считаются на лету (ByteLimiter): как только
 * набралось больше лимита, поток обрывается, недописанный файл удаляется, ответ — 413. Зависшую отправку обрывает
 * таймаут простоя, а не общий таймаут на весь файл — иначе гигабайтные загрузки на медленном канале не доходили бы.
 * Returns the temp dir (the caller removes it) and the payload's path and size.
 */
async function receiveToTempFile(data: MultipartFile, limit: { bytes: number; onExceeded: (received: number) => UploadRejected }) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'upload-'));
  const filePath = path.join(tmpDir, 'payload');
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => { if (idle) clearTimeout(idle); idle = setTimeout(() => controller.abort(), UPLOAD_IDLE_TIMEOUT_MS); };
  const maxTimer = setTimeout(() => controller.abort(), UPLOAD_MAX_DURATION_MS);
  armIdle();
  const limiter = new ByteLimiter(limit.bytes, armIdle);
  try {
    await pipeline(data.file, limiter, createWriteStream(filePath), { signal: controller.signal });
    // busboy обрезал поток ровно на своём пределе: значит, файл больше лимита
    if (data.file.truncated) throw limit.onExceeded(Math.max(limiter.received, limit.bytes + 1));
    const { size } = await stat(filePath);
    if (size === 0) throw new UploadRejected(400, 'NO_FILE', 'Uploaded file is empty');
    return { tmpDir, filePath, sizeBytes: size };
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof LimitExceeded) throw limit.onExceeded(err.receivedBytes);
    if (errCode(err) === 'FST_REQ_FILE_TOO_LARGE') throw limit.onExceeded(Math.max(limiter.received, limit.bytes + 1));
    if (err instanceof Error && err.name === 'AbortError') {
      throw new UploadRejected(408, 'UPLOAD_TIMEOUT', 'Загрузка остановилась: от вас давно не приходили данные');
    }
    throw err;
  } finally {
    if (idle) clearTimeout(idle);
    clearTimeout(maxTimer);
  }
}

/** Content and per-folder format rules checked after the bytes have arrived. */
export async function validateContent(filePath: string, mimetype: string, folder: Folder) {
  // Тип объявляет клиент: проверяем, что содержимое действительно этого формата
  if (!sniffMatches(await readHead(filePath), mimetype)) {
    throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', 'Содержимое файла не соответствует его типу');
  }
  if (folder === 'stickers' && mimetype !== 'image/png' && mimetype !== 'image/webp') {
    throw new UploadRejected(422, 'STICKER_FORMAT', 'Стикер должен быть в формате PNG или WEBP');
  }
  // Frame art needs an alpha channel to overlay over an avatar — only PNG guarantees that here.
  if (folder === 'avatar-frames' && mimetype !== 'image/png') {
    throw new UploadRejected(422, 'FRAME_FORMAT', 'Рамка должна быть в формате PNG с прозрачным фоном');
  }
  if (folder === 'avatars' && !mimetype.startsWith('image/')) {
    throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', 'Аватар может быть только изображением или GIF');
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
export async function storeWithQuota(opts: {
  filePath: string; filename: string; mimetype: string; folder: Folder;
  userId: string; sizeBytes: number; storageQuotaBytes: number | null; uncompressed: boolean;
}) {
  const { filePath, filename, mimetype, folder, userId, sizeBytes, storageQuotaBytes, uncompressed } = opts;
  const tracked = STORAGE_TRACKED_FOLDERS.has(folder);
  if (tracked && !(await reserveStorage(userId, sizeBytes, storageQuotaBytes))) {
    throw quotaExceeded(`Хранилище заполнено (лимит ${formatMaxSize(storageQuotaBytes ?? 0)}). Освободите место или перейдите на тариф выше.`);
  }

  // Сколько места сейчас удерживается за этой загрузкой. Меняется при сверке с фактическим размером,
  // откат освобождает ровно это значение.
  let held = tracked ? sizeBytes : 0;
  const uploadedUrls: string[] = [];
  try {
    if (mimetype.startsWith('image/') && !DOCUMENT_MIME_TYPES.has(mimetype)) { // PSD — документ, не декодируем
      // Файл с диска: sharp читает его последовательно, оригинал уходит в MinIO потоком — без Buffer на весь файл
      const uploaded = await uploadFile({ filePath }, filename, mimetype, folder, { uncompressed });
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

    const isDocument = DOCUMENT_MIME_TYPES.has(mimetype);
    // Документы не должны открываться в браузере: расширение выбираем сами, тип — octet-stream, отдача — вложением
    const uploaded = await uploadStreamedFile({
      filePath,
      originalName: isDocument ? `file${DOCUMENT_EXT[mimetype]}` : filename,
      mimeType: isDocument ? 'application/octet-stream' : mimetype,
      folder,
      asAttachment: isDocument ? path.basename(filename) : undefined,
    });
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
  const fail = (status: number, code: string, message: string, details?: Record<string, unknown>) => {
    // Тело запроса ещё не дочитано: закрываем соединение, чтобы клиент не гнал остаток гигабайтов впустую
    if (status === 413 || status === 403 || status === 408) reply.header('Connection', 'close');
    return reply.code(status).send({ success: false, data: null, error: { code, message, ...(details ? { details } : {}) } });
  };

  const { tier, maxAny, uncompressed, storageQuotaBytes } = await resolveUploadLimits(folder, userId);

  // Отсекаем заведомо большой запрос по заголовку до приёма тела
  const declaredBytes = Number(request.headers['content-length'] ?? 0);
  if (declaredBytes > maxAny + MULTIPART_OVERHEAD_BYTES) {
    const r = limitError(tier, 'video', folder, maxAny, declaredBytes);
    return fail(r.status, r.code, r.message, r.details);
  }

  // Слоты ограничивают одновременную работу: и на пользователя, и на процесс целиком
  if (!acquireUploadSlot(userId)) {
    return fail(429, 'TOO_MANY_UPLOADS', 'Слишком много одновременных загрузок. Попробуйте чуть позже');
  }

  let tmpDir: string | null = null;
  try {
    const data = await openUpload(request, folder, maxAny);
    // Лимит этого файла: по виду (фото / видео / документ) и тарифу; в служебных папках — их жёсткий потолок
    const kind = uploadKind(data.mimetype);
    const limitBytes = limitFor(tier, kind, folder, FOLDER_MAX_BYTES[folder]);
    if (limitBytes === 0) throw limitError(tier, kind, folder, 0);
    const received = await receiveToTempFile(data, {
      bytes: limitBytes,
      onExceeded: (got) => limitError(tier, kind, folder, limitBytes, got),
    });
    tmpDir = received.tmpDir;
    const { filePath, sizeBytes } = received;

    await validateContent(filePath, data.mimetype, folder);

    const result = folder === 'avatars' && data.mimetype === 'image/gif'
      ? await storeGifAvatar(filePath, request.query, userId)
      : await storeWithQuota({ filePath, filename: data.filename, mimetype: data.mimetype, folder, userId, sizeBytes, storageQuotaBytes, uncompressed });
    return reply.send({ success: true, data: result, error: null });
  } catch (err) {
    if (err instanceof UploadRejected) return fail(err.status, err.code, err.message, err.details);
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

/**
 * GET /api/media/authz — проверка для внешнего nginx (auth_request) перед отдачей файла по
 * прямой ссылке /s3/<bucket>/<key>. Путь приходит в X-Original-URI. Ответ без тела:
 * 204 — отдать, 403 — запретить. Зритель: Bearer (мобильный клиент) или media-cookie (веб),
 * иначе гость. Недействительный токен не ошибка — с ним видно то же, что гостю.
 */
export const mediaAuthzHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  reply.header('Cache-Control', 'no-store');
  const key = objectKeyFromRequestPath(request.headers['x-original-uri']);
  if (!key) return reply.code(403).send();

  let viewer: MediaViewer = null;
  if (request.headers.authorization) {
    try {
      await request.jwtVerify();
      const identity = await resolveAccountIdentity((request.user as { id: string }).id);
      viewer = { id: identity.id, role: identity.role, is_adult: identity.is_adult };
    } catch {
      viewer = null;
    }
  }
  if (!viewer) viewer = await viewerFromMediaCookie(request);

  const allow = await canViewMediaCached(key, viewer);
  return reply.code(allow ? 204 : 403).send();
};
