/**
 * One-off backfill: replays every user's existing (non-deleted) votes and reposts through the
 * same term-extraction + "scale" blame logic used live (see posts/service.ts) to populate
 * UserTagAffinity for accounts that voted/reposted before that table existed.
 *
 * Safe to re-run: each user's rows are fully recomputed from source Vote/Repaw history, not
 * incremented, so running this twice does not double-count anything.
 *
 * Usage: npm run db:backfill-tag-affinity
 */
import prisma from '../config/prisma.js';
import {
  getPostTerms,
  distributeVoteDelta,
  REPAW_MULTIPLIER,
  type AffinityMap,
  type PostLike,
} from '../modules/posts/service.js';

type ReplayEvent = {
  at: Date;
  kind: 'vote' | 'repaw';
  id: string;
  direction: 1 | -1;
  multiplier: number;
  post: PostLike;
};

async function backfillUser(userId: string): Promise<{ terms: number; events: number }> {
  const [votes, repaws] = await Promise.all([
    prisma.vote.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'asc' },
      include: { post: { select: { content: true, title: true, is_nsfw: true, deleted_at: true, tags: { include: { tag: true } } } } },
    }),
    prisma.repaw.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      include: { post: { select: { content: true, title: true, is_nsfw: true, deleted_at: true, tags: { include: { tag: true } } } } },
    }),
  ]);

  const events: ReplayEvent[] = [
    ...votes.filter((v) => v.post && !v.post.deleted_at).map((v) => ({
      at: v.created_at, kind: 'vote' as const, id: v.id, direction: v.value as 1 | -1, multiplier: 1, post: v.post!,
    })),
    ...repaws.filter((r) => r.post && !r.post.deleted_at).map((r) => ({
      at: r.created_at, kind: 'repaw' as const, id: r.id, direction: 1 as const, multiplier: REPAW_MULTIPLIER, post: r.post!,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  if (events.length === 0) return { terms: 0, events: 0 };

  const affinity: AffinityMap = new Map();
  const termSourceGlobal = new Map<string, 'tag' | 'keyword'>();
  const voteSnapshots = new Map<string, Record<string, number>>();
  const repawSnapshots = new Map<string, Record<string, number>>();

  for (const ev of events) {
    const terms = getPostTerms(ev.post);
    for (const t of terms) termSourceGlobal.set(t.term, t.source);
    const deltas = distributeVoteDelta(terms, ev.direction, affinity, ev.multiplier);

    for (const [term, delta] of deltas) {
      const entry = affinity.get(term) ?? { score: 0, likes: 0, dislikes: 0 };
      entry.score += delta;
      if (ev.direction === 1) entry.likes += 1; else entry.dislikes += 1;
      affinity.set(term, entry);
    }

    const record = Object.fromEntries(deltas);
    if (ev.kind === 'vote') voteSnapshots.set(ev.id, record);
    else repawSnapshots.set(ev.id, record);
  }

  await prisma.$transaction([
    ...Array.from(affinity.entries()).map(([term, a]) =>
      prisma.userTagAffinity.upsert({
        where: { user_id_term: { user_id: userId, term } },
        create: { user_id: userId, term, source: termSourceGlobal.get(term) ?? 'tag', score: a.score, likes: a.likes, dislikes: a.dislikes },
        update: { score: a.score, likes: a.likes, dislikes: a.dislikes },
      }),
    ),
    ...Array.from(voteSnapshots.entries()).map(([id, term_deltas]) =>
      prisma.vote.update({ where: { id }, data: { term_deltas } }),
    ),
    ...Array.from(repawSnapshots.entries()).map(([id, term_deltas]) =>
      prisma.repaw.update({ where: { id }, data: { term_deltas } }),
    ),
  ]);

  return { terms: affinity.size, events: events.length };
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  console.log(`Backfilling tag affinity for up to ${users.length} users...`);

  let touched = 0;
  for (const user of users) {
    const { terms, events } = await backfillUser(user.id);
    if (events > 0) {
      touched++;
      console.log(`  @${user.username}: ${terms} terms from ${events} votes/reposts`);
    }
  }

  console.log(`Done. ${touched}/${users.length} users had voting/repost history to backfill.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
