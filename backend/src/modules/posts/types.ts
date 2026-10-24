import type { NsfwMode } from '../../lib/contentFilters.js';
export interface CreatePostInput {
  content: string;
  authorId: string;
  isNsfw?: boolean;
  isAiGenerated?: boolean;
  isAnnouncement?: boolean;
  subscriberOnly?: boolean;
  isPaid?: boolean;
  price?: number;
  rewardForUserId?: string;
  videoTitle?: string;
  videoDescription?: string;
  category?: string;
  tags?: string[];
  mediaUrls?: string[];
  mediaOriginalUrls?: string[];
}

/** new — новые сверху, old — старые сверху, hot — по рейтингу (с периодом `period`). */
export type PostSortBy = 'new' | 'old' | 'hot';
/** Период для сортировки по рейтингу: за сутки, неделю, месяц или всё время. */
export type PostSortPeriod = 'day' | 'week' | 'month' | 'all';

export interface GetPostsQuery {
  search?: string;
  category?: string;
  tag?: string;
  /** 'true' — the tag filter also matches its synonyms (see lib/tagSynonyms). */
  synonyms?: string;
  sort?: PostSortBy;
  period?: PostSortPeriod;
  safeMode?: string;
  nsfw?: string;
  /** Resolved by the controller from `nsfw`/`safeMode` + viewer age; the service never reads the raw params. */
  nsfwMode?: NsfwMode;
  hasMedia?: boolean;
  /** Курсор следующей страницы из прошлого ответа (nextCursor); вместо page. */
  cursor?: string;
  /** 'true' — только NSFW-посты (вкладка NSFW); для не-взрослых и при nsfw=hide ничего не вернёт. */
  nsfwOnly?: string | boolean;
  page?: string;
  limit?: string;
}

export interface GetPersonalizedQuery {
  safeMode?: string;
  /** Курсор следующей страницы из прошлого ответа (nextCursor); вместо page. */
  cursor?: string;
  nsfw?: string;
  page?: string;
  limit?: string;
}

export interface JwtUser {
  id: string;
  role: string;
}

export interface EditPostInput {
  content?: string;
  isNsfw?: boolean;
  isAiGenerated?: boolean;
  /** Full replacement of the post's tag list. */
  tags?: string[];
  /** New files appended after the existing ones (existing media is never replaced here). */
  addMediaUrls?: string[];
  addMediaOriginalUrls?: string[];
  /** Лот Dealers' Den группы поста: строка — прикрепить/заменить, null — открепить. */
  listingId?: string | null;
}
