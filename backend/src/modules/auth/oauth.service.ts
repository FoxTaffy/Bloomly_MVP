/**
 * OAuth 2.0 service (без сторонних OAuth-библиотек).
 * Поддерживаемые провайдеры: google, yandex, twitter, facebook, instagram, twitch
 *
 * Необходимые env-переменные (пример для Google):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET
 *   TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
 *   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
 *   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
 *   OAUTH_REDIRECT_BASE  – базовый URL callback'а, напр. https://bloomly.fun/api
 */

import { randomBytes, createHash } from 'crypto'
import prisma from '../../config/prisma.js'

export type OAuthProvider = 'google' | 'yandex' | 'twitter' | 'twitch'

// ── Конфиги провайдеров ───────────────────────────────────────────────────────

interface ProviderConfig {
  authUrl: string
  tokenUrl: string
  scopes: string
  clientId: () => string
  clientSecret: () => string
  /** Возвращает { id, email, name, avatar } из токена доступа */
  fetchUser: (accessToken: string, extraParams?: Record<string, string>) => Promise<OAuthUser>
  /** Некоторые провайдеры (Twitter) требуют PKCE */
  usePkce?: boolean
  /** Twitter/X требует Basic-авторизацию (client_id:client_secret) в заголовке token-запроса,
   *  иначе отдаёт "unauthorized_client: Missing valid authorization header" */
  useBasicAuth?: boolean
}

export interface OAuthUser {
  id: string
  email: string | null
  name: string | null
  avatar: string | null
}

const providers: Record<OAuthProvider, ProviderConfig> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'openid email profile',
    clientId:     () => process.env.GOOGLE_CLIENT_ID     ?? '',
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? '',
    async fetchUser(token) {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json() as any
      return { id: d.sub, email: d.email ?? null, name: d.name ?? null, avatar: d.picture ?? null }
    },
  },

  yandex: {
    authUrl: 'https://oauth.yandex.ru/authorize',
    tokenUrl: 'https://oauth.yandex.ru/token',
    scopes: 'login:email login:info login:avatar',
    clientId:     () => process.env.YANDEX_CLIENT_ID     ?? '',
    clientSecret: () => process.env.YANDEX_CLIENT_SECRET ?? '',
    async fetchUser(token) {
      const r = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { Authorization: `OAuth ${token}` },
      })
      const d = await r.json() as any
      const avatar = d.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${d.default_avatar_id}/islands-200`
        : null
      return { id: String(d.id), email: d.default_email ?? null, name: d.display_name ?? null, avatar }
    },
  },

  twitter: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: 'tweet.read users.read offline.access',
    clientId:     () => process.env.TWITTER_CLIENT_ID     ?? '',
    clientSecret: () => process.env.TWITTER_CLIENT_SECRET ?? '',
    usePkce: true,
    useBasicAuth: true,
    async fetchUser(token) {
      const r = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = (await r.json() as any).data
      return { id: d.id, email: null, name: d.name ?? null, avatar: d.profile_image_url ?? null }
    },
  },

  twitch: {
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    scopes: 'user:read:email',
    clientId:     () => process.env.TWITCH_CLIENT_ID     ?? '',
    clientSecret: () => process.env.TWITCH_CLIENT_SECRET ?? '',
    async fetchUser(token, extra) {
      const r = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': extra?.clientId ?? process.env.TWITCH_CLIENT_ID ?? '',
        },
      })
      const d = (await r.json() as any).data?.[0]
      return { id: d.id, email: d.email ?? null, name: d.display_name ?? null, avatar: d.profile_image_url ?? null }
    },
  },
}

// ── State + PKCE store (TTL 10 min) ──────────────────────────────────────────
interface StateEntry { provider: OAuthProvider; codeVerifier?: string; createdAt: number; linkUserId?: string; client?: 'mobile'; mobileRedirect?: string }

// Мобильный редирект уносит access/refresh токены в URL, поэтому принимаем только свою схему
// bloomly://. exp:// (Expo Go) разрешён только вне production. Хост не проверяем регэкспом:
// схема без ограничения хоста (exp://evil.example) раньше отдавала токены чужому серверу.
// Проверка в момент вызова, а не при загрузке модуля: dotenv в server.ts стартует позже импортов.
export function isAllowedMobileRedirect(url: string): boolean {
  if (/^bloomly:\/\//i.test(url)) return true
  return process.env.NODE_ENV !== 'production' && /^exp:\/\//i.test(url)
}
const stateStore = new Map<string, StateEntry>()

function pruneExpiredStates() {
  const now = Date.now()
  for (const [k, v] of stateStore) {
    if (now - v.createdAt > 10 * 60 * 1000) stateStore.delete(k)
  }
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function generatePkce() {
  const verifier  = base64urlEncode(randomBytes(32))
  const challenge = base64urlEncode(Buffer.from(createHash('sha256').update(verifier).digest()))
  return { verifier, challenge }
}

// ── Public API ────────────────────────────────────────────────────────────────

const REDIRECT_BASE = () => process.env.OAUTH_REDIRECT_BASE ?? 'http://localhost:8080/api'

/** Строим URL редиректа на провайдера, возвращаем его + state.
 *  Если передан `linkUserId` — это mode "привязать к существующему аккаунту". */
export function buildOAuthUrl(
  provider: OAuthProvider,
  linkUserId?: string,
  client?: 'mobile',
  mobileRedirect?: string,
): { url: string; state: string } {
  pruneExpiredStates()
  const cfg   = providers[provider]
  const state = base64urlEncode(randomBytes(16))
  const safeRedirect = mobileRedirect && isAllowedMobileRedirect(mobileRedirect) ? mobileRedirect : undefined
  const entry: StateEntry = {
    provider, createdAt: Date.now(),
    ...(linkUserId ? { linkUserId } : {}),
    ...(client ? { client } : {}),
    ...(safeRedirect ? { mobileRedirect: safeRedirect } : {}),
  }

  const params = new URLSearchParams({
    client_id:     cfg.clientId(),
    redirect_uri:  `${REDIRECT_BASE()}/auth/callback/${provider}`,
    response_type: 'code',
    scope:         cfg.scopes,
    state,
  })

  if (cfg.usePkce) {
    const { verifier, challenge } = generatePkce()
    entry.codeVerifier = verifier
    params.set('code_challenge',        challenge)
    params.set('code_challenge_method', 'S256')
  }

  stateStore.set(state, entry)
  return { url: `${cfg.authUrl}?${params}`, state }
}

/** Обрабатываем callback — возвращаем user данные + linkUserId (если это режим привязки) */
export async function handleOAuthCallback(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<{ oauthUser: OAuthUser; linkUserId?: string; client?: 'mobile'; mobileRedirect?: string }> {
  const entry = stateStore.get(state)
  if (!entry || entry.provider !== provider) throw new Error('Invalid OAuth state')
  const { linkUserId, client, mobileRedirect } = entry
  stateStore.delete(state)

  const cfg = providers[provider]

  // Обмен code → token
  const tokenParams: Record<string, string> = {
    grant_type:    'authorization_code',
    code,
    redirect_uri:  `${REDIRECT_BASE()}/auth/callback/${provider}`,
    client_id:     cfg.clientId(),
    client_secret: cfg.clientSecret(),
  }
  if (entry.codeVerifier) tokenParams.code_verifier = entry.codeVerifier

  const tokenHeaders: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  if (cfg.useBasicAuth) {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${cfg.clientId()}:${cfg.clientSecret()}`).toString('base64')}`
  }

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: tokenHeaders,
    body: new URLSearchParams(tokenParams),
  })
  const tokenData = await tokenRes.json() as any
  if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`)

  const oauthUser = await cfg.fetchUser(tokenData.access_token, { clientId: cfg.clientId() })
  return { oauthUser, linkUserId, client, mobileRedirect }
}

// ── Поиск / создание пользователя через OAuth ─────────────────────────────────

/** Найти или создать пользователя по OAuth-аккаунту.
 *  Возвращает { user, isNew } */
export async function findOrCreateOAuthUser(provider: OAuthProvider, oauthUser: OAuthUser) {
  // 1. Проверяем — есть ли уже привязанный OAuthAccount
  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_provider_id: { provider, provider_id: oauthUser.id } },
    include: { user: true },
  })
  if (existing) return { user: existing.user, isNew: false }

  // 2. Если у провайдера есть email — ищем по email
  if (oauthUser.email) {
    const byEmail = await prisma.user.findFirst({
      where: { email: oauthUser.email.toLowerCase(), deleted_at: null },
    })
    if (byEmail) {
      // Привязываем этот OAuth к существующему аккаунту
      await prisma.oAuthAccount.create({
        data: { user_id: byEmail.id, provider, provider_id: oauthUser.id },
      })
      return { user: byEmail, isNew: false }
    }
  }

  // 3. Создаём нового пользователя
  const baseUsername = (oauthUser.name ?? oauthUser.id)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 20)
  // Уникальность username
  let username = baseUsername || provider.slice(0, 6)
  let attempt  = 0
  while (await prisma.user.findUnique({ where: { username } })) {
    attempt++
    username = `${baseUsername}${attempt}`
  }

  const email = oauthUser.email?.toLowerCase() ?? `${oauthUser.id}@${provider}.oauth`

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        username,
        display_name: oauthUser.name,
        avatar_url:   oauthUser.avatar,
        email_verified: oauthUser.email != null, // email from provider — trusted
        likes:    [],
        dislikes: [],
      },
    })
    await tx.wallet.create({ data: { user_id: newUser.id } })
    await tx.oAuthAccount.create({
      data: { user_id: newUser.id, provider, provider_id: oauthUser.id },
    })
    return newUser
  })

  return { user, isNew: true }
}
