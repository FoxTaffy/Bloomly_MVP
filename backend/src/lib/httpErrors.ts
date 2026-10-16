// Helpers for reading caught errors (`catch (e)` gives `unknown`).
// The service layer throws plain Errors, optionally with an HTTP `statusCode`;
// Prisma / Node errors carry a string `code` (e.g. 'P2002', 'ENOENT').

const field = (e: unknown, key: string): unknown =>
  typeof e === 'object' && e !== null ? (e as Record<string, unknown>)[key] : undefined;

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function errStatus(e: unknown): number | undefined {
  const v = field(e, 'statusCode');
  return typeof v === 'number' ? v : undefined;
}

export function errCode(e: unknown): string | undefined {
  const v = field(e, 'code');
  return typeof v === 'string' ? v : undefined;
}
