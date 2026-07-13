import * as WebBrowser from 'expo-web-browser';
import { API_URL } from './config';
import { useSession } from '../stores/session';

export type OAuthProvider = 'yandex' | 'google' | 'twitter' | 'twitch';

const DEEP_LINK_REDIRECT = 'bloomly://auth/callback';

export async function loginWithOAuth(provider: OAuthProvider): Promise<'success' | 'cancel' | 'error'> {
  const authUrl = `${API_URL}/auth/oauth/${provider}?client=mobile`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, DEEP_LINK_REDIRECT);

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
