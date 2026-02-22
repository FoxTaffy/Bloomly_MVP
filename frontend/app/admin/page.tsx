'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, isLoggedIn } from '../lib/api';

type AdminTab = 'stats' | 'reports' | 'users';

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tab, setTab] = useState<AdminTab>('stats');
  const [stats, setStats] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login'); return; }
    api.getMe().then(res => {
      const u = res.data?.user;
      if (!['admin', 'moderator'].includes(u?.role)) {
        router.push('/feed');
        return;
      }
      setCurrentUser(u);
    }).catch(() => router.push('/feed'));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadTab();
  }, [tab, currentUser]);

  const loadTab = async () => {
    setLoading(true);
    try {
      if (tab === 'stats') {
        const res = await api.getAdminStats();
        setStats(res.data);
      } else if (tab === 'reports') {
        const res = await api.getAdminReports();
        setReports(res.data?.reports || []);
      } else if (tab === 'users') {
        const res = await api.getAdminUsers();
        setUsers(res.data?.users || []);
      }
    } catch {}
    setLoading(false);
  };

  const handleReportAction = async (id: string, status: 'reviewed' | 'rejected') => {
    try {
      await api.updateReport(id, status);
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {}
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.updateUserRole(userId, role);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
    } catch {}
  };

  const handleBlockUser = async (userId: string) => {
    try {
      const res = await api.adminBlockUser(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_blocked: res.data?.is_blocked } : u));
    } catch {}
  };

  if (!currentUser) return <div className="text-center py-12 text-zinc-400 text-sm">Загрузка...</div>;

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'stats', label: 'Статистика' },
    { key: 'reports', label: 'Жалобы' },
    { key: 'users', label: 'Пользователи' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">Панель администратора</h1>

      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-400 text-sm">Загрузка...</div>
      ) : (
        <>
          {tab === 'stats' && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Пользователей', value: stats.userCount },
                { label: 'Постов', value: stats.postCount },
                { label: 'Комментариев', value: stats.commentCount },
                { label: 'Жалоб в очереди', value: stats.pendingReports },
              ].map(item => (
                <div key={item.label} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                  <p className="text-3xl font-bold">{item.value}</p>
                  <p className="text-sm text-zinc-500 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'reports' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {reports.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-sm">Нет жалоб</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Тип</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Причина</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Статус</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {reports.map(report => (
                      <tr key={report.id}>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{report.target_type}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 max-w-xs truncate">{report.reason}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            report.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            report.status === 'reviewed' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                            'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
                          }`}>
                            {report.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {report.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReportAction(report.id, 'reviewed')}
                                className="text-xs text-green-600 hover:underline"
                              >
                                Рассмотрено
                              </button>
                              <button
                                onClick={() => handleReportAction(report.id, 'rejected')}
                                className="text-xs text-zinc-400 hover:underline"
                              >
                                Отклонить
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'users' && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {users.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-sm">Нет пользователей</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Пользователь</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Роль</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Статус</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{u.display_name || u.username}</p>
                          <p className="text-xs text-zinc-400">@{u.username}</p>
                        </td>
                        <td className="px-4 py-3">
                          {currentUser.role === 'admin' ? (
                            <select
                              value={u.role}
                              onChange={e => handleRoleChange(u.id, e.target.value)}
                              className="rounded border border-zinc-200 dark:border-zinc-700 bg-transparent text-xs px-2 py-1"
                            >
                              <option value="user">user</option>
                              <option value="moderator">moderator</option>
                              <option value="admin">admin</option>
                            </select>
                          ) : (
                            <span className="text-xs">{u.role}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${u.is_blocked ? 'text-red-500' : 'text-green-500'}`}>
                            {u.is_blocked ? 'Заблокирован' : 'Активен'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleBlockUser(u.id)}
                            className={`text-xs hover:underline ${u.is_blocked ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
