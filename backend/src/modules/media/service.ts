import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import path from 'path';
import sharp from 'sharp';

// ── MinIO (local S3-compatible storage) ───────────────────────────────────
const minioClient = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'minio',
  port:      parseInt(process.env.MINIO_PORT || '9000'),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER     || 'admin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || 'bloomly_secret_123',
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

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: 'posts' | 'avatars' | 'banners' | 'messages' | 'backgrounds' = 'posts',
): Promise<string> {
  // Await only if the startup promise hasn't resolved yet (no-op on subsequent calls)
  await bucketReady;

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

