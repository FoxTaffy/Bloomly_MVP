// Единая конфигурация загрузок. Меняйте лимиты здесь, а не в контроллерах.
//
// Потолок 100 МБ задан не произвольно: host nginx (client_max_body_size 100m) режет тело
// запроса раньше API, поэтому всё, что больше, до обработчика не доходит. Тарифные лимиты
// чата (до 16 ГБ) при этом до клиента не доезжали, но API готов был буферизовать их в память.
// Пока nginx не поднят, ограничения выше 100 МБ недостижимы; при поднятии nginx поднимите
// PLATFORM_MAX_UPLOAD_BYTES и разрешите потоковую запись (см. media/controller.ts).

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Верхняя граница тела multipart-запроса на уровне API (совпадает с nginx). */
export const PLATFORM_MAX_UPLOAD_BYTES = 100 * MB;

/** Запас на заголовки multipart сверх размера файла. */
export const MULTIPART_OVERHEAD_BYTES = 1 * MB;

/** Лимит размера файла по папкам. Тарифные значения ниже обрезаются до PLATFORM_MAX_UPLOAD_BYTES. */
export const FOLDER_MAX_BYTES: Record<string, number> = {
  posts: PLATFORM_MAX_UPLOAD_BYTES,
  comments: PLATFORM_MAX_UPLOAD_BYTES,
  messages: PLATFORM_MAX_UPLOAD_BYTES,
  backgrounds: PLATFORM_MAX_UPLOAD_BYTES,
  avatars: 10 * MB,
  banners: 10 * MB,
  stickers: 100 * 1024,
  'avatar-frames': 5 * MB,
  reports: 10 * MB,
  verification: 10 * MB,
};

/** Чат: лимит по тарифу. Значения выше платформенного потолка обрезаются до него. */
export const MESSAGE_LIMIT_BY_TIER: Record<string, number> = {
  free: 2 * GB,
  lite: 4 * GB,
  pro: 8 * GB,
  business: 16 * GB,
};

/**
 * Изображения декодируются sharp в память, поэтому для них отдельный и меньший лимит.
 * Видео и аудио пишутся на диск и в MinIO потоком, в памяти их не держим.
 */
export const IMAGE_MAX_BYTES = 25 * MB;

/** Пиксели, которые sharp вправе декодировать (защита от «бомб» сжатия). */
export const IMAGE_MAX_PIXELS = 50_000_000;

/** Одновременные загрузки одного пользователя. */
export const MAX_CONCURRENT_UPLOADS_PER_USER = 3;
/** Одновременные загрузки на весь процесс API. */
export const MAX_CONCURRENT_UPLOADS_GLOBAL = 8;
/** Одновременная обработка изображений (буфер в памяти) на процесс. */
export const MAX_CONCURRENT_IMAGE_JOBS = 4;

/** Максимальное время приёма одного файла. Дольше — обрыв, временный файл удаляется. */
export const UPLOAD_TIMEOUT_MS = 120_000;

/** Потолок квоты хранилища по тарифам (null — без лимита на уровне квоты). */
export const STORAGE_QUOTA_BYTES_BY_TIER: Record<string, number | null> = {
  free: null,
  lite: 5 * GB,
  pro: 20 * GB,
  business: 100 * GB,
};

/** Папки, объём которых учитывается в квоте хранилища пользователя. */
export const STORAGE_TRACKED_FOLDERS = new Set(['posts', 'comments', 'messages', 'backgrounds']);

/**
 * Папки с закрытым содержимым (жалобы, верификация, письма поддержки). Объекты кладутся под
 * префикс private/ и не читаются анонимно: отдача только через /api/media/private с проверкой прав.
 */
export const PRIVATE_FOLDERS = new Set(['reports', 'verification', 'support']);
export const PRIVATE_KEY_PREFIX = 'private/';
