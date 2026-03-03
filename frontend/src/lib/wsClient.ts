/**
 * Singleton WebSocket client — shared across all stores/composables.
 * Handles auth, ping, reconnect and routes incoming frames to subscribers.
 */
import { useAuthStore } from '@/stores/auth'

type Handler = (msg: Record<string, unknown>) => void

const handlers = new Map<string, Set<Handler>>()

let ws: WebSocket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let destroyed = false
let tokenCache = ''

function send(data: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

function stopTimers() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

function scheduleReconnect() {
  if (destroyed || reconnectTimer) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 5_000)
}

function connect() {
  if (destroyed) return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/api/`)

  ws.onopen = () => {
    const auth = useAuthStore()
    tokenCache = auth.token ?? ''
    if (tokenCache) send({ type: 'auth', token: tokenCache })
    pingTimer = setInterval(() => send({ type: 'ping' }), 25_000)
  }

  ws.onclose = () => {
    stopTimers()
    scheduleReconnect()
  }

  ws.onerror = () => {}

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>
      const type = msg.type as string | undefined
      if (!type) return
      handlers.get(type)?.forEach((fn) => { try { fn(msg) } catch { /**/ } })
      // 'all' subscriber
      handlers.get('*')?.forEach((fn) => { try { fn(msg) } catch { /**/ } })
    } catch { /*non-JSON*/ }
  }
}

export const wsClient = {
  connect() { destroyed = false; connect() },

  disconnect() {
    destroyed = true
    stopTimers()
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
      ws = null
    }
  },

  /** Re-authenticate — call after login/token refresh */
  reauth(token: string) {
    tokenCache = token
    send({ type: 'auth', token })
  },

  send,

  on(type: string, fn: Handler): () => void {
    if (!handlers.has(type)) handlers.set(type, new Set())
    handlers.get(type)!.add(fn)
    return () => handlers.get(type)?.delete(fn)
  },
}
