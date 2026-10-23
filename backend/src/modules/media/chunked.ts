import { FastifyReply, FastifyRequest } from 'fastify';
import { createWriteStream } from 'fs';
import { mkdir, open, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { userLookup } from '../users/lookup.js';
import {
  ALLOWED_FOLDERS, acquireUploadSlot, releaseUploadSlot, isAllowedMime, limitError, resolveUploadLimits,
  storeWithQuota, UploadRejected, validateContent, type Folder,
} from './controller.js';
import { UploadValidationError } from './service.js';
import { ByteLimiter, LimitExceeded, TIER_GOVERNED_FOLDERS, limitFor, uploadKind } from './limits.js';
import {
  CHUNK_BYTES, MAX_UPLOAD_SESSIONS_GLOBAL, MAX_UPLOAD_SESSIONS_PER_USER, UPLOAD_DISK_RESERVE_BYTES,
  UPLOAD_IDLE_TIMEOUT_MS, UPLOAD_SESSION_TTL_MS,
} from '../../config/uploads.js';
import { errMessage } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';

// Чанковая загрузка: init → PATCH частями (по CHUNK_BYTES) → complete. Часть дописывается в конец временного файла
// сессии; после complete файл проходит тот же путь, что и обычная загрузка (сигнатура, пайплайн хранения), и ответ
// тот же. Состояние сессии — на диске (meta.json рядом с payload), миграций БД нет; сессия живёт, пока приходят части.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sessionsRoot = () => process.env.UPLOAD_SESSIONS_DIR || path.join(os.tmpdir(), 'bloomly-chunked');

interface Session {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  folder: Folder;
  totalSize: number;
  received: number;
  limitBytes: number;
  createdAt: string;
}

const dirOf = (id: string) => path.join(sessionsRoot(), id);
const payloadOf = (id: string) => path.join(dirOf(id), 'payload');
const metaOf = (id: string) => path.join(dirOf(id), 'meta.json');

async function saveMeta(s: Session) {
  // Запись через переименование: оборванная запись не оставит битый meta.json
  const tmp = `${metaOf(s.id)}.tmp`;
  await writeFile(tmp, JSON.stringify(s));
  await rename(tmp, metaOf(s.id));
}

async function loadSession(id: string, userId: string): Promise<Session> {
  const notFound = new UploadRejected(404, 'UPLOAD_NOT_FOUND', 'Сессия загрузки не найдена или истекла');
  if (!UUID_RE.test(id)) throw notFound;
  try {
    const s = JSON.parse(await readFile(metaOf(id), 'utf8')) as Session;
    if (s.userId !== userId) throw notFound; // чужая сессия неотличима от несуществующей
    return s;
  } catch (e) {
    if (e instanceof UploadRejected) throw e;
    throw notFound;
  }
}

// Одна часть за раз на сессию: параллельные PATCH портили бы смещения
const busy = new Set<string>();

const fail = (reply: FastifyReply, err: UploadRejected) =>
  reply.code(err.status).send({ success: false, data: null, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });

function handleError(request: FastifyRequest, reply: FastifyReply, err: unknown) {
  if (err instanceof UploadRejected) return fail(reply, err);
  if (err instanceof UploadValidationError) return reply.code(422).send({ success: false, data: null, error: { code: err.code, message: err.message } });
  request.log.error({ err }, 'Chunked upload failed');
  return reply.code(500).send({ success: false, data: null, error: { code: 'UPLOAD_ERROR', message: errMessage(err) } });
}

/** POST /api/media/upload/init — лимит тарифа проверяется ДО пересылки данных. */
export async function initUploadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user;
  try {
    const body = (request.body ?? {}) as { fileName?: unknown; mimeType?: unknown; totalSize?: unknown; folder?: unknown };
    const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 255) : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    const totalSize = Number(body.totalSize);
    const folder = (typeof body.folder === 'string' ? body.folder : 'posts') as Folder;
    if (!fileName || !mimeType || !Number.isSafeInteger(totalSize) || totalSize < 1) {
      throw new UploadRejected(400, 'INVALID_INIT', 'Нужны fileName, mimeType и totalSize');
    }
    // Крупные файлы бывают только в папках с тарифными лимитами; у аватаров, баннеров и т.п. свои малые потолки
    if (!ALLOWED_FOLDERS.includes(folder) || !TIER_GOVERNED_FOLDERS.has(folder)) {
      throw new UploadRejected(400, 'CHUNKED_NOT_SUPPORTED', 'Для этой папки чанковая загрузка недоступна');
    }
    if (!isAllowedMime(mimeType, folder)) throw new UploadRejected(415, 'UNSUPPORTED_MEDIA_TYPE', 'File type not allowed');

    const { tier, uncompressed, storageQuotaBytes } = await resolveUploadLimits(folder, userId);
    void uncompressed; void storageQuotaBytes;
    const kind = uploadKind(mimeType);
    const limitBytes = limitFor(tier, kind, folder);
    if (limitBytes === 0) throw limitError(tier, kind, folder, 0);
    if (totalSize > limitBytes) throw limitError(tier, kind, folder, limitBytes, totalSize);

    await mkdir(sessionsRoot(), { recursive: true });
    const existing = await listSessions();
    if (existing.filter((s) => s.userId === userId).length >= MAX_UPLOAD_SESSIONS_PER_USER || existing.length >= MAX_UPLOAD_SESSIONS_GLOBAL) {
      throw new UploadRejected(429, 'TOO_MANY_UPLOADS', 'Слишком много незавершённых загрузок. Дождитесь окончания или повторите позже');
    }
    // Не начинаем сессию, если для неё нет места на диске
    const fsInfo = await statfs(sessionsRoot()).catch(() => null);
    if (fsInfo && fsInfo.bavail * fsInfo.bsize < totalSize + UPLOAD_DISK_RESERVE_BYTES) {
      throw new UploadRejected(503, 'INSUFFICIENT_STORAGE', 'На сервере сейчас нет места для такой загрузки. Попробуйте позже');
    }

    const id = randomUUID();
    await mkdir(dirOf(id), { recursive: true });
    await writeFile(payloadOf(id), '');
    await saveMeta({ id, userId, fileName, mimeType, folder, totalSize, received: 0, limitBytes, createdAt: new Date().toISOString() });
    return reply.code(201).send({ success: true, data: { uploadId: id, chunkSize: CHUNK_BYTES, received: 0 }, error: null });
  } catch (err) {
    return handleError(request, reply, err);
  }
}

/** GET /api/media/upload/:uploadId — сколько байт принято (клиент продолжает с этого места после сбоя). */
export async function uploadStatusHandler(request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) {
  try {
    const s = await loadSession(request.params.uploadId, request.user.id);
    return reply.send({ success: true, data: { received: s.received, totalSize: s.totalSize, chunkSize: CHUNK_BYTES }, error: null });
  } catch (err) {
    return handleError(request, reply, err);
  }
}

/** PATCH /api/media/upload/:uploadId — очередная часть (application/octet-stream), заголовок Upload-Offset. */
export async function uploadChunkHandler(request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) {
  const id = request.params.uploadId;
  try {
    const s = await loadSession(id, request.user.id);
    if (busy.has(id)) throw new UploadRejected(409, 'UPLOAD_BUSY', 'Предыдущая часть ещё принимается');
    busy.add(id);
    try {
      const offset = Number(request.headers['upload-offset']);
      const length = Number(request.headers['content-length']);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new UploadRejected(400, 'INVALID_OFFSET', 'Нужен заголовок Upload-Offset');
      if (!Number.isSafeInteger(length) || length < 1) throw new UploadRejected(400, 'INVALID_CHUNK', 'Пустая часть');
      // Смещение должно совпадать с принятым: так повтор после сбоя не задвоит и не перепутает части
      if (offset !== s.received) {
        throw new UploadRejected(409, 'OFFSET_MISMATCH', 'Смещение не совпадает с принятым', { received: s.received });
      }
      if (length > CHUNK_BYTES) throw new UploadRejected(413, 'CHUNK_TOO_LARGE', `Часть больше ${CHUNK_BYTES} байт`, { chunkSize: CHUNK_BYTES });
      if (s.received + length > s.totalSize) {
        throw new UploadRejected(413, 'UPLOAD_SIZE_EXCEEDED', 'Данных пришло больше заявленного размера файла', { totalSize: s.totalSize });
      }

      const body = request.body as Readable | undefined;
      if (!body || typeof (body as Readable).pipe !== 'function') throw new UploadRejected(415, 'INVALID_CHUNK', 'Часть должна идти как application/octet-stream');

      // Лимит части и таймаут простоя; недописанная часть откатывается обратно к принятому
      const controller = new AbortController();
      let idle = setTimeout(() => controller.abort(), UPLOAD_IDLE_TIMEOUT_MS);
      const limiter = new ByteLimiter(length, () => { clearTimeout(idle); idle = setTimeout(() => controller.abort(), UPLOAD_IDLE_TIMEOUT_MS); });
      try {
        await pipeline(body, limiter, createWriteStream(payloadOf(id), { flags: 'r+', start: s.received }), { signal: controller.signal });
        if (limiter.received !== length) throw new UploadRejected(400, 'INVALID_CHUNK', 'Размер части не совпал с Content-Length');
      } catch (err) {
        await truncateTo(id, s.received);
        if (err instanceof LimitExceeded) throw new UploadRejected(413, 'CHUNK_TOO_LARGE', 'Часть больше заявленной длины');
        if (err instanceof Error && err.name === 'AbortError') throw new UploadRejected(408, 'UPLOAD_TIMEOUT', 'Часть не дошла: от вас давно не приходили данные');
        throw err;
      } finally {
        clearTimeout(idle);
      }

      s.received += length;
      await saveMeta(s);
      return reply.send({ success: true, data: { received: s.received, totalSize: s.totalSize }, error: null });
    } finally {
      busy.delete(id);
    }
  } catch (err) {
    return handleError(request, reply, err);
  }
}

async function truncateTo(id: string, size: number) {
  const fh = await open(payloadOf(id), 'r+').catch(() => null);
  if (!fh) return;
  try { await fh.truncate(size); } finally { await fh.close(); }
}

/** POST /api/media/upload/:uploadId/complete — сборка завершена: тот же пайплайн и тот же ответ, что у обычной загрузки. */
export async function completeUploadHandler(request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) {
  const id = request.params.uploadId;
  const { id: userId } = request.user;
  let slot = false;
  let discard = false; // удалять ли временные файлы при отказе: окончательный — да, временный сбой — нет
  try {
    const s = await loadSession(id, userId);
    if (busy.has(id)) throw new UploadRejected(409, 'UPLOAD_BUSY', 'Предыдущая часть ещё принимается');
    if (s.received !== s.totalSize) {
      throw new UploadRejected(409, 'UPLOAD_INCOMPLETE', 'Файл принят не целиком', { received: s.received, totalSize: s.totalSize });
    }
    const actual = (await stat(payloadOf(id))).size;
    if (actual !== s.totalSize) throw new UploadRejected(409, 'UPLOAD_INCOMPLETE', 'Файл принят не целиком', { received: actual, totalSize: s.totalSize });
    if (!acquireUploadSlot(userId)) throw new UploadRejected(429, 'TOO_MANY_UPLOADS', 'Слишком много одновременных загрузок. Попробуйте чуть позже');
    slot = true;
    busy.add(id);

    // Тариф и лимит снова: за время загрузки подписка могла закончиться
    const { tier, uncompressed, storageQuotaBytes } = await resolveUploadLimits(s.folder, userId);
    const kind = uploadKind(s.mimeType);
    const limitBytes = limitFor(tier, kind, s.folder);
    if (limitBytes === 0) throw limitError(tier, kind, s.folder, 0);
    if (s.totalSize > limitBytes) throw limitError(tier, kind, s.folder, limitBytes, s.totalSize);

    await validateContent(payloadOf(id), s.mimeType, s.folder);
    const result = await storeWithQuota({
      filePath: payloadOf(id), filename: s.fileName, mimetype: s.mimeType, folder: s.folder, userId,
      sizeBytes: s.totalSize, storageQuotaBytes, uncompressed,
    });
    // Файлы убираем до ответа: клиент, получив его, уже не найдёт ни сессии, ни временных данных
    await rm(dirOf(id), { recursive: true, force: true }).catch(() => {});
    return reply.send({ success: true, data: result, error: null });
  } catch (err) {
    // Окончательный отказ (не тот тип, не прошла сигнатура, лимит) повтором не исправить — файлы удаляем.
    // Временные сбои (занято, много загрузок, 5xx) и «принято не целиком» оставляют сессию: клиент повторит complete или доошлёт.
    discard = err instanceof UploadRejected
      ? ![409, 429, 503, 408].includes(err.status) && err.code !== 'UPLOAD_NOT_FOUND'
      : err instanceof UploadValidationError;
    if (discard && UUID_RE.test(id)) await rm(dirOf(id), { recursive: true, force: true }).catch(() => {});
    return handleError(request, reply, err);
  } finally {
    busy.delete(id);
    if (slot) releaseUploadSlot(userId);
  }
}

/** DELETE /api/media/upload/:uploadId — отмена: временные файлы удаляются сразу. */
export async function abortUploadHandler(request: FastifyRequest<{ Params: { uploadId: string } }>, reply: FastifyReply) {
  try {
    const s = await loadSession(request.params.uploadId, request.user.id);
    await rm(dirOf(s.id), { recursive: true, force: true });
    return reply.send({ success: true, data: null, error: null });
  } catch (err) {
    return handleError(request, reply, err);
  }
}

async function listSessions(): Promise<Session[]> {
  const names = await readdir(sessionsRoot()).catch(() => [] as string[]);
  const out: Session[] = [];
  for (const name of names) {
    if (!UUID_RE.test(name)) continue;
    try { out.push(JSON.parse(await readFile(metaOf(name), 'utf8')) as Session); } catch { /* сессия без meta чистится по таймауту */ }
  }
  return out;
}

/**
 * Cron: удаляет брошенные сессии (без активности дольше UPLOAD_SESSION_TTL_MS) вместе с временными файлами.
 * Активность — время последней записи meta.json (обновляется после каждой принятой части).
 */
export async function cleanupStaleUploadSessions(now = Date.now(), maxAgeMs = UPLOAD_SESSION_TTL_MS): Promise<number> {
  const names = await readdir(sessionsRoot()).catch(() => [] as string[]);
  let removed = 0;
  for (const name of names) {
    const dir = path.join(sessionsRoot(), name);
    try {
      const st = await stat(path.join(dir, 'meta.json')).catch(() => stat(dir)); // без meta.json — по возрасту каталога
      if (now - st.mtimeMs > maxAgeMs && !busy.has(name)) {
        await rm(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch (err) {
      logger.warn({ err, name }, '[chunked] cleanup skipped');
    }
  }
  return removed;
}
