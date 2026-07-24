// Missing birth_date is treated as "not verified adult" — NSFW content
// stays gated until the user sets a birth date that puts them at 18+.
export function isAdult(birthDate: Date | null | undefined): boolean {
  if (!birthDate) return false;

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;

  return age >= 18;
}

/** Reads the `is_adult` flag the auth hooks attach to request.user; anonymous or unverified requests count as minors. */
export function requestIsAdult(user: unknown): boolean {
  return (user as { is_adult?: boolean } | undefined)?.is_adult === true;
}
