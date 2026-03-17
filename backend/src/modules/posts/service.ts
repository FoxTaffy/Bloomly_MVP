import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';
import type { CreatePostInput, GetPostsQuery } from './types.js';

/** Reusable author select for posts — includes verification fields */
const AUTHOR_SELECT = { id: true, username: true, display_name: true, avatar_url: true, is_verified: true, verification_type: true } as const;

/** Reusable include for post queries */
const POST_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
  tags: { include: { tag: true } },
  _count: { select: { votes: true, repaws: true, comments: true } },
} as const;

/**
 * Group posts are anonymous: author is hidden from the public.
 * If the post belongs to a group (has groupPosts), null out `author`.
 * Exception: author's own "my posts" endpoint does NOT call this.
 */
function maskGroupAuthor(post: any): any {
  if (!post) return post;
  if (post.groupPosts && post.groupPosts.length > 0) {
    return { ...post, author: null };
  }
  return post;
}

export const postService = {
  async createPost(input: CreatePostInput) {
    const content = (input.content ?? '').trim();
    if (!content) throw new Error('Content is required');

    const authorId = input.authorId;
    const isNsfw = input.isNsfw ?? false;
    const isAnnouncement = input.isAnnouncement ?? false;
    const subscriberOnly = input.subscriberOnly ?? false;
    const isPaid = input.isPaid ?? false;
    const price = input.price ?? null;
    const rewardForUserId = input.rewardForUserId ?? null;
    const videoTitle = input.videoTitle?.trim() || null;
    const videoDescription = input.videoDescription?.trim() || null;
    const category = input.category?.trim() || undefined;
    const tags = Array.from(
      new Set(
        (input.tags ?? [])
          .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean),
      ),
    );
    const mediaUrls = (input.mediaUrls ?? []).filter(Boolean);
    
    return prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: { 
          content, 
          author_id: authorId, 
          is_nsfw: isNsfw,
          is_announcement: isAnnouncement,
          subscriber_only: subscriberOnly,
          is_paid: isPaid,
          price: price ? price : undefined,
          reward_for_user_id: rewardForUserId || undefined,
          video_title: videoTitle || undefined,
          video_description: videoDescription || undefined,
          category,
          media_urls: mediaUrls,
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
    });
  },


  async getPostById(postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId, deleted_at: null },
      include: {
        ...POST_INCLUDE,
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return maskGroupAuthor(post);
  },

  async getPosts(query: GetPostsQuery = {}) {
    const { search, category, tag, sort = 'new', safeMode = false, hasMedia = false, page, limit } = query;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;

    const where: any = { deleted_at: null };
    if (safeMode) where.is_nsfw = false;
    if (hasMedia) where.media_urls = { isEmpty: false };

    if (search) {
      where.content = { contains: search, mode: 'insensitive' };
    }

    if (category) {
      where.category = category;
    }

    if (tag) {
      where.tags = {
        some: {
          tag: {
            name: tag,
          },
        },
      };
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: sort === 'hot' ? { rating: 'desc' } : { created_at: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: true } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return posts.map(maskGroupAuthor);
  },

  async getPersonalizedPosts(userId: string, safeMode: boolean = false, pageNum: number = 1, limitNum: number = 30) {
    const postInclude = {
      author: { select: AUTHOR_SELECT },
      rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      tags: { include: { tag: true } },
      _count: { select: { votes: true, repaws: true, comments: true } },
      groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
    };

    // Analyse last 30 activity records
    const activities = await prisma.userActivity.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 30,
      include: { post: { select: { category: true } } },
    });

    // Posts already seen
    const viewedPostIds = activities
      .filter((a) => a.type === 'VIEW')
      .map((a) => a.post_id);

    // Category scores: LIKE=3, VIEW=1
    const categoryScores: Record<string, number> = {};
    for (const activity of activities) {
      const category = activity.post?.category;
      if (!category) continue;
      const weight = activity.type === 'LIKE' ? 3 : 1;
      categoryScores[category] = (categoryScores[category] || 0) + weight;
    }

    const topCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const nsfwFilter = safeMode ? { is_nsfw: false } : {};
    const excludeIds = viewedPostIds.length > 0 ? { notIn: viewedPostIds } : undefined;

    let personalizedPosts: any[] = [];
    let discoverPosts: any[] = [];

    const pLimit = Math.ceil(limitNum * 0.6);
    const dLimit = limitNum - pLimit;
    const pSkip = (pageNum - 1) * pLimit;
    const dSkip = (pageNum - 1) * dLimit;

    if (topCategories.length > 0) {
      // 60% from favourite categories
      personalizedPosts = await prisma.post.findMany({
        where: { deleted_at: null, category: { in: topCategories }, id: excludeIds, ...nsfwFilter },
        orderBy: { rating: 'desc' },
        skip: pSkip,
        take: pLimit,
        include: postInclude,
      });

      // 40% from other categories (discovery)
      discoverPosts = await prisma.post.findMany({
        where: {
          deleted_at: null,
          OR: [{ category: { notIn: topCategories } }, { category: null }],
          id: excludeIds,
          ...nsfwFilter,
        },
        orderBy: [{ rating: 'desc' }, { created_at: 'desc' }],
        skip: dSkip,
        take: dLimit,
        include: postInclude,
      });
    } else {
      // No activity yet — show popular new content
      discoverPosts = await prisma.post.findMany({
        where: { deleted_at: null, id: excludeIds, ...nsfwFilter },
        orderBy: [{ rating: 'desc' }, { created_at: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: postInclude,
      });
    }

    // Interleave: 3 personalised → 2 discover
    const result: any[] = [];
    let pi = 0;
    let di = 0;
    while (pi < personalizedPosts.length || di < discoverPosts.length) {
      for (let i = 0; i < 3 && pi < personalizedPosts.length; i++, pi++) result.push(personalizedPosts[pi]);
      for (let i = 0; i < 2 && di < discoverPosts.length; i++, di++) result.push(discoverPosts[di]);
    }

    return result.map(maskGroupAuthor);
  },

  async toggleVote(userId: string, postId: string, value: 1 | -1) {
    return prisma.$transaction(async (tx) => {
      const existingVote = await tx.vote.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });

      if (existingVote && existingVote.deleted_at === null) {
        if (existingVote.value === value) {
          // Same vote → retract it (soft delete)
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { deleted_at: new Date() },
          });
        } else {
          // Opposite vote → flip it
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { value },
          });
        }
      } else if (existingVote && existingVote.deleted_at !== null) {
        // Previously retracted → restore with the new value
        await tx.vote.update({
          where: { user_id_post_id: { user_id: userId, post_id: postId } },
          data: { value, deleted_at: null },
        });
      } else {
        // First-time vote
        await tx.vote.create({
          data: { user_id: userId, post_id: postId, value },
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

      // Fire LIKE notification when a net new upvote is cast (not a retraction)
      const isNewUpvote = value === 1 && updated.author_id !== userId;
      if (isNewUpvote) {
        const isRetraction = existingVote && existingVote.deleted_at === null && existingVote.value === value;
        if (!isRetraction) {
          notificationService.create({
            receiverId: updated.author_id,
            senderId: userId,
            type: 'LIKE',
            postId,
          }).catch(() => {});
        }
      }

      return updated;
    });
  },

  async toggleRepaw(userId: string, postId: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.repaw.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });

      if (existing) {
        await tx.repaw.delete({ where: { user_id_post_id: { user_id: userId, post_id: postId } } });
        const count = await tx.repaw.count({ where: { post_id: postId } });
        return { repawed: false, repaw_count: count };
      } else {
        await tx.repaw.create({ data: { user_id: userId, post_id: postId } });
        const [count, post] = await Promise.all([
          tx.repaw.count({ where: { post_id: postId } }),
          tx.post.findUnique({ where: { id: postId }, select: { author_id: true } }),
        ]);
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

  async getUserPosts(userId: string, take = 50) {
    const posts = await prisma.post.findMany({
      where: { author_id: userId, deleted_at: null, groupPosts: { none: {} } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: true } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return posts.map(maskGroupAuthor);
  },

  async getUserMediaPosts(userId: string, take = 50) {
    const posts = await prisma.post.findMany({
      where: { author_id: userId, deleted_at: null, media_urls: { isEmpty: false }, groupPosts: { none: {} } },
      orderBy: { created_at: 'desc' },
      take,
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: true } },
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true, accent_color: true } } } },
      },
    });
    return posts.map(maskGroupAuthor);
  },

  async getUserRepawedPosts(userId: string, take = 50) {
    const repaws = await prisma.repaw.findMany({
      where: { user_id: userId, post: { groupPosts: { none: {} } } },
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

  async getUserFavouritePosts(userId: string, take = 50) {
    const favs = await prisma.favourite.findMany({
      where: { user_id: userId, post: { groupPosts: { none: {} } } },
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

  async createComment(userId: string, postId: string, content: string, parentId?: string) {
    const comment = await prisma.comment.create({
      data: {
        post_id: postId,
        author_id: userId,
        content,
        parent_id: parentId ?? null,
      },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { replies: true, votes: true } },
      },
    });

    // Notify post author (not for self-comments)
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { author_id: true } });
    if (post && post.author_id !== userId) {
      notificationService.create({
        receiverId: post.author_id,
        senderId: userId,
        type: 'COMMENT',
        postId,
        commentId: comment.id,
      }).catch(() => {});
    }

    // Notify @mentioned users in parallel
    const mentions = content.match(/@(\w+)/g);
    if (mentions) {
      const uniqueUsernames = [...new Set(mentions.map((m) => m.slice(1)))];
      await Promise.all(
        uniqueUsernames.map(async (username) => {
          const mentioned = await prisma.user.findFirst({ where: { username, deleted_at: null }, select: { id: true } });
          if (mentioned && mentioned.id !== userId) {
            notificationService.create({
              receiverId: mentioned.id,
              senderId: userId,
              type: 'MENTION',
              postId,
              commentId: comment.id,
            }).catch(() => {});
          }
        }),
      );
    }

    return comment;
  },

  async getComments(postId: string) {
    const topLevel = await prisma.comment.findMany({
      where: { post_id: postId, parent_id: null, deleted_at: null },
      orderBy: { created_at: 'asc' },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { replies: true } },
        replies: {
          where: { deleted_at: null },
          orderBy: { created_at: 'asc' },
          include: {
            author: { select: AUTHOR_SELECT },
            _count: { select: { replies: true } },
          },
        },
      },
    });
    return topLevel;
  },

  async voteComment(userId: string, commentId: string, value: 1 | -1) {
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
    if (!isAdmin && post.author_id !== userId) throw new Error('Not authorized');
    return prisma.post.update({ where: { id: postId }, data: { deleted_at: new Date() } });
  },

  async editPost(userId: string, postId: string, content: string) {
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null } });
    if (!post) throw new Error('Post not found');
    if (post.author_id !== userId) throw new Error('Not authorized');
    return prisma.post.update({
      where: { id: postId },
      data: { content },
      include: {
        author: { select: AUTHOR_SELECT },
        rewardForUser: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        tags: { include: { tag: true } },
        _count: { select: { votes: true, repaws: true } },
      },
    });
  },

  async deleteComment(userId: string, commentId: string, isAdmin = false) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId, deleted_at: null } });
    if (!comment) throw new Error('Comment not found');
    if (!isAdmin && comment.author_id !== userId) throw new Error('Not authorized');
    return prisma.comment.update({ where: { id: commentId }, data: { deleted_at: new Date() } });
  },

  async getTrendingTags(includeNsfw: boolean = false) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    type RawRow = {
      name: string;
      total_count: bigint;
      month_count: bigint;
      prev_month_count: bigint;
      nsfw_pct: number;
    };

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        t.name,
        COUNT(DISTINCT pt.post_id)::bigint                                                          AS total_count,
        COUNT(DISTINCT CASE WHEN p.created_at >= ${thirtyDaysAgo} THEN pt.post_id END)::bigint      AS month_count,
        COUNT(DISTINCT CASE WHEN p.created_at >= ${sixtyDaysAgo}
                             AND p.created_at  <  ${thirtyDaysAgo} THEN pt.post_id END)::bigint     AS prev_month_count,
        COALESCE(
          ROUND(
            100.0 * COUNT(CASE WHEN p.is_nsfw = true THEN 1 END)::numeric
                  / NULLIF(COUNT(*)::numeric, 0)
          ), 0
        )::int                                                                                       AS nsfw_pct
      FROM "Tag" t
      JOIN "PostTag" pt ON pt.tag_id = t.id
      JOIN "Post"    p  ON p.id = pt.post_id AND p.deleted_at IS NULL
      GROUP BY t.id, t.name
      HAVING COUNT(DISTINCT pt.post_id) > 0
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
          name:           row.name,
          totalCount:     Number(row.total_count),
          monthCount:     month,
          prevMonthCount: prev,
          isNsfw:         row.nsfw_pct >= 50,
          trend,
        };
      });
  },
};
