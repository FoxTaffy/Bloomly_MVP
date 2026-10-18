// Service worker Bloomly: только системные Web Push уведомления (без кэширования).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* не JSON */ }
  const title = data.title || 'Bloomly'
  event.waitUntil((async () => {
    // Вкладка открыта и видима — пользователь и так видит сообщение в приложении (toast + звук).
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.some((c) => c.visibilityState === 'visible')) return
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/bloomly.png',
      badge: '/bloomly.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus()
        if ('navigate' in w) await w.navigate(url)
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
