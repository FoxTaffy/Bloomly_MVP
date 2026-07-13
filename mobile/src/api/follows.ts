import { api } from './client';

export async function toggleFollow(userId: string): Promise<{ following: boolean }> {
  const res = await api.post(`/follows/${userId}/toggle`);
  return res.data.data;
}

export async function checkFollow(userId: string): Promise<boolean> {
  const res = await api.get(`/follows/${userId}/check`);
  return !!res.data.data?.following;
}
