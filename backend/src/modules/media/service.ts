import { ObjectStorage } from '../../lib/objectStorage.js';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import type { Readable } from 'stream';
import os from 'os';
import prisma from '../../config/prisma.js';
import { isModerator } from '../../lib/roles.js';
import {
  IMAGE_MAX_PIXELS,
  PRIVATE_FOLDERS,
  PRIVATE_KEY_PREFIX,
  STORAGE_TRACKED_FOLDERS,
} from '../../config/uploads.js';
import { isDevEnv } from '../../lib/env.js';
import { errMessage } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';

const execFileAsync = promisify(execFile);
const FFMPEG_TIMEOUT_MS = 90_000;

// ── MinIO (local S3-compatible storage) ───────────────────────────────────
const minioPassword = process.env.MINIO_ROOT_PASSWORD;
// Запасного пароля в коде нет: публичный дефолт давал бы root-доступ к хранилищу.
if (!minioPassword) {
  if (!isDevEnv()) {
    logger.error('[FATAL] MINIO_ROOT_PASSWORD env variable is not set. Refusing to start outside development/test.');
    process.exit(1);
  }
  logger.warn('[WARN] MINIO_ROOT_PASSWORD is not set. Storage requests will fail until it is configured.');
}

const minioClient = new ObjectStorage({
  endPoint:  process.env.MINIO_ENDPOINT  || 'minio',
  port:      parseInt(process.env.MINIO_PORT || '9000'),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER     || 'admin',
  secretKey: minioPassword                   || '',
});

const BUCKET     = process.env.MINIO_BUCKET     || 'bloomly';
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'https://bloomly.fun/s3';

/**
 * Анонимное чтение разрешено всему бакету, кроме закрытого префикса private/. Deny побеждает
 * Allow, поэтому жалобы, документы верификации и письма поддержки по прямой ссылке не отдаются.
 * Политика применяется при каждом старте: существующий публичный бакет тоже закрывается.
 */
function bucketPolicy(): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      },
      {
        Effect: 'Deny',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/${PRIVATE_KEY_PREFIX}*`],
      },
    ],
  });
}

async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) await minioClient.makeBucket(BUCKET, 'us-east-1');
  await minioClient.setBucketPolicy(BUCKET, bucketPolicy());
}

// Ensure bucket exists once on startup; subsequent uploads skip the check.
// bucketReady resolves when the bucket is confirmed available.
const bucketReady: Promise<void> = ensureBucket().catch((err) => {
  // Без этой политики закрытые объекты остаются публично читаемыми, поэтому ошибка заметна.
  logger.error({ err }, '[MEDIA] Не удалось настроить бакет и политику доступа');
}) as Promise<void>;

export class UploadValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UploadValidationError';
    this.code = code;
  }
}

/**
 * Ключ объекта. Закрытые папки (жалобы, верификация, поддержка) уходят под префикс private/,
 * остальные — как раньше, чтобы не ломать уже выданные ссылки.
 */
export function objectKeyFor(folder: string, ext: string): string {
  const prefix = PRIVATE_FOLDERS.has(folder) ? PRIVATE_KEY_PREFIX : '';
  return `${prefix}${folder}/${randomUUID()}${ext}`;
}

/** True, если у видео нет аудиодорожки (ведёт себя как gif). Читает файл с диска, в память не грузит. */
async function hasNoAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      filePath,
    ], { maxBuffer: 1024 * 1024 * 8 });
    return stdout.trim().length === 0;
  } catch {
    // Fail closed: if probing fails for any reason, treat it as a normal video
    // rather than risk mis-tagging a real video (with sound) as a silent gif.
    return false;
  }
}

/**
 * Загрузка изображений и стикеров. Буфер здесь оправдан: sharp декодирует картинку в память,
 * а размер ограничен IMAGE_MAX_BYTES на уровне контроллера. Видео и аудио сюда не попадают,
 * для них см. uploadStreamedFile.
 */
/** Лимит файла стикера по правилам Telegram */
export const STICKER_MAX_BYTES = 512 * 1024;

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: 'posts' | 'comments' | 'avatars' | 'banners' | 'messages' | 'backgrounds' | 'stickers' | 'reports' | 'verification' | 'avatar-frames' = 'posts',
): Promise<{ url: string; sizeBytes: number; originalUrl?: string; originalSizeBytes?: number }> {
  // Размеры возвращаем фактические: отображаемая копия и, если есть, оригинал
  // Await only if the startup promise hasn't resolved yet (no-op on subsequent calls)
  await bucketReady;

  // ── Sticker validation (Telegram rules) ───────────────────────────────
  // PNG или WEBP с прозрачным фоном, одна сторона ровно 512 px, другая не больше, файл до 512 КБ
  if (folder === 'stickers') {
    if (mimeType !== 'image/png' && mimeType !== 'image/webp') {
      throw new UploadValidationError('STICKER_FORMAT', 'Стикер должен быть в формате PNG или WEBP');
    }
    if (buffer.length > STICKER_MAX_BYTES) {
      throw new UploadValidationError('STICKER_SIZE', `Размер файла превышает 512 КБ (${(buffer.length / 1024).toFixed(1)} КБ)`);
    }
    const meta = await sharp(buffer, { limitInputPixels: IMAGE_MAX_PIXELS }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (Math.max(w, h) !== 512 || Math.min(w, h) < 1) {
      throw new UploadValidationError(
        'STICKER_DIMENSIONS',
        `Одна сторона стикера должна быть ровно 512 пикселей, вторая — 512 или меньше (получено ${w}×${h})`,
      );
    }
    if (!(meta.hasAlpha ?? false)) {
      throw new UploadValidationError('STICKER_ALPHA', 'Стикер должен иметь прозрачный фон (с альфа-каналом)');
    }
    // Store as-is: preserve transparency and exact pixel data
    const isWebp = mimeType === 'image/webp';
    const objectName = objectKeyFor('stickers', isWebp ? '.webp' : '.png');
    await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, { 'Content-Type': mimeType });
    return { url: `${PUBLIC_URL}/${BUCKET}/${objectName}`, sizeBytes: buffer.length };
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error('uploadFile принимает только изображения; видео и аудио — через uploadStreamedFile');
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error('uploadFile принимает только изображения; видео и аудио — через uploadStreamedFile');
  }

  let finalBuffer = buffer;
  let finalMimeType = mimeType;
  let finalExt = path.extname(originalName).toLowerCase() || '.bin';
  let originalUrl: string | undefined;
  let originalSizeBytes: number | undefined;

  // Process images with sharp (ignore GIFs to preserve animation if needed)
  if (!mimeType.includes('gif')) {
    try {
      const image = sharp(buffer, { limitInputPixels: IMAGE_MAX_PIXELS });

      if (folder === 'avatars') {
        finalBuffer = await image
          .resize(500, 500, { fit: 'cover' })
          .webp({ quality: 80 })
          .toBuffer();
      } else if (folder === 'banners') {
        finalBuffer = await image
          .resize(1500, 500, { fit: 'cover' })
          .webp({ quality: 80 })
          .toBuffer();
      } else if (folder === 'backgrounds') {
        finalBuffer = await image
          .resize(2560, 1440, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } else {
        // posts / messages
        finalBuffer = await image
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        // Keep the pre-compression source so it can be offered as a full-quality
        // download later — the display copy above is always the lossy WebP.
        if (folder === 'posts') {
          const origExt = path.extname(originalName).toLowerCase() || '.bin';
          const originalObjectName = objectKeyFor('posts/originals', origExt);
          await minioClient.putObject(BUCKET, originalObjectName, buffer, buffer.length, {
            'Content-Type': mimeType,
          });
          originalUrl = `${PUBLIC_URL}/${BUCKET}/${originalObjectName}`;
          originalSizeBytes = buffer.length;
        }
      }
      finalMimeType = 'image/webp';
      finalExt = '.webp';
    } catch (err) {
      logger.error({ err }, 'Sharp failed to process image');
      // Раньше тут был fallback на исходный буфер: оригинал с EXIF/GPS и картинка сверх лимита
      // пикселей уходили в хранилище и отдавались всем. Теперь такой файл отклоняется.
      throw Object.assign(new Error('Не удалось обработать изображение'), { statusCode: 400 });
    }
  }

  const objectName = objectKeyFor(folder, finalExt);

  await minioClient.putObject(BUCKET, objectName, finalBuffer, finalBuffer.length, {
    'Content-Type': finalMimeType,
  });

  // URL structure: <public_base>/<bucket>/<object>
  return { url: `${PUBLIC_URL}/${BUCKET}/${objectName}`, sizeBytes: finalBuffer.length, originalUrl, originalSizeBytes };
}

/**
 * Видео и аудио: файл уже лежит на диске, в MinIO уходит потоком. Память процесса не растёт
 * с размером файла. Временный файл удаляет вызывающий.
 */
export async function uploadStreamedFile(args: {
  filePath: string;
  originalName: string;
  mimeType: string;
  folder: string;
}): Promise<{ url: string; sizeBytes: number; isSilentVideo?: boolean }> {
  await bucketReady;
  const ext = path.extname(args.originalName).toLowerCase() || '.bin';
  const sizeBytes = statSync(args.filePath).size;
  const objectName = objectKeyFor(args.folder, ext);
  const isVideo = args.mimeType.startsWith('video/');

  const stream = createReadStream(args.filePath);
  try {
    await minioClient.putObject(BUCKET, objectName, stream, sizeBytes, { 'Content-Type': args.mimeType });
  } finally {
    stream.destroy();
  }

  const isSilentVideo = isVideo ? await hasNoAudioStream(args.filePath) : undefined;
  return { url: `${PUBLIC_URL}/${BUCKET}/${objectName}`, sizeBytes, isSilentVideo };
}

export type AvatarCropRect = { x: number; y: number; w: number; h: number }; // fractions 0..1 of the source image

async function runFfmpeg(args: string[]): Promise<void> {
  // Таймаут: тяжёлый GIF/видео не должен держать слот загрузки и CPU бесконечно
  await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64, timeout: FFMPEG_TIMEOUT_MS, killSignal: 'SIGKILL' });
}

/**
 * Converts an animated GIF avatar into two assets:
 *  - a 500x500 static poster, 1:1-cropped to the user's selection — this is what
 *    `avatar_url` points to, so every existing <img> render site keeps working unmodified.
 *  - a full-frame (uncropped) animated WebM — far smaller than the source GIF — used only
 *    where the avatar is explicitly opened/expanded (lightbox, avatar history).
 */
export async function convertGifAvatarToWebm(
  buffer: Buffer,
  crop?: AvatarCropRect,
): Promise<{ posterUrl: string; videoUrl: string }> {
  await bucketReady;

  const meta = await sharp(buffer, { animated: false, limitInputPixels: IMAGE_MAX_PIXELS }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new UploadValidationError('INVALID_GIF', 'Не удалось прочитать GIF');

  let cropW = crop ? Math.round(crop.w * width) : Math.min(width, height);
  let cropH = crop ? Math.round(crop.h * height) : Math.min(width, height);
  let cropX = crop ? Math.round(crop.x * width) : Math.round((width - cropW) / 2);
  let cropY = crop ? Math.round(crop.y * height) : Math.round((height - cropH) / 2);
  cropW = Math.min(Math.max(1, cropW), width);
  cropH = Math.min(Math.max(1, cropH), height);
  cropX = Math.min(Math.max(0, cropX), width - cropW);
  cropY = Math.min(Math.max(0, cropY), height - cropH);

  const dir = await mkdtemp(path.join(os.tmpdir(), 'avatar-gif-'));
  const inPath = path.join(dir, 'in.gif');
  const posterPath = path.join(dir, 'poster.jpg');
  const videoPath = path.join(dir, 'out.webm');

  try {
    await writeFile(inPath, buffer);

    await runFfmpeg([
      '-y', '-i', inPath,
      '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=500:500`,
      '-frames:v', '1',
      posterPath,
    ]);

    // Full video keeps the original framing (no crop) — only capped to a sane max size.
    const MAX_DIM = 720;
    const scaleFilter = width >= height ? `scale=${Math.min(width, MAX_DIM)}:-2` : `scale=-2:${Math.min(height, MAX_DIM)}`;
    await runFfmpeg([
      '-y', '-i', inPath,
      '-vf', scaleFilter,
      '-c:v', 'libvpx-vp9',
      '-b:v', '0',
      '-crf', '34',
      '-an',
      videoPath,
    ]);

    const posterBuffer = await readFile(posterPath);
    const videoBuffer = await readFile(videoPath);

    const posterObject = objectKeyFor('avatars', '.jpg');
    const videoObject = objectKeyFor('avatars', '.webm');

    await minioClient.putObject(BUCKET, posterObject, posterBuffer, posterBuffer.length, { 'Content-Type': 'image/jpeg' });
    await minioClient.putObject(BUCKET, videoObject, videoBuffer, videoBuffer.length, { 'Content-Type': 'video/webm' });

    return {
      posterUrl: `${PUBLIC_URL}/${BUCKET}/${posterObject}`,
      videoUrl: `${PUBLIC_URL}/${BUCKET}/${videoObject}`,
    };
  } catch (err) {
    if (err instanceof UploadValidationError) throw err;
    throw new UploadValidationError('GIF_CONVERT_FAILED', `Не удалось обработать GIF: ${errMessage(err) ?? String(err)}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Расширения вложений поддержки. Всё остальное сохраняется как .bin. */
const SUPPORT_EXT_ALLOWLIST = new Set(['.pdf', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.webp']);

/**
 * Upload a raw buffer to MinIO without any processing (for trusted sources like Telegram).
 * The caller is responsible for ensuring the buffer is valid.
 *
 * Вложения из почты (folder=support) непроверенные: пишутся под private/, отдаются как
 * application/octet-stream с Content-Disposition: attachment и без доверия к расширению.
 * Иначе письмо с evil.html стало бы HTML-страницей на домене bloomly.fun.
 */
const RAW_UPLOAD_ALLOWED_FOLDERS = ['posts', 'comments', 'avatars', 'banners', 'messages', 'backgrounds', 'stickers', 'support'] as const;

export async function uploadRawToMinIO(
  buffer: Buffer,
  ext: string,
  mimeType: string,
  folder: string = 'stickers',
): Promise<string> {
  if (!(RAW_UPLOAD_ALLOWED_FOLDERS as readonly string[]).includes(folder)) throw new Error('INVALID_FOLDER');
  await bucketReady;
  if (folder === 'support') {
    const safeExt = SUPPORT_EXT_ALLOWLIST.has(ext.toLowerCase()) ? ext.toLowerCase() : '.bin';
    const objectName = objectKeyFor('support', safeExt);
    await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment',
      'X-Content-Type-Options': 'nosniff',
    });
    return `${PUBLIC_URL}/${BUCKET}/${objectName}`;
  }
  const objectName = objectKeyFor(folder, ext);
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, { 'Content-Type': mimeType });
  return `${PUBLIC_URL}/${BUCKET}/${objectName}`;
}

/**
 * Real S3/MinIO usage, broken down by top-level folder (posts/, stickers/,
 * avatars/, video/ …). Lists the whole bucket — fine at our current object
 * counts; would need pagination limits if the bucket grows very large.
 */
export async function getStorageStats(): Promise<{ totalBytes: number; totalObjects: number; byFolder: { folder: string; bytes: number; count: number }[] }> {
  await bucketReady;
  const byFolder = new Map<string, { bytes: number; count: number }>();
  let totalBytes = 0;
  let totalObjects = 0;

  for await (const obj of minioClient.listObjects(BUCKET)) {
    const size = obj.size;
    const parts = obj.key.split('/');
    // Закрытые объекты лежат под private/<папка>/ — группируем по папке, а не по префиксу
    const folder = parts[0] === PRIVATE_KEY_PREFIX.slice(0, -1) && parts[1] ? parts[1] : (parts[0] || 'other');
    const entry = byFolder.get(folder) ?? { bytes: 0, count: 0 };
    entry.bytes += size;
    entry.count += 1;
    byFolder.set(folder, entry);
    totalBytes += size;
    totalObjects += 1;
  }

  return {
    totalBytes, totalObjects,
    byFolder: [...byFolder.entries()].map(([folder, v]) => ({ folder, ...v })).sort((a, b) => b.bytes - a.bytes),
  };
}

/** Папки, объём которых учитывается в квоте хранилища пользователя. */
export const STORAGE_TRACKED_FOLDER_NAMES = STORAGE_TRACKED_FOLDERS;

/**
 * Атомарно резервирует место под загрузку. Проверка и увеличение счётчика — одна операция
 * в БД, поэтому параллельные загрузки не проходят вместе сверх лимита.
 * limitBytes = null — без лимита (только учёт). Возвращает false, если места нет.
 */
export async function reserveStorage(userId: string, bytes: number, limitBytes: number | null): Promise<boolean> {
  if (bytes < 0) throw new Error('reserveStorage: отрицательный объём');
  const size = BigInt(bytes);
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      ...(limitBytes !== null ? { storage_used_bytes: { lte: BigInt(limitBytes) - size } } : {}),
    },
    data: { storage_used_bytes: { increment: size } },
  });
  return result.count === 1;
}

/**
 * Возвращает место (неудачная загрузка или уменьшение реального размера). Не уходит ниже нуля.
 * Если освобождать пришлось больше, чем числилось, это значит, что учёт уже разошёлся с
 * фактом: пишем в лог, а не скрываем обрезанием до нуля.
 */
export async function releaseStorage(userId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  const rows = await prisma.$queryRaw<{ before: bigint }[]>`
    WITH prev AS (
      SELECT storage_used_bytes AS before FROM "User" WHERE id = ${userId}::uuid FOR UPDATE
    )
    UPDATE "User" u
       SET storage_used_bytes = GREATEST(u.storage_used_bytes - ${BigInt(bytes)}, 0)
      FROM prev
     WHERE u.id = ${userId}::uuid
    RETURNING prev.before AS before`;
  const before = rows[0]?.before;
  if (before !== undefined && before < BigInt(bytes)) {
    logger.warn(`[QUOTA] освобождено ${bytes} Б при учёте ${before} Б у пользователя ${userId}: учёт расходился`);
  }
}

/**
 * Записывает владельца объекта сразу после успешной записи в хранилище.
 * ownerId = null — системный объект (вложение из почты), его может читать только персонал.
 */
export async function recordMediaOwner(url: string, ownerId: string | null, folder: string, sizeBytes: number): Promise<void> {
  const key = urlToObjectKey(url);
  if (!key) throw new Error('Not a stored media URL');
  await prisma.mediaObject.create({
    data: { object_key: key, owner_id: ownerId, folder, size_bytes: BigInt(sizeBytes) },
  });
}

/**
 * Файл можно прикрепить к контенту, только если его загрузил сам пользователь.
 * Случайный UUID в URL — не разрешение: проверяется запись о владельце.
 * Пустое значение разрешено (очистка поля).
 */
export async function assertOwnedMedia(url: unknown, ownerId: string): Promise<void> {
  if (url === undefined || url === null || url === '') return;
  const key = urlToObjectKey(url);
  if (!key) throw Object.assign(new Error('Недопустимая ссылка на файл'), { statusCode: 400 });
  const row = await prisma.mediaObject.findUnique({
    where: { object_key: key },
    select: { owner_id: true, deleted_at: true },
  });
  if (!row || row.deleted_at || row.owner_id !== ownerId) {
    throw Object.assign(new Error('Файл не принадлежит вам или не загружен'), { statusCode: 403 });
  }
}

/**
 * Системная очистка истёкшего или окончательно удалённого контента (cron). Здесь владелец
 * не проверяется: срок хранения истёк, и пользователь уже не вправе на файл ссылаться.
 * Квота освобождается один раз, повторный вызов ничего не делает.
 */
export async function purgeMediaUrl(url: string): Promise<void> {
  const key = urlToObjectKey(url);
  if (!key) return;
  const row = await prisma.mediaObject.findUnique({ where: { object_key: key }, select: { owner_id: true, folder: true, size_bytes: true, deleted_at: true } });
  if (row && !row.deleted_at) {
    const claimed = await prisma.mediaObject.updateMany({
      where: { object_key: key, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    if (claimed.count === 1 && row.owner_id && STORAGE_TRACKED_FOLDERS.has(row.folder)) {
      await releaseStorage(row.owner_id, Number(row.size_bytes));
    }
  }
  try {
    await minioClient.removeObject(BUCKET, key);
  } catch {
    // best-effort: как и при обычном удалении
  }
}

/**
 * Удаляет файл из хранилища, только если его загрузил ownerId. Чужой или неизвестный файл
 * не трогаем. Повторный вызов ничего не делает, квота уменьшается ровно один раз.
 */
export async function deleteFileByUrl(url: string, ownerId: string | null): Promise<void> {
  const key = urlToObjectKey(url);
  if (!key || !ownerId) return;
  const claimed = await prisma.mediaObject.updateMany({
    where: { object_key: key, owner_id: ownerId, deleted_at: null },
    data: { deleted_at: new Date() },
  });
  if (claimed.count === 0) return;

  const row = await prisma.mediaObject.findUnique({ where: { object_key: key }, select: { size_bytes: true, folder: true } });
  if (row && STORAGE_TRACKED_FOLDERS.has(row.folder)) {
    await releaseStorage(ownerId, Number(row.size_bytes));
  }
  try {
    await minioClient.removeObject(BUCKET, key);
  } catch {
    // best-effort: запись уже помечена удалённой, файл можно подчистить фоновой задачей
  }
}

/**
 * Откат незаписанной загрузки: объект ещё не попал в media_objects, квоту и строку не трогаем.
 * Ошибки глотаем, как и при обычном удалении.
 */
export async function removeObjectByUrl(url: string): Promise<void> {
  const key = urlToObjectKey(url);
  if (!key) return;
  try {
    await minioClient.removeObject(BUCKET, key);
  } catch {
    // best-effort
  }
}

/**
 * Checks a URL was actually produced by our own MinIO upload, rejecting
 * arbitrary external/attacker-supplied URLs from being stored as media references.
 */
export function isTrustedMediaUrl(url: string): boolean {
  return typeof url === 'string' && url.startsWith(`${PUBLIC_URL}/${BUCKET}/`);
}

/** Публичный URL объекта по его ключу (обратно к urlToObjectKey). */
export function mediaUrlForKey(key: string): string {
  return `${PUBLIC_URL}/${BUCKET}/${key}`;
}

/** Maps a stored MinIO URL back to its bucket object key, or null if it isn't one of ours. */
export function urlToObjectKey(url: unknown): string | null {
  const prefix = `${PUBLIC_URL}/${BUCKET}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}

/** Ключ: папка (возможно posts/originals) и имя файла. Ни «..», ни пустых сегментов, ни кодированных слэшей. */
const OBJECT_KEY_PATTERN = /^[a-z-]+(?:\/[a-z-]+)?\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]{1,8})?$/;

/**
 * Ключ объекта по пути запроса к хранилищу через внешний nginx (/s3/<bucket>/<key>?…).
 * Путь берётся из X-Original-URI, поэтому разбирается строго: чужой бакет, лишние сегменты
 * или необычные символы — null (доступ не выдаётся).
 */
export function objectKeyFromRequestPath(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri.length > 1024) return null;
  const pathOnly = uri.split(/[?#]/, 1)[0];
  const prefix = `${new URL(PUBLIC_URL).pathname.replace(/\/$/, '')}/${BUCKET}/`;
  if (!pathOnly.startsWith(prefix)) return null;
  const key = pathOnly.slice(prefix.length);
  return OBJECT_KEY_PATTERN.test(key) ? key : null;
}

/**
 * Байты собственного объекта по сохранённому URL — напрямую из MinIO, а не через публичный
 * адрес: закрытые папки по внешней ссылке без cookie зрителя не отдаются.
 */
export async function readStoredObject(url: string, maxBytes: number): Promise<Buffer> {
  const key = urlToObjectKey(url);
  if (!key || !OBJECT_KEY_PATTERN.test(key)) throw Object.assign(new Error('Not a stored media URL'), { statusCode: 400 });
  await bucketReady;
  const stat = await minioClient.statObject(BUCKET, key);
  if (stat.size > maxBytes) throw Object.assign(new Error('Stored object is too large'), { statusCode: 413 });
  const stream = await minioClient.getObject(BUCKET, key);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += (chunk as Buffer).length;
    if (bytes > maxBytes) { stream.destroy(); throw Object.assign(new Error('Stored object is too large'), { statusCode: 413 }); }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks, bytes);
}

// ── Чтение закрытых объектов ─────────────────────────────────────────────

export type MediaActor = { id: string; role: string | null | undefined };

/**
 * Решение о чтении закрытого файла, без обращения к БД и MinIO (чистая функция, легко тестировать).
 *  - reports, verification: автор загрузки и модераторы;
 *  - support: только модераторы. Вложение из почты владельца не имеет, это внешний ввод;
 *  - неизвестная папка: отказ.
 * Удалённый файл не отдаётся никому. Файл без владельца доступен только модераторам.
 */
export function canReadPrivateMedia(
  row: { owner_id: string | null; folder: string; deleted_at: Date | null },
  actor: MediaActor,
): boolean {
  if (row.deleted_at) return false;
  if (!PRIVATE_FOLDERS.has(row.folder)) return false;
  if (isModerator(actor.role)) return true;
  if (row.folder === 'support') return false;
  return row.owner_id !== null && row.owner_id === actor.id;
}

/** Строка учёта для закрытого файла по его публичному URL (или null, если такого объекта нет). */
export async function findPrivateMediaRow(url: string) {
  const key = urlToObjectKey(url);
  if (!key) return null;
  return prisma.mediaObject.findUnique({
    where: { object_key: key },
    select: { object_key: true, owner_id: true, folder: true, deleted_at: true, size_bytes: true },
  });
}

/** Поток байтов закрытого объекта. Вызывать только после canReadPrivateMedia. */
export async function openPrivateObject(key: string): Promise<{ stream: Readable; size: number; contentType: string }> {
  await bucketReady;
  const stat = await minioClient.statObject(BUCKET, key);
  const stream = await minioClient.getObject(BUCKET, key);
  return {
    stream,
    size: stat.size,
    contentType: String(stat.metaData?.['content-type'] ?? 'application/octet-stream'),
  };
}

/** Lists every object currently in the bucket — used by the orphaned-media cleanup script. */
export async function listAllObjectKeys(): Promise<{ key: string; size: number; lastModified: Date }[]> {
  await bucketReady;
  const objects: { key: string; size: number; lastModified: Date }[] = [];
  for await (const obj of minioClient.listObjects(BUCKET)) objects.push(obj);
  return objects;
}

/** Bulk-deletes objects by key — used by the orphaned-media cleanup script. */
export async function deleteObjectKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await bucketReady;
  await minioClient.removeObjects(BUCKET, keys);
}
