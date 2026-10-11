/**
 * Brevo transactional email service for OTP codes and password resets.
 * Multilingual (i18n) version — design preserved 1:1 from the original Russian template.
 *
 * Environment variables required:
 *   BREVO_API_KEY  – API key from brevo.com (Settings → SMTP & API → API Keys)
 *   EMAIL_FROM     – sender address, e.g. "Bloomly <noreply@bloomly.fun>"
 *
 * Adding a language: add one entry to the TRANSLATIONS map below and to the Lang union.
 * Tone is informal ("ты" / "du" / "tu" …) to match the original Bloomly voice.
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

type Purpose = 'register' | 'reset' | 'unfreeze' | 'change_email' | 'login_2fa' | 'enable_2fa_email'

// Supported locales. Add a code here and a matching block in TRANSLATIONS to enable a language.
type Lang = 'ru' | 'en' | 'uk' | 'de' | 'es' | 'fr' | 'pl' | 'pt'

const DEFAULT_LANG: Lang = 'ru'

interface Strings {
  title:    Record<Purpose, string>
  subtitle: Record<Purpose, string>
  subject:  Record<Purpose, string>
  codeLabel: string   // "Код подтверждения"
  validity:  string   // "Действует 15 минут"
  ignore:    string   // "Если это не ты — просто проигнорируй письмо."
}

// ── Translations ──────────────────────────────────────────────────────────────

const TRANSLATIONS: Record<Lang, Strings> = {
  ru: {
    title:    { register: 'Подтверждение почты',  reset: 'Сброс пароля', unfreeze: 'Разморозка аккаунта', change_email: 'Смена email', login_2fa: 'Вход в аккаунт', enable_2fa_email: 'Двухфакторная аутентификация' },
    subtitle: {
      register: 'Введи этот код на сайте Bloomly, чтобы завершить регистрацию.',
      reset:    'Введи этот код для сброса пароля.',
      unfreeze: 'Введи этот код на сайте Bloomly, чтобы разморозить аккаунт.',
      change_email: 'Введи этот код на сайте Bloomly, чтобы сменить почту аккаунта.',
      login_2fa: 'Введи этот код, чтобы подтвердить вход в аккаунт Bloomly.',
      enable_2fa_email: 'Введи этот код, чтобы включить вход по коду с почты.',
    },
    subject:  { register: '🌸 Код подтверждения Bloomly', reset: '🔑 Сброс пароля Bloomly', unfreeze: '❄️ Разморозка аккаунта Bloomly', change_email: '📧 Смена email Bloomly', login_2fa: '🔐 Код входа Bloomly', enable_2fa_email: '🛡️ Код для двухфакторной аутентификации Bloomly' },
    codeLabel: 'Код подтверждения',
    validity:  'Действует 15 минут',
    ignore:    'Если это не ты — просто проигнорируй письмо.',
  },

  en: {
    title:    { register: 'Confirm your email', reset: 'Reset your password', unfreeze: 'Unfreeze your account', change_email: 'Change your email', login_2fa: 'Confirm your login', enable_2fa_email: 'Two-factor authentication' },
    subtitle: {
      register: 'Enter this code on Bloomly to finish signing up.',
      reset:    'Enter this code to reset your password.',
      unfreeze: 'Enter this code on Bloomly to unfreeze your account.',
      change_email: 'Enter this code on Bloomly to change your account email.',
      login_2fa: 'Enter this code to confirm signing in to your Bloomly account.',
      enable_2fa_email: 'Enter this code to enable email-code sign-in.',
    },
    subject:  { register: '🌸 Your Bloomly verification code', reset: '🔑 Reset your Bloomly password', unfreeze: '❄️ Unfreeze your Bloomly account', change_email: '📧 Change your Bloomly email', login_2fa: '🔐 Your Bloomly login code', enable_2fa_email: '🛡️ Your Bloomly two-factor code' },
    codeLabel: 'Verification code',
    validity:  'Valid for 15 minutes',
    ignore:    "If this wasn't you, just ignore this email.",
  },

  uk: {
    title:    { register: 'Підтвердження пошти', reset: 'Скидання пароля', unfreeze: 'Розморозка акаунта', change_email: 'Зміна email', login_2fa: 'Вхід в акаунт', enable_2fa_email: 'Двофакторна автентифікація' },
    subtitle: {
      register: 'Введи цей код на сайті Bloomly, щоб завершити реєстрацію.',
      reset:    'Введи цей код, щоб скинути пароль.',
      unfreeze: 'Введи цей код на сайті Bloomly, щоб розморозити акаунт.',
      change_email: 'Введи цей код на сайті Bloomly, щоб змінити пошту акаунта.',
      login_2fa: 'Введи цей код, щоб підтвердити вхід в акаунт Bloomly.',
      enable_2fa_email: 'Введи цей код, щоб увімкнути вхід за кодом з пошти.',
    },
    subject:  { register: '🌸 Код підтвердження Bloomly', reset: '🔑 Скидання пароля Bloomly', unfreeze: '❄️ Розморозка акаунта Bloomly', change_email: '📧 Зміна email Bloomly', login_2fa: '🔐 Код входу Bloomly', enable_2fa_email: '🛡️ Код двофакторної автентифікації Bloomly' },
    codeLabel: 'Код підтвердження',
    validity:  'Дійсний 15 хвилин',
    ignore:    'Якщо це не ти — просто проігноруй цей лист.',
  },

  de: {
    title:    { register: 'E-Mail bestätigen', reset: 'Passwort zurücksetzen', unfreeze: 'Konto entsperren', change_email: 'E-Mail ändern', login_2fa: 'Anmeldung bestätigen', enable_2fa_email: 'Zwei-Faktor-Authentifizierung' },
    subtitle: {
      register: 'Gib diesen Code auf Bloomly ein, um die Registrierung abzuschließen.',
      reset:    'Gib diesen Code ein, um dein Passwort zurückzusetzen.',
      unfreeze: 'Gib diesen Code auf Bloomly ein, um dein Konto zu entsperren.',
      change_email: 'Gib diesen Code auf Bloomly ein, um die E-Mail deines Kontos zu ändern.',
      login_2fa: 'Gib diesen Code ein, um deine Anmeldung bei Bloomly zu bestätigen.',
      enable_2fa_email: 'Gib diesen Code ein, um die Anmeldung per E-Mail-Code zu aktivieren.',
    },
    subject:  { register: '🌸 Dein Bloomly-Bestätigungscode', reset: '🔑 Bloomly-Passwort zurücksetzen', unfreeze: '❄️ Bloomly-Konto entsperren', change_email: '📧 Bloomly-E-Mail ändern', login_2fa: '🔐 Dein Bloomly-Anmeldecode', enable_2fa_email: '🛡️ Dein Bloomly-Zwei-Faktor-Code' },
    codeLabel: 'Bestätigungscode',
    validity:  '15 Minuten gültig',
    ignore:    'Wenn du das nicht warst, ignoriere diese E-Mail einfach.',
  },

  es: {
    title:    { register: 'Confirma tu correo', reset: 'Restablece tu contraseña', unfreeze: 'Desbloquea tu cuenta', change_email: 'Cambia tu correo', login_2fa: 'Confirma tu inicio de sesión', enable_2fa_email: 'Autenticación de dos factores' },
    subtitle: {
      register: 'Introduce este código en Bloomly para completar el registro.',
      reset:    'Introduce este código para restablecer tu contraseña.',
      unfreeze: 'Introduce este código en Bloomly para desbloquear tu cuenta.',
      change_email: 'Introduce este código en Bloomly para cambiar el correo de tu cuenta.',
      login_2fa: 'Introduce este código para confirmar el inicio de sesión en tu cuenta Bloomly.',
      enable_2fa_email: 'Introduce este código para activar el inicio de sesión con código por correo.',
    },
    subject:  { register: '🌸 Tu código de verificación de Bloomly', reset: '🔑 Restablece tu contraseña de Bloomly', unfreeze: '❄️ Desbloquea tu cuenta de Bloomly', change_email: '📧 Cambia tu correo de Bloomly', login_2fa: '🔐 Tu código de inicio de sesión de Bloomly', enable_2fa_email: '🛡️ Tu código de doble factor de Bloomly' },
    codeLabel: 'Código de verificación',
    validity:  'Válido durante 15 minutos',
    ignore:    'Si no fuiste tú, simplemente ignora este correo.',
  },

  fr: {
    title:    { register: 'Confirme ton e-mail', reset: 'Réinitialise ton mot de passe', unfreeze: 'Débloque ton compte', change_email: 'Change ton e-mail', login_2fa: 'Confirme ta connexion', enable_2fa_email: 'Authentification à deux facteurs' },
    subtitle: {
      register: 'Saisis ce code sur Bloomly pour terminer ton inscription.',
      reset:    'Saisis ce code pour réinitialiser ton mot de passe.',
      unfreeze: 'Saisis ce code sur Bloomly pour débloquer ton compte.',
      change_email: 'Saisis ce code sur Bloomly pour changer l\'e-mail de ton compte.',
      login_2fa: 'Saisis ce code pour confirmer ta connexion à ton compte Bloomly.',
      enable_2fa_email: 'Saisis ce code pour activer la connexion par code e-mail.',
    },
    subject:  { register: '🌸 Ton code de vérification Bloomly', reset: '🔑 Réinitialise ton mot de passe Bloomly', unfreeze: '❄️ Débloque ton compte Bloomly', change_email: '📧 Change ton e-mail Bloomly', login_2fa: '🔐 Ton code de connexion Bloomly', enable_2fa_email: '🛡️ Ton code à deux facteurs Bloomly' },
    codeLabel: 'Code de vérification',
    validity:  'Valable 15 minutes',
    ignore:    "Si ce n'était pas toi, ignore simplement cet e-mail.",
  },

  pl: {
    title:    { register: 'Potwierdź e-mail', reset: 'Zresetuj hasło', unfreeze: 'Odblokuj konto', change_email: 'Zmień e-mail', login_2fa: 'Potwierdź logowanie', enable_2fa_email: 'Uwierzytelnianie dwuskładnikowe' },
    subtitle: {
      register: 'Wpisz ten kod na Bloomly, aby dokończyć rejestrację.',
      reset:    'Wpisz ten kod, aby zresetować hasło.',
      unfreeze: 'Wpisz ten kod na Bloomly, aby odblokować konto.',
      change_email: 'Wpisz ten kod na Bloomly, aby zmienić e-mail konta.',
      login_2fa: 'Wpisz ten kod, aby potwierdzić logowanie do konta Bloomly.',
      enable_2fa_email: 'Wpisz ten kod, aby włączyć logowanie kodem z e-maila.',
    },
    subject:  { register: '🌸 Twój kod weryfikacyjny Bloomly', reset: '🔑 Zresetuj hasło Bloomly', unfreeze: '❄️ Odblokuj konto Bloomly', change_email: '📧 Zmień e-mail Bloomly', login_2fa: '🔐 Twój kod logowania Bloomly', enable_2fa_email: '🛡️ Twój kod dwuskładnikowy Bloomly' },
    codeLabel: 'Kod weryfikacyjny',
    validity:  'Ważny przez 15 minut',
    ignore:    'Jeśli to nie ty — po prostu zignoruj tę wiadomość.',
  },

  pt: {
    title:    { register: 'Confirme seu e-mail', reset: 'Redefina sua senha', unfreeze: 'Desbloqueie sua conta', change_email: 'Altere seu e-mail', login_2fa: 'Confirme seu login', enable_2fa_email: 'Autenticação de dois fatores' },
    subtitle: {
      register: 'Digite este código no Bloomly para concluir o cadastro.',
      reset:    'Digite este código para redefinir sua senha.',
      unfreeze: 'Digite este código no Bloomly para desbloquear sua conta.',
      change_email: 'Digite este código no Bloomly para alterar o e-mail da sua conta.',
      login_2fa: 'Digite este código para confirmar o login na sua conta Bloomly.',
      enable_2fa_email: 'Digite este código para ativar o login por código no e-mail.',
    },
    subject:  { register: '🌸 Seu código de verificação do Bloomly', reset: '🔑 Redefina sua senha do Bloomly', unfreeze: '❄️ Desbloqueie sua conta Bloomly', change_email: '📧 Altere seu e-mail Bloomly', login_2fa: '🔐 Seu código de login Bloomly', enable_2fa_email: '🛡️ Seu código de dois fatores Bloomly' },
    codeLabel: 'Código de verificação',
    validity:  'Válido por 15 minutos',
    ignore:    'Se não foi você, basta ignorar este e-mail.',
  },
}

function resolveLang(lang?: string): Lang {
  if (lang && lang in TRANSLATIONS) return lang as Lang
  return DEFAULT_LANG
}

function parseSender(from: string): { name: string; email: string } {
  const m = from.match(/^(.+?)\s*<(.+?)>$/)
  if (m) return { name: m[1].trim(), email: m[2].trim() }
  return { name: 'Bloomly', email: from.trim() }
}

// ── HTML шаблон ──────────────────────────────────────────────────────────────

function otpHtml(code: string, purpose: Purpose, lang: Lang): string {
  const t        = TRANSLATIONS[lang]
  const title    = t.title[purpose]
  const subtitle = t.subtitle[purpose]
  const isReset      = purpose === 'reset'
  const isUnfreeze    = purpose === 'unfreeze'
  const isChangeEmail = purpose === 'change_email'
  const isTwoFactor   = purpose === 'login_2fa' || purpose === 'enable_2fa_email'

  const topGrad     = isUnfreeze
    ? 'linear-gradient(160deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)'
    : isReset
    ? 'linear-gradient(160deg,#4f46e5 0%,#7c3aed 60%,#9333ea 100%)'
    : isChangeEmail
    ? 'linear-gradient(160deg,#0d9488 0%,#14b8a6 55%,#5eead4 100%)'
    : isTwoFactor
    ? 'linear-gradient(160deg,#059669 0%,#10b981 55%,#34d399 100%)'
    : 'linear-gradient(160deg,#7c3aed 0%,#a855f7 55%,#ec4899 100%)'
  const borderClr   = isUnfreeze ? '#0ea5e9' : isReset ? '#4f46e5' : isChangeEmail ? '#0d9488' : isTwoFactor ? '#10b981' : '#9333ea'
  const emoji       = isUnfreeze ? '❄️' : isReset ? '🔑' : isChangeEmail ? '📧' : isTwoFactor ? '🔐' : '✉️'

  // Code is rendered as ONE text node (no per-digit <td>s) so selecting/copying
  // it on desktop mail clients yields a single clean string like "123456",
  // not a spaced-out/line-broken mess. Visual "digit boxes" look is done purely
  // via letter-spacing + a single bordered panel, not separate table cells.
  const digitCells = `<td style="padding:0">
    <div style="
      display:inline-block;
      background:#1e1e30;
      border:1px solid ${borderClr}55;
      border-top:2px solid ${borderClr}99;
      border-radius:10px;
      color:#ffffff;
      font-size:30px;
      font-weight:700;
      font-family:'Courier New',Courier,monospace;
      letter-spacing:12px;
      padding:14px 12px 14px 24px;
    ">${code}</div>
  </td>`

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0d0d1a;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d0d1a">
  <tr><td align="center" style="padding:48px 16px 48px">

    <table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">

      <!-- TOP GRADIENT BANNER -->
      <tr>
        <td style="background:${topGrad};border-radius:20px 20px 0 0;padding:36px 40px 32px;text-align:center;">
          <img src="https://bloomly.fun/bloomly.png" width="44" height="44" alt="Bloomly"
               style="display:block;margin:0 auto 12px;border-radius:12px;">
          <p style="margin:0;color:rgba(255,255,255,0.75);font-size:13px;font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;font-weight:600;">bloomly.fun</p>
        </td>
      </tr>

      <!-- CARD BODY -->
      <tr>
        <td style="background:#15152a;padding:36px 40px 28px;border-left:1px solid #ffffff0d;border-right:1px solid #ffffff0d;">

          <!-- emoji + title -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 4px;font-size:28px;line-height:1;">${emoji}</p>
                <h1 style="margin:0 0 10px;color:#f0f0ff;font-size:24px;font-weight:800;font-family:Arial,sans-serif;line-height:1.25;">${title}</h1>
                <p style="margin:0 0 32px;color:#8080a8;font-size:15px;font-family:Arial,sans-serif;line-height:1.6;">${subtitle}</p>
              </td>
            </tr>
          </table>

          <!-- CODE BLOCK -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background:#0d0d1a;border:1px solid ${borderClr}33;border-radius:14px;padding:24px 16px;">

                <p style="margin:0 0 14px;color:#5a5a7a;font-size:11px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:2.5px;font-weight:700;">${t.codeLabel}</p>

                <!-- digit row -->
                <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                  <tr>${digitCells}</tr>
                </table>

                <p style="margin:0;color:#4a4a6a;font-size:12px;font-family:Arial,sans-serif;">⏱ ${t.validity}</p>

              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- IGNORE NOTE -->
      <tr>
        <td style="background:#111126;padding:16px 40px;border-left:1px solid #ffffff0d;border-right:1px solid #ffffff0d;">
          <p style="margin:0;color:#4a4a6a;font-size:13px;font-family:Arial,sans-serif;line-height:1.5;">&#9432; ${t.ignore}</p>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td align="center" style="background:#0d0d1a;border-radius:0 0 20px 20px;padding:18px 40px;border:1px solid #ffffff08;border-top:0;">
          <p style="margin:0;color:#2e2e48;font-size:12px;font-family:Arial,sans-serif;">
            © 2026 Bloomly &nbsp;&middot;&nbsp;
            <a href="https://bloomly.fun" style="color:#7c3aed;text-decoration:none;">bloomly.fun</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param to       recipient email
 * @param code     OTP code
 * @param purpose  'register' | 'reset' | 'unfreeze' | 'change_email' | 'login_2fa' | 'enable_2fa_email'
 * @param lang     locale (defaults to 'ru'); unknown codes fall back to DEFAULT_LANG
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: Purpose,
  lang: string = DEFAULT_LANG,
) {
  const l = resolveLang(lang)
  const subject = TRANSLATIONS[l].subject[purpose]

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    // Код в логе — это готовый доступ к аккаунту, поэтому в production его не пишем.
    if (process.env.NODE_ENV === 'production') {
      console.error(`[EMAIL][NO_KEY] BREVO_API_KEY не задан, письмо (${purpose}) не отправлено`)
      return
    }
    console.log(`[EMAIL][NO_KEY] ${purpose} OTP for ${to} (${l}): ${code}`)
    return
  }

  const sender = parseSender(process.env.EMAIL_FROM ?? 'Bloomly <noreply@bloomly.fun>')

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: otpHtml(code, purpose, l),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[EMAIL] Brevo error:', res.status, body)
    throw new Error(`Email delivery failed: ${res.status}`)
  }
}