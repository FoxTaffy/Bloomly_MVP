/**
 * Legacy E2E-encrypted message detection.
 * End-to-end encryption itself has been removed — this heuristic is kept only
 * to recognize old ciphertext messages sent before the removal, so they render
 * as a placeholder instead of raw base64 garbage.
 */

/** Heuristic: is this string likely a legacy encrypted base64 payload? */
export function isEncrypted(text: string): boolean {
  return text.length > 32 && /^[A-Za-z0-9+/]+=*$/.test(text)
}
