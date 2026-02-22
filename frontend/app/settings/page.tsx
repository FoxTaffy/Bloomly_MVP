'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, isLoggedIn } from '../lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({
    display_name: '',
    status_text: '',
    persona: '',
    city: '',
    avatar_url: '',
    header_url: '',
    likes_list: '',
    dislikes_list: '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login'); return; }
    api.getMe().then(res => {
      const u = res.data?.user;
      setUser(u);
      setForm({
        display_name: u.display_name || '',
        status_text: u.status_text || '',
        persona: u.persona || '',
        city: u.city || '',
        avatar_url: u.avatar_url || '',
        header_url: u.header_url || '',
        likes_list: (u.likes_list || []).join(', '),
        dislikes_list: (u.dislikes_list || []).join(', '),
      });
    }).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = {
        ...form,
        likes_list: form.likes_list.split(',').map(s => s.trim()).filter(Boolean),
        dislikes_list: form.dislikes_list.split(',').map(s => s.trim()).filter(Boolean),
      };
      await api.updateUser(user.id, data);
      setSuccess('Настройки сохранены');
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  };

  if (!user) return <div className="text-center py-12 text-zinc-400 text-sm">Загрузка...</div>;

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-6">Настройки профиля</h1>

      <form onSubmit={handleSave} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col gap-5">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Отображаемое имя</label>
          <input
            value={form.display_name}
            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            maxLength={100}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Статус</label>
          <input
            value={form.status_text}
            onChange={e => setForm(f => ({ ...f, status_text: e.target.value }))}
            maxLength={300}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Персона (ваше животное/персонаж)</label>
          <input
            value={form.persona}
            onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
            maxLength={100}
            placeholder="например, лис, кот, дракон..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Город</label>
          <input
            value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
            maxLength={100}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">URL аватара</label>
          <input
            value={form.avatar_url}
            onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))}
            type="url"
            placeholder="https://..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">URL шапки профиля</label>
          <input
            value={form.header_url}
            onChange={e => setForm(f => ({ ...f, header_url: e.target.value }))}
            type="url"
            placeholder="https://..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Любит (через запятую)</label>
          <input
            value={form.likes_list}
            onChange={e => setForm(f => ({ ...f, likes_list: e.target.value }))}
            placeholder="арт, аниме, музыка..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">Не любит (через запятую)</label>
          <input
            value={form.dislikes_list}
            onChange={e => setForm(f => ({ ...f, dislikes_list: e.target.value }))}
            placeholder="спам, грубость..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
          />
        </div>

        {success && (
          <p className="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            {success}
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-zinc-900 dark:bg-white py-3 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
      </form>
    </div>
  );
}
