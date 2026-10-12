import { api } from './client';
import type { UserProfile, UserSummary } from '../types/api';

export async function fetchUserProfile(idOrUsername: string): Promise<UserProfile> {
  const res = await api.get(`/users/${idOrUsername}`);
  return res.data.data.user as UserProfile;
}

export async function searchUsers(q: string): Promise<UserSummary[]> {
  const res = await api.get('/users/search', { params: { q, limit: 10 } });
  return res.data.data.users as UserSummary[];
}
