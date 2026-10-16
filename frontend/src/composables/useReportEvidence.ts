import api from '../api'

// Фото жалоб лежат в закрытом префиксе private/reports/: бакет их напрямую не отдаёт.
// Модератор получает файл через API (нужен токен, поэтому blob, а не прямой src).
const cache = new Map<string, Promise<string>>()

const attachmentCache = new Map<string, Promise<string>>()

/** Вложение обращения в поддержку: автор и модераторы читают через API (закрытый префикс). */
export function fetchSupportAttachment(url: string): Promise<string> {
  let pending = attachmentCache.get(url)
  if (!pending) {
    pending = api
      .get('/support/attachment', { params: { url }, responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data as Blob))
    pending.catch(() => attachmentCache.delete(url))
    attachmentCache.set(url, pending)
  }
  return pending
}

export function fetchReportEvidence(url: string): Promise<string> {
  let pending = cache.get(url)
  if (!pending) {
    pending = api
      .get('/admin/reports/evidence', { params: { url }, responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data as Blob))
    // Неудачу не кэшируем: файл могли восстановить, а сеть — моргнуть
    pending.catch(() => cache.delete(url))
    cache.set(url, pending)
  }
  return pending
}
