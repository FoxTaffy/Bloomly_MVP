import { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'crypto';
import { AuthService } from './service.js';
import { buildOAuthUrl, handleOAuthCallback, findOrCreateOAuthUser, OAuthProvider } from './oauth.service.js';
import { parseDeviceName, getClientIp } from './device.util.js';
import { hashToken, authUsers, sessions, oauthAccounts } from './session.service.js';
import { setMediaCookie, clearMediaCookie } from '../../lib/mediaCookie.js';
import { getSetting } from '../../lib/settings.js';
import { isAdult } from '../../lib/age.js';
import { createMfaToken, verifyMfaToken } from '../../lib/mfaToken.js';
import type { RegisterInput, LoginInput, JwtPayload } from './types.js';
import { isDevEnv } from '../../lib/env.js';
import { presence } from '../realtime/presence.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';

const authService = new AuthService();

// ── Grace-период для гонки конкурентных refresh-запросов ─────────────────────
// Несколько вкладок/параллельных запросов могут одновременно словить 401 и
// каждый попытаться обновить токен одним и тем же (ещё не отревокнутым на их
// стороне) refresh_token. Ротация мгновенно ревокает старый токен, поэтому
// второй запрос иначе получал бы "невалидный refresh token" и разлогинивал
// пользователя, хотя первый запрос ротацию уже успешно выполнил.
// Кэшируем результат ротации на несколько секунд и отдаём его повторно, если
// видим тот же (уже отревокнутый) hash снова в течение окна.
interface RotationReplay { token: string; refreshToken: string; user: any; storedAt: number }
const recentRotations = new Map<string, RotationReplay>();
const ROTATION_GRACE_MS = 15_000;

function pruneRotationReplays() {
  const now = Date.now();
  for (const [k, v] of recentRotations) {
    if (now - v.storedAt > ROTATION_GRACE_MS) recentRotations.delete(k);
  }
}

// Replay отдаёт токены только если сессия, выданная ротацией, всё ещё жива в БД. Иначе выход,
// смена пароля или отзыв устройства в течение 15 секунд не отзывали бы кэшированную пару.
async function validReplay(hash: string): Promise<RotationReplay | undefined> {
  pruneRotationReplays();
  const replay = recentRotations.get(hash);
  if (!replay) return undefined;
  if (!(await sessions.isAlive(hashToken(replay.refreshToken)))) {
    recentRotations.delete(hash);
    return undefined;
  }
  return replay;
}

function withIsAdult<T extends { birth_date: Date | null }>(user: T): Omit<T, 'birth_date'> & { is_adult: boolean } {
  const { birth_date, ...rest } = user;
  return { ...rest, is_adult: isAdult(birth_date) };
}

// ── 15-минутный access token ──────────────────────────────────────────────────
function issueAccessToken(request: FastifyRequest, id: string, role: string) {
  return request.server.jwt.sign({ id, role }, { expiresIn: '15m' });
}

// ── Мобильные клиенты (React Native): нет cookie jar между запусками,
// поэтому им дополнительно отдаём raw refresh token в теле JSON-ответа ────────
function isMobileClient(request: FastifyRequest): boolean {
  return request.headers['x-client'] === 'mobile';
}

// ── Выдача refresh token: запись в БД + httpOnly cookie ───────────────────────
// remember=true  → persistent 30-day cookie + 30-day DB token
// remember=false → session cookie (no maxAge) + 24-hour DB token
// Возвращает raw-токен, чтобы мобильные клиенты могли сохранить его сами
// (веб-клиент его игнорирует и полагается на httpOnly cookie как раньше).
// rotateSessionId: при обновлении access-токена та же физическая сессия должна
// оставаться одной строкой в БД (иначе список "устройства и сессии" плодит
// дубликаты одного и того же девайса каждые 15 минут). Передаётся только из
// refreshHandler; при логине/регистрации/OAuth — не передаётся, создаётся новая строка.
// expectedHash: при ротации (rotateSessionId передан) перезапись строки условная —
// проходит только если token_hash в БД всё ещё равен тому, что мы прочитали.
// Без этого два параллельных refresh-запроса (две вкладки, гонка сети) оба проходят
// первичную проверку валидности одной и той же ещё-не-отревокнутой записи и оба
// безусловно перезаписывают её новым hash — тот, кто запишет вторым, "стирает"
// ротацию первого, и cookie, отданный первому запросу, перестаёт совпадать с БД
// (это разлогинивало пользователя без явной причины). Возвращаем null, если проиграли
// гонку — вызывающий код обязан не выставлять cookie и обратиться к recentRotations.
async function issueRefreshToken(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  remember = false,
  rotateSessionId?: string,
  expectedHash?: string,
): Promise<string | null> {
  const raw = randomBytes(40).toString('hex');
  const ttlMs = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const userAgent = request.headers['user-agent'];
  const session = {
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
    remember,
    deviceName: parseDeviceName(userAgent),
    userAgent: userAgent ?? null,
    ipAddress: getClientIp(request) ?? null,
  };

  if (rotateSessionId) {
    if (!(await sessions.rotate(rotateSessionId, session, expectedHash))) return null; // lost the rotation race
  } else {
    await sessions.create(userId, session);
  }

  setRefreshCookie(reply, raw, remember);
  return raw;
}

// ── refresh_token cookie ──────────────────────────────────────────────────────
// remember → persistent 30-day cookie; otherwise a session cookie.
function setRefreshCookie(reply: FastifyReply, raw: string, remember: boolean) {
  reply.setCookie('refresh_token', raw, {
    httpOnly: true,
    secure:   !isDevEnv(),
    sameSite: 'strict',
    path:     '/api/auth',
    ...(remember ? { maxAge: 30 * 24 * 60 * 60 } : {}),
  });
  // Тот же срок жизни — у cookie для файлов по прямым ссылкам (см. lib/mediaCookie.ts)
  setMediaCookie(reply, raw, remember);
}

function readRefreshCookie(request: FastifyRequest): string | undefined {
  return request.cookies?.refresh_token;
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie('refresh_token', { path: '/api/auth' });
  clearMediaCookie(reply);
}

// ── Статистика ────────────────────────────────────────────────────────────────
export const statsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const online = presence.onlineCount()
  const { users, posts } = await authUsers.countUsersAndPosts()
  return reply.send({ success: true, data: { users, posts, online }, error: null })
}

// ── Текущий пользователь ──────────────────────────────────────────────────────
export const meHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = await authUsers.findFullById(request.user.id);
  if (!user) {
    return reply.code(401).send({ success: false, data: null, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  return reply.send({ success: true, data: { user: withIsAdult(user) }, error: null });
};

// ── Регистрация (Step 1) ───────────────────────────────────────────────────────
export const registerHandler = async (
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply,
) => {
  if (!(await getSetting('open_registration'))) {
    return reply.code(403).send({ success: false, data: null, error: { code: 'REGISTRATION_CLOSED', message: 'Регистрация временно закрыта' } });
  }
  try {
    const user = await authService.createUser(request.body);
    return reply.code(201).send({
      success: true,
      data: { user, message: 'Код подтверждения отправлен на почту' },
      error: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return reply.code(400).send({ success: false, data: null, error: { code: 'REGISTRATION_ERROR', message } });
  }
};

// ── Подтверждение email (Step 2) ──────────────────────────────────────────────
export const verifyEmailHandler = async (
  request: FastifyRequest<{ Body: { email: string; code: string; remember?: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    const { email, code, remember = false } = request.body;
    await authService.verifyEmail(email, code);

    const user = await authUsers.findFullByEmail(email);
    if (!user) return reply.code(400).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });

    const token = issueAccessToken(request, user.id, user.role);
    const refreshToken = await issueRefreshToken(request, reply, user.id, remember);
    return reply.send({
      success: true,
      data: { token, user: withIsAdult(user), ...(isMobileClient(request) ? { refreshToken } : {}) },
      error: null,
    });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'VERIFY_ERROR', message: errMessage(e) } });
  }
};

// ── Повторная отправка OTP ────────────────────────────────────────────────────
export const resendOtpHandler = async (
  request: FastifyRequest<{ Body: { email: string; purpose: 'register' | 'reset' | 'unfreeze' } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.resendOtp(request.body.email, request.body.purpose);
    return reply.send({ success: true, data: { message: 'Код отправлен повторно' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'RESEND_ERROR', message: errMessage(e) } });
  }
};

// ── Экспорт своих данных (доступно и забаненным/замороженным) ─────────────────
export const exportDataHandler = async (
  request: FastifyRequest<{ Body: { email: string; password: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { email, password } = request.body;
    const data = await authService.exportUserData(email, password);
    return reply.send({ success: true, data, error: null });
  } catch (e) {
    return reply.code(401).send({ success: false, data: null, error: { code: 'EXPORT_ERROR', message: errMessage(e) } });
  }
};

// ── Разморозка аккаунта по коду с почты ───────────────────────────────────────
export const requestUnfreezeHandler = async (
  request: FastifyRequest<{ Body: { email: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.requestUnfreeze(request.body.email);
    return reply.send({ success: true, data: { message: 'Если аккаунт заморожен, код отправлен на почту' }, error: null });
  } catch {
    return reply.code(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const confirmUnfreezeHandler = async (
  request: FastifyRequest<{ Body: { email: string; code: string; remember?: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    const { email, code, remember = false } = request.body;
    await authService.confirmUnfreeze(email, code);

    const user = await authUsers.findFullByEmail(email);
    if (!user) return reply.code(400).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });

    const token = issueAccessToken(request, user.id, user.role);
    const refreshToken = await issueRefreshToken(request, reply, user.id, remember);
    return reply.send({
      success: true,
      data: { token, user: withIsAdult(user), ...(isMobileClient(request) ? { refreshToken } : {}) },
      error: null,
    });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'UNFREEZE_ERROR', message: errMessage(e) } });
  }
};

// ── Вход ──────────────────────────────────────────────────────────────────────
export const loginHandler = async (
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply,
) => {
  try {
    const { email, password, remember = false } = request.body;
    const user = await authService.loginUser(email, password);

    if (!user) {
      return reply.code(401).send({
        success: false, data: null,
        error: { code: 'AUTH_FAILED', message: 'Неверный email или пароль' },
      });
    }

    if (user.deleted_at) {
      return reply.code(403).send({
        success: false, data: null,
        error: { code: 'ACCOUNT_BANNED', message: user.frozen_reason || 'Аккаунт заблокирован за нарушение правил' },
      });
    }

    if (user.frozen_at) {
      return reply.code(403).send({
        success: false, data: { email: user.email },
        error: { code: 'ACCOUNT_FROZEN', message: user.frozen_reason || 'Аккаунт временно заморожен' },
      });
    }

    if (!user.email_verified) {
      return reply.code(403).send({
        success: false, data: null,
        error: { code: 'EMAIL_NOT_VERIFIED', message: 'Подтвердите email перед входом' },
      });
    }

    if (user.two_factor_method) {
      if (user.two_factor_method === 'email') {
        await authService.resendLoginTwoFactor(user.id);
      }
      return reply.code(401).send({
        success: false,
        data: { method: user.two_factor_method, mfaToken: createMfaToken(user.id) },
        error: { code: 'TWO_FACTOR_REQUIRED', message: 'Требуется двухфакторная аутентификация' },
      });
    }

    const token = issueAccessToken(request, user.id, user.role);
    const refreshToken = await issueRefreshToken(request, reply, user.id, remember);
    const fullUser = await authUsers.findFullById(user.id);

    return reply.send({
      success: true,
      data: {
        token,
        user: fullUser ? withIsAdult(fullUser) : { id: user.id, username: user.username, email: user.email, role: user.role },
        ...(isMobileClient(request) ? { refreshToken } : {}),
      },
      error: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    // Блокировка аккаунта после серии неудачных попыток — 429, а не внутренняя ошибка
    if ((error as { statusCode?: number })?.statusCode === 429) {
      return reply.code(429).send({ success: false, data: null, error: { code: 'ACCOUNT_LOCKED', message } });
    }
    return reply.code(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message } });
  }
};

// ── Сброс пароля ──────────────────────────────────────────────────────────────
export const forgotPasswordHandler = async (
  request: FastifyRequest<{ Body: { email: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.requestPasswordReset(request.body.email);
    return reply.send({ success: true, data: { message: 'Если аккаунт существует, код отправлен' }, error: null });
  } catch {
    return reply.code(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const resetPasswordHandler = async (
  request: FastifyRequest<{ Body: { email: string; code: string; password: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.resetPassword(request.body.email, request.body.code, request.body.password);
    return reply.send({ success: true, data: { message: 'Пароль успешно изменён' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'RESET_ERROR', message: errMessage(e) } });
  }
};

// ── Смена пароля (требует JWT) ─────────────────────────────────────────────────
export const changePasswordHandler = async (
  request: FastifyRequest<{ Body: { currentPassword?: string; newPassword: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    const raw = readRefreshCookie(request);
    const currentTokenHash = raw ? hashToken(raw) : undefined;
    await authService.changePassword(id, request.body.currentPassword, request.body.newPassword, currentTokenHash);
    return reply.send({ success: true, data: { message: 'Пароль успешно изменён' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'CHANGE_PASSWORD_ERROR', message: errMessage(e) } });
  }
};

// ── Смена email (требует JWT) ──────────────────────────────────────────────────
export const requestEmailChangeHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    await authService.requestEmailChange(id);
    return reply.send({ success: true, data: { message: 'Код отправлен на текущую почту' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'REQUEST_EMAIL_CHANGE_ERROR', message: errMessage(e) } });
  }
};

export const confirmEmailChangeHandler = async (
  request: FastifyRequest<{ Body: { code: string; newEmail: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    const { code, newEmail } = request.body;
    const email = await authService.confirmEmailChange(id, code, newEmail);
    return reply.send({ success: true, data: { email }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'CONFIRM_EMAIL_CHANGE_ERROR', message: errMessage(e) } });
  }
};

// ── 2FA: подключение TOTP-приложения (требует JWT) ─────────────────────────────
export const totpSetupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.user as JwtPayload;
    const { secret, qrDataUrl } = await authService.setupTotp(id);
    return reply.send({ success: true, data: { secret, qrDataUrl }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'TOTP_SETUP_ERROR', message: errMessage(e) } });
  }
};

export const totpConfirmHandler = async (
  request: FastifyRequest<{ Body: { code: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    await authService.confirmTotp(id, request.body.code);
    return reply.send({ success: true, data: { message: 'Приложение-аутентификатор подключено' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'TOTP_CONFIRM_ERROR', message: errMessage(e) } });
  }
};

// ── 2FA: подключение кода на почту (требует JWT) ───────────────────────────────
export const email2faEnableHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { id } = request.user as JwtPayload;
    await authService.enableEmail2fa(id);
    return reply.send({ success: true, data: { message: 'Код отправлен на почту' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'ENABLE_2FA_EMAIL_ERROR', message: errMessage(e) } });
  }
};

export const email2faConfirmHandler = async (
  request: FastifyRequest<{ Body: { code: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    await authService.confirmEmail2fa(id, request.body.code);
    return reply.send({ success: true, data: { message: 'Вход по коду с почты включён' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'CONFIRM_2FA_EMAIL_ERROR', message: errMessage(e) } });
  }
};

// ── 2FA: отключение активного метода (требует JWT) ─────────────────────────────
export const disable2faHandler = async (
  request: FastifyRequest<{ Body: { password?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    await authService.disableTwoFactor(id, request.body.password);
    return reply.send({ success: true, data: { message: 'Двухфакторная аутентификация отключена' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'DISABLE_2FA_ERROR', message: errMessage(e) } });
  }
};

// ── 2FA: второй шаг входа ────────────────────────────────────────────────────
// mfaToken подписан отдельным HMAC-секретом (см. lib/mfaToken.ts) и намеренно
// непроверяем через обычный request.jwtVerify()/authenticate — иначе он бы
// работал как полноценный access token и позволял обойти второй фактор.
export const loginVerify2faHandler = async (
  request: FastifyRequest<{ Body: { mfaToken: string; code: string; remember?: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    const { mfaToken, code, remember = false } = request.body;
    const userId = verifyMfaToken(mfaToken);
    if (!userId) {
      return reply.code(401).send({
        success: false, data: null,
        error: { code: 'MFA_TOKEN_INVALID', message: 'Сессия подтверждения истекла, войдите заново' },
      });
    }

    await authService.verifyLoginTwoFactor(userId, code);

    const user = await authUsers.findActiveById(userId);
    if (!user) throw new Error('Пользователь не найден');

    const token = issueAccessToken(request, user.id, user.role);
    const refreshToken = await issueRefreshToken(request, reply, user.id, remember);
    const fullUser = await authUsers.findFullById(user.id);

    return reply.send({
      success: true,
      data: {
        token,
        user: fullUser ? withIsAdult(fullUser) : { id: user.id, username: user.username, email: user.email, role: user.role },
        ...(isMobileClient(request) ? { refreshToken } : {}),
      },
      error: null,
    });
  } catch (e) {
    if (errStatus(e) === 429) return reply.code(429).send({ success: false, data: null, error: { code: 'ACCOUNT_LOCKED', message: errMessage(e) } });
    return reply.code(400).send({ success: false, data: null, error: { code: 'MFA_VERIFY_ERROR', message: errMessage(e) } });
  }
};

export const loginResend2faHandler = async (
  request: FastifyRequest<{ Body: { mfaToken: string } }>,
  reply: FastifyReply,
) => {
  try {
    const userId = verifyMfaToken(request.body.mfaToken);
    if (!userId) {
      return reply.code(401).send({
        success: false, data: null,
        error: { code: 'MFA_TOKEN_INVALID', message: 'Сессия подтверждения истекла, войдите заново' },
      });
    }
    await authService.resendLoginTwoFactor(userId);
    return reply.send({ success: true, data: { message: 'Код отправлен повторно' }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'MFA_RESEND_ERROR', message: errMessage(e) } });
  }
};

// ── OAuth: привязка state к браузеру ──────────────────────────────────────────
// Без этого любой мог начать OAuth у себя, вывести жертву на колбэк со своим code/state и
// залогинить её в свой аккаунт (login CSRF). State кладём в httpOnly-cookie браузера, который
// начал вход, и в колбэке требуем совпадения. SameSite=Lax нужен, чтобы cookie пришла на
// top-level редирект от провайдера.
const OAUTH_STATE_COOKIE = 'oauth_state';
function setOAuthStateCookie(reply: FastifyReply, state: string) {
  reply.setCookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure:   !isDevEnv(),
    sameSite: 'lax',
    path:     '/api/auth',
    maxAge:   10 * 60,
  });
}

// ── OAuth: редирект на провайдера ─────────────────────────────────────────────
export const oauthRedirectHandler = async (
  request: FastifyRequest<{ Params: { provider: string }; Querystring: { client?: string; redirect?: string } }>,
  reply: FastifyReply,
) => {
  const provider = request.params.provider as OAuthProvider;
  const validProviders: OAuthProvider[] = ['google', 'yandex', 'twitter', 'twitch'];
  if (!validProviders.includes(provider)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_PROVIDER', message: 'Unknown OAuth provider' } });
  }

  try {
    const client = request.query.client === 'mobile' ? 'mobile' : undefined;
    const { url, state } = buildOAuthUrl(provider, undefined, client, request.query.redirect);
    setOAuthStateCookie(reply, state);
    return reply.redirect(url, 302);
  } catch (e) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'OAUTH_ERROR', message: errMessage(e) } });
  }
};

// ── OAuth: callback от провайдера ─────────────────────────────────────────────
const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

export const oauthCallbackHandler = async (
  request: FastifyRequest<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>,
  reply: FastifyReply,
) => {
  const provider = request.params.provider as OAuthProvider;
  const { code, state, error } = request.query;

  if (error || !code || !state) {
    return reply.redirect(`${FRONTEND_URL()}/auth?error=oauth_denied`, 302);
  }
  const stateCookie = request.cookies?.[OAUTH_STATE_COOKIE];
  reply.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth' });
  if (!stateCookie || stateCookie !== state) {
    return reply.redirect(`${FRONTEND_URL()}/auth?error=oauth_denied`, 302);
  }

  try {
    const { oauthUser, linkUserId, client, mobileRedirect } = await handleOAuthCallback(provider, code, state);

    // ── РЕЖИМ ПРИВЯЗКИ (пользователь уже залогинен) ───────────────────────────
    if (linkUserId) {
      if ((await oauthAccounts.link(linkUserId, provider, oauthUser.id)) === 'taken') {
        return reply.redirect(`${FRONTEND_URL()}/settings/profile?section=sec-security&error=already_taken`, 302);
      }
      return reply.redirect(`${FRONTEND_URL()}/settings/profile?section=sec-security&linked=${provider}`, 302);
    }

    // ── ОБЫЧНЫЙ ВХОД / РЕГИСТРАЦИЯ ────────────────────────────────────────────
    const { user } = await findOrCreateOAuthUser(provider, oauthUser);

    // Забаненные/замороженные аккаунты не должны обходить модерацию, логинясь
    // через OAuth вместо email+пароля — loginHandler это проверяет, а этот путь
    // раньше нет, хотя findOrCreateOAuthUser ищет пользователя без фильтра по
    // deleted_at/frozen_at.
    if (user.deleted_at) {
      return reply.redirect(`${FRONTEND_URL()}/auth?error=account_banned`, 302);
    }
    if (user.frozen_at) {
      return reply.redirect(`${FRONTEND_URL()}/auth?error=account_frozen`, 302);
    }

    // Пользователь мог включить 2FA (TOTP/email), войдя через пароль, а затем
    // привязать OAuth-провайдер — без этой проверки "Войти через Google/Yandex"
    // полностью обходил второй фактор (findOrCreateOAuthUser находит существующий
    // аккаунт и по email, так что достаточно совпадения почты у провайдера).
    // Ведём себя так же, как loginHandler: не выдаём токены сразу, а отправляем
    // на фронтенд mfaToken, чтобы пользователь подтвердил второй фактор.
    if (user.two_factor_method) {
      if (user.two_factor_method === 'email') {
        await authService.resendLoginTwoFactor(user.id);
      }
      const mfaToken = createMfaToken(user.id);
      if (client === 'mobile') {
        const target = mobileRedirect ?? 'bloomly://auth/callback';
        return reply.redirect(`${target}?mfaToken=${mfaToken}&method=${user.two_factor_method}`, 302);
      }
      return reply.redirect(`${FRONTEND_URL()}/auth/callback#mfaToken=${mfaToken}&method=${user.two_factor_method}`, 302);
    }

    const token = issueAccessToken(request, user.id, user.role);
    // OAuth-вход не спрашивает "запомнить меня" — всегда выдаём persistent-сессию,
    // иначе вход через Google/Yandex/etc. живёт всего 24ч и разлогинивает раньше обычного
    const refreshToken = await issueRefreshToken(request, reply, user.id, true);
    if (client === 'mobile') {
      // Мобильное приложение не имеет cookie jar — отдаём токены через deep link.
      // В Expo Go это не bloomly://, а прокси-адрес (exp://...), который прислал сам клиент.
      const target = mobileRedirect ?? 'bloomly://auth/callback';
      return reply.redirect(`${target}?token=${token}&refreshToken=${refreshToken}`, 302);
    }
    // Токен во фрагменте: фрагмент не уходит на сервер и не попадает в access-лог nginx
    return reply.redirect(`${FRONTEND_URL()}/auth/callback#token=${token}`, 302);
  } catch (e) {
    logger.error({ err: e }, '[OAuth callback error]');
    return reply.redirect(`${FRONTEND_URL()}/auth?error=oauth_failed`, 302);
  }
};

// ── OAuth: начало привязки аккаунта (требует JWT) ─────────────────────────────
export const linkInitHandler = async (
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) => {
  const provider = request.params.provider as OAuthProvider;
  const validProviders: OAuthProvider[] = ['google', 'yandex', 'twitter', 'twitch'];
  if (!validProviders.includes(provider)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_PROVIDER', message: 'Unknown OAuth provider' } });
  }
  const { id } = request.user as JwtPayload;
  const { url, state } = buildOAuthUrl(provider, id);
  setOAuthStateCookie(reply, state);
  return reply.send({ success: true, data: { url }, error: null });
};

// ── Список привязанных OAuth-аккаунтов ────────────────────────────────────────
export const getLinkedAccountsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id } = request.user as JwtPayload;
  const accounts = await oauthAccounts.list(id);
  return reply.send({ success: true, data: { accounts }, error: null });
};

// ── Удаление привязки OAuth-провайдера ────────────────────────────────────────
export const unlinkAccountHandler = async (
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) => {
  const { id } = request.user as JwtPayload;
  const provider = request.params.provider;

  // Должен остаться хотя бы один способ входа
  if ((await oauthAccounts.unlink(id, provider)) === 'last_method') {
    return reply.code(400).send({
      success: false, data: null,
      error: { code: 'LAST_AUTH_METHOD', message: 'Нельзя отвязать единственный способ входа' },
    });
  }
  return reply.send({ success: true, data: null, error: null });
};

// ── Обновление access token по refresh token ──────────────────────────────────
// Веб-клиент шлёт токен через httpOnly cookie; мобильный (нет cookie jar между
// запусками) — через тело запроса, полученное при login/verify-email.
export const refreshHandler = async (
  request: FastifyRequest<{ Body?: { refreshToken?: string } }>,
  reply: FastifyReply,
) => {
  const raw = readRefreshCookie(request) ?? request.body?.refreshToken;
  if (!raw) {
    return reply.code(401).send({ success: false, data: null, error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token not provided' } });
  }

  const hash   = hashToken(raw);
  const record = await sessions.findByHash(hash);

  // Ротация обновляет строку сессии на месте (см. issueRefreshToken), поэтому
  // старый hash после неё уже ни на что не смотрит в БД — record будет null,
  // а не revoked:true. Проверяем replay-кэш в обоих случаях (null или revoked),
  // чтобы гоночный повторный запрос с тем же (уже отревокнутым/протухшим
  // хэшем) не разлогинивал пользователя, если параллельный запрос уже
  // провернул ротацию.
  if (!record || record.revoked) {
    const replay = await validReplay(hash);
    if (replay) {
      setRefreshCookie(reply, replay.refreshToken, !!record?.remember);
      return reply.send({
        success: true,
        data: { token: replay.token, user: replay.user, ...(isMobileClient(request) ? { refreshToken: replay.refreshToken } : {}) },
        error: null,
      });
    }
  }

  if (!record || record.revoked || record.expires_at < new Date()) {
    clearRefreshCookie(reply);
    return reply.code(401).send({ success: false, data: null, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid or expired' } });
  }

  const user = await authUsers.findFullById(record.user_id);
  if (!user) {
    clearRefreshCookie(reply);
    return reply.code(401).send({ success: false, data: null, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }

  const token = issueAccessToken(request, user.id, user.role);
  // Ротация: обновляем ту же строку сессии на месте (новый hash/expiry/device),
  // а не создаём новую — иначе список "устройства и сессии" плодил бы дубликат
  // одного и того же девайса на каждое обновление access-токена (каждые 15 мин).
  // remember сохраняем из старой записи — иначе persistent-сессия превращалась
  // бы в session-cookie на первом же обновлении токена.
  const refreshToken = await issueRefreshToken(request, reply, user.id, record.remember, record.id, hash);

  if (refreshToken === null) {
    // Проиграли гонку ротации — конкурентный запрос уже перезаписал эту строку
    // своим hash-ом. Он вот-вот (или уже) положит результат в recentRotations —
    // подождём его коротким поллингом вместо немедленного разлогина.
    for (let attempt = 0; attempt < 6 && !recentRotations.has(hash); attempt++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const replay = await validReplay(hash);
    if (replay) {
      setRefreshCookie(reply, replay.refreshToken, record.remember);
      return reply.send({
        success: true,
        data: { token: replay.token, user: replay.user, ...(isMobileClient(request) ? { refreshToken: replay.refreshToken } : {}) },
        error: null,
      });
    }
    clearRefreshCookie(reply);
    return reply.code(401).send({ success: false, data: null, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid or expired' } });
  }

  const publicUser = withIsAdult(user);

  pruneRotationReplays();
  recentRotations.set(hash, { token, refreshToken, user: publicUser, storedAt: Date.now() });

  return reply.send({
    success: true,
    data: { token, user: publicUser, ...(isMobileClient(request) ? { refreshToken } : {}) },
    error: null,
  });
};

// ── Выход (инвалидация только текущей сессии) ────────────────────────────────
// Инвалидирует ровно тот refresh token, что пришёл с запросом, а не все сессии
// пользователя — иначе логаут с одного устройства разлогинивал бы все остальные,
// что противоречит функционалу "устройства и сессии" (revoke one / revoke others).
export const logoutHandler = async (
  request: FastifyRequest<{ Body?: { refreshToken?: string } }>,
  reply: FastifyReply,
) => {
  const raw = readRefreshCookie(request) ?? request.body?.refreshToken;
  if (raw) {
    await sessions.revokeByHash(hashToken(raw));
  }
  clearRefreshCookie(reply);
  return reply.send({ success: true, data: null, error: null });
};

// ── Список активных сессий (устройств) ────────────────────────────────────────
export const listSessionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id } = request.user as JwtPayload;
  const raw = readRefreshCookie(request);
  const currentHash = raw ? hashToken(raw) : null;
  const active = await sessions.listActive(id);

  return reply.send({
    success: true,
    data: {
      sessions: active.map(({ token_hash, ...s }) => ({ ...s, current: token_hash === currentHash })),
    },
    error: null,
  });
};

// ── Завершение конкретной сессии (устройства) ─────────────────────────────────
export const revokeSessionHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const { id: userId } = request.user as JwtPayload;
  const { id: sessionId } = request.params;

  const revokedHash = await sessions.revokeOwn(userId, sessionId);
  if (!revokedHash) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Сессия не найдена' } });
  }

  const raw = readRefreshCookie(request);
  if (raw && hashToken(raw) === revokedHash) {
    clearRefreshCookie(reply);
  }

  return reply.send({ success: true, data: null, error: null });
};

// ── Завершение всех сессий, кроме текущей ─────────────────────────────────────
export const revokeOtherSessionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id: userId } = request.user as JwtPayload;
  const raw = readRefreshCookie(request);
  await sessions.revokeAllExcept(userId, raw ? hashToken(raw) : null);

  return reply.send({ success: true, data: null, error: null });
};

