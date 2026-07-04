import { FastifyRequest } from 'fastify';

/** Грубый парсинг User-Agent в читаемое имя устройства, без внешних зависимостей */
export function parseDeviceName(userAgent: string | undefined | null): string {
  if (!userAgent) return 'Неизвестное устройство';
  const ua = userAgent;

  let os = 'Неизвестная ОС';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'браузер';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/YaBrowser/i.test(ua)) browser = 'Яндекс Браузер';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return `${browser} · ${os}`;
}

/** Извлекает реальный IP клиента с учётом заголовков прокси */
export function getClientIp(request: FastifyRequest): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.ip;
}
