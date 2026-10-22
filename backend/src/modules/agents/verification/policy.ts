// Решающая часть агента верификации — чистые функции без БД и сети, чтобы правила можно было тестировать.
// Модель даёт вердикт по доказательствам, но последнее слово остаётся за кодом: ни текст пользователя,
// ни картинка с надписью «одобрить» не отменяют жёсткие проверки ниже.

/** Типы, для которых нужна «сигна»: бумажка с «Bloomly», датой и ID пользователя. */
export const SIGNA_TYPES: ReadonlySet<string> = new Set(['master', 'fursuiter', 'writer', 'organizer', 'photographer', 'programmer']);

export const APPROVE_MIN_CONFIDENCE = 85;
export const MAX_ATTEMPTS = 3;

export interface GateInput {
  type: string;
  account: { deleted: boolean; banned: boolean; frozen: boolean; deceased: boolean; alreadyVerified: boolean };
  criteria: {
    accountAgeDays: number; postCount: number; followerCount: number;
    hasAvatar: boolean; hasBio: boolean; hasEmail: boolean; completenessOk: boolean;
    minAge: number; minPosts: number; minFollowers: number;
  };
  evidence: { images: number; videos: number; links: number; hasText: boolean };
  duplicateEvidence: boolean;
}

export type GateResult = { action: 'reject' | 'escalate'; reason: string; gate: string } | null;

/** Проверки, не требующие модели. null — можно идти к разбору доказательств. */
export function evaluateGates(g: GateInput): GateResult {
  const reject = (gate: string, reason: string): GateResult => ({ action: 'reject', gate, reason });

  if (g.account.alreadyVerified) return reject('already_verified', 'Аккаунт уже верифицирован.');
  if (g.account.deleted || g.account.banned || g.account.frozen || g.account.deceased) {
    return reject('account_restricted', 'Верификация недоступна, пока аккаунт ограничен.');
  }

  const c = g.criteria;
  const unmet: string[] = [];
  if (c.accountAgeDays < c.minAge) unmet.push(`аккаунту меньше ${c.minAge} дней`);
  if (c.postCount < c.minPosts) unmet.push(`меньше ${c.minPosts} публикаций`);
  if (c.followerCount < c.minFollowers) unmet.push(`меньше ${c.minFollowers} подписчиков`);
  if (!c.hasAvatar) unmet.push('нет аватара');
  if (!c.hasBio) unmet.push('пустое «О себе»');
  if (!c.hasEmail) unmet.push('нет подтверждённой почты');
  if (!c.completenessOk) unmet.push('профиль заполнен меньше чем на 80%');
  if (unmet.length) return reject('criteria', `Не выполнены условия верификации: ${unmet.join(', ')}. Выполните их и подайте заявку снова.`);

  if (g.duplicateEvidence) {
    return reject('duplicate_evidence', 'Это доказательство уже использовалось в заявке другого аккаунта. Нужны ваши собственные материалы.');
  }

  const e = g.evidence;
  // Ссылки на соцсети и видео автоматически не проверить: подтвердить владение чужой страницей нечем.
  // Единственные случаи, когда заявка остаётся человеку; решение не выдумываем.
  if (g.type === 'popular') {
    return e.links > 0
      ? { action: 'escalate', gate: 'popular_links', reason: 'Владение страницами в соцсетях автоматически не проверить — нужен модератор.' }
      : reject('no_evidence', 'Укажите хотя бы одну ссылку на ваш аккаунт.');
  }
  if (e.images === 0 && e.videos > 0) {
    return { action: 'escalate', gate: 'video_only', reason: 'Видео автоматически не проверяется — нужен модератор.' };
  }
  if (e.images === 0) {
    return reject('no_images', 'Приложите фото или скриншот: одного текста для верификации недостаточно.');
  }
  return null;
}

export interface Verdict {
  decision: 'approve' | 'reject' | 'unclear';
  confidence: number;
  signa_visible: boolean | null;
  evidence_matches_type: boolean;
  ai_generated_suspected: boolean;
  profile_consistent: boolean;
  summary: string;
  signals: string[];
}

export type Outcome = { action: 'approve' | 'reject'; reason: string; confidence: number; failed: string[] };

const bool = (v: unknown): v is boolean => typeof v === 'boolean';

/** Разбор ответа модели; всё, что не по схеме, — null (запрос уйдёт на повтор, а не на угадывание). */
export function parseVerdict(raw: unknown): Verdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.decision !== 'approve' && v.decision !== 'reject' && v.decision !== 'unclear') return null;
  if (typeof v.confidence !== 'number' || !Number.isFinite(v.confidence)) return null;
  if (!bool(v.evidence_matches_type) || !bool(v.ai_generated_suspected) || !bool(v.profile_consistent)) return null;
  if (v.signa_visible !== null && !bool(v.signa_visible)) return null;
  if (typeof v.summary !== 'string') return null;
  const signals = Array.isArray(v.signals) ? v.signals.filter((s): s is string => typeof s === 'string').slice(0, 8).map((s) => s.slice(0, 200)) : [];
  return {
    decision: v.decision,
    confidence: Math.max(0, Math.min(100, Math.round(v.confidence))),
    signa_visible: v.signa_visible as boolean | null,
    evidence_matches_type: v.evidence_matches_type,
    ai_generated_suspected: v.ai_generated_suspected,
    profile_consistent: v.profile_consistent,
    summary: v.summary,
    signals,
  };
}

/** Текст попадает пользователю и в админку: без разметки, ссылок и управляющих символов. */
export function sanitizeReason(text: string, max = 400): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/https?:\/\/\S+/gi, '[ссылка]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Итог по вердикту модели. Одобрение — только если выполнены ВСЕ условия; любое сомнение — отказ с объяснением,
 * потому что ошибочная галочка (подмена, нейросеть) вреднее ошибочного отказа: заявку можно подать повторно.
 */
export function decide(type: string, v: Verdict): Outcome {
  const failed: string[] = [];
  if (v.decision !== 'approve') failed.push('decision');
  if (v.confidence < APPROVE_MIN_CONFIDENCE) failed.push('confidence');
  if (!v.evidence_matches_type) failed.push('evidence_type');
  if (v.ai_generated_suspected) failed.push('ai_generated');
  if (!v.profile_consistent) failed.push('profile');
  if (SIGNA_TYPES.has(type) && v.signa_visible !== true) failed.push('signa');

  if (!failed.length) {
    return { action: 'approve', confidence: v.confidence, failed, reason: sanitizeReason(v.summary || 'Доказательства подтверждены.') };
  }
  const why: string[] = [];
  if (failed.includes('signa')) why.push('на фото не видна «сигна» (бумажка с «Bloomly», датой и вашим ID)');
  if (failed.includes('ai_generated')) why.push('материалы похожи на созданные нейросетью');
  if (failed.includes('evidence_type')) why.push('приложенное не подтверждает выбранный тип верификации');
  if (failed.includes('profile')) why.push('профиль не согласуется с материалами');
  const own = sanitizeReason(v.summary);
  const reason = [own, why.length ? `Причины: ${why.join('; ')}.` : (own ? '' : 'Не удалось уверенно подтвердить заявку.'), 'Подайте заявку снова с более чёткими материалами.']
    .filter(Boolean).join(' ').slice(0, 500);
  return { action: 'reject', confidence: v.confidence, failed, reason };
}
