import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  loadOrCreateKeyPair,
  exportPublicKeyJwk,
  generateConversationKey,
  encryptConvKeyForUser,
  decryptConvKey,
  encryptMessage,
  decryptMessage,
} from '@/utils/crypto'
import api from '@/api'

/**
 * Manages E2EE keys for the current user.
 *
 * Lifecycle:
 *  1. Call init() on login — generates/loads key pair and registers public key.
 *  2. Before opening a conversation, call getConvKey(convId) to get the AES key.
 *  3. Use encrypt()/decrypt() to process message content.
 */
export const useKeysStore = defineStore('keys', () => {
  const keyPair = ref<CryptoKeyPair | null>(null)
  const ready = ref(false)
  // convId → AES CryptoKey
  const convKeys = new Map<string, CryptoKey>()
  // convId → inflight promise (avoid duplicate fetches)
  const inflight = new Map<string, Promise<CryptoKey | null>>()

  async function init() {
    if (ready.value) return
    try {
      const pair = await loadOrCreateKeyPair()
      keyPair.value = pair
      const pubJwk = await exportPublicKeyJwk(pair)
      await api.put('/messages/keys', { publicKey: pubJwk })
      ready.value = true
    } catch (e) {
      console.warn('[keys] init failed', e)
    }
  }

  /**
   * Get (or fetch+decrypt) the AES conversation key for `convId`.
   * Returns null if the conversation has no key (legacy plaintext conv or missing key).
   */
  async function getConvKey(convId: string): Promise<CryptoKey | null> {
    const cached = convKeys.get(convId)
    if (cached) return cached

    const existing = inflight.get(convId)
    if (existing) return existing

    const promise = (async () => {
      try {
        if (!keyPair.value) return null
        const res = await api.get(`/messages/conversations/${convId}/keys/me`)
        const encryptedKey: string | null = res.data?.data?.encryptedKey ?? null
        if (!encryptedKey) return null
        const aesKey = await decryptConvKey(encryptedKey, keyPair.value.privateKey)
        convKeys.set(convId, aesKey)
        return aesKey
      } catch {
        return null
      } finally {
        inflight.delete(convId)
      }
    })()

    inflight.set(convId, promise)
    return promise
  }

  /**
   * Create a new AES conversation key and push it to the server for all participants.
   * participantIds: all user IDs in the conversation (including self).
   */
  async function initConvKey(convId: string, participantIds: string[]): Promise<void> {
    if (!keyPair.value) return

    // Fetch all participants' public keys
    const res = await api.post('/messages/keys/batch', { userIds: participantIds })
    const pubKeys: Record<string, string> = res.data?.data?.keys ?? {}

    const aesKey = await generateConversationKey()
    const keysPayload: Record<string, string> = {}

    for (const uid of participantIds) {
      const pubJwk = pubKeys[uid]
      if (!pubJwk) continue
      keysPayload[uid] = await encryptConvKeyForUser(aesKey, pubJwk)
    }

    await api.put(`/messages/conversations/${convId}/keys`, { keys: keysPayload })
    convKeys.set(convId, aesKey)
  }

  /** Encrypt plaintext for a conversation. Returns null if no key. */
  async function encrypt(convId: string, plaintext: string): Promise<string | null> {
    const key = await getConvKey(convId)
    if (!key) return null
    return encryptMessage(plaintext, key)
  }

  /** Decrypt ciphertext from a conversation. Returns null if decryption fails or no key. */
  async function decrypt(convId: string, ciphertext: string): Promise<string | null> {
    const key = await getConvKey(convId)
    if (!key) return null
    return decryptMessage(ciphertext, key)
  }

  /** Evict a conversation key from the in-memory cache (e.g. on leave). */
  function evict(convId: string) {
    convKeys.delete(convId)
    inflight.delete(convId)
  }

  return { ready, init, getConvKey, initConvKey, encrypt, decrypt, evict }
})
