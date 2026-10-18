import { ref } from 'vue'
import api from '@/api'

const supported = typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const enabled = ref(false)
const permission = ref<NotificationPermission>(supported ? Notification.permission : 'denied')
const busy = ref(false)

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Подписан ли этот браузер сейчас. */
async function refresh() {
  if (!supported) return
  permission.value = Notification.permission
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    enabled.value = !!(await reg?.pushManager.getSubscription()) && Notification.permission === 'granted'
  } catch { enabled.value = false }
}

async function enable(): Promise<'ok' | 'denied' | 'unsupported' | 'unavailable'> {
  if (!supported) return 'unsupported'
  busy.value = true
  try {
    const perm = await Notification.requestPermission()
    permission.value = perm
    if (perm !== 'granted') return 'denied'
    const { data } = await api.get('/push/key')
    const key: string | null = data?.data?.publicKey
    if (!key) return 'unavailable'
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
    }
    await api.post('/push/subscribe', sub.toJSON())
    enabled.value = true
    return 'ok'
  } finally {
    busy.value = false
  }
}

async function disable() {
  if (!supported) return
  busy.value = true
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
      await sub.unsubscribe()
    }
    enabled.value = false
  } finally {
    busy.value = false
  }
}

export function usePushNotifications() {
  return { supported, enabled, permission, busy, refresh, enable, disable }
}
