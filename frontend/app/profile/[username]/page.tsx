'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api, isLoggedIn } from '../../lib/api';
import PostCard from '../../components/PostCard';

export default function ProfilePage() {
  const params = useParams();
  const username = params?.username as string;

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    loadProfile();
    if (isLoggedIn()) {
      api.getMe().then(res => setCurrentUser(res.data?.user)).catch(() => {});
    }
  }, [username]);

  const loadProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getUserByUsername(username);
      const user = res.data?.user;
      setProfile(user);

      const postsRes = await api.getPosts({ userId: user.id });
      setPosts(postsRes.data?.posts || []);
    } catch (err: any) {
      setError('Пользователь не найден');
    }
    setLoading(false);
  };

  const handleFollow = async () => {
    if (!isLoggedIn()) return;
    try {
      const res = await api.followUser(profile.id);
      setFollowing(res.data?.following);
      setProfile((p: any) => ({
        ...p,
        _count: {
          ...p._count,
          followers: p._count.followers + (res.data?.following ? 1 : -1),
        },
      }));
    } catch {}
  };

  if (loading) return <div className="text-center py-12 text-zinc-400 text-sm">Загрузка...</div>;
  if (error || !profile) return (
    <div className="text-center py-12 text-zinc-400 text-sm">Пользователь не найден</div>
  );

  const isOwn = currentUser?.id === profile.id;

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Cover */}
        <div className="h-32 bg-gradient-to-r from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800">
          {profile.header_url && (
            <img src={profile.header_url} alt="cover" className="w-full h-full object-cover" />
          )}
        </div>

        <div className="p-5">
          <div className="flex items-end justify-between -mt-12 mb-4">
            <div className="w-20 h-20 rounded-2xl border-4 border-white dark:border-zinc-900 bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-zinc-500">
                  {profile.username?.[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {!isOwn && isLoggedIn() && (
              <button
                onClick={handleFollow}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  following
                    ? 'border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:border-red-300 hover:text-red-600'
                    : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200'
                }`}
              >
                {following ? 'Отписаться' : 'Подписаться'}
              </button>
            )}
          </div>

          <h1 className="text-xl font-bold">{profile.display_name || profile.username}</h1>
          <p className="text-sm text-zinc-500">@{profile.username}</p>

          {profile.persona && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Персона: {profile.persona}</p>
          )}
          {profile.status_text && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 italic">"{profile.status_text}"</p>
          )}
          {profile.city && (
            <p className="text-xs text-zinc-400 mt-1">{profile.city}</p>
          )}

          <div className="flex gap-4 mt-3 text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">
              <strong>{profile._count?.followers || 0}</strong>
              <span className="text-zinc-400 ml-1">подписчиков</span>
            </span>
            <span className="text-zinc-700 dark:text-zinc-300">
              <strong>{profile._count?.following || 0}</strong>
              <span className="text-zinc-400 ml-1">подписок</span>
            </span>
            <span className="text-zinc-700 dark:text-zinc-300">
              <strong>{profile._count?.posts || 0}</strong>
              <span className="text-zinc-400 ml-1">постов</span>
            </span>
          </div>

          {profile.user_badges && profile.user_badges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {profile.user_badges.map((badge: any) => (
                <span key={badge.id} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {badge.badge_name}
                </span>
              ))}
            </div>
          )}

          {(profile.likes_list?.length > 0 || profile.dislikes_list?.length > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {profile.likes_list?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Любит</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.likes_list.slice(0, 5).map((item: string) => (
                      <span key={item} className="rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.dislikes_list?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Не любит</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.dislikes_list.slice(0, 5).map((item: string) => (
                      <span key={item} className="rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-500">Посты</h2>
        {posts.length === 0 ? (
          <div className="text-center py-8 text-zinc-400 text-sm">Нет постов</div>
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} currentUserId={currentUser?.id} />)
        )}
      </div>
    </div>
  );
}
