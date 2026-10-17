// Helpers for reading caught errors (`catch (e)` gives `unknown`).
// The service layer throws plain Errors, optionally with an HTTP `statusCode`;
// Prisma / Node errors carry a string `code` (e.g. 'P2002', 'ENOENT').

const field = (e: unknown, key: string): unknown =>
  typeof e === 'object' && e !== null ? (e as Record<string, unknown>)[key] : undefined;

export function errMessage(e: unknown): string {
  const code = field(e, 'code');
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) {
    if (code === 'P2002') return 'Record already exists';
    if (code === 'P2025') return 'Not found';
    return 'Invalid request';
  }
  const name = field(e, 'name');
  if (typeof name === 'string' && name.startsWith('Prisma')) return 'Invalid request';
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
