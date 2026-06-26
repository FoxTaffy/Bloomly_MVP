/**
 * E2EE utilities using Web Crypto API.
 *
 * Key scheme:
 *  - Each user has an RSA-OAEP 2048 key pair stored in IndexedDB.
 *  - Each conversation has a random AES-256-GCM key.
 *  - The AES key is encrypted with each participant's RSA public key and stored on the server.
 *  - Message text is encrypted with the AES key; ciphertext = base64(iv[12] + ciphertext).
 */

const DB_NAME = 'bloomly_keys';
const DB_VERSION = 1;
const STORE = 'keypair';
const KEY_ID = 'user_keypair';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ── RSA-OAEP key pair ─────────────────────────────────────────────────────────

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_PARAMS, true, ['encrypt', 'decrypt']);
}

export async function exportPublicKeyJwk(keyPair: CryptoKeyPair): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return JSON.stringify(jwk);
}

export async function importPublicKeyJwk(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr) as JsonWebKey;
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

// ── Persist / load key pair ───────────────────────────────────────────────────

export async function loadOrCreateKeyPair(): Promise<CryptoKeyPair> {
  const existing = await idbGet<CryptoKeyPair>(STORE, KEY_ID);
  if (existing) return existing;
  const pair = await generateKeyPair();
  await idbSet(STORE, KEY_ID, pair);
  return pair;
}

export async function clearKeyPair(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Conversation AES key ──────────────────────────────────────────────────────

export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Encrypt the AES conversation key with a user's RSA public key. Returns base64. */
export async function encryptConvKeyForUser(aesKey: CryptoKey, recipientPublicKeyJwk: string): Promise<string> {
  const pubKey = await importPublicKeyJwk(recipientPublicKeyJwk);
  const rawAes = await crypto.subtle.exportKey('raw', aesKey);
  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAes);
  return b64encode(encrypted);
}

/** Decrypt the encrypted AES key using our private key. */
export async function decryptConvKey(encryptedKeyB64: string, privateKey: CryptoKey): Promise<CryptoKey> {
  const encBuf = b64decode(encryptedKeyB64);
  const rawAes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encBuf);
  return crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// ── Message encrypt / decrypt ─────────────────────────────────────────────────

/**
 * Encrypt plaintext with the conversation AES key.
 * Returns base64(iv[12] + ciphertext).
 */
export async function encryptMessage(plaintext: string, aesKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return b64encode(combined.buffer);
}

/**
 * Decrypt a base64(iv[12] + ciphertext) string using the conversation AES key.
 * Returns null if decryption fails (wrong key, tampered data).
 */
export async function decryptMessage(ciphertextB64: string, aesKey: CryptoKey): Promise<string | null> {
  try {
    const combined = new Uint8Array(b64decode(ciphertextB64));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
