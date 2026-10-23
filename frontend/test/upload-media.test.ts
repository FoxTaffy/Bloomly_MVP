import { describe, it, expect, vi, beforeEach } from 'vitest'

// Клиентский протокол чанковой загрузки на подменённом api: порог, части, повторы, продолжение после сбоя
type Call = { method: string; url: string; offset?: number; size?: number };
const calls: Call[] = []
let serverReceived = 0
let plan: (call: Call) => Promise<any> | any = () => undefined

const ok = (data: unknown) => ({ data: { success: true, data } })
const httpError = (status: number, code: string, details?: unknown) =>
  Object.assign(new Error(code), { response: { status, data: { error: { code, details } } } })
const netError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

vi.mock('@/api', () => ({
  default: {
    post: vi.fn(async (url: string, body: any, cfg: any) => {
      const call: Call = { method: 'POST', url }
      calls.push(call)
      const planned = await plan(call)
      if (planned) return planned
      if (url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: 25, received: 0 })
      if (url.endsWith('/complete')) return ok({ url: 'https://s3/test.mp4', isSilentVideo: false })
      cfg?.onUploadProgress?.({ loaded: 1, total: 1 })
      return ok({ url: 'https://s3/single.png' })
    }),
    patch: vi.fn(async (url: string, body: Blob, cfg: any) => {
      const call: Call = { method: 'PATCH', url, offset: Number(cfg.headers['Upload-Offset']), size: body.size }
      calls.push(call)
      const planned = await plan(call)
      if (planned) return planned
      cfg.onUploadProgress?.({ loaded: body.size })
      serverReceived = call.offset! + body.size
      return ok({ received: serverReceived })
    }),
    get: vi.fn(async (url: string) => { calls.push({ method: 'GET', url }); return ok({ received: serverReceived, chunkSize: 25 }) }),
    delete: vi.fn(async (url: string) => { calls.push({ method: 'DELETE', url }); return ok(null) }),
  },
}))

import { uploadMedia, CHUNKED_THRESHOLD_BYTES } from '../src/lib/uploadMedia'

const file = (size: number, name = 'clip.mp4', type = 'video/mp4') => ({
  name, type, size,
  slice: (a: number, b: number) => ({ size: b - a }),
}) as unknown as File

beforeEach(() => { calls.length = 0; serverReceived = 0; plan = () => undefined })

describe('uploadMedia: выбор пути', () => {
  it('до 50 МБ — один POST /media/upload без чанков', async () => {
    const f = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' })
    const r = await uploadMedia(f, { folder: 'posts' })
    expect(r.url).toBe('https://s3/single.png')
    expect(calls.map(c => c.url)).toEqual(['/media/upload?folder=posts'])
  })

  it('ровно 50 МБ — ещё одним запросом, 50 МБ + 1 — частями', async () => {
    await uploadMedia(file(CHUNKED_THRESHOLD_BYTES) as any, { folder: 'posts' }).catch(() => {})
    expect(calls[0].url).toContain('/media/upload?folder=posts')
    calls.length = 0
    await uploadMedia(file(CHUNKED_THRESHOLD_BYTES + 1), { folder: 'posts' })
    expect(calls[0].url).toBe('/media/upload/init')
  })
})

describe('uploadMedia: чанковый путь', () => {
  const big = CHUNKED_THRESHOLD_BYTES + 60 // chunkSize в моках = 25 байт — три части с хвостом

  it('init → части по chunkSize → complete; ответ как у обычной загрузки', async () => {
    const total = 60
    // Порог обходим: размер файла больше порога, а сервер в моке даёт chunkSize 25
    const f = file(big)
    const progress: number[] = []
    // Меняем chunkSize так, чтобы число частей было небольшим
    plan = (c) => (c.url === '/media/upload/init' ? ok({ uploadId: 'u1', chunkSize: Math.ceil(big / 3), received: 0 }) : undefined)
    const r = await uploadMedia(f, { folder: 'posts', onProgress: (x) => progress.push(x) })
    expect(r).toMatchObject({ url: 'https://s3/test.mp4', isSilentVideo: false })
    const patches = calls.filter(c => c.method === 'PATCH')
    expect(patches).toHaveLength(3)
    expect(patches.map(p => p.offset)).toEqual([0, Math.ceil(big / 3), 2 * Math.ceil(big / 3)])
    expect(patches.reduce((s, p) => s + p.size!, 0)).toBe(big)
    expect(calls.at(-1)!.url).toBe('/media/upload/u1/complete')
    // Прогресс монотонный, до завершения не доходит до 1, в конце — ровно 1
    expect(progress.every((v, i) => i === 0 || v >= progress[i - 1])).toBe(true)
    expect(progress.slice(0, -1).every(v => v < 1)).toBe(true)
    expect(progress.at(-1)).toBe(1)
    void total
  })

  it('сетевой сбой части: повтор до 3 раз с проверкой статуса, затем успех', async () => {
    vi.useFakeTimers()
    let fails = 2
    plan = (c) => {
      if (c.url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: big, received: 0 })
      if (c.method === 'PATCH' && fails > 0) { fails -= 1; throw netError() }
    }
    const p = uploadMedia(file(big), { folder: 'posts' })
    await vi.runAllTimersAsync()
    const r = await p
    vi.useRealTimers()
    expect(r.url).toBe('https://s3/test.mp4')
    expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(3) // две неудачи и успех
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(2)   // после каждого сбоя сверяемся с сервером
  })

  it('после 3 неудачных повторов ошибка уходит наверх, временные файлы просим удалить', async () => {
    vi.useFakeTimers()
    plan = (c) => {
      if (c.url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: big, received: 0 })
      if (c.method === 'PATCH') throw netError()
    }
    const p = uploadMedia(file(big), { folder: 'posts' }).catch((e) => e)
    await vi.runAllTimersAsync()
    const err = await p
    vi.useRealTimers()
    expect(err.message).toBe('Network Error')
    expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(4) // первая попытка + 3 повтора
    expect(calls.some(c => c.method === 'DELETE')).toBe(true)
  })

  it('часть дошла, а ответ потерялся: продолжаем с места сервера, ничего не шлём дважды', async () => {
    vi.useFakeTimers()
    const chunk = Math.ceil(big / 2)
    let first = true
    plan = (c) => {
      if (c.url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: chunk, received: 0 })
      if (c.method === 'PATCH' && first) { first = false; serverReceived = chunk; throw netError() } // сервер принял, ответа нет
    }
    const p = uploadMedia(file(big), { folder: 'posts' })
    await vi.runAllTimersAsync()
    await p
    vi.useRealTimers()
    const patches = calls.filter(c => c.method === 'PATCH')
    expect(patches.map(x => x.offset)).toEqual([0, chunk]) // вторая отправка уже со второй части
  })

  it('409 OFFSET_MISMATCH: берём received с сервера без повтора и штрафа', async () => {
    const chunk = Math.ceil(big / 2)
    let first = true
    plan = (c) => {
      if (c.url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: chunk, received: 0 })
      if (c.method === 'PATCH' && first) { first = false; serverReceived = chunk; throw httpError(409, 'OFFSET_MISMATCH', { received: chunk }) }
    }
    await uploadMedia(file(big), { folder: 'posts' })
    expect(calls.filter(c => c.method === 'PATCH').map(x => x.offset)).toEqual([0, chunk])
  })

  it('окончательные отказы (лимит тарифа, формат) не повторяются; init отказал — частей нет', async () => {
    plan = (c) => { if (c.url === '/media/upload/init') throw httpError(413, 'FILE_LIMIT_EXCEEDED', { kind: 'video' }) }
    await expect(uploadMedia(file(big), { folder: 'posts' })).rejects.toMatchObject({ response: { status: 413 } })
    expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(0)

    calls.length = 0
    plan = (c) => {
      if (c.url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: big, received: 0 })
      if (c.method === 'PATCH') throw httpError(413, 'UPLOAD_SIZE_EXCEEDED')
    }
    await expect(uploadMedia(file(big), { folder: 'posts' })).rejects.toBeTruthy()
    expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(1) // без повторов
  })

  it('отмена пользователем не повторяется и не ждёт', async () => {
    plan = (c) => {
      if (c.url === '/media/upload/init') return ok({ uploadId: 'u1', chunkSize: big, received: 0 })
      if (c.method === 'PATCH') throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })
    }
    await expect(uploadMedia(file(big), { folder: 'posts' })).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(calls.filter(c => c.method === 'PATCH')).toHaveLength(1)
  })
})
