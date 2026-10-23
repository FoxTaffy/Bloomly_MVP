import type { PaidTier } from './pricing.js';

// Что даёт каждый тариф помимо цены. Единственный источник для бэкенда: кулдаун и поднятия Dealers Den,
// комиссия вывода, скидки на баннеры и промо-кэшбэк (Этап 4) читают значения отсюда. Фронт получает их из /payments/config.
// Размеры файлов (maxPhotoBytes / maxVideoBytes / maxAttachmentBytes) читает config/uploads.ts и media/controller.ts:
// лимит применяется на лету во время приёма потока.
const MB = 1024 * 1024;
const GB = 1024 * MB;

export interface PlanPerks {
  /** Фото: максимальный размер файла. */
  maxPhotoBytes: number;
  /** Видео и аудио: максимальный размер файла. */
  maxVideoBytes: number;
  /** Тяжёлые файлы и исходники (PSD, архивы) во вложениях чата; 0 — тариф такие файлы не принимает. */
  maxAttachmentBytes: number;
  /** Фото без сжатия: отображаемая копия в высоком качестве и оригинал сохраняется как есть (иначе стандартное сжатие). */
  uncompressedPhotos: boolean;
  /** Сообщений в сутки; null — без ограничений (личные сообщения безлимитны на всех тарифах). */
  dailyMessageLimit: number | null;
  /** Комиссия платформы на продажи внутри групп, %. */
  groupSalesFeePct: number;
  /** Комиссия на вывод средств на карту, %. */
  withdrawFeePct: number;
  /** Скидка на рекламные баннеры, %. */
  adDiscountPct: number;
  /** Не чаще одной новой карточки группы в общую ленту Dealers Den за столько часов. */
  denCooldownHours: number;
  /** Бесплатные поднятия карточек в месяц. */
  freeBumpsPerMonth: number;
  /** Автоподнятие карточек. */
  autoBump: boolean;
  /** Бонус к оценке в поиске людей, групп и лотов Dealers Den (0 — без приоритета). */
  searchBonus: number;
  /** Бесплатные бусты постов в ленту в месяц. */
  postBoostsPerMonth: number;
  /** Ежемесячный кэшбэк промо-BLM при продлении. */
  promoCashbackBlm: number;
}

export type PerkTier = 'free' | PaidTier;

export const PLAN_PERKS: Record<PerkTier, PlanPerks> = {
  free:     { maxPhotoBytes: 15 * MB, maxVideoBytes: 100 * MB, maxAttachmentBytes: 0, uncompressedPhotos: false, dailyMessageLimit: null, groupSalesFeePct: 0, withdrawFeePct: 3, adDiscountPct: 0,  denCooldownHours: 3,   freeBumpsPerMonth: 0,  autoBump: false, searchBonus: 0, postBoostsPerMonth: 0,  promoCashbackBlm: 0 },
  lite:     { maxPhotoBytes: 50 * MB, maxVideoBytes: 500 * MB, maxAttachmentBytes: 0, uncompressedPhotos: true, dailyMessageLimit: null, groupSalesFeePct: 0, withdrawFeePct: 3, adDiscountPct: 0,  denCooldownHours: 3,   freeBumpsPerMonth: 0,  autoBump: false, searchBonus: 0, postBoostsPerMonth: 0,  promoCashbackBlm: 0 },
  pro:      { maxPhotoBytes: 50 * MB, maxVideoBytes: 1 * GB, maxAttachmentBytes: 1 * GB, uncompressedPhotos: true, dailyMessageLimit: null, groupSalesFeePct: 0, withdrawFeePct: 2, adDiscountPct: 15, denCooldownHours: 1,   freeBumpsPerMonth: 3,  autoBump: false, searchBonus: 4, postBoostsPerMonth: 0,  promoCashbackBlm: 0 },
  business: { maxPhotoBytes: 50 * MB, maxVideoBytes: 2 * GB, maxAttachmentBytes: 2 * GB, uncompressedPhotos: true, dailyMessageLimit: null, groupSalesFeePct: 0, withdrawFeePct: 1, adDiscountPct: 30, denCooldownHours: 0.5, freeBumpsPerMonth: 3,  autoBump: true,  searchBonus: 6, postBoostsPerMonth: 10, promoCashbackBlm: 2 },
};

/** Перки тарифа; неизвестный или истёкший тариф считается free. */
export const perksFor = (tier: string): PlanPerks => PLAN_PERKS[tier as PerkTier] ?? PLAN_PERKS.free;
