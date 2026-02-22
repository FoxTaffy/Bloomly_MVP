'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (username: string, email: string, password: string) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),

  getMe: () => apiFetch('/users/me'),

  // Users
  getUserByUsername: (username: string) => apiFetch(`/users/username/${username}`),
  getUserById: (id: string) => apiFetch(`/users/${id}`),
  updateUser: (id: string, data: any) =>
    apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  followUser: (id: string) =>
    apiFetch(`/users/${id}/follow`, { method: 'POST' }),
  blockUser: (id: string) =>
    apiFetch(`/users/${id}/block`, { method: 'POST' }),
  getFollowers: (id: string, page = 1) => apiFetch(`/users/${id}/followers?page=${page}`),
  getFollowing: (id: string, page = 1) => apiFetch(`/users/${id}/following?page=${page}`),

  // Posts
  getPosts: (params?: { sortBy?: string; page?: number; userId?: string; groupId?: string; hashtag?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return apiFetch(`/posts?${q}`);
  },
  getPost: (id: string) => apiFetch(`/posts/${id}`),
  createPost: (data: { content: string; isNsfw?: boolean; groupId?: string }) =>
    apiFetch('/posts', { method: 'POST', body: JSON.stringify(data) }),
  updatePost: (id: string, data: { content: string }) =>
    apiFetch(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePost: (id: string) =>
    apiFetch(`/posts/${id}`, { method: 'DELETE' }),
  votePost: (id: string, value: 1 | -1) =>
    apiFetch(`/posts/${id}/vote`, { method: 'POST', body: JSON.stringify({ value }) }),
  repost: (id: string, content?: string) =>
    apiFetch(`/posts/${id}/repost`, { method: 'POST', body: JSON.stringify({ content }) }),
  savePost: (id: string) =>
    apiFetch(`/posts/${id}/save`, { method: 'POST' }),
  getSavedPosts: (page = 1) => apiFetch(`/posts/saved?page=${page}`),

  // Comments
  getComments: (postId: string) => apiFetch(`/comments?post_id=${postId}`),
  createComment: (data: { postId: string; content: string; parentCommentId?: string }) =>
    apiFetch('/comments', { method: 'POST', body: JSON.stringify(data) }),
  updateComment: (id: string, content: string) =>
    apiFetch(`/comments/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  deleteComment: (id: string) =>
    apiFetch(`/comments/${id}`, { method: 'DELETE' }),
  voteComment: (id: string, value: 1 | -1) =>
    apiFetch(`/comments/${id}/vote`, { method: 'POST', body: JSON.stringify({ value }) }),

  // Groups
  getGroups: (params?: { type?: string; page?: number }) => {
    const q = new URLSearchParams(params as any).toString();
    return apiFetch(`/groups?${q}`);
  },
  getGroup: (id: string) => apiFetch(`/groups/${id}`),
  createGroup: (data: { name: string; slug: string; description?: string; type?: string }) =>
    apiFetch('/groups', { method: 'POST', body: JSON.stringify(data) }),
  joinGroup: (id: string) =>
    apiFetch(`/groups/${id}/join`, { method: 'POST' }),

  // Conversations
  getConversations: () => apiFetch('/conversations'),
  createConversation: (participantId: string) =>
    apiFetch('/conversations', { method: 'POST', body: JSON.stringify({ participant_id: participantId }) }),
  getMessages: (id: string, page = 1) => apiFetch(`/conversations/${id}/messages?page=${page}`),
  sendMessage: (id: string, content: string) =>
    apiFetch(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }),
  markRead: (id: string) =>
    apiFetch(`/conversations/${id}/read`, { method: 'POST' }),

  // Notifications
  getNotifications: (unread = false) => apiFetch(`/notifications${unread ? '?unread=true' : ''}`),
  getUnreadCount: () => apiFetch('/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    apiFetch('/notifications/read-all', { method: 'POST' }),

  // Search
  search: (query: string, type?: string, page = 1) => {
    const q = new URLSearchParams({ query, ...(type ? { type } : {}), page: String(page) }).toString();
    return apiFetch(`/search?${q}`);
  },

  // Reports
  createReport: (data: { targetType: string; targetId: string; reason: string }) =>
    apiFetch('/reports', { method: 'POST', body: JSON.stringify(data) }),

  // Admin
  getAdminStats: () => apiFetch('/admin/stats'),
  getAdminReports: (status?: string, page = 1) =>
    apiFetch(`/admin/reports?${status ? `status=${status}&` : ''}page=${page}`),
  updateReport: (id: string, status: string) =>
    apiFetch(`/admin/reports/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
  getAdminUsers: (page = 1, role?: string) =>
    apiFetch(`/admin/users?page=${page}${role ? `&role=${role}` : ''}`),
  updateUserRole: (id: string, role: string) =>
    apiFetch(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  adminBlockUser: (id: string) =>
    apiFetch(`/admin/users/${id}/block`, { method: 'POST' }),
  adminDeletePost: (id: string) =>
    apiFetch(`/admin/posts/${id}`, { method: 'DELETE' }),
  adminDeleteComment: (id: string) =>
    apiFetch(`/admin/comments/${id}`, { method: 'DELETE' }),
};

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout(): void {
  localStorage.removeItem('access_token');
}
