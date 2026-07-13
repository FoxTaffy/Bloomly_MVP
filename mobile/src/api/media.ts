import { api } from './client';

export async function uploadMedia(
  uri: string,
  folder: 'posts' | 'avatars' | 'stories' | 'messages',
  mimeType = 'image/jpeg',
): Promise<{ url: string; videoUrl?: string }> {
  const name = uri.split('/').pop() ?? `upload-${Date.now()}`;
  const form = new FormData();
  form.append('file', { uri, name, type: mimeType } as unknown as Blob);

  const res = await api.post(`/media/upload?folder=${folder}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}
