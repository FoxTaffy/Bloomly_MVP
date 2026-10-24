/**
 * Курсорная пагинация лент. Курсор — позиция последней отданной строки (время, id и для «лучших» рейтинг),
 * а не номер страницы: пока пользователь читает, лента сдвигается (новые посты, просмотренные
 * исключаются из «Для вас»), и смещение `skip` начинало бы пропускать или дублировать посты.
 *
 * Курсор «глупый»: в БД за строкой не ходим. Prisma-курсор (`cursor: { id }, skip: 1`) ломается, когда
 * строка-курсор больше не проходит `where` (просмотренный пост попал в notIn): тогда `skip: 1` отбрасывает
 * живой пост. Время в JS — миллисекунды, в Postgres — микросекунды, поэтому верхняя граница берётся с запасом
 * в 1 мс: лучше изредка отдать дубль соседа по миллисекунде (клиент склеивает по id), чем потерять пост.
 */

export type KeysetSort = 'new' | 'old' | 'hot';

export interface Keyset {
  /** created_at последней строки, мс */
  t: number;
  id: string;
  /** rating последней строки — только для сортировки «лучшие» */
  r?: number;
}

const MAX_CURSOR_LENGTH = 400;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const encodeCursor = (payload: object): string => Buffer.from(JSON.stringify(payload)).toString('base64url');

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_CURSOR_LENGTH) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function asKeyset(value: unknown): Keyset | null {
  if (!value || typeof value !== 'object') return null;
  const { t, id, r } = value as Record<string, unknown>;
  if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 0 || t > 8.64e15) return null;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
  if (r !== undefined && (typeof r !== 'number' || !Number.isSafeInteger(r))) return null;
  return r === undefined ? { t, id } : { t, id, r };
}

/** Курсор одной ленты. null — курсор испорчен (клиент прислал мусор). */
export const decodeKeyset = (raw: unknown): Keyset | null => asKeyset(parseJson(raw));

/** Позиция строки, после которой продолжать. */
export const keysetOf = (row: { created_at: Date; id: string; rating?: number }, withRating = false): Keyset =>
  withRating ? { t: row.created_at.getTime(), id: row.id, r: row.rating ?? 0 } : { t: row.created_at.getTime(), id: row.id };

/** Условие Prisma «строки строго после курсора» для заданной сортировки. */
export function keysetWhere(cursor: Keyset, sort: KeysetSort): object {
  const notCursor = { id: { not: cursor.id } };
  if (sort === 'old') return { AND: [notCursor, { created_at: { gt: new Date(cursor.t) } }] };
  const olderOrSame = { created_at: { lt: new Date(cursor.t + 1) } };
  if (sort === 'hot') {
    return { AND: [notCursor, { OR: [{ rating: { lt: cursor.r ?? 0 } }, { rating: cursor.r ?? 0, ...olderOrSame }] }] };
  }
  return { AND: [notCursor, olderOrSame] };
}

/**
 * «Для вас» собирается из двух потоков (по любимым категориям и «открытия»), у каждого своя позиция.
 * `null` у потока — он исчерпан, повторно его не запрашиваем; поля нет вовсе — первая страница.
 */
export interface StreamsCursor {
  p: Keyset | null;
  d: Keyset | null;
  /**
   * Любимые категории, по которым пользователь делил потоки на первой странице. Пересчитываются из последних
   * действий и меняются прямо во время чтения, а пост, перескочивший из одного потока в другой, пропал бы.
   */
  c: string[];
}

export function decodeStreams(raw: unknown): StreamsCursor | null {
  const value = parseJson(raw);
  if (!value || !('p' in value) || !('d' in value)) return null;
  const p = value.p === null ? null : asKeyset(value.p);
  const d = value.d === null ? null : asKeyset(value.d);
  if ((value.p !== null && !p) || (value.d !== null && !d)) return null;
  const c = value.c;
  if (!Array.isArray(c) || c.length > 5 || c.some((x) => typeof x !== 'string' || x.length > 40)) return null;
  return { p, d, c };
}
