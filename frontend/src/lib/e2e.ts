/**
 * End-to-end encryption for chat messages
 * Uses ECDH P-256 key exchange + AES-GCM-256 symmetric encryption.
 *
 * Key pair is generated once per user and stored in localStorage.
 * The public key (JWK) is uploaded to the server so the partner can
 * fetch it to derive the shared secret.
 */

const CURVE  = 'P-256'
const PREFIX = 'e2e_kp_' // localStorage key: e2e_kp_<userId>

// ── Key-pair management ───────────────────────────────────────────────────────

export interface KeyPairResult {
  privateKey: CryptoKey
  publicKeyJwk: JsonWebKey
}

export async function getOrCreateKeyPair(userId: string): Promise<KeyPairResult> {
  const storeKey = PREFIX + userId
  const stored = localStorage.getItem(storeKey)
  if (stored) {
    try {
      const { priv, pub } = JSON.parse(stored)
      const privateKey = await crypto.subtle.importKey(
        'jwk', priv,
        { name: 'ECDH', namedCurve: CURVE },
        false, ['deriveKey'],
      )
      return { privateKey, publicKeyJwk: pub }
    } catch { /* corrupt → regenerate */ }
  }

  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true, ['deriveKey'],
  )
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const pub  = await crypto.subtle.exportKey('jwk', kp.publicKey)
  localStorage.setItem(storeKey, JSON.stringify({ priv, pub }))
  return { privateKey: kp.privateKey, publicKeyJwk: pub }
}

// ── Shared key derivation ─────────────────────────────────────────────────────

export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKeyJwk: JsonWebKey,
): Promise<CryptoKey> {
  const theirKey = await crypto.subtle.importKey(
    'jwk', theirPublicKeyJwk,
    { name: 'ECDH', namedCurve: CURVE },
    false, [],
  )
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  )
}

// ── Encrypt / decrypt ─────────────────────────────────────────────────────────

/** Encrypts `plaintext` → base64 string (12-byte IV prepended to ciphertext) */
export async function encryptMsg(plaintext: string, key: CryptoKey): Promise<string> {
  const iv       = crypto.getRandomValues(new Uint8Array(12))
  const encoded  = new TextEncoder().encode(plaintext)
  const cipher   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(12 + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), 12)
  // btoa-safe base64
  return btoa(String.fromCharCode(...combined))
}

/** Decrypts base64 string → plaintext. Returns null on failure (e.g. missing key). */
export async function decryptMsg(b64: string, key: CryptoKey | null): Promise<string | null> {
  if (!key) return null
  try {
    const bytes  = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const iv     = bytes.slice(0, 12)
    const data   = bytes.slice(12)
    const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

/** Heuristic: is this string likely our encrypted base64 payload? */
export function isEncrypted(text: string): boolean {
  return text.length > 32 && /^[A-Za-z0-9+/]+=*$/.test(text)
}
