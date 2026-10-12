import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildOAuthUrl, handleOAuthCallback, findOrCreateOAuthUser } from '../src/modules/auth/oauth.service.js';
import { createUser, resetDb } from './helpers.js';

/** Подменяем fetch: первый вызов — обмен кода на токен, второй — профиль у провайдера. */
function stubProvider(profileBody: unknown) {
  let call = 0;
  vi.stubGlobal('fetch', async () => {
    call += 1;
    const body = call === 1 ? { access_token: 'tok' } : profileBody;
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
}

describe('oauth: доверие к email провайдера', () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllGlobals());

  it('Google: непроверенный email не берётся', async () => {
    stubProvider({ sub: 'g-1', email: 'someone@example.com', email_verified: false, name: 'G' });
    const { state } = buildOAuthUrl('google');
    const { oauthUser } = await handleOAuthCallback('google', 'code', state);
    expect(oauthUser.email).toBeNull();
  });

  it('Google: подтверждённый email берётся', async () => {
    stubProvider({ sub: 'g-2', email: 'ok@example.com', email_verified: true, name: 'G' });
    const { state } = buildOAuthUrl('google');
    const { oauthUser } = await handleOAuthCallback('google', 'code', state);
    expect(oauthUser.email).toBe('ok@example.com');
  });

  it('Twitch: email не используется, даже если прислан', async () => {
    stubProvider({ data: [{ id: 't-1', email: 'twitch@example.com', display_name: 'T' }] });
    const { state } = buildOAuthUrl('twitch');
    const { oauthUser } = await handleOAuthCallback('twitch', 'code', state);
    expect(oauthUser.email).toBeNull();
  });

  it('вход по email провайдера не привязывается к непроверенному аккаунту', async () => {
    await createUser({ email: 'victim@example.com', email_verified: false });
    await expect(
      findOrCreateOAuthUser('google', { id: 'g-3', email: 'victim@example.com', name: null, avatar: null }),
    ).rejects.toThrow('непроверенным');
  });

  it('вход по email провайдера привязывается к проверенному аккаунту', async () => {
    const { user } = await createUser({ email: 'owner@example.com', email_verified: true });
    const res = await findOrCreateOAuthUser('google', { id: 'g-4', email: 'owner@example.com', name: null, avatar: null });
    expect(res.user.id).toBe(user.id);
  });
});
