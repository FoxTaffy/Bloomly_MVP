/**
 * AutoMod Service — rule-based content moderation with scoring
 *
 * Actions:
 *  - warn:       +1 warn_count, log (max N → auto-freeze, never auto-ban)
 *  - freeze:     set frozen_at, log — reversible, requires moderator review to lift
 *  - ban:        set deleted_at + frozen_reason = 'ban', log — manual/moderator use only,
 *                automod itself never calls this automatically anymore
 *  - flag_post:  soft-delete or mark suspicious post, log
 *
 * Categories:
 *  spam | toxic | duplicate | fraud | suspicious
 */

import prisma from '../../config/prisma.js';
import { isModerator } from '../../lib/roles.js';
import { notificationService } from '../notifications/service.js';
import { getSetting } from '../../lib/settings.js';
import { logger } from '../../lib/logger.js';

// ── Thresholds (loosened further — AutoMod was flagging normal, active, or just
//    chatty users as "suspicious"; these behavioral/rate checks now need a much
//    clearer bot-like pattern before acting; escalation is still warn → freeze, never an automatic ban) ──
const WARNS_BEFORE_BAN       = 5;
const SPAM_POSTS_PER_MINUTE  = 15;   // more than 15 posts/min = spam
const SPAM_POSTS_PER_HOUR    = 60;   // more than 60 posts/hr = spam
const STORY_BURST_PER_10S    = 15;   // 15+ stories in 10 seconds = bot-like burst
const STORY_SPAM_PER_MINUTE  = 20;   // more than 20 stories/min = spam
const STORY_SPAM_PER_HOUR    = 60;   // more than 60 stories/hr = spam (safety net past the route limiter)
const COMMENT_BURST_PER_10S  = 12;   // 12+ comments in 10 seconds = bot-like burst (scripted spam)
const COMMENT_SPAM_PER_MINUTE = 25;  // more than 25 comments/min = spam (safety net past the route limiter)
const COMMENT_SPAM_PER_HOUR  = 150;  // more than 150 comments/hr = spam
const MESSAGE_BURST_PER_10S  = 20;   // 20+ DMs in 10 seconds = bot-like burst
const MESSAGE_SPAM_PER_MINUTE = 40;  // more than 40 messages/min = spam (matches the client-side "slow down" nag)
const MESSAGE_SPAM_PER_HOUR  = 250;  // more than 250 messages/hr = spam
const MESSAGE_SPAM_WARN_WINDOW_MS = 30 * 60_000; // repeat offense within 30min of an existing spam warn → freeze instead of warning again
const DUPLICATE_SIMILARITY   = 0.92; // 92% bigram overlap = duplicate (was 0.85 — flagged merely-similar posts)
const DUPLICATE_MIN_LENGTH   = 30;   // skip duplicate check for short posts/one-liners entirely (was 20)
const FRAUD_SCORE_THRESHOLD  = 0.7;
const TOXIC_SCORE_THRESHOLD  = 0.75;
const SPAM_SCORE_THRESHOLD   = 0.7;

// ── Russian keyword dictionaries ──────────────────────────────────────────────
const FRAUD_PATTERNS = [
  /казино|casino|пассивный доход|кликни по ссылк|инвест.*гарант/i,
  /бинарн.*опцион|криптоин.*схем|заработок в интернет|лёгкие деньги/i,
  /заработ\w*\s*(без вложени|не выходя из дома|каждый день\s*\d|гарантированн)/i,
  /telegram.*заработ|пишите в лс.*деньги|перевед.*кошел/i,
  /Hyip|hyip|рефераль.*ссылк|партнёрск.*програ/i,
  /обнал|отмыв.*денег|вывес.*средств без верификац/i,
  /\bNFT\b.*инвест|rug pull|pumpdump|по реферальн/i,
];

const TOXIC_PATTERNS = [
  /\b(ублюдок|сука|пиздец|мразь|тварь|уёбок|гандон|шлюха|блядь|падла|падаль)\b/i,
  /\b(иди нахуй|пошёл нахуй|нахрен отсюда|заткнись|убирайся)\b/i,
  /\b(дебил|идиот|тупой|кретин|имбецил|даун)\b.*\b(ты|вы)\b/i,
  /\b(педик|пидор|гей|лесбиян)\b.*\b(мразь|тварь|сдохни)\b/i,
  /\b(расист|нацист|фашист)\b/i,
  /убей себя|покончи с собой|сдохни/i,
];

const SPAM_PATTERNS = [
  /(.)\1{6,}/,                         // повторяющиеся символы (ааааааа)
  /(http[s]?:\/\/[^\s]+\s*){3,}/i,    // 3+ ссылки подряд
  /(\w+\s*){0,5}(free|бесплатно|скидка)[^.]*(\d{2,}%|промокод|promo)/i,
  /подписывайтесь|подписка за подписку|взаимная подписка/i,
  /\b(спам|spam|массовая рассылка)\b/i,
];

// Suspicious account patterns
const SUSPICIOUS_NAME_PATTERNS = [
  /^(user|bot|test)\d{4,}$/i,
  /^[a-z]{2,4}\d{6,}$/i,
];

// ── Scoring helper ────────────────────────────────────────────────────────────
export interface AnalysisResult {
  category: 'spam' | 'toxic' | 'duplicate' | 'fraud' | 'clean';
  score:    number;   // 0..1
  reason:   string;
  shouldAct: boolean;
}

/** Any single TOXIC_PATTERNS hit rejects — unlike analyzeContent's shouldAct threshold
 *  (tuned for full posts, needs 2+ hits), this is for validating short user-authored
 *  strings (e.g. a group's welcome-message text) where one slur is enough to reject. */
export function containsToxicLanguage(text: string): boolean {
  return TOXIC_PATTERNS.some((p) => p.test(text));
}

export function analyzeContent(text: string): AnalysisResult {
  if (!text || text.trim().length === 0) {
    return { category: 'clean', score: 0, reason: '', shouldAct: false };
  }

  // 1. Fraud check (highest priority, instant ban)
  for (const p of FRAUD_PATTERNS) {
    if (p.test(text)) {
      return { category: 'fraud', score: 0.95, reason: 'Обнаружены признаки мошенничества', shouldAct: true };
    }
  }

  // 2. Toxic check
  let toxicCount = 0;
  for (const p of TOXIC_PATTERNS) {
    if (p.test(text)) toxicCount++;
  }
  if (toxicCount > 0) {
    const score = Math.min(0.5 + toxicCount * 0.2, 1);
    if (score >= TOXIC_SCORE_THRESHOLD) {
      return { category: 'toxic', score, reason: 'Оскорбительный контент', shouldAct: true };
    }
  }

  // 3. Spam check
  let spamCount = 0;
  for (const p of SPAM_PATTERNS) {
    if (p.test(text)) spamCount++;
  }
  // Check char ratio (all-caps, repetitive)
  const capsRatio = (text.match(/[A-ZА-ЯЁ]/g) ?? []).length / Math.max(text.length, 1);
  if (capsRatio > 0.6 && text.length > 20) spamCount++;

  if (spamCount > 0) {
    const score = Math.min(0.4 + spamCount * 0.25, 1);
    if (score >= SPAM_SCORE_THRESHOLD) {
      return { category: 'spam', score, reason: 'Обнаружен спам', shouldAct: true };
    }
  }

  return { category: 'clean', score: 0, reason: '', shouldAct: false };
}

// ── Duplicate detection ───────────────────────────────────────────────────────
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\wа-яёa-z0-9 ]/gi, '').trim();
}

// Dice's coefficient over character bigrams — measures actual textual overlap,
// not just shared alphabet (a naive per-character check flags almost any two
// same-language posts of similar length as "duplicates").
function bigrams(s: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    map.set(bg, (map.get(bg) ?? 0) + 1);
  }
  return map;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigrams(a), bb = bigrams(b);
  let common = 0;
  for (const [bg, count] of ba) {
    const other = bb.get(bg);
    if (other) common += Math.min(count, other);
  }
  let total = 0;
  for (const v of ba.values()) total += v;
  for (const v of bb.values()) total += v;
  return total ? (2 * common) / total : 0;
}

export async function checkDuplicate(authorId: string, content: string, postId?: string): Promise<{ isDuplicate: boolean; originalPostId?: string }> {
  const norm = normalize(content);
  if (norm.length < DUPLICATE_MIN_LENGTH) return { isDuplicate: false };

  const recent = await prisma.post.findMany({
    where: {
      author_id: authorId,
      deleted_at: null,
      created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      ...(postId ? { id: { not: postId } } : {}),
    },
    select: { id: true, content: true },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  for (const p of recent) {
    if (similarity(norm, normalize(p.content)) >= DUPLICATE_SIMILARITY) {
      return { isDuplicate: true, originalPostId: p.id };
    }
  }
  return { isDuplicate: false };
}

// ── Rate / spam frequency check ───────────────────────────────────────────────
export async function checkSpamRate(authorId: string): Promise<{ isSpam: boolean; reason: string }> {
  const now = Date.now();
  const [perMinute, perHour] = await Promise.all([
    prisma.post.count({ where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(now - 60_000) } } }),
    prisma.post.count({ where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(now - 3_600_000) } } }),
  ]);

  if (perMinute >= SPAM_POSTS_PER_MINUTE) return { isSpam: true, reason: `Слишком много постов за минуту (${perMinute})` };
  if (perHour  >= SPAM_POSTS_PER_HOUR)   return { isSpam: true, reason: `Слишком много постов за час (${perHour})` };
  return { isSpam: false, reason: '' };
}

// ── Story burst / spam frequency check ────────────────────────────────────────
export async function checkStoryBurstRate(userId: string): Promise<{ isSpam: boolean; reason: string }> {
  const now = Date.now();
  const [per10s, perMinute, perHour] = await Promise.all([
    prisma.story.count({ where: { user_id: userId, created_at: { gte: new Date(now - 10_000) } } }),
    prisma.story.count({ where: { user_id: userId, created_at: { gte: new Date(now - 60_000) } } }),
    prisma.story.count({ where: { user_id: userId, created_at: { gte: new Date(now - 3_600_000) } } }),
  ]);

  if (per10s    >= STORY_BURST_PER_10S)   return { isSpam: true, reason: `Аномальный всплеск историй: ${per10s} за 10 секунд` };
  if (perMinute >= STORY_SPAM_PER_MINUTE) return { isSpam: true, reason: `Слишком много историй за минуту (${perMinute})` };
  if (perHour   >= STORY_SPAM_PER_HOUR)   return { isSpam: true, reason: `Слишком много историй за час (${perHour})` };
  return { isSpam: false, reason: '' };
}

// ── Comment burst / spam frequency check ──────────────────────────────────────
export async function checkCommentBurstRate(authorId: string): Promise<{ isSpam: boolean; reason: string }> {
  const now = Date.now();
  const [per10s, perMinute, perHour] = await Promise.all([
    prisma.comment.count({ where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(now - 10_000) } } }),
    prisma.comment.count({ where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(now - 60_000) } } }),
    prisma.comment.count({ where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(now - 3_600_000) } } }),
  ]);

  if (per10s    >= COMMENT_BURST_PER_10S)   return { isSpam: true, reason: `Аномальный всплеск комментариев: ${per10s} за 10 секунд` };
  if (perMinute >= COMMENT_SPAM_PER_MINUTE) return { isSpam: true, reason: `Слишком много комментариев за минуту (${perMinute})` };
  if (perHour   >= COMMENT_SPAM_PER_HOUR)   return { isSpam: true, reason: `Слишком много комментариев за час (${perHour})` };
  return { isSpam: false, reason: '' };
}

// ── Message burst / spam frequency check ──────────────────────────────────────
export async function checkMessageBurstRate(senderId: string): Promise<{ isSpam: boolean; reason: string }> {
  const now = Date.now();
  const [per10s, perMinute, perHour] = await Promise.all([
    prisma.message.count({ where: { sender_id: senderId, deleted_at: null, created_at: { gte: new Date(now - 10_000) } } }),
    prisma.message.count({ where: { sender_id: senderId, deleted_at: null, created_at: { gte: new Date(now - 60_000) } } }),
    prisma.message.count({ where: { sender_id: senderId, deleted_at: null, created_at: { gte: new Date(now - 3_600_000) } } }),
  ]);

  if (per10s    >= MESSAGE_BURST_PER_10S)   return { isSpam: true, reason: `Аномальный всплеск сообщений: ${per10s} за 10 секунд` };
  if (perMinute >= MESSAGE_SPAM_PER_MINUTE) return { isSpam: true, reason: `Слишком много сообщений за минуту (${perMinute})` };
  if (perHour   >= MESSAGE_SPAM_PER_HOUR)   return { isSpam: true, reason: `Слишком много сообщений за час (${perHour})` };
  return { isSpam: false, reason: '' };
}

// ── Group chat message burst / spam frequency check ───────────────────────────
// GroupMessage is a separate table from Message (DMs), so it needs its own rate
// check — checkMessageBurstRate only ever sees direct-message rows.
export async function checkGroupMessageBurstRate(senderId: string): Promise<{ isSpam: boolean; reason: string }> {
  const now = Date.now();
  const [per10s, perMinute, perHour] = await Promise.all([
    prisma.groupMessage.count({ where: { user_id: senderId, deleted_at: null, created_at: { gte: new Date(now - 10_000) } } }),
    prisma.groupMessage.count({ where: { user_id: senderId, deleted_at: null, created_at: { gte: new Date(now - 60_000) } } }),
    prisma.groupMessage.count({ where: { user_id: senderId, deleted_at: null, created_at: { gte: new Date(now - 3_600_000) } } }),
  ]);

  if (per10s    >= MESSAGE_BURST_PER_10S)   return { isSpam: true, reason: `Аномальный всплеск сообщений в группе: ${per10s} за 10 секунд` };
  if (perMinute >= MESSAGE_SPAM_PER_MINUTE) return { isSpam: true, reason: `Слишком много сообщений в группе за минуту (${perMinute})` };
  if (perHour   >= MESSAGE_SPAM_PER_HOUR)   return { isSpam: true, reason: `Слишком много сообщений в группе за час (${perHour})` };
  return { isSpam: false, reason: '' };
}

// Snapshot of the reported content, captured before deletion, so the user-facing
// violation modal can still show what was removed and when.
export interface TargetSnapshot {
  label?: string;      // e.g. "Видео oreiro197" or a caption preview
  thumbnail?: string;  // media URL, if any
  date?: string;       // ISO date the content was originally published
}

// ── Main action dispatch ──────────────────────────────────────────────────────
// Returns the id of the 'warn' AutoModLog row (so callers can link a notification
// back to the specific log entry for appeals), or null when no action was taken.
export async function applyAction(
  userId: string,
  action: 'warn' | 'freeze' | 'ban',
  category: string,
  reason: string,
  details?: string,
  postId?: string,
  actorId?: string, // set when a moderator triggers this manually (vs. the automatic pipeline)
  imageUrl?: string,        // evidence photo attached by a moderator
  targetSnapshot?: TargetSnapshot,
): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { warn_count: true, deleted_at: true, frozen_at: true } });
  if (!user || user.deleted_at) return null; // already banned

  const log = await prisma.autoModLog.create({
    data: { user_id: userId, actor_id: actorId ?? null, action, reason, category, score: 0, details, post_id: postId || null, image_url: imageUrl ?? null },
  });

  if (action === 'ban') {
    await prisma.user.update({ where: { id: userId }, data: { deleted_at: new Date(), is_banned: true, frozen_reason: `[AUTOMOD BAN] ${reason}` } });
    await notificationService.create({ receiverId: userId, type: 'automod_ban', postId, meta: { reason } });
    logger.info(`[AUTOMOD] BAN user=${userId} reason=${reason}`);
    return log.id;
  }

  if (action === 'freeze') {
    if (!user.frozen_at) {
      await prisma.user.update({ where: { id: userId }, data: { frozen_at: new Date(), frozen_reason: reason } });
      await notificationService.create({ receiverId: userId, type: 'automod_freeze', postId, meta: { reason } });
      logger.info(`[AUTOMOD] FREEZE user=${userId} reason=${reason}`);
    }
    return log.id;
  }

  if (action === 'warn') {
    // Атомарный инкремент: параллельные нарушения раньше писали один и тот же старый счётчик
    const bumped = await prisma.user.update({ where: { id: userId }, data: { warn_count: { increment: 1 } }, select: { warn_count: true } });
    const newWarnCount = bumped.warn_count;
    const warnMeta = {
      count: newWarnCount, limit: WARNS_BEFORE_BAN, reason, category,
      imageUrl: imageUrl ?? undefined, autoModLogId: log.id,
      targetLabel: targetSnapshot?.label, targetThumbnail: targetSnapshot?.thumbnail, targetDate: targetSnapshot?.date,
    };
    if (newWarnCount >= WARNS_BEFORE_BAN) {
      // Escalate to a reversible freeze, never an automatic permanent ban.
      // A human moderator reviews the log and decides whether to lift it or ban manually.
      if (!user.frozen_at) {
        await prisma.user.update({ where: { id: userId }, data: { frozen_at: new Date(), frozen_reason: `[AUTOMOD FREEZE after ${newWarnCount} warns] ${reason}` } });
        await prisma.autoModLog.create({ data: { user_id: userId, action: 'freeze', reason: `Аккаунт заморожен после ${newWarnCount} предупреждений — проверка модератором`, category, score: 1, details } });
        await notificationService.create({ receiverId: userId, type: 'automod_warn', postId, meta: warnMeta });
        await notificationService.create({
          receiverId: userId, type: 'automod_freeze', postId,
          meta: { reason: `Аккаунт заморожен после ${newWarnCount} предупреждений` },
        });
        logger.info(`[AUTOMOD] FREEZE (warn limit) user=${userId}`);
      }
    } else {
      await notificationService.create({ receiverId: userId, type: 'automod_warn', postId, meta: warnMeta });
      logger.info(`[AUTOMOD] WARN user=${userId} count=${newWarnCount} reason=${reason}`);
    }
    return log.id;
  }
  return log.id;
}

// ── Soft-delete flagged post ──────────────────────────────────────────────────
export async function flagPost(postId: string, userId: string, category: string, reason: string): Promise<void> {
  await prisma.post.update({ where: { id: postId }, data: { deleted_at: new Date() } });
  await prisma.autoModLog.create({ data: { user_id: userId, action: 'flag_post', reason, category, score: 0, details: `post_id=${postId}`, post_id: postId } });
  logger.info(`[AUTOMOD] FLAG_POST post=${postId} user=${userId} reason=${reason}`);
}

// ── Appeals ────────────────────────────────────────────────────────────────
export async function getOwnWarningLog(logId: string, userId: string) {
  const log = await prisma.autoModLog.findUnique({ where: { id: logId } });
  if (!log || log.user_id !== userId) return null;
  return log;
}

export async function submitAppeal(logId: string, userId: string, text: string) {
  const log = await prisma.autoModLog.findUnique({ where: { id: logId } });
  if (!log || log.user_id !== userId) throw new Error('Not found');
  if (log.appeal_status !== 'none') throw new Error('Appeal already submitted');
  return prisma.autoModLog.update({
    where: { id: logId },
    data: { appeal_status: 'pending', appeal_text: text, appeal_created_at: new Date() },
  });
}

export async function getPendingAppeals() {
  return prisma.autoModLog.findMany({
    where: { appeal_status: 'pending' },
    orderBy: { appeal_created_at: 'asc' },
    include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
  });
}

export async function decideAppeal(logId: string, resolverId: string, decision: 'accepted' | 'rejected') {
  const log = await prisma.autoModLog.findUnique({ where: { id: logId } });
  if (!log) throw new Error('No pending appeal');

  // Условный переход из pending: два модератора не могут принять одну апелляцию и дважды снять предупреждение
  const claimed = await prisma.autoModLog.updateMany({
    where: { id: logId, appeal_status: 'pending' },
    data: { appeal_status: decision, appeal_resolved_at: new Date(), appeal_resolved_by: resolverId },
  });
  if (claimed.count !== 1) throw new Error('No pending appeal');

  if (decision === 'accepted') {
    await prisma.user.updateMany({ where: { id: log.user_id, warn_count: { gt: 0 } }, data: { warn_count: { decrement: 1 } } });
    await notificationService.create({ receiverId: log.user_id, type: 'automod_appeal_accepted', meta: { autoModLogId: logId } });
  } else {
    await notificationService.create({ receiverId: log.user_id, type: 'automod_appeal_rejected', meta: { autoModLogId: logId } });
  }
}

// ── Main entry: called on post creation ──────────────────────────────────────
export async function moderatePost(postId: string, authorId: string, content: string): Promise<void> {
  if (!(await getSetting('automod_enabled'))) return; // admin-disabled — manual moderation only

  // Skip if user is already banned/frozen
  const user = await prisma.user.findUnique({ where: { id: authorId }, select: { deleted_at: true, frozen_at: true, role: true } });
  if (!user || user.deleted_at) return;
  if (isModerator(user.role)) return; // staff exempt

  // 1. Check spam rate
  const rateCheck = await checkSpamRate(authorId);
  if (rateCheck.isSpam) {
    await flagPost(postId, authorId, 'spam', rateCheck.reason);
    await applyAction(authorId, 'freeze', 'spam', rateCheck.reason, undefined, postId);
    return;
  }

  // 2. Check duplicate
  const dupCheck = await checkDuplicate(authorId, content, postId);
  if (dupCheck.isDuplicate) {
    await flagPost(postId, authorId, 'duplicate', 'Копия ранее опубликованного поста');
    await applyAction(authorId, 'warn', 'duplicate', `Публикация дублирующегося контента. При накоплении ${WARNS_BEFORE_BAN} предупреждений аккаунт будет заморожен.`, `Оригинал: ${dupCheck.originalPostId}`, postId);
    return;
  }

  // 3. Content analysis
  const analysis = analyzeContent(content);
  if (!analysis.shouldAct) return;

  await flagPost(postId, authorId, analysis.category, analysis.reason);

  if (analysis.category === 'fraud') {
    // Fraud is serious but still gets a reversible freeze, not an instant permanent ban —
    // a moderator reviews the flagged post and decides on further action.
    await applyAction(authorId, 'freeze', 'fraud', `${analysis.reason}. Аккаунт заморожен до проверки модератором.`, undefined, postId);
  } else if (analysis.category === 'toxic') {
    await applyAction(authorId, 'warn', 'toxic', `${analysis.reason}. При накоплении ${WARNS_BEFORE_BAN} предупреждений аккаунт будет заморожен.`, undefined, postId);
  } else if (analysis.category === 'spam') {
    await applyAction(authorId, 'freeze', 'spam', analysis.reason, undefined, postId);
  }
}

// ── Main entry: called on story creation ──────────────────────────────────────
export async function moderateStory(storyId: string, userId: string): Promise<void> {
  if (!(await getSetting('automod_enabled'))) return; // admin-disabled — manual moderation only

  // Skip if user is already banned/frozen or is staff
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { deleted_at: true, frozen_at: true, role: true } });
  if (!user || user.deleted_at || user.frozen_at) return;
  if (isModerator(user.role)) return; // staff exempt

  const rateCheck = await checkStoryBurstRate(userId);
  if (!rateCheck.isSpam) return;

  // Hide the stories that made up the burst, then freeze the account
  await prisma.story.updateMany({
    where: { user_id: userId, deleted_at: null, created_at: { gte: new Date(Date.now() - 60_000) } },
    data: { deleted_at: new Date() },
  });
  await applyAction(userId, 'freeze', 'suspicious', rateCheck.reason, `story_id=${storyId}`, undefined);
  logger.info(`[AUTOMOD] STORY_BURST user=${userId} reason=${rateCheck.reason}`);
}

// ── Main entry: called on comment creation ────────────────────────────────────
export async function moderateComment(commentId: string, authorId: string): Promise<void> {
  if (!(await getSetting('automod_enabled'))) return; // admin-disabled — manual moderation only

  // Skip if user is already banned/frozen or is staff
  const user = await prisma.user.findUnique({ where: { id: authorId }, select: { deleted_at: true, frozen_at: true, role: true } });
  if (!user || user.deleted_at || user.frozen_at) return;
  if (isModerator(user.role)) return; // staff exempt

  const rateCheck = await checkCommentBurstRate(authorId);
  if (!rateCheck.isSpam) return;

  // Hide the comments that made up the burst, then freeze the account
  await prisma.comment.updateMany({
    where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(Date.now() - 60_000) } },
    data: { deleted_at: new Date() },
  });
  await applyAction(authorId, 'freeze', 'spam', rateCheck.reason, `comment_id=${commentId}`, undefined);
  logger.info(`[AUTOMOD] COMMENT_BURST user=${authorId} reason=${rateCheck.reason}`);
}

// ── Main entry: called on message send ────────────────────────────────────────
// Unlike posts/stories/comments this can't inspect content (messages are
// client-side encrypted) — purely a send-rate check. First offense only warns
// (with an explicit "next time = freeze" message); if the sender is still
// spamming after that warning it escalates straight to freeze.
export async function moderateMessage(senderId: string): Promise<void> {
  if (!(await getSetting('automod_enabled'))) return; // admin-disabled — manual moderation only

  const user = await prisma.user.findUnique({ where: { id: senderId }, select: { deleted_at: true, frozen_at: true, role: true } });
  if (!user || user.deleted_at || user.frozen_at) return;
  if (isModerator(user.role)) return; // staff exempt

  const rateCheck = await checkMessageBurstRate(senderId);
  if (!rateCheck.isSpam) return;

  const priorWarn = await prisma.autoModLog.findFirst({
    where: {
      user_id: senderId, action: 'warn', category: 'spam', details: 'message_spam',
      created_at: { gte: new Date(Date.now() - MESSAGE_SPAM_WARN_WINDOW_MS) },
    },
  });

  if (priorWarn) {
    await applyAction(senderId, 'freeze', 'spam', `Спам в сообщениях продолжился после предупреждения: ${rateCheck.reason}`, 'message_spam');
    logger.info(`[AUTOMOD] MESSAGE_SPAM_FREEZE user=${senderId} reason=${rateCheck.reason}`);
  } else {
    await applyAction(senderId, 'warn', 'spam', `Спам в личных сообщениях: ${rateCheck.reason}. Если это повторится, аккаунт будет заморожен.`, 'message_spam');
    logger.info(`[AUTOMOD] MESSAGE_SPAM_WARN user=${senderId} reason=${rateCheck.reason}`);
  }
}

// ── Main entry: called on group chat message send ─────────────────────────────
// Same shape as moderateMessage but tracked separately (own rate check + own
// warn window) since group chat messages live in GroupMessage, not Message.
export async function moderateGroupMessage(senderId: string): Promise<void> {
  if (!(await getSetting('automod_enabled'))) return; // admin-disabled — manual moderation only

  const user = await prisma.user.findUnique({ where: { id: senderId }, select: { deleted_at: true, frozen_at: true, role: true } });
  if (!user || user.deleted_at || user.frozen_at) return;
  if (isModerator(user.role)) return; // staff exempt

  const rateCheck = await checkGroupMessageBurstRate(senderId);
  if (!rateCheck.isSpam) return;

  const priorWarn = await prisma.autoModLog.findFirst({
    where: {
      user_id: senderId, action: 'warn', category: 'spam', details: 'group_message_spam',
      created_at: { gte: new Date(Date.now() - MESSAGE_SPAM_WARN_WINDOW_MS) },
    },
  });

  if (priorWarn) {
    await applyAction(senderId, 'freeze', 'spam', `Спам в групповом чате продолжился после предупреждения: ${rateCheck.reason}`, 'group_message_spam');
    logger.info(`[AUTOMOD] GROUP_MESSAGE_SPAM_FREEZE user=${senderId} reason=${rateCheck.reason}`);
  } else {
    await applyAction(senderId, 'warn', 'spam', `Спам в групповом чате: ${rateCheck.reason}. Если это повторится, аккаунт будет заморожен.`, 'group_message_spam');
    logger.info(`[AUTOMOD] GROUP_MESSAGE_SPAM_WARN user=${senderId} reason=${rateCheck.reason}`);
  }
}

// ── Report priority scoring ───────────────────────────────────────────────────
export function scoreReport(reason: string, targetType: string): { priority: number; category: string; score: number } {
  const analysis = analyzeContent(reason);

  let priority = 0;
  let category = analysis.category;

  // Base priority from analysis
  priority += Math.round(analysis.score * 50);

  // Boost by target type
  if (targetType === 'post')    priority += 10;
  if (targetType === 'comment') priority += 5;
  if (targetType === 'user')    priority += 20;

  // Boost fraud/toxic
  if (category === 'fraud') priority += 50;
  if (category === 'toxic') priority += 30;
  if (category === 'spam')  priority += 15;
  if (category === 'duplicate') priority += 5;

  // Keyword boosts in reason text
  if (/мошенничество|мошенник|обман|развод/i.test(reason)) { priority += 30; category = 'fraud'; }
  if (/оскорбл|угроз|насили|травл/i.test(reason))          { priority += 25; category = 'toxic'; }
  if (/спам|реклам|рассылк/i.test(reason))                  { priority += 15; category = 'spam'; }
  if (/несовершеннолет|child|15 лет|underage/i.test(reason)){ priority += 60; }

  return { priority: Math.min(priority, 100), category: category === 'clean' ? 'other' : category, score: analysis.score };
}

// ── Suspicious activity patrol (called from cron) ─────────────────────────────
export async function patrolSuspiciousActivity(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const oneDayAgo  = new Date(Date.now() - 86_400_000);

  // 1. Users with very high post rate today (possible bot)
  const highPosters = await prisma.$queryRaw<{ author_id: string; cnt: bigint }[]>`
    SELECT author_id, COUNT(*) as cnt FROM "Post"
    WHERE deleted_at IS NULL AND created_at >= ${oneDayAgo}
    GROUP BY author_id HAVING COUNT(*) > 100
  `;

  for (const hp of highPosters) {
    const u = await prisma.user.findUnique({ where: { id: hp.author_id }, select: { deleted_at: true, frozen_at: true, role: true } });
    if (!u || u.deleted_at || u.frozen_at || isModerator(u.role)) continue;
    await applyAction(hp.author_id, 'freeze', 'suspicious', `Подозрительная активность: ${hp.cnt} постов за 24ч`, undefined, undefined);
  }

  // 2. Users with very high story rate today (possible bot)
  const highStoryPosters = await prisma.$queryRaw<{ user_id: string; cnt: bigint }[]>`
    SELECT user_id, COUNT(*) as cnt FROM "Story"
    WHERE deleted_at IS NULL AND created_at >= ${oneDayAgo}
    GROUP BY user_id HAVING COUNT(*) > 80
  `;

  for (const hs of highStoryPosters) {
    const u = await prisma.user.findUnique({ where: { id: hs.user_id }, select: { deleted_at: true, frozen_at: true, role: true } });
    if (!u || u.deleted_at || u.frozen_at || isModerator(u.role)) continue;
    await applyAction(hs.user_id, 'freeze', 'suspicious', `Подозрительная активность: ${hs.cnt} историй за 24ч`, undefined, undefined);
  }

  // 3. Users with many *distinct reporters* against them in last hour → freeze.
  // Must count distinct reporter_id, not raw report rows — otherwise a single
  // attacker can spam reports (up to the 10/min rate limit) against one profile
  // and trigger an automatic freeze of an innocent user.
  const reportedUsers = await prisma.$queryRaw<{ uid: string; cnt: bigint }[]>`
    SELECT r.target_id as uid, COUNT(DISTINCT r.reporter_id) as cnt FROM "Report" r
    WHERE r.status = 'pending' AND r.created_at >= ${oneHourAgo}
      AND r.target_type = 'user'
    GROUP BY r.target_id HAVING COUNT(DISTINCT r.reporter_id) >= 8
  `;

  for (const ru of reportedUsers) {
    const u = await prisma.user.findUnique({ where: { id: ru.uid }, select: { deleted_at: true, frozen_at: true, role: true } });
    if (!u || u.deleted_at || u.frozen_at || isModerator(u.role)) continue;
    await applyAction(ru.uid, 'freeze', 'suspicious', `Массовые жалобы: ${ru.cnt} за час`, undefined, undefined);
  }

  // 4. Auto-prioritize all pending reports
  const pending = await prisma.report.findMany({ where: { status: 'pending', priority: 0 }, select: { id: true, reason: true, target_type: true } });
  for (const r of pending) {
    const { priority, category, score } = scoreReport(r.reason, r.target_type);
    if (priority > 0) {
      await prisma.report.update({ where: { id: r.id }, data: { priority, ai_category: category, ai_score: score } });
    }
  }

  logger.info(`[AUTOMOD] Patrol done. HighPosters:${highPosters.length} HighStoryPosters:${highStoryPosters.length} ReportedUsers:${reportedUsers.length} PrioritizedReports:${pending.length}`);
}
