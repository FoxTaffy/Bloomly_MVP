import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import path from 'path';

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

// Ensure bucket exists on startup
ensureBucket().catch(console.error);

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: 'posts' | 'avatars' | 'banners' = 'posts',
): Promise<string> {
  await ensureBucket();

  const ext        = path.extname(originalName) || '.bin';
  const objectName = `${folder}/${randomUUID()}${ext}`;

  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': mimeType,
  });

  // URL structure: <public_base>/<bucket>/<object>
  return `${PUBLIC_URL}/${BUCKET}/${objectName}`;
}
