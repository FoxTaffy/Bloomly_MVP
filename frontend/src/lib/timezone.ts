// Zero-dependency timezone conversion for post scheduling. Uses the standard
// Intl.DateTimeFormat.formatToParts "offset guess" trick (the same technique
// libraries like date-fns-tz use internally) instead of pulling in a library.

/** Device/region timezone (same signal every OS derives from locale settings) — no manual picker, matches how other platforms schedule posts. */
export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** "YYYY-MM-DDTHH:mm" wall-clock in `timeZone` → UTC ISO string. */
export function zonedTimeToUtcIso(localDateTime: string, timeZone: string): string {
  const [datePart, timePart] = localDateTime.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcGuess))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offset = asIfUtc - utcGuess;
  return new Date(utcGuess - offset).toISOString();
}

/** UTC ISO string → { date: "YYYY-MM-DD", time: "HH:mm" } as displayed in `timeZone`. */
export function utcToZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(iso))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}
