import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';

const execFileAsync = promisify(execFile);

// ── MinIO (local S3-compatible storage) ───────────────────────────────────
const minioPassword = process.env.MINIO_ROOT_PASSWORD;
if (!minioPassword) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] MINIO_ROOT_PASSWORD env variable is not set. Refusing to start in production.');
    process.exit(1);
  }
  console.warn('[WARN] MINIO_ROOT_PASSWORD is not set. Using insecure fallback for development only.');
}

const minioClient = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'minio',
  port:      parseInt(process.env.MINIO_PORT || '9000'),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER     || 'admin',
  secretKey: minioPassword                   || 'bloomly_secret_123',
});

const BUCKET     = process.env.MINIO_BUCKET     || 'bloomly';
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'https://bloomly.fun/s3';

async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1');
    // Make bucket publicly readable
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      }],
    });
    await minioClient.setBucketPolicy(BUCKET, policy);
  }
}

// Ensure bucket exists once on startup; subsequent uploads skip the check.
// bucketReady resolves when the bucket is confirmed available.
const bucketReady: Promise<void> = ensureBucket().catch(console.error) as Promise<void>;

export class UploadValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UploadValidationError';
    this.code = code;
  }
}

/** True if the video file has no audio stream at all — i.e. it behaves like a GIF. */
async function hasNoAudioStream(buffer: Buffer, ext: string): Promise<boolean> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'probe-'));
  const inPath = path.join(dir, `in${ext || '.mp4'}`);
  try {
    await writeFile(inPath, buffer);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      inPath,
    ], { maxBuffer: 1024 * 1024 * 8 });
    return stdout.trim().length === 0;
  } catch {
    // Fail closed: if probing fails for any reason, treat it as a normal video
    // rather than risk mis-tagging a real video (with sound) as a silent gif.
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: 'posts' | 'comments' | 'avatars' | 'banners' | 'messages' | 'backgrounds' | 'stickers' | 'reports' | 'verification' = 'posts',
): Promise<{ url: string; originalUrl?: string; isSilentVideo?: boolean }> {
  // Await only if the startup promise hasn't resolved yet (no-op on subsequent calls)
  await bucketReady;

  // ── Sticker validation (Telegram rules) ───────────────────────────────
  if (folder === 'stickers') {
    if (mimeType !== 'image/png') {
      throw new UploadValidationError('STICKER_FORMAT', 'Стикер должен быть в формате PNG');
    }
    if (buffer.length > 100 * 1024) {
      throw new UploadValidationError('STICKER_SIZE', `Размер файла превышает 100 КБ (${(buffer.length / 1024).toFixed(1)} КБ)`);
    }
    const meta = await sharp(buffer).metadata();
    if (meta.width !== 512 || meta.height !== 512) {
      throw new UploadValidationError(
        'STICKER_DIMENSIONS',
        `Размер стикера должен быть 512×512 пикселей (получен ${meta.width}×${meta.height})`,
      );
    }
    const hasAlpha = meta.hasAlpha ?? false;
    if (!hasAlpha) {
      throw new UploadValidationError('STICKER_ALPHA', 'Стикер должен иметь прозрачный фон (PNG с альфа-каналом)');
    }
    // Store as-is: preserve transparency and exact pixel data
    const objectName = `stickers/${randomUUID()}.png`;
    await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, { 'Content-Type': 'image/png' });
    return { url: `${PUBLIC_URL}/${BUCKET}/${objectName}` };
  }

  let finalBuffer = buffer;
  let finalMimeType = mimeType;
  let finalExt = path.extname(originalName).toLowerCase() || '.bin';
  let originalUrl: string | undefined;

  // Process images with sharp (ignore GIFs to preserve animation if needed)
  if (mimeType.startsWith('image/') && !mimeType.includes('gif')) {
    try {
      const image = sharp(buffer);

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
          const originalObjectName = `posts/originals/${randomUUID()}${origExt}`;
          await minioClient.putObject(BUCKET, originalObjectName, buffer, buffer.length, {
            'Content-Type': mimeType,
          });
          originalUrl = `${PUBLIC_URL}/${BUCKET}/${originalObjectName}`;
        }
      }
      finalMimeType = 'image/webp';
      finalExt = '.webp';
    } catch (err: any) {
      console.error('Sharp failed to process image:', err.message);
      // Fallback to original buffer and extension if sharp fails
    }
  }

  const objectName = `${folder}/${randomUUID()}${finalExt}`;

  await minioClient.putObject(BUCKET, objectName, finalBuffer, finalBuffer.length, {
    'Content-Type': finalMimeType,
  });

  const isSilentVideo = mimeType.startsWith('video/')
    ? await hasNoAudioStream(buffer, finalExt)
    : undefined;

  // URL structure: <public_base>/<bucket>/<object>
  return { url: `${PUBLIC_URL}/${BUCKET}/${objectName}`, originalUrl, isSilentVideo };
}

export type AvatarCropRect = { x: number; y: number; w: number; h: number }; // fractions 0..1 of the source image

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 });
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

  const meta = await sharp(buffer, { animated: false }).metadata();
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

    const posterObject = `avatars/${randomUUID()}.jpg`;
    const videoObject = `avatars/${randomUUID()}.webm`;

    await minioClient.putObject(BUCKET, posterObject, posterBuffer, posterBuffer.length, { 'Content-Type': 'image/jpeg' });
    await minioClient.putObject(BUCKET, videoObject, videoBuffer, videoBuffer.length, { 'Content-Type': 'video/webm' });

    return {
      posterUrl: `${PUBLIC_URL}/${BUCKET}/${posterObject}`,
      videoUrl: `${PUBLIC_URL}/${BUCKET}/${videoObject}`,
    };
  } catch (err: any) {
    if (err instanceof UploadValidationError) throw err;
    throw new UploadValidationError('GIF_CONVERT_FAILED', `Не удалось обработать GIF: ${err?.message ?? String(err)}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Upload a raw buffer to MinIO without any processing (for trusted sources like Telegram).
 * The caller is responsible for ensuring the buffer is valid.
 */
const RAW_UPLOAD_ALLOWED_FOLDERS = ['posts', 'comments', 'avatars', 'banners', 'messages', 'backgrounds', 'stickers'] as const;

export async function uploadRawToMinIO(
  buffer: Buffer,
  ext: string,
  mimeType: string,
  folder: string = 'stickers',
): Promise<string> {
  if (!(RAW_UPLOAD_ALLOWED_FOLDERS as readonly string[]).includes(folder)) throw new Error('INVALID_FOLDER');
  await bucketReady;
  const objectName = `${folder}/${randomUUID()}${ext}`;
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

  await new Promise<void>((resolve, reject) => {
    const stream = minioClient.listObjectsV2(BUCKET, '', true);
    stream.on('data', (obj) => {
      const size = obj.size ?? 0;
      const folder = obj.name?.split('/')[0] ?? 'other';
      const entry = byFolder.get(folder) ?? { bytes: 0, count: 0 };
      entry.bytes += size;
      entry.count += 1;
      byFolder.set(folder, entry);
      totalBytes += size;
      totalObjects += 1;
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  return {
    totalBytes, totalObjects,
    byFolder: [...byFolder.entries()].map(([folder, v]) => ({ folder, ...v })).sort((a, b) => b.bytes - a.bytes),
  };
}

/**
 * Try to delete a file from MinIO by its public URL.
 * Silently ignores errors (e.g. file already gone, external URL).
 */
export async function deleteFileByUrl(url: string): Promise<void> {
  const prefix = `${PUBLIC_URL}/${BUCKET}/`;
  if (!url || !url.startsWith(prefix)) return;           // not a MinIO file
  const objectName = url.slice(prefix.length);
  try {
    await minioClient.removeObject(BUCKET, objectName);
  } catch {
    // best-effort – never throw
  }
}

/**
 * Checks a URL was actually produced by our own MinIO upload, rejecting
 * arbitrary external/attacker-supplied URLs from being stored as media references.
 */
export function isTrustedMediaUrl(url: string): boolean {
  return typeof url === 'string' && url.startsWith(`${PUBLIC_URL}/${BUCKET}/`);
}

