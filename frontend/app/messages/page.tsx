'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, isLoggedIn } from '../lib/api';

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/auth/login'); return; }
    api.getMe().then(res => setCurrentUser(res.data?.user)).catch(() => {});
    loadConversations();
  }, []);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv);
      api.markRead(activeConv).catch(() => {});
    }
  }, [activeConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await api.getConversations();
      setConversations(res.data?.conversations || []);
    } catch {}
    setLoading(false);
  };

  const loadMessages = async (convId: string) => {
    try {
      const res = await api.getMessages(convId);
      setMessages(res.data?.messages || []);
    } catch {}
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);
    try {
      const res = await api.sendMessage(activeConv, newMessage);
      setMessages(prev => [...prev, res.data?.message]);
      setNewMessage('');
    } catch (err: any) {
      alert(err.message);
    }
    setSending(false);
  };

  const getOtherParticipant = (conv: any) => {
    return conv.participants?.find((p: any) => p.user?.id !== currentUser?.id)?.user;
  };

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин`;
    if (m < 1440) return `${Math.floor(m / 60)} ч`;
    return `${Math.floor(m / 1440)} дн`;
  };

  const activeConvData = conversations.find(c => c.id === activeConv);
  const otherUser = activeConvData ? getOtherParticipant(activeConvData) : null;

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Conversations list */}
      <div className="w-72 flex-shrink-0 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-medium text-sm">Сообщения</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-zinc-400 text-sm text-center">Загрузка...</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-zinc-400 text-sm text-center">Нет диалогов</div>
          ) : (
            conversations.map(conv => {
              const other = getOtherParticipant(conv);
              const lastMsg = conv.messages?.[0];
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConv(conv.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors ${
                    activeConv === conv.id ? 'bg-zinc-50 dark:bg-zinc-800' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0 overflow-hidden">
                    {other?.avatar_url ? (
                      <img src={other.avatar_url} alt={other.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">
                        {other?.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{other?.display_name || other?.username || 'Unknown'}</p>
                    {lastMsg && (
                      <p className="text-xs text-zinc-400 truncate">{lastMsg.content}</p>
                    )}
                  </div>
                  {lastMsg && (
                    <span className="text-xs text-zinc-400 flex-shrink-0">{timeAgo(lastMsg.created_at)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        {activeConv ? (
          <>
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
              {otherUser && (
                <>
                  <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    {otherUser.avatar_url ? (
                      <img src={otherUser.avatar_url} alt={otherUser.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                        {otherUser.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <Link href={`/profile/${otherUser.username}`} className="text-sm font-medium hover:underline">
                    {otherUser.display_name || otherUser.username}
                  </Link>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {messages.map(msg => {
                const isOwn = msg.sender_id === currentUser?.id || msg.sender?.id === currentUser?.id;
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                      isOwn
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${isOwn ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-400'}`}>
                        {timeAgo(msg.created_at)}
                        {isOwn && msg.read_at && ' · Прочитано'}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Напишите сообщение..."
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-sm outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={sending || !newMessage.trim()}
                className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
              >
                {sending ? '...' : 'Отправить'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
            Выберите диалог для начала общения
          </div>
        )}
      </div>
    </div>
  );
}
