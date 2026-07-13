import { api } from './client';
import type { Post } from '../types/api';

export async function fetchTrendingTags(): Promise<{ id: string; name: string; count: number }[]> {
  const res = await api.get('/posts/trending-tags');
  return res.data.data.tags;
}

export async function fetchFeed(params: { personalized: boolean }): Promise<Post[]> {
  const path = params.personalized ? '/posts/personalized' : '/posts';
  const res = await api.get(path);
  return res.data.data.posts as Post[];
}

export async function fetchUserPosts(userId: string, tab: 'posts' | 'media' | 'likes' | 'repaws' = 'posts'): Promise<Post[]> {
  const suffix = tab === 'posts' ? '' : `/${tab}`;
  const res = await api.get(`/posts/user/${userId}${suffix}`);
  return res.data.data.posts as Post[];
}

export async function createPost(body: {
  content?: string;
  isNsfw?: boolean;
  category?: string;
  mediaUrls?: string[];
  mediaOriginalUrls?: string[];
}): Promise<Post> {
  const res = await api.post('/posts', body);
  return res.data.data.post as Post;
}

export async function votePost(id: string, value: -1 | 0 | 1) {
  await api.post(`/posts/${id}/vote`, { value });
}

export async function repawPost(id: string) {
  await api.post(`/posts/${id}/repaw`);
}

export async function favouritePost(id: string) {
  await api.post(`/posts/${id}/favourite`);
}
