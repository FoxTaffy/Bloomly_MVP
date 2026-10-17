/** Bounded integers keep NaN, negative offsets and unbounded reads away from Prisma. */
export function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

export function pagination(page: unknown, limit: unknown, defaultLimit = 20, maxLimit = 100) {
  const pageNumber = boundedInteger(page, 1, 1, 100_000);
  const pageSize = boundedInteger(limit, defaultLimit, 1, maxLimit);
  return { page: pageNumber, limit: pageSize, skip: (pageNumber - 1) * pageSize };
}
