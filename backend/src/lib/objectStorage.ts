import {
  S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand, PutObjectCommand,
  HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, CopyObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

/**
 * Хранилище объектов (MinIO) через официальный S3 SDK. Раньше использовался SDK minio: его
 * последняя версия тянет уязвимые query-string/decode-uri-component/stream-json, которые
 * нельзя поднять без поломки самого пакета. Методы повторяют прежние вызовы, чтобы код
 * медиа не менялся: putObject(bucket, key, body, size, meta) и т. д.
 */
export type StorageConfig = {
  endPoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string; region?: string;
};

export type StoredObjectInfo = { key: string; size: number; lastModified: Date };

/** Заголовки из прежнего формата metaData: Content-Type и т. п. → поля PutObject, прочее — x-amz-meta-*. */
function putHeaders(meta: Record<string, string>) {
  const out: { ContentType?: string; ContentDisposition?: string; CacheControl?: string; Metadata?: Record<string, string> } = {};
  for (const [name, value] of Object.entries(meta)) {
    const lower = name.toLowerCase();
    if (lower === 'content-type') out.ContentType = value;
    else if (lower === 'content-disposition') out.ContentDisposition = value;
    else if (lower === 'cache-control') out.CacheControl = value;
    else (out.Metadata ??= {})[lower.replace(/^x-amz-meta-/, '')] = value;
  }
  return out;
}

const isNotFound = (err: unknown) => {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchBucket' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
};

export class ObjectStorage {
  private readonly s3: S3Client;

  constructor(cfg: StorageConfig) {
    this.s3 = new S3Client({
      endpoint: `${cfg.useSSL ? 'https' : 'http'}://${cfg.endPoint}:${cfg.port}`,
      region: cfg.region ?? 'us-east-1',
      forcePathStyle: true, // MinIO: bucket в пути, не в поддомене
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
      // Контрольные суммы CRC32 по умолчанию (SDK ≥3.729) MinIO поддерживает не во всех версиях
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async bucketExists(bucket: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async makeBucket(bucket: string, _region?: string): Promise<void> {
    await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  async setBucketPolicy(bucket: string, policy: string): Promise<void> {
    await this.s3.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: policy }));
  }

  async putObject(bucket: string, key: string, body: Buffer | Readable, size: number, meta: Record<string, string> = {}): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: size, ...putHeaders(meta) }));
  }

  async statObject(bucket: string, key: string): Promise<{ size: number; metaData: Record<string, string> }> {
    const head = await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      size: Number(head.ContentLength ?? 0),
      metaData: { 'content-type': head.ContentType ?? 'application/octet-stream', ...(head.Metadata ?? {}) },
    };
  }

  async getObject(bucket: string, key: string): Promise<Readable> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return res.Body as Readable;
  }

  /** Копия внутри бакета (метаданные и Content-Type сохраняются). */
  async copyObject(bucket: string, destKey: string, sourceKey: string): Promise<void> {
    const source = `${bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;
    await this.s3.send(new CopyObjectCommand({ Bucket: bucket, Key: destKey, CopySource: source }));
  }

  async removeObject(bucket: string, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  /** Пакетное удаление: S3 принимает до 1000 ключей за запрос. */
  async removeObjects(bucket: string, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await this.s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
    }
  }

  /** Все объекты под префиксом, страницами по 1000. */
  async *listObjects(bucket: string, prefix = ''): AsyncGenerator<StoredObjectInfo> {
    let token: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        if (o.Key) yield { key: o.Key, size: Number(o.Size ?? 0), lastModified: o.LastModified ?? new Date(0) };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
