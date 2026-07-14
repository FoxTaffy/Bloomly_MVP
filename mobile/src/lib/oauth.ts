import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_URL } from './config';
import { useSession } from '../stores/session';

export type OAuthProvider = 'yandex' | 'google' | 'twitter' | 'twitch';

export async function loginWithOAuth(provider: OAuthProvider): Promise<'success' | 'cancel' | 'error'> {
  // В Expo Go это exp://..., в собранном приложении — bloomly://auth/callback.
  // Бэкенд не может угадать это заранее, поэтому шлём актуальный редирект явно.
  const redirectUrl = Linking.createURL('auth/callback');
  const authUrl = `${API_URL}/auth/oauth/${provider}?client=mobile&redirect=${encodeURIComponent(redirectUrl)}`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

  if (result.type !== 'success' || !result.url) {
    return result.type === 'cancel' || result.type === 'dismiss' ? 'cancel' : 'error';
  }

  const tokenMatch = result.url.match(/[?&]token=([^&]+)/);
  const refreshMatch = result.url.match(/[?&]refreshToken=([^&]+)/);
  if (!tokenMatch) return 'error';

  const token = decodeURIComponent(tokenMatch[1]);
  const refreshToken = refreshMatch ? decodeURIComponent(refreshMatch[1]) : undefined;

  try {
    await useSession.getState().loginWithToken(token, refreshToken);
    return 'success';
  } catch {
    return 'error';
  }
}
