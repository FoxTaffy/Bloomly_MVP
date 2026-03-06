/**
 * AutoMod Service — rule-based content moderation with scoring
 *
 * Actions:
 *  - warn:       +1 warn_count, log (max 3 → auto-ban)
 *  - freeze:     set frozen_at, log
 *  - ban:        set deleted_at + frozen_reason = 'ban', log
 *  - flag_post:  soft-delete or mark suspicious post, log
 *
 * Categories:
 *  spam | toxic | duplicate | fraud | suspicious
 */

import prisma from '../../config/prisma.js';

// ── Thresholds ────────────────────────────────────────────────────────────────
const WARNS_BEFORE_BAN       = 3;
const SPAM_POSTS_PER_MINUTE  = 5;    // more than 5 posts/min = spam
const SPAM_POSTS_PER_HOUR    = 20;   // more than 20 posts/hr = spam
const DUPLICATE_SIMILARITY   = 0.85; // 85% same chars = duplicate
const FRAUD_SCORE_THRESHOLD  = 0.7;
const TOXIC_SCORE_THRESHOLD  = 0.65;
const SPAM_SCORE_THRESHOLD   = 0.6;

// ── Russian keyword dictionaries ──────────────────────────────────────────────
const FRAUD_PATTERNS = [
  /казино|casino|заработ[аи][тй]|пассивный доход|кликни по ссылк|инвест.*гарант/i,
  /бинарн.*опцион|криптоин.*схем|заработок в интернет|лёгкие деньги/i,
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

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const common = [...a].filter(c => b.includes(c)).length;
  return (2 * common) / (la + lb);
}

export async function checkDuplicate(authorId: string, content: string): Promise<{ isDuplicate: boolean; originalPostId?: string }> {
  const norm = normalize(content);
  if (norm.length < 20) return { isDuplicate: false };

  const recent = await prisma.post.findMany({
    where: { author_id: authorId, deleted_at: null, created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
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

// ── Main action dispatch ──────────────────────────────────────────────────────
export async function applyAction(
  userId: string,
  action: 'warn' | 'freeze' | 'ban',
  category: string,
  reason: string,
  details?: string,
  postId?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { warn_count: true, deleted_at: true, frozen_at: true } });
  if (!user || user.deleted_at) return; // already banned

  await prisma.autoModLog.create({
    data: { user_id: userId, action, reason, category, score: 0, details, post_id: postId || null },
  });

  if (action === 'ban') {
    await prisma.user.update({ where: { id: userId }, data: { deleted_at: new Date(), frozen_reason: `[AUTOMOD BAN] ${reason}` } });
    console.log(`[AUTOMOD] BAN user=${userId} reason=${reason}`);
    return;
  }

  if (action === 'freeze') {
    if (!user.frozen_at) {
      await prisma.user.update({ where: { id: userId }, data: { frozen_at: new Date(), frozen_reason: reason } });
      console.log(`[AUTOMOD] FREEZE user=${userId} reason=${reason}`);
    }
    return;
  }

  if (action === 'warn') {
    const newWarnCount = (user.warn_count ?? 0) + 1;
    if (newWarnCount >= WARNS_BEFORE_BAN) {
      await prisma.user.update({ where: { id: userId }, data: { warn_count: newWarnCount, deleted_at: new Date(), frozen_reason: `[AUTOMOD BAN after ${newWarnCount} warns] ${reason}` } });
      await prisma.autoModLog.create({ data: { user_id: userId, action: 'ban', reason: `Забанен после ${newWarnCount} предупреждений`, category, score: 1, details } });
      console.log(`[AUTOMOD] BAN (warn limit) user=${userId}`);
    } else {
      await prisma.user.update({ where: { id: userId }, data: { warn_count: newWarnCount } });
      console.log(`[AUTOMOD] WARN user=${userId} count=${newWarnCount} reason=${reason}`);
    }
  }
}

// ── Soft-delete flagged post ──────────────────────────────────────────────────
export async function flagPost(postId: string, userId: string, category: string, reason: string): Promise<void> {
  await prisma.post.update({ where: { id: postId }, data: { deleted_at: new Date() } });
  await prisma.autoModLog.create({ data: { user_id: userId, action: 'flag_post', reason, category, score: 0, details: `post_id=${postId}`, post_id: postId } });
  console.log(`[AUTOMOD] FLAG_POST post=${postId} user=${userId} reason=${reason}`);
}

// ── Main entry: called on post creation ──────────────────────────────────────
export async function moderatePost(postId: string, authorId: string, content: string): Promise<void> {
  // Skip if user is already banned/frozen
  const user = await prisma.user.findUnique({ where: { id: authorId }, select: { deleted_at: true, frozen_at: true, role: true } });
  if (!user || user.deleted_at) return;
  if (user.role === 'admin' || user.role === 'moderator') return; // admins exempt

  // 1. Check spam rate
  const rateCheck = await checkSpamRate(authorId);
  if (rateCheck.isSpam) {
    await flagPost(postId, authorId, 'spam', rateCheck.reason);
    await applyAction(authorId, 'freeze', 'spam', rateCheck.reason, undefined, postId);
    return;
  }

  // 2. Check duplicate
  const dupCheck = await checkDuplicate(authorId, content);
  if (dupCheck.isDuplicate) {
    await flagPost(postId, authorId, 'duplicate', 'Копия ранее опубликованного поста');
    await applyAction(authorId, 'warn', 'duplicate', 'Публикация дублирующегося контента', `Оригинал: ${dupCheck.originalPostId}`, postId);
    return;
  }

  // 3. Content analysis
  const analysis = analyzeContent(content);
  if (!analysis.shouldAct) return;

  await flagPost(postId, authorId, analysis.category, analysis.reason);

  if (analysis.category === 'fraud') {
    await applyAction(authorId, 'ban', 'fraud', analysis.reason, undefined, postId);
  } else if (analysis.category === 'toxic') {
    await applyAction(authorId, 'warn', 'toxic', analysis.reason, undefined, postId);
  } else if (analysis.category === 'spam') {
    await applyAction(authorId, 'freeze', 'spam', analysis.reason, undefined, postId);
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
    GROUP BY author_id HAVING COUNT(*) > 50
  `;

  for (const hp of highPosters) {
    const u = await prisma.user.findUnique({ where: { id: hp.author_id }, select: { deleted_at: true, frozen_at: true, role: true } });
    if (!u || u.deleted_at || u.frozen_at || u.role === 'admin' || u.role === 'moderator') continue;
    await applyAction(hp.author_id, 'freeze', 'suspicious', `Подозрительная активность: ${hp.cnt} постов за 24ч`, undefined, undefined);
  }

  // 2. Users with many reports against them in last hour → freeze
  const reportedUsers = await prisma.$queryRaw<{ reporter_id_ignored: string; uid: string; cnt: bigint }[]>`
    SELECT r.target_id as uid, COUNT(*) as cnt FROM "Report" r
    WHERE r.status = 'pending' AND r.created_at >= ${oneHourAgo}
      AND r.target_type = 'user'
    GROUP BY r.target_id HAVING COUNT(*) >= 5
  `;

  for (const ru of reportedUsers) {
    const u = await prisma.user.findUnique({ where: { id: ru.uid }, select: { deleted_at: true, frozen_at: true, role: true } });
    if (!u || u.deleted_at || u.frozen_at || u.role === 'admin' || u.role === 'moderator') continue;
    await applyAction(ru.uid, 'freeze', 'suspicious', `Массовые жалобы: ${ru.cnt} за час`, undefined, undefined);
  }

  // 3. Auto-prioritize all pending reports
  const pending = await prisma.report.findMany({ where: { status: 'pending', priority: 0 }, select: { id: true, reason: true, target_type: true } });
  for (const r of pending) {
    const { priority, category, score } = scoreReport(r.reason, r.target_type);
    if (priority > 0) {
      await prisma.report.update({ where: { id: r.id }, data: { priority, ai_category: category, ai_score: score } });
    }
  }

  console.log(`[AUTOMOD] Patrol done. HighPosters:${highPosters.length} ReportedUsers:${reportedUsers.length} PrioritizedReports:${pending.length}`);
}
