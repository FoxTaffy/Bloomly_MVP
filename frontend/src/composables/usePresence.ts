import { onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function usePresence() {
  const auth = useAuthStore()
  let ws: WebSocket | null = null
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let stopWatching: WatchStopHandle | undefined
  let active = false

  function disconnect() {
    clearInterval(pingTimer)
    clearTimeout(reconnectTimer)
    pingTimer = undefined
    reconnectTimer = undefined
    if (!ws) return
    const previous = ws
    ws = null
    previous.onopen = previous.onclose = previous.onerror = previous.onmessage = null
    if (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING) previous.close()
  }

  function connect(token: string) {
    if (!active) return
    disconnect()
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${location.host}/api/`)
    ws = socket
    socket.onopen = () => {
      if (!active || ws !== socket) return
      socket.send(JSON.stringify({ type: 'auth', token }))
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }))
      }, 25_000)
    }
    socket.onclose = () => {
      if (ws !== socket) return
      clearInterval(pingTimer)
      pingTimer = undefined
      if (active && auth.token) reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        if (auth.token) connect(auth.token)
      }, 6_000)
    }
    socket.onerror = () => {}
  }

  function scheduleRefresh(token: string) {
    clearTimeout(refreshTimer)
    refreshTimer = undefined
    let expiresAt: number
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      expiresAt = Number(JSON.parse(atob(part)).exp) * 1000
      if (!Number.isFinite(expiresAt)) return
    } catch { return }
    const renew = async () => {
      if (!active || auth.token !== token) return
      const refreshed = await auth.tryRefresh(true)
      if (active && !refreshed && auth.token === token) refreshTimer = setTimeout(renew, 15_000)
    }
    refreshTimer = setTimeout(renew, Math.max(1_000, expiresAt - Date.now() - 30_000))
  }

  onMounted(() => {
    active = true
    stopWatching = watch(() => auth.token, token => {
      disconnect()
      clearTimeout(refreshTimer)
      refreshTimer = undefined
      if (token) { connect(token); scheduleRefresh(token) }
    }, { immediate: true })
  })

  onUnmounted(() => {
    active = false
    stopWatching?.()
    clearTimeout(refreshTimer)
    disconnect()
  })
}
