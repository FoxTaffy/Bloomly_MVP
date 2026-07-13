import { api } from './client';
import type { Story } from '../types/api';

export async function fetchStories(): Promise<Story[]> {
  const res = await api.get('/stories');
  return res.data.data.stories as Story[];
}

export async function createStory(body: { image_url?: string; video_url?: string }): Promise<Story> {
  const res = await api.post('/stories', body);
  return res.data.data.story as Story;
}

export async function voteStory(id: string, value: 1 | -1) {
  await api.post(`/stories/${id}/vote`, { value });
}

export async function viewStory(id: string) {
  await api.post(`/stories/${id}/view`);
}
