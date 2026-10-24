/**
 * Адрес web-push подписки приходит от клиента, а сервер потом сам отправляет на него запросы.
 * Без проверки это SSRF: «подписка» на https://127.0.0.1:… или внутренний адрес заставит сервер
 * стучаться туда по таймеру. Разрешаем только push-сервисы браузеров (Chrome/Edge/Opera/Яндекс — FCM,
 * Firefox — Mozilla, Safari — Apple, старый Edge — WNS), только https и стандартный порт.
 */
const EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);
const HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((s) => host.endsWith(s));
}
