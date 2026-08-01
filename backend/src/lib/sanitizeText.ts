// Strips Unicode tricks that let a user break layouts or spoof text via
// user-supplied free-text fields (display name, bio, group name, etc):
//   - "Zalgo" text: dozens of combining marks stacked on one base character
//   - zero-width characters hiding real content length
//   - bidi control overrides reversing displayed text direction
//
// NFC composition runs first so legitimate accented text (e.g. e-acute,
// n-tilde, Vietnamese tone marks) collapses to its normal precomposed form.
// Remaining combining marks are then capped at a small count per base
// character rather than deleted outright — real orthographies (Thai, Arabic,
// Hebrew, Devanagari, ...) legitimately stack 1-2 combining marks on a single
// letter, and those must keep working; only runs far beyond that are Zalgo
// abuse.
const MAX_COMBINING_MARKS_PER_CHAR = 2;
const COMBINING_MARK_RUN = /\p{M}+/gu;

// Zero-width space/joiners, LTR/RTL marks, bidi embedding/override/isolate
// controls, word joiner, BOM, soft hyphen — no legitimate use in a name/bio,
// safe to strip unconditionally regardless of script/language.
const ZERO_WIDTH_AND_BIDI = new RegExp(
  '[\\u00AD\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g',
);

// C0/C1 control characters (no legitimate display purpose in a name/bio).
const CONTROL_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]',
  'g',
);

export function sanitizeDisplayText(input: string, maxLength: number): string {
  let s = input.normalize('NFC');
  s = s.replace(COMBINING_MARK_RUN, (run) => run.slice(0, MAX_COMBINING_MARKS_PER_CHAR));
  s = s.replace(ZERO_WIDTH_AND_BIDI, '');
  s = s.replace(CONTROL_CHARS, '');
  s = s.trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

// Applies sanitizeDisplayText in place to the given string-valued keys of an
// object, skipping keys that are absent, null, or not strings.
export function sanitizeFields<T extends Record<string, any>>(
  data: T,
  fields: { [K in keyof T]?: number },
): T {
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const maxLength = fields[key];
    if (typeof data[key] === 'string' && typeof maxLength === 'number') {
      (data as any)[key] = sanitizeDisplayText(data[key] as string, maxLength);
    }
  }
  return data;
}
