import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';

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

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: 'posts' | 'avatars' | 'banners' | 'messages' | 'backgrounds' | 'stickers' = 'posts',
): Promise<string> {
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
    return `${PUBLIC_URL}/${BUCKET}/${objectName}`;
  }

  let finalBuffer = buffer;
  let finalMimeType = mimeType;
  let finalExt = path.extname(originalName).toLowerCase() || '.bin';

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

  // URL structure: <public_base>/<bucket>/<object>
  return `${PUBLIC_URL}/${BUCKET}/${objectName}`;
}

/**
 * Upload a raw buffer to MinIO without any processing (for trusted sources like Telegram).
 * The caller is responsible for ensuring the buffer is valid.
 */
export async function uploadRawToMinIO(
  buffer: Buffer,
  ext: string,
  mimeType: string,
  folder: string = 'stickers',
): Promise<string> {
  await bucketReady;
  const objectName = `${folder}/${randomUUID()}${ext}`;
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, { 'Content-Type': mimeType });
  return `${PUBLIC_URL}/${BUCKET}/${objectName}`;
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

