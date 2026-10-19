import prisma from '../../config/prisma.js';
import { readablePostsWhere, assertPostReadable } from '../../lib/contentAccess.js';
import { pagination } from '../../lib/pagination.js';
import { notificationService } from '../notifications/service.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import { isBlockedBy, getBlockerIds } from '../../lib/blocks.js';
import { isTrustedMediaUrl, deleteFileByUrl, assertOwnedMedia } from '../media/service.js';
import { groupService } from '../groups/service.js';
import { extractKeywords } from '../../lib/textKeywords.js';
import { interestsToTerms } from '../../lib/interestTags.js';
import { normalizeTag } from '../../lib/tagRules.js';
import { expandTag, groupKeyOf, synonymGroups } from '../../lib/tagSynonyms.js';
import { parseSearchQuery, textScore } from '../../lib/searchQuery.js';
import { resolveTagsForTerm } from '../../lib/tagSearch.js';
import { muteKeywordsWhere, nsfwWhere, type NsfwMode } from '../../lib/contentFilters.js';
import { analyzeContent } from '../automod/service.js';
import type { CreatePostInput, EditPostInput, GetPostsQuery } from './types.js';
import { errCode } from '../../lib/httpErrors.js';
import { logError } from '../../lib/logger.js';

const MAX_MEDIA_PER_POST = 20;
/** Сколько самых свежих подходящих постов ранжируется при поиске. */
const SEARCH_WINDOW = 300;

// A group owner/admin/moderator may moderate (delete) content posted inside their own group,
// even if they didn't author it — this is separate from the site-wide staff role.
async function canModerateAsGroupStaff(postId: string, userId: string): Promise<boolean> {
  const groupPost = await prisma.groupPost.findFirst({
    where: { post_id: postId },
    select: { group_id: true },
  });
  if (!groupPost) return false;
  return groupService.isAtLeastModerator(groupPost.group_id, userId);
}

// Who may remove *any* comment on a post (not just their own): the post's
// author moderating their own content, site staff, or group staff moderating
// a post inside their group.
async function canManageAllComments(postId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { author_id: true } });
  if (post?.author_id === userId) return true;
  return canModerateAsGroupStaff(postId, userId);
}

/** Throws a 403 unless the viewer is allowed to see userId's profile content. */
async function assertProfileVisible(userId: string, viewerId?: string) {
  if (viewerId === userId) return;
  if (await isBlockedBy(userId, viewerId)) {
    throw Object.assign(new Error('PROFILE_BLOCKED'), { statusCode: 403 });
  }
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { profile_visibility: true } });
  if (owner && !(await isAllowedByPrivacy(owner.profile_visibility, userId, viewerId))) {
    throw Object.assign(new Error('PROFILE_PRIVATE'), { statusCode: 403 });
  }
}

/** Убирает посты авторов, чей профиль скрыт от смотрящего (настройка профиля и блокировки). */
export async function filterByProfilePrivacy<T extends { author_id: string }>(rows: T[], viewerId?: string): Promise<T[]> {
  const authorIds = [...new Set(rows.map((r) => r.author_id))].filter((id) => id !== viewerId);
  if (authorIds.length === 0) return rows;
  const owners = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, profile_visibility: true },
  });
  // Пакетно, а не по запросу на автора: лента из 20 постов делала 20 проверок блокировки
  // и по две на каждого автора с приватностью «друзья». Правила те же, что у isBlockedBy
  // (автор заблокировал зрителя) и isAllowedByPrivacy (друзья = взаимная подписка).
  const friendsOnly = owners.filter((o) => o.profile_visibility === 'friends').map((o) => o.id);
  const [blockRows, viewerFollows, followsViewer] = viewerId ? await Promise.all([
    prisma.block.findMany({ where: { blocked_id: viewerId, blocker_id: { in: authorIds } }, select: { blocker_id: true } }),
    friendsOnly.length ? prisma.follow.findMany({ where: { follower_id: viewerId, following_id: { in: friendsOnly } }, select: { following_id: true } }) : [],
    friendsOnly.length ? prisma.follow.findMany({ where: { following_id: viewerId, follower_id: { in: friendsOnly } }, select: { follower_id: true } }) : [],
  ]) : [[], [], []];
  const blockedBy = new Set(blockRows.map((b) => b.blocker_id));
  const followed = new Set(viewerFollows.map((f) => f.following_id));
  const friends = new Set(followsViewer.map((f) => f.follower_id).filter((id) => followed.has(id)));
  const visible = new Set<string>();
  for (const owner of owners) {
    if (blockedBy.has(owner.id)) continue;
    switch (owner.profile_visibility) {
      case 'nobody':
      case 'only_me':
        continue;
      case 'friends':
        if (friends.has(owner.id)) visible.add(owner.id);
        continue;
      default:
        visible.add(owner.id);
    }
  }
  return rows.filter((r) => r.author_id === viewerId || visible.has(r.author_id));
}

/** Reusable author select for posts — includes verification fields */
const AUTHOR_SELECT = { id: true, username: true, display_name: true, avatar_url: true, is_verified: true, verification_type: true, deceased_at: true } as const;

/** Authors can edit a post's content only within this window after creation */
export const POST_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Number of votes (likes + dislikes combined) a user must cast before the "Interests" tag cloud unlocks in settings. */
export const TAG_INSIGHTS_UNLOCK_THRESHOLD = 20;

/** Weight given to content-derived keywords relative to an explicit hashtag (weight 1.0). */
export const KEYWORD_WEIGHT = 0.4;
/** Max content keywords pulled into a post's affinity terms alongside its hashtags. */
export const KEYWORDS_PER_POST = 8;
/** Reposts are a stronger positive signal than a plain like — you don't reshare what you're lukewarm on. */
export const REPAW_MULTIPLIER = 1.6;
/** How strongly behavioral tag/keyword affinity swings feed ranking vs. raw post rating. */
const AFFINITY_RANK_WEIGHT = 3;
/** Flat per-matched-term bonus when a post lines up with a declared "Interest". */
const INTEREST_RANK_WEIGHT = 1.5;
/** Weight given to a passive view vs. an explicit like when reinforcing tag/keyword affinity. */
export const VIEW_AFFINITY_MULTIPLIER = 0.15;
/** Dwell time (ms) that counts as "gave this a proper look" — matches the frontend's MIN_VIEW_MS. */
const DWELL_BASELINE_MS = 2000;
/** Dwell time (ms) at which the view's affinity weight caps out — long past this, more time no longer means more interest. */
const DWELL_SATURATION_MS = 20_000;
/** Floor/ceiling multipliers applied on top of VIEW_AFFINITY_MULTIPLIER based on dwell time. */
const DWELL_MIN_FACTOR = 0.5;
const DWELL_MAX_FACTOR = 2.5;
/** An explicit "не интересно" is a deliberate negative signal — stronger than scrolling past, comparable to a real dislike. */
export const NOT_INTERESTED_MULTIPLIER = 1.2;
/** How many "bell" (notify_posts) posts get pinned to the very top of page 1 of the personalised feed. */
const BELL_FEED_LIMIT = 5;
/** Feed score halves every N hours a post ages — keeps old-but-highly-rated posts from permanently burying fresh ones. */
const RECENCY_HALF_LIFE_HOURS = 72;
/** Window looked at for "is this suddenly taking off" trending detection. */
const TRENDING_WINDOW_HOURS = 12;
/** How strongly a recent engagement burst (likes/comments/repaws within TRENDING_WINDOW_HOURS) swings feed ranking. */
const TRENDING_WEIGHT = 4;
/** Minimum number of other authors between two posts by the same author/group in the final feed. */
const AUTHOR_DIVERSITY_MIN_GAP = 2;
/**
 * Flat score bonus for posts the user has never opened. Sized against TRENDING_WEIGHT so a
 * genuinely undiscovered post is favored over ordinary content, but a post currently on a real
 * viral run (several recent votes/comments/repaws) can still outrank it — unseen is a strong
 * signal, not an absolute override of everything else.
 */
const UNSEEN_BOOST = 40;
/**
 * Flat bonus for a brand-new post, halving every FRESHNESS_HALF_LIFE_HOURS. Sized above UNSEEN_BOOST
 * so that posts from the last hour or two lead the feed (as in most social networks), then give way
 * to affinity/popularity within about half a day.
 */
const FRESHNESS_BOOST = 80;
const FRESHNESS_HALF_LIFE_HOURS = 4;

export type PostTerm = { term: string; source: 'tag' | 'keyword'; weight: number };
export type AffinityMap = Map<string, { score: number; likes: number; dislikes: number }>;
export type PostLike = { content: string; title?: string | null; is_nsfw: boolean; tags: { tag: { name: string } }[] };

/**
 * The set of hashtag + content-keyword terms a post is "about", each with a scoring weight.
 * Exported so the tag-affinity backfill script (src/scripts/backfillTagAffinity.ts) can replay
 * historical votes/repaws through the exact same term extraction as live voting does.
 */
export function getPostTerms(post: PostLike): PostTerm[] {
  const tagNames = new Set(post.tags.map((t) => t.tag.name.toLowerCase()));
  if (post.is_nsfw) tagNames.add('nsfw');

  const terms: PostTerm[] = Array.from(tagNames, (term) => ({ term, source: 'tag' as const, weight: 1 }));

  const keywords = extractKeywords(`${post.title ?? ''} ${post.content}`, {
    exclude: tagNames,
    limit: KEYWORDS_PER_POST,
  });
  for (const term of keywords) terms.push({ term, source: 'keyword', weight: KEYWORD_WEIGHT });

  return terms;
}

/** Squashes a raw affinity score into a 0..1 "how much does the user like this term" reading. */
function likeability(score: number): number {
  return (Math.tanh(score / 4) + 1) / 2;
}

/**
 * Splits a vote/repaw's effect across a post's terms.
 *
 * Likes/repaws reinforce every term uniformly — a positive signal isn't ambiguous about which
 * tag it's "for". Dislikes work like a scale instead of an even split: terms the user already
 * likes (say they upvote #fox and #dog constantly) are shielded, so disliking a #fox #dog #yiff
 * post mostly comes down on #yiff — the term actually out of step with their taste — rather than
 * eroding tags they otherwise love. Total magnitude is preserved either way, just reallocated.
 */
export function distributeVoteDelta(terms: PostTerm[], direction: 1 | -1, affinity: AffinityMap, multiplier = 1): Map<string, number> {
  const deltas = new Map<string, number>();
  if (terms.length === 0) return deltas;

  if (direction > 0) {
    for (const t of terms) deltas.set(t.term, (deltas.get(t.term) ?? 0) + t.weight * multiplier);
    return deltas;
  }

  const totalMagnitude = terms.reduce((sum, t) => sum + t.weight, 0);
  const blameFactors = terms.map((t) => {
    const currentScore = affinity.get(t.term)?.score ?? 0;
    return t.weight * Math.max(0.15, 1 - likeability(currentScore)); // floor: nothing is fully immune
  });
  const blameSum = blameFactors.reduce((a, b) => a + b, 0) || 1;
  terms.forEach((t, i) => {
    const delta = -(blameFactors[i] / blameSum) * totalMagnitude * multiplier;
    deltas.set(t.term, (deltas.get(t.term) ?? 0) + delta);
  });
  return deltas;
}

/** Applies a {term: scoreDelta} map to UserTagAffinity, plus a like/dislike count adjustment (may be negative to reverse a prior vote). */
async function applyTermDeltas(
  tx: any,
  userId: string,
  scoreDeltas: Map<string, number>,
  termSource: Map<string, 'tag' | 'keyword'>,
  countDelta: { likes: number; dislikes: number },
) {
  for (const [term, delta] of scoreDeltas) {
    if (delta === 0 && countDelta.likes === 0 && countDelta.dislikes === 0) continue;
    await tx.userTagAffinity.upsert({
      where: { user_id_term: { user_id: userId, term } },
      create: {
        user_id: userId,
        term,
        source: termSource.get(term) ?? 'tag',
        score: delta,
        likes: Math.max(0, countDelta.likes),
        dislikes: Math.max(0, countDelta.dislikes),
      },
      update: {
        score: { increment: delta },
        likes: { increment: countDelta.likes },
        dislikes: { increment: countDelta.dislikes },
      },
    });
  }
}

function negateDeltas(deltas: Map<string, number>): Map<string, number> {
  return new Map(Array.from(deltas, ([k, v]) => [k, -v]));
}

/** Maps raw dwell time to a linear factor between DWELL_MIN_FACTOR and DWELL_MAX_FACTOR. */
function dwellFactor(dwellMs?: number): number {
  if (dwellMs === undefined) return 1; // caller (e.g. old client, backfill script) didn't supply a duration
  const clamped = Math.min(Math.max(dwellMs, DWELL_BASELINE_MS), DWELL_SATURATION_MS);
  const t = (clamped - DWELL_BASELINE_MS) / (DWELL_SATURATION_MS - DWELL_BASELINE_MS);
  return DWELL_MIN_FACTOR + t * (DWELL_MAX_FACTOR - DWELL_MIN_FACTOR);
}

/**
 * Reinforces a viewer's tag/keyword affinity from a passive view — same term extraction and
 * distribution as a like (see distributeVoteDelta), just far weaker (VIEW_AFFINITY_MULTIPLIER)
 * since scrolling past a post is a much softer signal than an explicit like/repost. Scaled by
 * how long they actually dwelled (see dwellFactor) — a 20s read is a stronger "I'm into this"
 * signal than the 2s minimum that qualifies a view at all, same idea as TikTok/YouTube watch-time.
 */
export async function applyViewAffinity(userId: string, postId: string, dwellMs?: number) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { content: true, title: true, is_nsfw: true, tags: { include: { tag: true } } },
  });
  if (!post) return;
  const terms = getPostTerms(post);
  if (terms.length === 0) return;
  const deltas = distributeVoteDelta(terms, 1, new Map(), VIEW_AFFINITY_MULTIPLIER * dwellFactor(dwellMs));
  const termSource = new Map(terms.map((t) => [t.term, t.source]));
  await applyTermDeltas(prisma, userId, deltas, termSource, { likes: 0, dislikes: 0 });
}

async function getUserAffinityMap(userId: string): Promise<AffinityMap> {
  const rows = await prisma.userTagAffinity.findMany({ where: { user_id: userId } });
  return new Map(rows.map((r) => [r.term, { score: r.score, likes: r.likes, dislikes: r.dislikes }]));
}

/**
 * Re-orders an already-fetched candidate pool into a single feed-ranking score. Ranking-only —
 * never adds or drops posts. The score combines:
 *  - raw rating, decayed by age (RECENCY_HALF_LIFE_HOURS) so old-but-once-popular posts don't
 *    permanently bury fresh ones,
 *  - behavioral tag/keyword affinity (built from likes/dislikes/reposts, see toggleVote/toggleRepaw),
 *  - declared "Interests",
 *  - a trending bump for posts currently getting a burst of engagement (see trendingMap),
 *  - a flat bonus for posts the user has never opened (per the durable PostView log, not just the
 *    shallow recent-activity window used for exclusion) — see UNSEEN_BOOST. This is a strong
 *    nudge, not a hard bucket: a real viral post can still beat a mediocre unseen one.
 */
function rankByAffinity<T extends PostLike & { id: string; rating: number; created_at: Date }>(
  posts: T[],
  affinity: AffinityMap,
  interestTerms: Set<string>,
  seenIds: Set<string> = new Set(),
  trendingMap: Map<string, number> = new Map(),
): T[] {
  const now = Date.now();
  return posts
    .map((post) => {
      const terms = getPostTerms(post);
      let behavioral = 0;
      let interestBoost = 0;
      for (const t of terms) {
        const a = affinity.get(t.term);
        if (a) behavioral += a.score * t.weight;
        if (interestTerms.has(t.term)) interestBoost += t.weight;
      }
      const ageHours = (now - post.created_at.getTime()) / 3_600_000;
      const decay = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
      const trending = trendingMap.get(post.id) ?? 0;
      const unseenBonus = seenIds.has(post.id) ? 0 : UNSEEN_BOOST;
      const freshness = FRESHNESS_BOOST * Math.pow(0.5, Math.max(0, ageHours) / FRESHNESS_HALF_LIFE_HOURS);
      const score = post.rating * decay
        + behavioral * AFFINITY_RANK_WEIGHT
        + interestBoost * INTEREST_RANK_WEIGHT
        + trending * TRENDING_WEIGHT
        + unseenBonus
        + freshness;
      return { post, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => s.post);
}

/** post_id -> author identity key ("group:<id>" or "user:<id>") used to spread out consecutive posts by the same author/group. */
function authorKey(post: any): string {
  const groupId = post.groupPosts?.[0]?.group?.id ?? post.groupPosts?.[0]?.group_id;
  return groupId ? `group:${groupId}` : `user:${post.author_id}`;
}

/**
 * Greedy re-rank pass: pulls a lower-ranked-but-different-author post forward whenever the same
 * author/group would otherwise appear twice within AUTHOR_DIVERSITY_MIN_GAP slots — same idea as
 * an Instagram/TikTok-style feed never stacking one creator's posts back to back. Falls back to
 * the next-best post (forced repeat) only if literally everything left is the same author.
 */
function diversifyByAuthor<T>(posts: T[]): T[] {
  const pending = posts.slice();
  const result: T[] = [];
  while (pending.length > 0) {
    const recentAuthors = result.slice(-AUTHOR_DIVERSITY_MIN_GAP).map(authorKey);
    let idx = pending.findIndex((p) => !recentAuthors.includes(authorKey(p)));
    if (idx === -1) idx = 0;
    result.push(pending[idx]);
    pending.splice(idx, 1);
  }
  return result;
}

/**
 * Excludes posts belonging to a soft-deleted group. A group's own deletion (leave-empties-it or
 * staff hard-delete) doesn't necessarily delete the Post rows themselves (see groups/service.ts
 * `leave`/`removeMember`, which only sets Group.deleted_at) — without this, those posts kept
 * showing up in every feed/search/permalink query as if the group were still around.
 */
// `none` (rather than `NOT: { some: ... }`) so this can be safely spread alongside another
// top-level `NOT` filter (e.g. bellExcludeFilter in getPersonalizedPosts) without one clobbering
// the other — object spread only keeps the last value for a duplicate key.
const NOT_DELETED_GROUP_FILTER = { groupPosts: { none: { group: { deleted_at: { not: null } } } } };

/** Reusable include for post queries */
const POST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
  tags: { include: { tag: true } },
  _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
  comments: {
    where: { deleted_at: null, parent_id: null, rating: { gt: 0 } },
    orderBy: { rating: 'desc' as const },
    take: 1,
    select: {
      id: true,
      content: true,
      rating: true,
      type: true,
      file_url: true,
      author: { select: AUTHOR_SELECT },
    },
  },
} as const;

/**
 * Group posts are anonymous: author is hidden from the public.
 * If the post belongs to a group (has groupPosts), null out `author`.
 * Exception: author's own "my posts" endpoint does NOT call this.
 */
function maskGroupAuthor(post: any): any {
  if (!post) return post;
  if (post.groupPosts && post.groupPosts.length > 0) {
    return { ...post, author: null, can_view_content: true };
  }
  return { ...post, can_view_content: true };
}

/** Same idea as maskGroupAuthor, but for a comment posted "as" a group (Comment.group_id). */
function maskGroupCommentAuthor(comment: any): any {
  if (!comment) return comment;
  if (comment.group_id && comment.group) {
    return { ...comment, author: null };
  }
  return comment;
}

// ── Personalized feed helpers ────────────────────────────────────────────────

const FEED_POST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
  tags: { include: { tag: true } },
  _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
  groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
};

/**
 * The user's taste from their last 30 activity records: posts they just viewed (skipped by the
 * feed) and their top-3 categories. Category score: LIKE = 3, VIEW scaled by how long they
 * dwelled (same dwellFactor used to weigh tag affinity — a 20s read says more than a scroll-past).
 */
async function recentTaste(userId: string) {
  const activities = await prisma.userActivity.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 30,
    include: { post: { select: { category: true } } },
  });
  const viewedPostIds = activities.filter((a) => a.type === 'VIEW').map((a) => a.post_id);
  const categoryScores: Record<string, number> = {};
  for (const activity of activities) {
    const category = activity.post?.category;
    if (!category) continue;
    const weight = activity.type === 'LIKE' ? 3 : dwellFactor(activity.duration ?? undefined);
    categoryScores[category] = (categoryScores[category] || 0) + weight;
  }
  const topCategories = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat]) => cat);
  return { viewedPostIds, topCategories };
}

/**
 * For ranking a candidate pool: which posts the user has ever opened (PostView — the shallow
 * last-30-activity skip only catches very recent repeats) and a "trending" score per post —
 * a recent burst of engagement weighted like effort: like < comment < repaw (mirrors
 * REPAW_MULTIPLIER's reasoning — a repost is a stronger signal than a like).
 */
async function seenAndTrending(userId: string, candidateIds: string[]) {
  const trendingCutoff = new Date(Date.now() - TRENDING_WINDOW_HOURS * 3_600_000);
  const [seenViews, recentVotes, recentComments, recentRepaws] = candidateIds.length > 0
    ? await Promise.all([
        prisma.postView.findMany({ where: { user_id: userId, post_id: { in: candidateIds } }, select: { post_id: true } }),
        prisma.vote.groupBy({ by: ['post_id'], where: { post_id: { in: candidateIds }, value: 1, deleted_at: null, created_at: { gte: trendingCutoff } }, _count: { _all: true } }),
        prisma.comment.groupBy({ by: ['post_id'], where: { post_id: { in: candidateIds }, deleted_at: null, created_at: { gte: trendingCutoff } }, _count: { _all: true } }),
        prisma.repaw.groupBy({ by: ['post_id'], where: { post_id: { in: candidateIds }, created_at: { gte: trendingCutoff } }, _count: { _all: true } }),
      ])
    : [[], [], [], []];
  const trendingMap = new Map<string, number>();
  const bump = (rows: { post_id: string; _count: { _all: number } }[], weight: number) => {
    for (const r of rows) trendingMap.set(r.post_id, (trendingMap.get(r.post_id) ?? 0) + r._count._all * weight);
  };
  bump(recentVotes, 1);
  bump(recentComments, 1.5);
  bump(recentRepaws, 2);
  return { seenIds: new Set(seenViews.map((v) => v.post_id)), trendingMap };
}

/** Merges two lists taking `aRun` items from `a`, then `bRun` from `b`, until both run out. */
export function interleave<T>(a: T[], aRun: number, b: T[], bRun: number): T[] {
  const out: T[] = [];
  let ai = 0;
  let bi = 0;
  while (ai < a.length || bi < b.length) {
    for (let i = 0; i < aRun && ai < a.length; i++, ai++) out.push(a[ai]);
    for (let i = 0; i < bRun && bi < b.length; i++, bi++) out.push(b[bi]);
  }
  return out;
}

export const postService = {
  async createPost(input: CreatePostInput) {
    const content = (input.content ?? '').trim();
    const mediaUrls = (input.mediaUrls ?? []).filter(Boolean);
    if (!content && mediaUrls.length === 0) throw new Error('Content is required');
    if (mediaUrls.length > MAX_MEDIA_PER_POST) {
      throw Object.assign(new Error('TOO_MANY_MEDIA_FILES'), { statusCode: 422 });
    }
    if (mediaUrls.some((url) => !isTrustedMediaUrl(url))) {
      throw Object.assign(new Error('INVALID_MEDIA_URL'), { statusCode: 422 });
    }
    // Index-aligned with mediaUrls; only kept when the caller supplied a matching-length array.
    const mediaOriginalUrls = input.mediaOriginalUrls?.length === mediaUrls.length
      ? input.mediaOriginalUrls
      : [];
    if (mediaOriginalUrls.some((url) => !isTrustedMediaUrl(url))) {
      throw Object.assign(new Error('INVALID_MEDIA_URL'), { statusCode: 422 });
    }

    const authorId = input.authorId;
    const isNsfw = input.isNsfw ?? false;
    const isAiGenerated = input.isAiGenerated ?? false;
    const isAnnouncement = input.isAnnouncement ?? false;
    const subscriberOnly = input.subscriberOnly ?? false;
    const isPaid = false; // Paid posts are temporarily disabled
    const price = input.price ?? null;
    const rewardForUserId = input.rewardForUserId ?? null;
    const videoTitle = input.videoTitle?.trim() || null;
    const videoDescription = input.videoDescription?.trim() || null;
    const category = input.category?.trim() || undefined;
    const tags = Array.from(
      new Set(
        (input.tags ?? [])
          .map(normalizeTag)
          .filter(Boolean),
      ),
    );

    // Прикреплять можно только файлы, которые автор загрузил сам (иначе чужой файл
    // потом удалялся бы вместе с этим постом)
    for (const url of [...mediaUrls, ...mediaOriginalUrls]) await assertOwnedMedia(url, authorId);

    return prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          content,
          author_id: authorId,
          is_nsfw: isNsfw,
          is_ai_generated: isAiGenerated,
          is_announcement: isAnnouncement,
          subscriber_only: subscriberOnly,
          is_paid: isPaid,
          price: price ? price : undefined,
          reward_for_user_id: rewardForUserId || undefined,
          video_title: videoTitle || undefined,
          video_description: videoDescription || undefined,
          category,
          media_urls: mediaUrls,
          media_original_urls: mediaOriginalUrls,
        },
      });

      if (tags.length > 0) {
        // Upsert all tags in parallel, then link them in parallel
        const tagRecords = await Promise.all(
          tags.map((tagName) =>
            tx.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName },
            })
          ),
        );

        await Promise.all(
          tagRecords.map((tag) =>
            tx.postTag.create({ data: { post_id: post.id, tag_id: tag.id } })
          ),
        );
      }

      return tx.post.findUnique({
        where: { id: post.id },
        include: POST_INCLUDE,
      });
    }).then(async (created) => {
      // Notify followers who opted into post notifications for this author.
      const subscribers = await prisma.follow.findMany({
        where: { following_id: authorId, notify_posts: true },
        select: { follower_id: true },
      });
      await Promise.all(
        subscribers.map((s) =>
          notificationService.create({
            receiverId: s.follower_id,
            senderId:   authorId,
            type:       'FOLLOW_POST',
            postId:     created!.id,
          }).catch(() => {})
        ),
      );
      return created;
    });
  },


  async getPostById(postId: string, viewerId?: string) {
    await assertPostReadable(postId, viewerId);
    const post = await prisma.post.findUnique({
      where: { id: postId, AND: [await readablePostsWhere(viewerId)], deleted_at: null, ...NOT_DELETED_GROUP_FILTER },
      include: {
        ...POST_INCLUDE,
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    if (!post) return null;
    // A direct-link fetch must respect blocks the same way feeds/search do — otherwise
    // a blocked user could just open the post URL to bypass the block entirely.
    if (await isBlockedBy(post.author_id, viewerId)) {
      throw Object.assign(new Error('PROFILE_BLOCKED'), { statusCode: 403 });
    }
    // Пост закрытого профиля по прямой ссылке — так же, как в ленте
    await assertProfileVisible(post.author_id, viewerId);
    return maskGroupAuthor(post);
  },

  async getPosts(query: GetPostsQuery = {}, viewerId?: string) {
    const { search, category, tag, synonyms, sort = 'new', nsfwMode = 'hide', hasMedia = false, page, limit } = query;
    const { page: pageNum, limit: limitNum } = pagination(page, limit);

    const where: any = { deleted_at: null, is_archived: false, ...NOT_DELETED_GROUP_FILTER };
    Object.assign(where, nsfwWhere(nsfwMode));
    if (hasMedia) where.media_urls = { isEmpty: false };

    const blockerIds = await getBlockerIds(viewerId);
    if (blockerIds.length > 0) where.author_id = { notIn: blockerIds };

    if (search) {
      where.content = { contains: search, mode: 'insensitive' };
    }

    if (category) {
      where.category = category;
    }

    if (tag) {
      where.tags = {
        some: {
          tag: synonyms === 'true' ? { name: { in: await expandTag(tag) } } : { name: tag },
        },
      };
    }

    const posts = await prisma.post.findMany({
      where: { AND: [where, await readablePostsWhere(viewerId)] },
      orderBy: sort === 'hot' ? { rating: 'desc' } : { created_at: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return (await filterByProfilePrivacy(posts, viewerId)).map(maskGroupAuthor);
  },

  /**
   * Поиск постов: каждое слово запроса должно найтись в тексте, заголовке или теге (с учётом
   * синонимов, исправления раскладки и опечаток в тегах). Результаты ранжируются по релевантности
   * (совпадение в теге/заголовке > в тексте), затем по популярности и свежести; sort='new' — по дате.
   * Ранжируется окно из SEARCH_WINDOW самых свежих подходящих постов.
   */
  async searchPosts(
    query: string,
    nsfwMode: NsfwMode = 'hide',
    pageNum: number = 1,
    limitNum: number = 20,
    viewerId?: string,
    withSynonyms = true,
    sort: 'relevance' | 'new' = 'relevance',
  ) {
    const parsed = parseSearchQuery(query);
    if (!parsed.terms.length) return [];
    const page = Math.max(1, pageNum || 1);
    const limit = Math.min(50, Math.max(1, limitNum || 20));

    const tagScores = await Promise.all(parsed.terms.map((t) => resolveTagsForTerm(t, withSynonyms)));
    const blockerIds = await getBlockerIds(viewerId);

    const where: any = {
      AND: [
        { deleted_at: null, is_archived: false },
        NOT_DELETED_GROUP_FILTER,
        nsfwWhere(nsfwMode),
        ...(blockerIds.length > 0 ? [{ author_id: { notIn: blockerIds } }] : []),
        ...parsed.terms.map((t, i) => {
          const tagNames = [...tagScores[i].keys()];
          return {
            OR: [
              ...[t.text, ...t.variants].flatMap((w) => [
                { content: { contains: w, mode: 'insensitive' } },
                { title: { contains: w, mode: 'insensitive' } },
              ]),
              ...(tagNames.length ? [{ tags: { some: { tag: { name: { in: tagNames } } } } }] : []),
            ],
          };
        }),
      ],
    };

    const window = await prisma.post.findMany({
      where: { AND: [where, await readablePostsWhere(viewerId)] },
      orderBy: { created_at: 'desc' },
      take: SEARCH_WINDOW,
      select: {
        id: true,
        title: true,
        content: true,
        created_at: true,
        tags: { select: { tag: { select: { name: true } } } },
        _count: { select: { votes: true } },
      },
    });

    let ids: string[];
    if (sort === 'new') {
      ids = window.map((p) => p.id);
    } else {
      const now = Date.now();
      const scored = window.map((p) => {
        const names = p.tags.map((t) => t.tag.name);
        let score = 0;
        parsed.terms.forEach((t, i) => {
          let best = 0;
          for (const n of names) best = Math.max(best, tagScores[i].get(n) ?? 0);
          for (const w of [t.text, ...t.variants]) {
            best = Math.max(best, textScore(p.title, w) * 0.8, textScore(p.content, w) * 0.5);
          }
          score += best;
        });
        if (parsed.terms.length > 1) {
          if (textScore(p.title, parsed.phrase) > 0) score += 4;
          if (textScore(p.content, parsed.phrase) > 0) score += 2;
        }
        score += Math.log1p(Math.max(0, p._count.votes)) * 0.7;
        score += 3 * Math.exp(-(now - p.created_at.getTime()) / (30 * 24 * 3600 * 1000));
        return { id: p.id, score };
      });
      // sort стабилен: при равной оценке сохраняется порядок «свежие выше»
      scored.sort((a, b) => b.score - a.score);
      ids = scored.map((x) => x.id);
    }

    const pageIds = ids.slice((page - 1) * limit, page * limit);
    if (!pageIds.length) return [];
    const full = await prisma.post.findMany({
      where: { id: { in: pageIds } },
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    const order = new Map(pageIds.map((id, i) => [id, i]));
    full.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return (await filterByProfilePrivacy(full, viewerId)).map(maskGroupAuthor);
  },

  /** Подсказки тегов для поиска: подходящие теги (синонимы склеены в основной) с числом постов. */
  async searchTags(query: string, nsfwMode: NsfwMode = 'hide', limit = 8) {
    const parsed = parseSearchQuery(query);
    if (!parsed.terms.length) return [];
    // Подсказываем по последнему набираемому слову.
    const term = parsed.terms[parsed.terms.length - 1];
    const scores = await resolveTagsForTerm(term, true);
    if (!scores.size) return [];

    // Склеиваем варианты и синонимы в группы; показываем канонический тег (или лучший по оценке).
    const { groupName } = await synonymGroups();
    const groups = new Map<string, { names: string[]; score: number; best: string; bestScore: number }>();
    for (const [name, score] of scores) {
      const key = await groupKeyOf(name);
      const g = groups.get(key) ?? { names: [], score: 0, best: name, bestScore: 0 };
      g.names.push(name);
      g.score = Math.max(g.score, score);
      if (score > g.bestScore) { g.best = name; g.bestScore = score; }
      groups.set(key, g);
    }
    const top = [...groups.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, Math.min(20, limit * 2));

    const counted = await Promise.all(top.map(async ([key, g]) => {
      // В счёт идёт вся группа, а не только найденные по запросу теги (по «fo» не находится «лис»).
      const names = [...new Set([...g.names, ...(await expandTag(g.best))])];
      return {
        name: groupName.get(key) ?? g.best,
        score: g.score,
        count: await prisma.post.count({
          where: {
            deleted_at: null,
            is_archived: false,
            ...NOT_DELETED_GROUP_FILTER,
            ...nsfwWhere(nsfwMode),
            tags: { some: { tag: { name: { in: names } } } },
          },
        }),
      };
    }));
    return counted
      .filter((t) => t.count > 0)
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .slice(0, limit)
      .map(({ name, count }) => ({ name, count }));
  },

  async getPersonalizedPosts(userId: string, nsfwMode: NsfwMode = 'hide', pageNum: number = 1, limitNum: number = 30) {
    const postInclude = FEED_POST_INCLUDE;
    const { viewedPostIds, topCategories } = await recentTaste(userId);
    const nsfwFilter = nsfwWhere(nsfwMode);

    // Fetched once up front so the mute-keywords filter can be baked into every query's `where`.
    const [affinity, user, bellFollows, bellGroups, blockerIds, notInterested] = await Promise.all([
      getUserAffinityMap(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { interests: true, mute_keywords: true } }),
      prisma.follow.findMany({ where: { follower_id: userId, notify_posts: true }, select: { following_id: true } }),
      prisma.groupMember.findMany({ where: { user_id: userId, notify_posts: true }, select: { group_id: true } }),
      getBlockerIds(userId),
      prisma.postNotInterested.findMany({ where: { user_id: userId }, select: { post_id: true } }),
    ]);
    const muteFilter = muteKeywordsWhere(user?.mute_keywords ?? []);
    const blockFilter = blockerIds.length > 0 ? { author_id: { notIn: blockerIds } } : {};
    // "Не интересно" is a hard exclusion — unlike the shallow viewed-post skip below, it never resurfaces.
    const hiddenPostIds = [...viewedPostIds, ...notInterested.map((n) => n.post_id)];
    const excludeIds = hiddenPostIds.length > 0 ? { notIn: hiddenPostIds } : undefined;
    // Every feed query: live, unarchived, not hidden/seen, NSFW mode, muted words, blocks, live groups
    const feedWhere = { AND: [await readablePostsWhere(userId)], deleted_at: null, is_archived: false, id: excludeIds, ...nsfwFilter, ...muteFilter, ...blockFilter, ...NOT_DELETED_GROUP_FILTER };

    // Posts from authors/groups the user rang the "bell" for (Follow/GroupMember.notify_posts).
    // Computed on every page (not just page 1) because the algorithmic pool below excludes all
    // bell-eligible posts unconditionally — bell's job is "surface the latest N from these", not
    // "let the ranking pool also resurface the rest of them on later pages" (that duplicated posts
    // across pages when this was page-1-only).
    const bellAuthorIds = bellFollows.map((f) => f.following_id);
    const bellGroupIds = bellGroups.map((g) => g.group_id);
    const bellOr: any[] = [];
    if (bellAuthorIds.length > 0) bellOr.push({ author_id: { in: bellAuthorIds } });
    if (bellGroupIds.length > 0) bellOr.push({ groupPosts: { some: { group_id: { in: bellGroupIds } } } });
    const bellExcludeFilter = bellOr.length > 0 ? { NOT: { OR: bellOr } } : {};

    let bellPosts: any[] = [];
    if (pageNum === 1 && bellOr.length > 0) {
      bellPosts = await prisma.post.findMany({
        where: { ...feedWhere, OR: bellOr },
        orderBy: { created_at: 'desc' },
        take: BELL_FEED_LIMIT,
        include: postInclude,
      });
    }

    let personalizedPosts: any[] = [];
    let discoverPosts: any[] = [];

    const pLimit = Math.ceil(limitNum * 0.6);
    const dLimit = limitNum - pLimit;
    const pSkip = (pageNum - 1) * pLimit;
    const dSkip = (pageNum - 1) * dLimit;

    if (topCategories.length > 0) {
      // 60% from favourite categories
      personalizedPosts = await prisma.post.findMany({
        where: { ...feedWhere, ...bellExcludeFilter, category: { in: topCategories } },
        orderBy: [{ created_at: 'desc' }, { rating: 'desc' }],
        skip: pSkip,
        take: pLimit,
        include: postInclude,
      });

      // 40% from other categories (discovery)
      discoverPosts = await prisma.post.findMany({
        where: { ...feedWhere, ...bellExcludeFilter, OR: [{ category: { notIn: topCategories } }, { category: null }] },
        orderBy: [{ created_at: 'desc' }, { rating: 'desc' }],
        skip: dSkip,
        take: dLimit,
        include: postInclude,
      });
    } else {
      // No activity yet — show popular new content
      discoverPosts = await prisma.post.findMany({
        where: { ...feedWhere, ...bellExcludeFilter },
        orderBy: [{ created_at: 'desc' }, { rating: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: postInclude,
      });
    }

    // Candidates are pulled newest-first (a rating-ordered pull never let fresh, not-yet-voted posts
    // into the pool); rankByAffinity below only reorders within the fetched page.
    // Weigh the fetched pool by the user's behavioral tag/keyword affinity (like a scale — terms
    // they keep liking/reposting float up, terms they keep disliking sink) and their declared
    // Interests, before interleaving. Also pull the real "have I ever opened this" signal from
    // PostView (the shallow last-30-activity exclusion above only catches very recent repeats)
    // so genuinely undiscovered posts get bucketed ahead of ones the user has already seen.
    const interestTerms = interestsToTerms(user?.interests ?? []);
    const { seenIds, trendingMap } = await seenAndTrending(userId, [...personalizedPosts, ...discoverPosts].map((p) => p.id));
    personalizedPosts = rankByAffinity(personalizedPosts, affinity, interestTerms, seenIds, trendingMap);
    discoverPosts = rankByAffinity(discoverPosts, affinity, interestTerms, seenIds, trendingMap);

    // Interleave: 3 personalised → 2 discover
    const result = interleave(personalizedPosts, 3, discoverPosts, 2);

    // Diversify across the whole page, bell pins included — otherwise a bell pin and the very
    // next personalized pick could still land back to back for the same author/group.
    return diversifyByAuthor([...bellPosts, ...result]).map(maskGroupAuthor);
  },

  async toggleVote(userId: string, postId: string, value: 1 | -1) {
    await assertPostReadable(postId, userId);
    return prisma.$transaction(async (tx) => {
      // Блокируем пост: два параллельных голоса иначе оба откатили бы эффект на сродство тегов дважды
      await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${postId}::uuid FOR UPDATE`;
      const existingVote = await tx.vote.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { content: true, title: true, is_nsfw: true, tags: { include: { tag: true } } },
      });
      const termSource = post ? new Map(getPostTerms(post).map((t) => [t.term, t.source])) : new Map();
      const countFor = (v: 1 | -1) => (v === 1 ? { likes: 1, dislikes: 0 } : { likes: 0, dislikes: 1 });

      /** Undo the affinity effect a previously-active vote applied, using its stored snapshot. */
      async function reversePriorEffect() {
        if (!post || !existingVote?.term_deltas) return;
        const prevDeltas = new Map(Object.entries(existingVote.term_deltas as Record<string, number>));
        const reverseCount = countFor(existingVote.value as 1 | -1);
        await applyTermDeltas(tx, userId, negateDeltas(prevDeltas), termSource, { likes: -reverseCount.likes, dislikes: -reverseCount.dislikes });
      }

      /** Distribute+apply a fresh vote effect for `value`, returning the snapshot to store on the Vote row. */
      async function applyFreshEffect(): Promise<Record<string, number> | undefined> {
        if (!post) return undefined;
        const affinity = await getUserAffinityMap(userId);
        const deltas = distributeVoteDelta(getPostTerms(post), value, affinity);
        await applyTermDeltas(tx, userId, deltas, termSource, countFor(value));
        return Object.fromEntries(deltas);
      }

      if (existingVote && existingVote.deleted_at === null) {
        if (existingVote.value === value) {
          // Same vote → retract it (soft delete), reversing its affinity effect
          await reversePriorEffect();
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { deleted_at: new Date() },
          });
        } else {
          // Opposite vote → flip it: reverse the old effect, apply a fresh one for the new direction
          await reversePriorEffect();
          const term_deltas = await applyFreshEffect();
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { value, term_deltas },
          });
        }
      } else if (existingVote && existingVote.deleted_at !== null) {
        // Previously retracted → restore with the new value
        const term_deltas = await applyFreshEffect();
        await tx.vote.update({
          where: { user_id_post_id: { user_id: userId, post_id: postId } },
          data: { value, deleted_at: null, term_deltas },
        });
      } else {
        // First-time vote
        const term_deltas = await applyFreshEffect();
        await tx.vote.create({
          data: { user_id: userId, post_id: postId, value, term_deltas },
        });
      }

      // Recalculate rating using aggregate sum — much faster than fetching all rows
      const agg = await tx.vote.aggregate({
        where: { post_id: postId, deleted_at: null },
        _sum: { value: true },
      });
      const newRating = agg._sum.value ?? 0;

      const updated = await tx.post.update({
        where: { id: postId },
        data: { rating: newRating },
        include: {
          author: { select: { id: true, username: true } },
        },
      });

      // The previous vote was an active upvote that is now being retracted or flipped → remove its notification
      const hadActiveUpvote = existingVote && existingVote.deleted_at === null && existingVote.value === 1;
      if (hadActiveUpvote && updated.author_id !== userId) {
        notificationService.deleteForAction({
          receiverId: updated.author_id,
          senderId: userId,
          type: 'LIKE',
          postId,
        }).catch(() => {});
      }

      // Fire LIKE notification when a net new upvote is cast (not a retraction). Guarded against
      // an already-active LIKE notification for this (sender, receiver, post) triple so a stray
      // duplicate request (double click, retry) can't spawn two notifications for one like.
      const isNewUpvote = value === 1 && updated.author_id !== userId;
      if (isNewUpvote) {
        const isRetraction = existingVote && existingVote.deleted_at === null && existingVote.value === value;
        if (!isRetraction) {
          const alreadyNotified = await tx.notification.findFirst({
            where: { receiver_id: updated.author_id, sender_id: userId, type: 'LIKE', post_id: postId, deleted_at: null },
            select: { id: true },
          });
          if (!alreadyNotified) {
            notificationService.create({
              receiverId: updated.author_id,
              senderId: userId,
              type: 'LIKE',
              postId,
            }).catch(() => {});
          }
        }
      }

      return updated;
    });
  },

  /**
   * Explicit "не интересно" — unlike a passive scroll-past, this is a deliberate signal: it
   * permanently hides the post from this user's personalized feed (see the PostNotInterested
   * exclusion in getPersonalizedPosts) and applies a stronger negative affinity delta than a
   * view, comparable to an actual dislike. Symmetric undo mirrors toggleVote's reverse path.
   */
  async setNotInterested(userId: string, postId: string, notInterested: boolean) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.postNotInterested.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });

      if (notInterested) {
        if (existing) return { notInterested: true };
        const post = await tx.post.findUnique({
          where: { id: postId },
          select: { content: true, title: true, is_nsfw: true, tags: { include: { tag: true } } },
        });
        if (!post) throw new Error('Post not found');
        const terms = getPostTerms(post);
        const termSource = new Map(terms.map((t) => [t.term, t.source]));
        const affinity = await getUserAffinityMap(userId);
        const deltas = distributeVoteDelta(terms, -1, affinity, NOT_INTERESTED_MULTIPLIER);
        await applyTermDeltas(tx, userId, deltas, termSource, { likes: 0, dislikes: 0 });
        try {
          await tx.postNotInterested.create({
            data: { user_id: userId, post_id: postId, term_deltas: Object.fromEntries(deltas) },
          });
        } catch (err) {
          // Lost a race to a concurrent identical request (unique violation) — undo the
          // redundant delta we just applied instead of double-counting it.
          if (errCode(err) === 'P2002') {
            await applyTermDeltas(tx, userId, negateDeltas(deltas), termSource, { likes: 0, dislikes: 0 });
            return { notInterested: true };
          }
          throw err;
        }
        return { notInterested: true };
      }

      if (!existing) return { notInterested: false };
      try {
        await tx.postNotInterested.delete({ where: { user_id_post_id: { user_id: userId, post_id: postId } } });
      } catch (err) {
        // Already undone by a concurrent request — its reversal already ran, don't double-reverse.
        if (errCode(err) === 'P2025') return { notInterested: false };
        throw err;
      }
      if (existing.term_deltas) {
        const post = await tx.post.findUnique({
          where: { id: postId },
          select: { content: true, title: true, is_nsfw: true, tags: { include: { tag: true } } },
        });
        const termSource = post ? new Map(getPostTerms(post).map((t) => [t.term, t.source])) : new Map();
        const prevDeltas = new Map(Object.entries(existing.term_deltas as Record<string, number>));
        await applyTermDeltas(tx, userId, negateDeltas(prevDeltas), termSource, { likes: 0, dislikes: 0 });
      }
      return { notInterested: false };
    });
  },

  async toggleRepaw(userId: string, postId: string) {
    await assertPostReadable(postId, userId);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.repaw.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { author_id: true, content: true, title: true, is_nsfw: true, tags: { include: { tag: true } } },
      });

      if (existing) {
        // Reverse the repost's affinity boost — a repost is a strong "I like this" signal, so
        // un-reposting should un-teach the algorithm just as retracting a like does.
        if (post && existing.term_deltas) {
          const prevDeltas = new Map(Object.entries(existing.term_deltas as Record<string, number>));
          const termSource = new Map(getPostTerms(post).map((t) => [t.term, t.source]));
          await applyTermDeltas(tx, userId, negateDeltas(prevDeltas), termSource, { likes: -1, dislikes: 0 });
        }
        await tx.repaw.delete({ where: { user_id_post_id: { user_id: userId, post_id: postId } } });
        const count = await tx.repaw.count({ where: { post_id: postId } });
        if (post && post.author_id !== userId) {
          notificationService.deleteForAction({
            receiverId: post.author_id,
            senderId: userId,
            type: 'REPAW',
            postId,
          }).catch(() => {});
        }
        return { repawed: false, repaw_count: count };
      } else {
        let term_deltas: Record<string, number> | undefined;
        if (post) {
          const termSource = new Map(getPostTerms(post).map((t) => [t.term, t.source]));
          const affinity = await getUserAffinityMap(userId);
          const deltas = distributeVoteDelta(getPostTerms(post), 1, affinity, REPAW_MULTIPLIER);
          await applyTermDeltas(tx, userId, deltas, termSource, { likes: 1, dislikes: 0 });
          term_deltas = Object.fromEntries(deltas);
        }
        await tx.repaw.create({ data: { user_id: userId, post_id: postId, term_deltas } });
        const count = await tx.repaw.count({ where: { post_id: postId } });
        if (post && post.author_id !== userId) {
          notificationService.create({
            receiverId: post.author_id,
            senderId: userId,
            type: 'REPAW',
            postId,
          }).catch(() => {});
        }
        return { repawed: true, repaw_count: count };
      }
    });
  },

  async toggleFavourite(userId: string, postId: string) {
    await assertPostReadable(postId, userId);
    const existing = await prisma.favourite.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
    });

    if (existing) {
      await prisma.favourite.delete({ where: { user_id_post_id: { user_id: userId, post_id: postId } } });
      return { favourited: false };
    } else {
      await prisma.favourite.create({ data: { user_id: userId, post_id: postId } });
      return { favourited: true };
    }
  },

  async getUserPosts(userId: string, take = 50, viewerId?: string) {
    await assertProfileVisible(userId, viewerId);
    const posts = await prisma.post.findMany({
      where: { author_id: userId, AND: [await readablePostsWhere(viewerId)], deleted_at: null, is_archived: false, groupPosts: { none: {} } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return posts.map(maskGroupAuthor);
  },

  async getUserMediaPosts(userId: string, take = 50, viewerId?: string) {
    await assertProfileVisible(userId, viewerId);
    const posts = await prisma.post.findMany({
      where: { author_id: userId, AND: [await readablePostsWhere(viewerId)], deleted_at: null, is_archived: false, media_urls: { isEmpty: false }, groupPosts: { none: {} } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return posts.map(maskGroupAuthor);
  },

  async getUserRepawedPosts(userId: string, take = 50, viewerId?: string) {
    await assertProfileVisible(userId, viewerId);
    const repaws = await prisma.repaw.findMany({
      where: { user_id: userId, post: { AND: [await readablePostsWhere(viewerId)], deleted_at: null, is_archived: false, groupPosts: { none: {} } } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        post: {
          include: {
            author: { select: AUTHOR_SELECT },
            rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            tags: { include: { tag: true } },
            _count: { select: { votes: true, repaws: true } },
            groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
          },
        },
      },
    });
    return repaws.map((r) => maskGroupAuthor({ ...r.post, repawed_at: r.created_at }));
  },

  async getUserFavouritePosts(userId: string, take = 50, viewerId?: string) {
    await assertProfileVisible(userId, viewerId);
    const favs = await prisma.favourite.findMany({
      where: { user_id: userId, post: { AND: [await readablePostsWhere(viewerId)], deleted_at: null, is_archived: false, groupPosts: { none: {} } } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        post: {
          include: {
            author: { select: AUTHOR_SELECT },
            rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            tags: { include: { tag: true } },
            _count: { select: { votes: true, repaws: true } },
            groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
          },
        },
      },
    });
    return favs.map((f) => maskGroupAuthor({ ...f.post, favourited_at: f.created_at }));
  },

  async getMyBookmarks(
    userId: string,
    opts: { skip?: number; take?: number; sort?: 'newest' | 'oldest' | 'top'; hasMedia?: boolean; labelId?: string | null },
  ) {
    const { skip = 0, take = 20, sort = 'newest', hasMedia, labelId } = opts;

    const postFilter: any = { deleted_at: null, AND: [await readablePostsWhere(userId)] };
    if (hasMedia) postFilter.media_urls = { isEmpty: false };

    const where: any = { user_id: userId, post: postFilter };
    if (labelId !== undefined) where.label_id = labelId ?? null;

    const orderBy: any =
      sort === 'oldest' ? { created_at: 'asc' }
      : sort === 'top'  ? { post: { rating: 'desc' } }
      : { created_at: 'desc' };

    const POST_INCLUDE_FULL = {
      author: { select: AUTHOR_SELECT },
      rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      tags: { include: { tag: true } },
      _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
      groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
    };

    const [favs, total] = await Promise.all([
      prisma.favourite.findMany({ where, orderBy, skip, take, include: { post: { include: POST_INCLUDE_FULL } } }),
      prisma.favourite.count({ where }),
    ]);

    return {
      posts: favs.map((f) => maskGroupAuthor({ ...f.post, favourited_at: f.created_at, label_id: f.label_id })),
      total,
      hasMore: skip + take < total,
    };
  },

  async getPostStatus(userId: string, postIds: string[]) {
    const [repaws, favourites, votes] = await Promise.all([
      prisma.repaw.findMany({ where: { user_id: userId, post_id: { in: postIds } }, select: { post_id: true } }),
      prisma.favourite.findMany({ where: { user_id: userId, post_id: { in: postIds } }, select: { post_id: true } }),
      prisma.vote.findMany({ where: { user_id: userId, post_id: { in: postIds }, deleted_at: null }, select: { post_id: true, value: true } }),
    ]);
    const repawedSet = new Set(repaws.map((r) => r.post_id));
    const favouritedSet = new Set(favourites.map((f) => f.post_id));
    const voteMap = new Map(votes.map((v) => [v.post_id, v.value]));
    return postIds.map((id) => ({
      id,
      repawed: repawedSet.has(id),
      favourited: favouritedSet.has(id),
      userVote: (voteMap.get(id) ?? 0) as 1 | -1 | 0,
    }));
  },

  async createComment(userId: string, postId: string, content: string, parentId?: string, type?: string, file_url?: string, groupId?: string) {
    await assertPostReadable(postId, userId);
    if (!content?.trim() && !file_url) {
      throw Object.assign(new Error('Content is required'), { statusCode: 400 });
    }
    if (file_url && !isTrustedMediaUrl(file_url)) {
      throw Object.assign(new Error('INVALID_MEDIA_URL'), { statusCode: 422 });
    }
    await assertOwnedMedia(file_url, userId);
    if (groupId && !(await groupService.isAtLeastModerator(groupId, userId))) {
      throw Object.assign(new Error('Not authorized to comment as this group'), { statusCode: 403 });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { author_id: true, comments_disabled: true, author: { select: { comments_privacy: true } } },
    });
    if (!post) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    if (post.comments_disabled && post.author_id !== userId) {
      throw Object.assign(new Error('COMMENTS_DISABLED'), { statusCode: 403 });
    }
    if (post.author_id !== userId && (await isBlockedBy(post.author_id, userId))) {
      throw Object.assign(new Error('COMMENTS_DISABLED'), { statusCode: 403 });
    }
    if (!(await isAllowedByPrivacy(post.author.comments_privacy, post.author_id, userId))) {
      throw Object.assign(new Error('COMMENTS_DISABLED'), { statusCode: 403 });
    }

    if (parentId) {
      const parent = await prisma.comment.findFirst({ where: { id: parentId, post_id: postId, deleted_at: null }, select: { id: true } });
      if (!parent) throw Object.assign(new Error('Reply must reference a live comment on this post'), { statusCode: 400 });
    }
    const comment = await prisma.comment.create({
      data: {
        post_id: postId,
        author_id: userId,
        group_id: groupId ?? null,
        content: content || '',
        parent_id: parentId ?? null,
        type: type ?? 'text',
        file_url: file_url ?? null,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        group: { select: { id: true, slug: true, name: true, avatar_url: true } },
        _count: { select: { replies: true, votes: true } },
      },
    });

    // Notify post author (not for self-comments)
    if (post.author_id !== userId) {
      notificationService.create({
        receiverId: post.author_id,
        senderId: userId,
        senderGroupId: groupId ?? undefined,
        type: 'COMMENT',
        postId,
        commentId: comment.id,
      }).catch(() => {});
    }

    // Notify @mentioned users in parallel (skipped if the mentioned user restricts who can mention them)
    const mentions = content.match(/@\w+(?:-\w+)*/g);
    if (mentions) {
      const uniqueUsernames = [...new Set(mentions.map((m) => m.slice(1)))];
      await Promise.all(
        uniqueUsernames.map(async (username) => {
          const mentioned = await prisma.user.findFirst({ where: { username, deleted_at: null }, select: { id: true, mentions_privacy: true } });
          if (mentioned && mentioned.id !== userId && (await isAllowedByPrivacy(mentioned.mentions_privacy, mentioned.id, userId))) {
            notificationService.create({
              receiverId: mentioned.id,
              senderId: userId,
              senderGroupId: groupId ?? undefined,
              type: 'MENTION',
              postId,
              commentId: comment.id,
            }).catch(() => {});
          }
        }),
      );
    }

    return maskGroupCommentAuthor(comment);
  },

  async getComments(postId: string, viewerId?: string) {
    await assertPostReadable(postId, viewerId);
    let muteFilter = {};
    let filterSpam = false;
    if (viewerId) {
      const prefs = await prisma.user.findUnique({ where: { id: viewerId }, select: { mute_keywords: true, filter_spam: true } });
      muteFilter = muteKeywordsWhere(prefs?.mute_keywords ?? []);
      filterSpam = prefs?.filter_spam ?? false;
    }
    // Comments from either side of a block relationship must stay hidden, same as posts/stories.
    const blockerIds = await getBlockerIds(viewerId);
    const blockFilter = blockerIds.length > 0 ? { author_id: { notIn: blockerIds } } : {};

    const topLevel = await prisma.comment.findMany({
      where: { post_id: postId, parent_id: null, deleted_at: null, ...muteFilter, ...blockFilter },
      orderBy: { created_at: 'asc' },
      include: {
        author: { select: AUTHOR_SELECT },
        group: { select: { id: true, slug: true, name: true, avatar_url: true } },
        _count: { select: { replies: true } },
        replies: {
          where: { deleted_at: null, ...muteFilter, ...blockFilter },
          orderBy: { created_at: 'asc' },
          include: {
            author: { select: AUTHOR_SELECT },
            group: { select: { id: true, slug: true, name: true, avatar_url: true } },
            _count: { select: { replies: true } },
          },
        },
      },
    });
    const filtered = filterSpam
      ? topLevel
          .filter((c) => analyzeContent(c.content).category !== 'spam')
          .map((c) => ({ ...c, replies: c.replies.filter((r) => analyzeContent(r.content).category !== 'spam') }))
      : topLevel;
    return filtered.map((c) => ({
      ...maskGroupCommentAuthor(c),
      replies: c.replies.map(maskGroupCommentAuthor),
    }));
  },

  async voteComment(userId: string, commentId: string, value: 1 | -1) {
    const comment = await prisma.comment.findFirst({ where: { id: commentId, deleted_at: null }, select: { post_id: true } });
    if (!comment) throw Object.assign(new Error('Comment not found'), { statusCode: 404 });
    await assertPostReadable(comment.post_id, userId);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.commentVote.findUnique({
        where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
      });

      if (existing && existing.deleted_at === null) {
        if (existing.value === value) {
          await tx.commentVote.update({
            where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
            data: { deleted_at: new Date() },
          });
        } else {
          await tx.commentVote.update({
            where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
            data: { value },
          });
        }
      } else if (existing && existing.deleted_at !== null) {
        await tx.commentVote.update({
          where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
          data: { value, deleted_at: null },
        });
      } else {
        await tx.commentVote.create({ data: { user_id: userId, comment_id: commentId, value } });
      }

      const activeVotes = await tx.commentVote.findMany({ where: { comment_id: commentId, deleted_at: null } });
      const newRating = activeVotes.reduce((acc, v) => acc + v.value, 0);
      return tx.comment.update({ where: { id: commentId }, data: { rating: newRating } });
    });
  },

  async deletePost(userId: string, postId: string, isAdmin: boolean) {
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null } });
    if (!post) throw new Error('Post not found');
    if (!isAdmin && post.author_id !== userId && !(await canModerateAsGroupStaff(postId, userId))) {
      throw new Error('Not authorized');
    }
    const updated = await prisma.post.update({ where: { id: postId }, data: { deleted_at: new Date() } });
    // Posts have no restore path, so the underlying files can be purged immediately
    // instead of leaking in S3 until the 30-day hard-delete cron finally drops the row.
    Promise.all([...post.media_urls, ...post.media_original_urls].map((url) => deleteFileByUrl(url, post.author_id)))
      .catch(logError('[deletePost] media cleanup failed'));
    return updated;
  },

  async editPost(userId: string, postId: string, input: EditPostInput) {
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null } });
    if (!post) throw new Error('Post not found');
    if (post.author_id !== userId) throw new Error('Not authorized');
    if (Date.now() - post.created_at.getTime() > POST_EDIT_WINDOW_MS) {
      throw new Error('Edit window expired');
    }

    const content = input.content !== undefined ? input.content.trim() : post.content;
    const addMedia = (input.addMediaUrls ?? []).filter(Boolean);
    const addOriginals = input.addMediaOriginalUrls?.length === addMedia.length ? input.addMediaOriginalUrls : [];
    const mediaUrls = [...post.media_urls, ...addMedia];
    if (!content && mediaUrls.length === 0) throw new Error('Content is required');
    if (mediaUrls.length > MAX_MEDIA_PER_POST) {
      throw Object.assign(new Error('TOO_MANY_MEDIA_FILES'), { statusCode: 422 });
    }
    if ([...addMedia, ...addOriginals].some((url) => !isTrustedMediaUrl(url))) {
      throw Object.assign(new Error('INVALID_MEDIA_URL'), { statusCode: 422 });
    }
    for (const url of [...addMedia, ...addOriginals]) await assertOwnedMedia(url, userId);

    // media_original_urls is index-aligned with media_urls: when the post already has originals, every new
    // file needs one too (the file itself if the client sent no separate original).
    const mediaOriginalUrls = post.media_original_urls.length > 0 && post.media_original_urls.length === post.media_urls.length
      ? [...post.media_original_urls, ...(addOriginals.length > 0 ? addOriginals : addMedia)]
      : addOriginals.length > 0 && post.media_urls.length === 0
        ? addOriginals
        : post.media_original_urls;

    const tags = input.tags
      ? Array.from(new Set(input.tags.map(normalizeTag).filter(Boolean)))
      : null;

    return prisma.$transaction(async (tx) => {
      if (tags) {
        const tagRecords = await Promise.all(
          tags.map((name) => tx.tag.upsert({ where: { name }, update: {}, create: { name } })),
        );
        await tx.postTag.deleteMany({ where: { post_id: postId } });
        if (tagRecords.length > 0) {
          await tx.postTag.createMany({ data: tagRecords.map((tag) => ({ post_id: postId, tag_id: tag.id })) });
        }
      }
      return tx.post.update({
        where: { id: postId },
        data: {
          content,
          ...(input.isNsfw !== undefined && { is_nsfw: input.isNsfw }),
          ...(input.isAiGenerated !== undefined && { is_ai_generated: input.isAiGenerated }),
          ...(addMedia.length > 0 && { media_urls: mediaUrls, media_original_urls: mediaOriginalUrls }),
        },
        include: {
          author: { select: AUTHOR_SELECT },
          rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          tags: { include: { tag: true } },
          _count: { select: { votes: true, repaws: true } },
        },
      });
    });
  },

  async deleteComment(userId: string, commentId: string, isAdmin = false) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId, deleted_at: null } });
    if (!comment) throw new Error('Comment not found');
    if (comment.author_id !== userId && !(await canManageAllComments(comment.post_id, userId, isAdmin))) {
      throw new Error('Not authorized');
    }
    const updated = await prisma.comment.update({ where: { id: commentId }, data: { deleted_at: new Date() } });
    if (comment.file_url) {
      deleteFileByUrl(comment.file_url, comment.author_id).catch(logError('[deleteComment] media cleanup failed'));
    }
    return updated;
  },

  /** Whether `userId` may delete any comment on this post (shown to the frontend so it can render a delete button on comments that aren't their own). */
  async canManageComments(postId: string, userId: string | undefined, isAdmin: boolean): Promise<boolean> {
    if (!userId) return false;
    return canManageAllComments(postId, userId, isAdmin);
  },

  /**
   * Counts at most one view per (post, viewer) — anonymous requests are ignored, since
   * there's no stable identity to dedupe them against. Relies on the PostView unique
   * constraint to no-op on repeat calls instead of racing a read-then-write check.
   */
  async recordView(postId: string, viewerId?: string): Promise<{ counted: boolean }> {
    if (!viewerId) return { counted: false };
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null }, select: { author_id: true } });
    if (!post) return { counted: false };
    if (viewerId === post.author_id) return { counted: false }; // не считаем просмотры автора
    try {
      await prisma.$transaction([
        prisma.postView.create({ data: { post_id: postId, user_id: viewerId } }),
        prisma.post.update({ where: { id: postId }, data: { views_count: { increment: 1 } } }),
      ]);
      return { counted: true };
    } catch (err) {
      if (errCode(err) !== 'P2002') throw err; // already viewed by this user — not an error
      return { counted: false };
    }
  },

  async toggleArchive(userId: string, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, deleted_at: null },
      select: { author_id: true, is_archived: true, groupPosts: { select: { group_id: true }, take: 1 } },
    });
    if (!post) throw new Error('Post not found');
    // Пост группы может архивировать и модерация группы, а не только автор
    const groupId = post.groupPosts[0]?.group_id;
    const allowed = post.author_id === userId || (!!groupId && await groupService.isAtLeastModerator(groupId, userId));
    if (!allowed) throw new Error('Not authorized');
    const updated = await prisma.post.update({ where: { id: postId }, data: { is_archived: !post.is_archived } });
    return { archived: updated.is_archived };
  },

  async toggleCommentsDisabled(userId: string, postId: string) {
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null }, select: { author_id: true, comments_disabled: true } });
    if (!post) throw new Error('Post not found');
    if (post.author_id !== userId) throw new Error('Not authorized');
    const updated = await prisma.post.update({ where: { id: postId }, data: { comments_disabled: !post.comments_disabled } });
    return { commentsDisabled: updated.comments_disabled };
  },

  async getUserArchivedPosts(userId: string, viewerId: string, take = 50) {
    if (viewerId !== userId) throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
    const posts = await prisma.post.findMany({
      where: { author_id: userId, deleted_at: null, is_archived: true, groupPosts: { none: {} } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: { where: { deleted_at: null } } } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return posts.map(maskGroupAuthor);
  },

  async getPostStats(userId: string, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, deleted_at: null },
      select: {
        author_id: true,
        created_at: true,
        views_count: true,
        rating: true,
        author: { select: { subscription_tier: true } },
      },
    });
    if (!post) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    if (post.author_id !== userId) throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
    const isPro = post.author.subscription_tier === 'pro' || post.author.subscription_tier === 'business';
    if (!isPro) throw Object.assign(new Error('PRO_REQUIRED'), { statusCode: 402 });

    const [upvotes, downvotes, comments, repaws, favourites] = await Promise.all([
      prisma.vote.count({ where: { post_id: postId, value: 1, deleted_at: null } }),
      prisma.vote.count({ where: { post_id: postId, value: -1, deleted_at: null } }),
      prisma.comment.count({ where: { post_id: postId, deleted_at: null } }),
      prisma.repaw.count({ where: { post_id: postId } }),
      prisma.favourite.count({ where: { post_id: postId } }),
    ]);

    return {
      viewsCount: post.views_count,
      rating: post.rating,
      upvotes,
      downvotes,
      comments,
      repaws,
      favourites,
      createdAt: post.created_at,
    };
  },

  /**
   * Per-tag like/dislike breakdown for the settings "Interests" tag cloud — locked until the
   * user has cast enough votes, likes or dislikes alike (see TAG_INSIGHTS_UNLOCK_THRESHOLD),
   * to make it meaningful.
   */
  async getUserTagInsights(userId: string) {
    const votesGiven = await prisma.vote.count({ where: { user_id: userId, deleted_at: null } });
    const unlocked = votesGiven >= TAG_INSIGHTS_UNLOCK_THRESHOLD;

    // Only explicit hashtags are surfaced here (not content-derived keywords) — this cloud is a
    // curated "what you're into" view, while keywords quietly help ranking behind the scenes.
    const tags = unlocked
      ? (await prisma.userTagAffinity.findMany({
          where: { user_id: userId, source: 'tag' },
          orderBy: { score: 'desc' },
          take: 40,
        }))
          .map((t) => ({ name: t.term, likes: t.likes, dislikes: t.dislikes, score: t.score }))
          .sort((a, b) => b.score - a.score || (b.likes + b.dislikes) - (a.likes + a.dislikes))
      : [];

    return { unlocked, votesGiven, threshold: TAG_INSIGHTS_UNLOCK_THRESHOLD, tags };
  },

  /** Tag-name autocomplete for the post composer, ranked by how many posts use each tag. */
  async suggestTags(prefix: string, limit: number = 8) {
    const q = prefix.trim().replace(/^#/, '');
    if (!q) return [];
    const take = Math.min(20, Math.max(1, limit));

    type RawRow = { name: string; count: bigint };
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT t.name, COUNT(DISTINCT p.id)::bigint AS count
      FROM "Tag" t
      LEFT JOIN "PostTag" pt ON pt.tag_id = t.id
      LEFT JOIN "Post" p ON p.id = pt.post_id AND p.deleted_at IS NULL
      WHERE t.name ILIKE ${q + '%'}
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name ASC
      LIMIT ${take}
    `;

    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  },

  async getTrendingTags(includeNsfw: boolean = false) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    type RawRow = {
      grp: string;
      name: string;
      total_count: bigint;
      month_count: bigint;
      prev_month_count: bigint;
      nsfw_pct: number;
    };

    // Synonyms are counted as one tag: variants differing only in "_"/"-" always, plus the
    // admin-defined alias → canonical pairs. A post carrying several synonyms counts once.
    const { keyToGroup, groupName } = await synonymGroups();

    const rows = await prisma.$queryRaw<RawRow[]>`
      WITH tagged AS (
        SELECT
          t.name,
          pt.post_id,
          p.created_at,
          p.is_nsfw,
          COALESCE(
            ${JSON.stringify(keyToGroup)}::jsonb ->> regexp_replace(t.name, '[_-]', '', 'g'),
            regexp_replace(t.name, '[_-]', '', 'g')
          ) AS grp
        FROM "Tag" t
        JOIN "PostTag" pt ON pt.tag_id = t.id
        JOIN "Post"    p  ON p.id = pt.post_id
                          AND p.deleted_at IS NULL
                          AND p.is_archived = false
                          AND cardinality(p.media_urls) > 0
                          AND NOT EXISTS (
                            SELECT 1 FROM "GroupPost" gp
                            JOIN "Group" g ON g.id = gp.group_id
                            WHERE gp.post_id = p.id AND g.deleted_at IS NOT NULL
                          )
      )
      SELECT
        grp,
        mode() WITHIN GROUP (ORDER BY name)                                                      AS name,
        COUNT(DISTINCT post_id)::bigint                                                          AS total_count,
        COUNT(DISTINCT CASE WHEN created_at >= ${thirtyDaysAgo} THEN post_id END)::bigint        AS month_count,
        COUNT(DISTINCT CASE WHEN created_at >= ${sixtyDaysAgo}
                             AND created_at  <  ${thirtyDaysAgo} THEN post_id END)::bigint       AS prev_month_count,
        COALESCE(
          ROUND(
            100.0 * COUNT(DISTINCT CASE WHEN is_nsfw = true THEN post_id END)::numeric
                  / NULLIF(COUNT(DISTINCT post_id)::numeric, 0)
          ), 0
        )::int                                                                                   AS nsfw_pct
      FROM tagged
      GROUP BY grp
      ORDER BY month_count DESC, total_count DESC
      LIMIT 30
    `;

    return rows
      .filter((row) => includeNsfw || row.nsfw_pct < 50)
      .slice(0, 15)
      .map((row) => {
        const month = Number(row.month_count);
        const prev  = Number(row.prev_month_count);
        let trend: 'up' | 'down' | 'stable';
        if (prev === 0) {
          trend = month > 0 ? 'up' : 'stable';
        } else if (month > prev * 1.1) {
          trend = 'up';
        } else if (month < prev * 0.9) {
          trend = 'down';
        } else {
          trend = 'stable';
        }
        return {
          name:           groupName.get(row.grp) ?? row.name,
          totalCount:     Number(row.total_count),
          monthCount:     month,
          prevMonthCount: prev,
          isNsfw:         row.nsfw_pct >= 50,
          trend,
        };
      });
  },
};
