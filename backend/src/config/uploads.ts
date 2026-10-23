// Единая конфигурация загрузок. Меняйте лимиты здесь, а не в контроллерах.
//
// Размеры файлов по тарифам (фото 15/50 МБ, видео 100 МБ…2 ГБ, вложения до 2 ГБ) заданы перками тарифа в
// modules/payments/plan-perks.ts и применяются в media/controller.ts прямо во время приёма потока.
// Тело запроса уходит во временный файл на диске и оттуда потоком в MinIO — память не растёт с размером файла.
//
// Цепочка прокси должна пропускать такие тела: frontend/nginx.conf и deploy/nginx/bloomly.conf (client_max_body_size,
// proxy_request_buffering off). ВНИМАНИЕ: Cloudflare на тарифах Free/Pro режет тело запроса на 100 МБ — если домен
// проксируется через него, одиночные запросы крупнее проходят только в обход Cloudflare (см. docs/uploads.md).

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Запас на заголовки multipart сверх размера файла. */
export const MULTIPART_OVERHEAD_BYTES = 1 * MB;

/** Жёсткие потолки папок вне тарифной сетки: оформление, служебные файлы. Тариф их не повышает. */
export const FOLDER_MAX_BYTES: Record<string, number> = {
  avatars: 10 * MB,
  banners: 10 * MB,
  stickers: 100 * 1024,
  'avatar-frames': 5 * MB,
  reports: 50 * MB, // скриншоты и короткие видео к жалобам и обращениям
  verification: 10 * MB,
};

/**
 * Пиксели, которые sharp вправе декодировать (защита от «бомб» сжатия). Фото до 50 МБ у платных тарифов бывают
 * заметно больше 50 Мпикс (панорамы, сканы), поэтому для них потолок выше; декодирование потоковое
 * (sequentialRead + shrink-on-load), полный растр в памяти не держится.
 */
export const IMAGE_MAX_PIXELS = 50_000_000;
export const IMAGE_MAX_PIXELS_UNCOMPRESSED = 120_000_000;

/**
 * Чанковая загрузка (media/chunked.ts): файлы крупнее порога уходят частями, чтобы каждый запрос проходил через
 * Cloudflare (лимит тела 100 МБ на Free/Pro). Порог и размер части клиент берёт из ответа init / lib/uploadMedia.ts.
 */
export const CHUNKED_THRESHOLD_BYTES = 50 * MB;
export const CHUNK_BYTES = 25 * MB;
/** Брошенные незавершённые сессии удаляются вместе с временными файлами. */
export const UPLOAD_SESSION_TTL_MS = 3 * 60 * 60_000;
export const MAX_UPLOAD_SESSIONS_PER_USER = 3;
export const MAX_UPLOAD_SESSIONS_GLOBAL = 20;
/** Запас свободного места на диске сверх размера новой сессии. */
export const UPLOAD_DISK_RESERVE_BYTES = 2 * GB;

/** Одновременные загрузки одного пользователя. */
export const MAX_CONCURRENT_UPLOADS_PER_USER = 3;
/** Одновременные загрузки на весь процесс API. */
export const MAX_CONCURRENT_UPLOADS_GLOBAL = 8;
/** Одновременная обработка изображений (буфер в памяти) на процесс. */
export const MAX_CONCURRENT_IMAGE_JOBS = 4;

/**
 * Приём файла: обрыв, если от клиента не пришло ни байта за UPLOAD_IDLE_TIMEOUT_MS (зависшая отправка), и общий
 * потолок UPLOAD_MAX_DURATION_MS. Один фиксированный таймаут на весь файл рвал бы гигабайтные загрузки на медленном канале.
 */
export const UPLOAD_IDLE_TIMEOUT_MS = 60_000;
export const UPLOAD_MAX_DURATION_MS = 3 * 60 * 60_000;

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
