/**
 * Global online-presence manager.
 * Connects once per app session, authenticates via JWT,
 * and keeps the server updated with per-ping heartbeats.
 */
import { onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

let ws: WebSocket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let destroyed = false

function disconnect() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    ws = null
  }
}

function connect(token: string) {
  if (destroyed) return
  disconnect()
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/api/`)
  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: 'auth', token }))
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 25_000)
  }
  ws.onclose = () => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    if (!destroyed) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(token) }, 6_000)
  }
  ws.onerror = () => {}
  ws.onmessage = () => {}
}

export function usePresence() {
  const auth = useAuthStore()

  onMounted(() => {
    destroyed = false
    if (auth.token) connect(auth.token)
  })

  onUnmounted(() => {
    destroyed = true
    disconnect()
  })
}
