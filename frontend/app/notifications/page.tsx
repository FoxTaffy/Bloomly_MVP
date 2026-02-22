'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, isLoggedIn } from '../lib/api';

const notificationText: Record<string, string> = {
  follow: 'подписался на вас',
  comment: 'прокомментировал ваш пост',
  mention: 'упомянул вас',
  vote: 'оценил ваш пост',
  message: 'отправил вам сообщение',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login'); return; }
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.data?.notifications || []);
    } catch {}
    setLoading(false);
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин назад`;
    if (m < 1440) return `${Math.floor(m / 60)} ч назад`;
    return `${Math.floor(m / 1440)} дн назад`;
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Уведомления</h1>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Отметить все прочитанными
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-zinc-400 text-sm">Загрузка...</div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-sm">Нет уведомлений</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {notifications.map(notif => (
              <div
                key={notif.id}
                className={`flex items-start gap-3 px-5 py-4 transition-colors ${
                  !notif.is_read ? 'bg-blue-50 dark:bg-blue-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
              >
                {notif.actor?.avatar_url ? (
                  <img
                    src={notif.actor.avatar_url}
                    alt={notif.actor.username}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0 flex items-center justify-center text-sm font-bold text-zinc-500">
                    {notif.actor?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    {notif.actor ? (
                      <Link href={`/profile/${notif.actor.username}`} className="font-medium hover:underline">
                        {notif.actor.display_name || notif.actor.username}
                      </Link>
                    ) : (
                      <span className="font-medium">Система</span>
                    )}{' '}
                    {notificationText[notif.type] || notif.type}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{timeAgo(notif.created_at)}</p>
                </div>

                {!notif.is_read && (
                  <button
                    onClick={() => handleMarkRead(notif.id)}
                    className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
                  >
                    Прочитано
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
