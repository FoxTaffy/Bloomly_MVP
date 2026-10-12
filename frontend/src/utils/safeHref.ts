// Ссылки, которые задают пользователи (соцсети, реклама, вложения), выводятся в href.
// Пропускаем только http(s), mailto и tel. Всё остальное (javascript:, data:, vbscript:)
// превращаем в '#', чтобы клик не выполнял код в нашем origin. Защита на фронтенде нужна
// и на бэкенде, и для уже сохранённых в БД старых записей.
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const resolved = new URL(url.trim(), window.location.origin)
    return SAFE_PROTOCOLS.has(resolved.protocol) ? resolved.href : '#'
  } catch {
    return '#'
  }
}
