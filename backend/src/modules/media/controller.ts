import { FastifyReply, FastifyRequest } from 'fastify';
import { uploadFile, UploadValidationError } from './service.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4',
]);

const ALLOWED_FOLDERS = ['posts', 'avatars', 'banners', 'messages', 'backgrounds', 'stickers'] as const;
type Folder = typeof ALLOWED_FOLDERS[number];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
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

  if (!isAllowedMime(data.mimetype)) {
    return reply.code(415).send({
      success: false,
      data: null,
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'File type not allowed' },
    });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const buf = Buffer.concat(chunks);

    if (buf.length === 0) {
      return reply.code(400).send({
        success: false,
        data: null,
        error: { code: 'NO_FILE', message: 'Uploaded file is empty' },
      });
    }

    const rawFolder = (request.query as any).folder ?? 'posts';
    const folder: Folder = ALLOWED_FOLDERS.includes(rawFolder as Folder) ? (rawFolder as Folder) : 'posts';

    if (folder === 'stickers' && data.mimetype !== 'image/png') {
      return reply.code(422).send({
        success: false,
        data: null,
        error: { code: 'STICKER_FORMAT', message: 'Стикер должен быть в формате PNG' },
      });
    }

    const url = await uploadFile(buf, data.filename, data.mimetype, folder);
    return reply.send({ success: true, data: { url }, error: null });
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
