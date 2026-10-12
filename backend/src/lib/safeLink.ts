// Ссылки, которые пользователи задают сами (соцсети группы, реклама), выводятся как href.
// javascript:/data:/vbscript: в href исполняют код в нашем origin, поэтому пропускаем только
// явно разрешённые схемы. Ссылку без схемы считаем адресом https://, как в профиле.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Возвращает нормализованную безопасную ссылку или null, если схема не разрешена. */
export function normalizeSafeLink(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value || value.length > 2048) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  try {
    const url = new URL(hasScheme ? value : `https://${value}`);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Необязательная ссылка: пусто → null, недопустимая → исключение (его текст уходит клиенту как 400). */
export function requireSafeLink(input: unknown, label: string): string | null {
  if (input === undefined || input === null || (typeof input === 'string' && !input.trim())) return null;
  const safe = normalizeSafeLink(input);
  if (!safe) throw new Error(`Недопустимая ссылка: ${label}`);
  return safe;
}

/** Словарь соцсетей {название: ссылка}: пустые значения отбрасываются, остальные проверяются. */
export function sanitizeLinkRecord(links: Record<string, unknown> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(links ?? {})) {
    const safe = requireSafeLink(value, key);
    if (safe) out[key] = safe;
  }
  return out;
}
