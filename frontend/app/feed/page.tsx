'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, isLoggedIn } from '../lib/api';
import PostCard from '../components/PostCard';

export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'date' | 'rating'>('date');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login'); return; }
    api.getMe().then(res => setCurrentUser(res.data?.user)).catch(() => {});
  }, []);

  useEffect(() => {
    loadPosts(1);
  }, [sortBy]);

  const loadPosts = async (p: number) => {
    setLoading(true);
    try {
      const res = await api.getPosts({ sortBy, page: p, limit: 20 } as any);
      const fetched = res.data?.posts || [];
      if (p === 1) {
        setPosts(fetched);
      } else {
        setPosts(prev => [...prev, ...fetched]);
      }
      setPage(p);
      setHasMore(fetched.length === 20);
    } catch {}
    setLoading(false);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      const res = await api.createPost({ content: newPost });
      setPosts(prev => [res.data?.post, ...prev].filter(Boolean));
      setNewPost('');
    } catch (err: any) {
      alert(err.message);
    }
    setPosting(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* New post form */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
        <form onSubmit={handlePost}>
          <textarea
            value={newPost}
            onChange={e => setNewPost(e.target.value)}
            placeholder="Что у вас нового? Используйте #хештеги"
            rows={3}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 resize-none"
          />
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={posting || !newPost.trim()}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {posting ? 'Публикация...' : 'Опубликовать'}
            </button>
          </div>
        </form>
      </div>

      {/* Sort controls */}
      <div className="flex gap-2">
        <button
          onClick={() => setSortBy('date')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            sortBy === 'date'
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
              : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
          }`}
        >
          Новые
        </button>
        <button
          onClick={() => setSortBy('rating')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            sortBy === 'rating'
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
              : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
          }`}
        >
          Популярные
        </button>
      </div>

      {/* Posts */}
      {loading && page === 1 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">Загрузка...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">
          Нет постов. Будьте первым — опубликуйте что-нибудь!
        </div>
      ) : (
        <>
          {posts.map(post => (
            <PostCard key={post.id} post={post} currentUserId={currentUser?.id} />
          ))}

          {hasMore && (
            <button
              onClick={() => loadPosts(page + 1)}
              disabled={loading}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              {loading ? 'Загрузка...' : 'Загрузить ещё'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
