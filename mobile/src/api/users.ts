import { api } from './client';
import type { UserProfile } from '../types/api';

export async function fetchUserProfile(idOrUsername: string): Promise<UserProfile> {
  const res = await api.get(`/users/${idOrUsername}`);
  return res.data.data.user as UserProfile;
}
