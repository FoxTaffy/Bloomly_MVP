'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';

interface Post {
  id: string;
  content: string;
  rating: number;
  created_at: string;
  author: { id: string; username: string; display_name?: string; avatar_url?: string };
  hashtags?: { hashtag: { tag: string } }[];
  _count?: { comments: number; saved_by: number };
}

export default function PostCard({ post, currentUserId }: { post: Post; currentUserId?: string }) {
  const [rating, setRating] = useState(post.rating);
  const [userVote, setUserVote] = useState<1 | -1 | 0>(0);
  const [saved, setSaved] = useState(false);

  const vote = async (value: 1 | -1) => {
    try {
      const newValue = userVote === value ? 0 : value;
      const res = await api.votePost(post.id, value);
      setRating(res.data?.rating ?? rating);
      setUserVote(newValue);
    } catch {}
  };

  const toggleSave = async () => {
    try {
      const res = await api.savePost(post.id);
      setSaved(res.data?.saved ?? !saved);
    } catch {}
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч назад`;
    return `${Math.floor(h / 24)} дн назад`;
  };

  return (
    <article className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
      <div className="flex items-start gap-3">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            onClick={() => vote(1)}
            className={`p-1 rounded transition-colors ${userVote === 1 ? 'text-orange-500' : 'text-zinc-400 hover:text-orange-400'}`}
          >
            ▲
          </button>
          <span className={`text-sm font-bold ${rating > 0 ? 'text-orange-500' : rating < 0 ? 'text-blue-500' : 'text-zinc-500'}`}>
            {rating}
          </span>
          <button
            onClick={() => vote(-1)}
            className={`p-1 rounded transition-colors ${userVote === -1 ? 'text-blue-500' : 'text-zinc-400 hover:text-blue-400'}`}
          >
            ▼
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Link href={`/profile/${post.author.username}`} className="flex items-center gap-2 group">
              {post.author.avatar_url ? (
                <img src={post.author.avatar_url} alt={post.author.username} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold">
                  {post.author.username?.[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium group-hover:underline">
                {post.author.display_name || post.author.username}
              </span>
            </Link>
            <span className="text-xs text-zinc-400">@{post.author.username}</span>
            <span className="text-xs text-zinc-400">{timeAgo(post.created_at)}</span>
          </div>

          <Link href={`/posts/${post.id}`}>
            <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words hover:text-zinc-600 dark:hover:text-zinc-300">
              {post.content.length > 400 ? post.content.slice(0, 400) + '...' : post.content}
            </p>
          </Link>

          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {post.hashtags.map(ph => (
                <Link
                  key={ph.hashtag.tag}
                  href={`/search?q=${encodeURIComponent(ph.hashtag.tag)}&type=hashtags`}
                  className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  #{ph.hashtag.tag}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3">
            <Link
              href={`/posts/${post.id}`}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Комментарии {post._count?.comments ? `(${post._count.comments})` : ''}
            </Link>
            {currentUserId && (
              <>
                <button
                  onClick={toggleSave}
                  className={`text-xs transition-colors ${saved ? 'text-yellow-500' : 'text-zinc-400 hover:text-yellow-500'}`}
                >
                  {saved ? 'Сохранено' : 'Сохранить'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
