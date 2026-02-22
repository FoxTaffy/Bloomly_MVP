'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api';
import PostCard from '../components/PostCard';

type SearchType = 'all' | 'users' | 'posts' | 'hashtags';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams?.get('q') || '';
  const initialType = (searchParams?.get('type') as SearchType) || 'all';

  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<SearchType>(initialType);
  const [results, setResults] = useState<{ users: any[]; posts: any[]; hashtags: any[] }>({
    users: [], posts: [], hashtags: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialQuery) performSearch(initialQuery, initialType);
  }, []);

  const performSearch = async (q: string, t: SearchType) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await api.search(q, t === 'all' ? undefined : t);
      setResults(res.data || { users: [], posts: [], hashtags: [] });
    } catch {}
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(query)}&type=${type}`);
    performSearch(query, type);
  };

  const tabs: { key: SearchType; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'users', label: 'Пользователи' },
    { key: 'posts', label: 'Посты' },
    { key: 'hashtags', label: 'Хештеги' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск пользователей, постов, хештегов..."
          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
        />
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 dark:bg-white px-5 py-3 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          Найти
        </button>
      </form>

      {/* Type tabs */}
      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setType(tab.key); performSearch(query, tab.key); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              type === tab.key
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-400 text-sm">Поиск...</div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Users */}
          {(type === 'all' || type === 'users') && results.users.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-500 mb-3">Пользователи</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.users.map(user => (
                  <Link
                    key={user.id}
                    href={`/profile/${user.username}`}
                    className="flex items-center gap-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 hover:border-zinc-400 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden flex-shrink-0">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">
                          {user.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.display_name || user.username}</p>
                      <p className="text-xs text-zinc-400">@{user.username}</p>
                      {user.persona && <p className="text-xs text-zinc-500">{user.persona}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Hashtags */}
          {(type === 'all' || type === 'hashtags') && results.hashtags.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-500 mb-3">Хештеги</h2>
              <div className="flex flex-wrap gap-2">
                {results.hashtags.map((tag: any) => (
                  <Link
                    key={tag.id}
                    href={`/search?q=%23${tag.tag}&type=posts`}
                    className="rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm hover:border-zinc-400 transition-colors"
                  >
                    <span className="text-blue-500">#{tag.tag}</span>
                    <span className="text-zinc-400 ml-2 text-xs">{tag._count?.posts || 0} постов</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Posts */}
          {(type === 'all' || type === 'posts') && results.posts.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-500 mb-3">Посты</h2>
              <div className="flex flex-col gap-3">
                {results.posts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}

          {!loading && query && results.users.length === 0 && results.posts.length === 0 && results.hashtags.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-sm">
              Ничего не найдено по запросу "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
