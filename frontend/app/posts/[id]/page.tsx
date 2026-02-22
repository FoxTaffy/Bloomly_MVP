'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, isLoggedIn } from '../../lib/api';
import PostCard from '../../components/PostCard';

function CommentItem({ comment, currentUserId, onReply, depth = 0 }: any) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await onReply(comment.post_id, replyText, comment.id);
      setReplyText('');
      setShowReply(false);
    } catch {}
    setSubmitting(false);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return `${m} мин`;
    return `${Math.floor(m / 60)} ч`;
  };

  return (
    <div className={`${depth > 0 ? 'ml-6 pl-4 border-l border-zinc-200 dark:border-zinc-700' : ''}`}>
      <div className="py-3">
        <div className="flex items-center gap-2 mb-1">
          <Link href={`/profile/${comment.user?.username}`} className="text-sm font-medium hover:underline">
            {comment.user?.display_name || comment.user?.username}
          </Link>
          <span className="text-xs text-zinc-400">{timeAgo(comment.created_at)}</span>
          <span className={`text-xs ${comment.rating > 0 ? 'text-orange-500' : comment.rating < 0 ? 'text-blue-500' : 'text-zinc-400'}`}>
            {comment.rating > 0 ? '+' : ''}{comment.rating}
          </span>
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{comment.content}</p>
        {isLoggedIn() && depth < 3 && (
          <button
            onClick={() => setShowReply(!showReply)}
            className="text-xs text-zinc-400 hover:text-zinc-600 mt-1"
          >
            Ответить
          </button>
        )}

        {showReply && (
          <form onSubmit={handleReply} className="mt-2 flex gap-2">
            <input
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Ваш ответ..."
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-zinc-900 dark:bg-white px-3 py-2 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              Отправить
            </button>
          </form>
        )}
      </div>

      {comment.replies?.map((reply: any) => (
        <CommentItem key={reply.id} comment={reply} currentUserId={currentUserId} onReply={onReply} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function PostPage() {
  const params = useParams();
  const postId = params?.id as string;

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!postId) return;
    loadPost();
    if (isLoggedIn()) {
      api.getMe().then(res => setCurrentUser(res.data?.user)).catch(() => {});
    }
  }, [postId]);

  const loadPost = async () => {
    setLoading(true);
    try {
      const [postRes, commentsRes] = await Promise.all([
        api.getPost(postId),
        api.getComments(postId),
      ]);
      setPost(postRes.data?.post);
      setComments(commentsRes.data?.comments || []);
    } catch {
      setError('Пост не найден');
    }
    setLoading(false);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await api.createComment({ postId, content: newComment });
      setNewComment('');
      const res = await api.getComments(postId);
      setComments(res.data?.comments || []);
    } catch (err: any) {
      alert(err.message);
    }
    setSubmitting(false);
  };

  const handleReply = async (postId: string, content: string, parentCommentId: string) => {
    await api.createComment({ postId, content, parentCommentId });
    const res = await api.getComments(postId);
    setComments(res.data?.comments || []);
  };

  if (loading) return <div className="text-center py-12 text-zinc-400 text-sm">Загрузка...</div>;
  if (error || !post) return <div className="text-center py-12 text-zinc-400 text-sm">{error || 'Пост не найден'}</div>;

  return (
    <div className="flex flex-col gap-4">
      <PostCard post={post} currentUserId={currentUser?.id} />

      {/* Comments section */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
        <h2 className="text-sm font-medium text-zinc-500 mb-4">
          Комментарии ({comments.length})
        </h2>

        {isLoggedIn() && (
          <form onSubmit={handleComment} className="flex gap-3 mb-6">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Напишите комментарий..."
              rows={2}
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-sm outline-none focus:border-zinc-400 resize-none"
            />
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="self-end rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {submitting ? '...' : 'Отправить'}
            </button>
          </form>
        )}

        {comments.length === 0 ? (
          <div className="text-center py-6 text-zinc-400 text-sm">Нет комментариев</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {comments.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                currentUserId={currentUser?.id}
                onReply={handleReply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
