'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, isLoggedIn, logout } from '../lib/api';

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      api.getMe().then(res => setUser(res.data?.user)).catch(() => {});
      api.getUnreadCount().then(res => setUnreadCount(res.data?.count || 0)).catch(() => {});
    }
  }, [pathname]);

  const handleLogout = () => {
    logout();
    setUser(null);
    router.push('/auth/login');
  };

  const isAuth = pathname.startsWith('/auth/');

  if (isAuth) return null;

  return (
    <nav className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/feed" className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
          Bloomly
        </Link>

        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = (e.target as HTMLFormElement).querySelector('input')?.value;
              if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
            }}
            className="w-full"
          >
            <input
              type="text"
              placeholder="Поиск..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
            />
          </form>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/feed"
                className={`text-sm font-medium transition-colors ${pathname === '/feed' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              >
                Лента
              </Link>
              <Link
                href="/notifications"
                className={`relative text-sm font-medium transition-colors ${pathname === '/notifications' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              >
                Уведомления
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/messages"
                className={`text-sm font-medium transition-colors ${pathname === '/messages' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
              >
                Сообщения
              </Link>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.username} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-300 dark:bg-zinc-600 flex items-center justify-center text-xs font-bold">
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium hidden sm:block">{user.display_name || user.username}</span>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg py-1 z-50">
                    <Link
                      href={`/profile/${user.username}`}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      Мой профиль
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      Настройки
                    </Link>
                    {(user.role === 'admin' || user.role === 'moderator') && (
                      <Link
                        href="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700"
                      >
                        Панель администратора
                      </Link>
                    )}
                    <hr className="my-1 border-zinc-200 dark:border-zinc-700" />
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                    >
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Войти
              </Link>
              <Link
                href="/auth/register"
                className="rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
              >
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
