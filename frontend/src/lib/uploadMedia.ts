import api from '@/api'
import { effectiveMime } from '@/lib/uploadLimits'

// Единая загрузка медиа. Файлы до порога уходят одним POST /media/upload; крупнее — частями (чанки по chunkSize),
// чтобы каждый запрос проходил через Cloudflare (лимит тела 100 МБ на Free/Pro). Ответ у обоих путей одинаковый.

export const CHUNKED_THRESHOLD_BYTES = 50 * 1024 * 1024
/** Автоматических повторов одной части при сетевом сбое. */
export const CHUNK_RETRIES = 3

export interface UploadResult {
  url: string
  originalUrl?: string
  videoUrl?: string
  isSilentVideo?: boolean
}

export interface UploadOptions {
  folder: string
  /** Доля отправленного, 0..1 (по сумме байт всех частей). */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

// Ошибки, которые повтором не лечатся: лимит тарифа, формат, доступ, чужая/истёкшая сессия
const DEFINITIVE = new Set([400, 401, 403, 404, 413, 415, 422])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}
function codeOf(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code
}
function receivedOf(err: unknown): number | undefined {
  return (err as { response?: { data?: { error?: { details?: { received?: number } } } } })?.response?.data?.error?.details?.received
}
const isAborted = (err: unknown) => (err as { code?: string })?.code === 'ERR_CANCELED' || (err as { name?: string })?.name === 'CanceledError'

/** С типом по расширению для PSD и архивов: сервер принимает только известные типы. */
function typedFile(file: File): File {
  const mime = effectiveMime(file)
  return mime === file.type ? file : new File([file], file.name, { type: mime })
}

async function uploadSingle(file: File, opts: UploadOptions): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', typedFile(file))
  const res = await api.post(`/media/upload?folder=${encodeURIComponent(opts.folder)}`, form, {
    headers: { 'Content-Type': undefined },
    signal: opts.signal,
    onUploadProgress: (p) => { if (p.total && p.total > 0) opts.onProgress?.(p.loaded / p.total) },
  })
  return res.data.data as UploadResult
}

async function uploadChunked(file: File, opts: UploadOptions): Promise<UploadResult> {
  const init = await api.post('/media/upload/init', {
    fileName: file.name, mimeType: effectiveMime(file), totalSize: file.size, folder: opts.folder,
  }, { signal: opts.signal })
  const { uploadId, chunkSize } = init.data.data as { uploadId: string; chunkSize: number }
  const base = `/media/upload/${uploadId}`
  const total = file.size
  let confirmed = 0 // байт, принятых сервером

  const report = (inflight = 0) => opts.onProgress?.(Math.min(0.99, (confirmed + inflight) / total))

  try {
    while (confirmed < total) {
      const start = confirmed
      const end = Math.min(start + chunkSize, total)
      let attempt = 0
      for (;;) {
        try {
          const res = await api.patch(base, file.slice(start, end), {
            headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(start) },
            signal: opts.signal,
            // Свою часть шлём целиком; прогресс суммируется с уже принятыми
            onUploadProgress: (p) => report(Math.min(p.loaded, end - start)),
          })
          confirmed = res.data.data.received as number
          report()
          break
        } catch (err) {
          if (isAborted(err)) throw err
          // Сервер уже принял больше (ответ потерялся): продолжаем с его места, это не повтор
          if (statusOf(err) === 409 && codeOf(err) === 'OFFSET_MISMATCH' && typeof receivedOf(err) === 'number') {
            confirmed = receivedOf(err)!
            report()
            break
          }
          const status = statusOf(err)
          if ((status && DEFINITIVE.has(status)) || attempt >= CHUNK_RETRIES) throw err
          attempt += 1
          await sleep(1000 * 2 ** (attempt - 1)) // 1 с, 2 с, 4 с
          // После сбоя сверяемся с сервером: часть могла дойти
          try {
            const st = await api.get(base, { signal: opts.signal })
            const got = st.data.data.received as number
            if (got !== start) { confirmed = got; report(); break }
          } catch (e2) {
            if (isAborted(e2)) throw e2
          }
        }
      }
    }
    const done = await api.post(`${base}/complete`, undefined, { signal: opts.signal })
    opts.onProgress?.(1)
    return done.data.data as UploadResult
  } catch (err) {
    // Временные файлы на сервере не нужны (если сессия ещё жива; ошибка отмены не страшна)
    if (statusOf(err) !== 404) api.delete(base).catch(() => {})
    throw err
  }
}

/** Загружает файл в хранилище; выбирает одиночный или чанковый путь по размеру. */
export function uploadMedia(file: File, opts: UploadOptions): Promise<UploadResult> {
  return file.size <= CHUNKED_THRESHOLD_BYTES ? uploadSingle(file, opts) : uploadChunked(file, opts)
}
