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

type Purpose = 'register' | 'reset'

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
    title:    { register: 'Подтверждение почты',  reset: 'Сброс пароля' },
    subtitle: {
      register: 'Введи этот код на сайте Bloomly, чтобы завершить регистрацию.',
      reset:    'Введи этот код для сброса пароля.',
    },
    subject:  { register: '🌸 Код подтверждения Bloomly', reset: '🔑 Сброс пароля Bloomly' },
    codeLabel: 'Код подтверждения',
    validity:  'Действует 15 минут',
    ignore:    'Если это не ты — просто проигнорируй письмо.',
  },

  en: {
    title:    { register: 'Confirm your email', reset: 'Reset your password' },
    subtitle: {
      register: 'Enter this code on Bloomly to finish signing up.',
      reset:    'Enter this code to reset your password.',
    },
    subject:  { register: '🌸 Your Bloomly verification code', reset: '🔑 Reset your Bloomly password' },
    codeLabel: 'Verification code',
    validity:  'Valid for 15 minutes',
    ignore:    "If this wasn't you, just ignore this email.",
  },

  uk: {
    title:    { register: 'Підтвердження пошти', reset: 'Скидання пароля' },
    subtitle: {
      register: 'Введи цей код на сайті Bloomly, щоб завершити реєстрацію.',
      reset:    'Введи цей код, щоб скинути пароль.',
    },
    subject:  { register: '🌸 Код підтвердження Bloomly', reset: '🔑 Скидання пароля Bloomly' },
    codeLabel: 'Код підтвердження',
    validity:  'Дійсний 15 хвилин',
    ignore:    'Якщо це не ти — просто проігноруй цей лист.',
  },

  de: {
    title:    { register: 'E-Mail bestätigen', reset: 'Passwort zurücksetzen' },
    subtitle: {
      register: 'Gib diesen Code auf Bloomly ein, um die Registrierung abzuschließen.',
      reset:    'Gib diesen Code ein, um dein Passwort zurückzusetzen.',
    },
    subject:  { register: '🌸 Dein Bloomly-Bestätigungscode', reset: '🔑 Bloomly-Passwort zurücksetzen' },
    codeLabel: 'Bestätigungscode',
    validity:  '15 Minuten gültig',
    ignore:    'Wenn du das nicht warst, ignoriere diese E-Mail einfach.',
  },

  es: {
    title:    { register: 'Confirma tu correo', reset: 'Restablece tu contraseña' },
    subtitle: {
      register: 'Introduce este código en Bloomly para completar el registro.',
      reset:    'Introduce este código para restablecer tu contraseña.',
    },
    subject:  { register: '🌸 Tu código de verificación de Bloomly', reset: '🔑 Restablece tu contraseña de Bloomly' },
    codeLabel: 'Código de verificación',
    validity:  'Válido durante 15 minutos',
    ignore:    'Si no fuiste tú, simplemente ignora este correo.',
  },

  fr: {
    title:    { register: 'Confirme ton e-mail', reset: 'Réinitialise ton mot de passe' },
    subtitle: {
      register: 'Saisis ce code sur Bloomly pour terminer ton inscription.',
      reset:    'Saisis ce code pour réinitialiser ton mot de passe.',
    },
    subject:  { register: '🌸 Ton code de vérification Bloomly', reset: '🔑 Réinitialise ton mot de passe Bloomly' },
    codeLabel: 'Code de vérification',
    validity:  'Valable 15 minutes',
    ignore:    "Si ce n'était pas toi, ignore simplement cet e-mail.",
  },

  pl: {
    title:    { register: 'Potwierdź e-mail', reset: 'Zresetuj hasło' },
    subtitle: {
      register: 'Wpisz ten kod na Bloomly, aby dokończyć rejestrację.',
      reset:    'Wpisz ten kod, aby zresetować hasło.',
    },
    subject:  { register: '🌸 Twój kod weryfikacyjny Bloomly', reset: '🔑 Zresetuj hasło Bloomly' },
    codeLabel: 'Kod weryfikacyjny',
    validity:  'Ważny przez 15 minut',
    ignore:    'Jeśli to nie ty — po prostu zignoruj tę wiadomość.',
  },

  pt: {
    title:    { register: 'Confirme seu e-mail', reset: 'Redefina sua senha' },
    subtitle: {
      register: 'Digite este código no Bloomly para concluir o cadastro.',
      reset:    'Digite este código para redefinir sua senha.',
    },
    subject:  { register: '🌸 Seu código de verificação do Bloomly', reset: '🔑 Redefina sua senha do Bloomly' },
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
  const t       = TRANSLATIONS[lang]
  const title   = t.title[purpose]
  const subtitle = t.subtitle[purpose]
  const digits  = code.split('')
  const isReset = purpose === 'reset'

  // Icon SVG: lock for reset, sparkle for register
  const icon = isReset
    ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="14" height="10" rx="2" fill="white" fill-opacity=".9"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.5" fill="#a855f7"/></svg>`
    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" fill="white" fill-opacity=".9"/><path d="M19 15l.9 2.6L22 18.5l-2.1.9L19 22l-.9-2.6L16 18.5l2.1-.9L19 15z" fill="white" fill-opacity=".6"/></svg>`

  const accentGrad   = isReset
    ? 'linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa)'
    : 'linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)'
  const glowColor    = isReset ? 'rgba(99,102,241,.35)' : 'rgba(168,85,247,.35)'
  const borderColor  = isReset ? 'rgba(99,102,241,.25)' : 'rgba(168,85,247,.25)'

  const digitBoxes = digits.map(d =>
    `<td style="padding:0 4px"><div style="
      display:inline-block;
      width:44px;height:56px;
      line-height:56px;
      text-align:center;
      background:rgba(255,255,255,.06);
      border:1.5px solid ${borderColor};
      border-radius:10px;
      color:#fff;
      font-size:28px;
      font-weight:800;
      font-family:'Courier New',monospace;
      letter-spacing:0;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 2px 8px rgba(0,0,0,.3);
    ">${d}</div></td>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a12;min-height:100vh;padding:48px 16px">
    <tr><td align="center" valign="top">

      <!-- Card -->
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#13131f;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,.06);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 32px 64px rgba(0,0,0,.6),0 0 80px ${glowColor}">

        <!-- Hero -->
        <tr>
          <td style="background:${accentGrad};padding:0;position:relative;overflow:hidden">
            <!-- Noise overlay -->
            <div style="position:absolute;inset:0;background:url('https://bloomly.fun/noise.png') repeat;opacity:.04;pointer-events:none"></div>
            <!-- Glow blobs -->
            <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;background:radial-gradient(circle,rgba(255,255,255,.15) 0%,transparent 70%);pointer-events:none"></div>
            <div style="position:absolute;bottom:-60px;left:-20px;width:180px;height:180px;background:radial-gradient(circle,rgba(0,0,0,.2) 0%,transparent 70%);pointer-events:none"></div>

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:36px 40px 32px;text-align:center;position:relative">
                  <!-- Logo circle -->
                  <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:rgba(255,255,255,.15);border-radius:18px;margin-bottom:16px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);box-shadow:0 4px 16px rgba(0,0,0,.2)">
                    ${icon}
                  </div>
                  <div>
                    <img src="https://bloomly.fun/bloomly.png" height="20" alt="Bloomly" style="display:inline-block;vertical-align:middle;margin-right:6px;opacity:.9">
                    <span style="color:rgba(255,255,255,.8);font-size:13px;font-weight:600;letter-spacing:.3px;vertical-align:middle">bloomly.fun</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">

            <!-- Title -->
            <h1 style="margin:0 0 10px;color:#f0f0ff;font-size:26px;font-weight:800;letter-spacing:-.3px;line-height:1.2">${title}</h1>
            <p style="margin:0 0 32px;color:#7878a0;font-size:15px;line-height:1.65">${subtitle}</p>

            <!-- Code block -->
            <div style="background:linear-gradient(180deg,rgba(255,255,255,.04) 0%,rgba(255,255,255,.02) 100%);border:1px solid ${borderColor};border-radius:16px;padding:28px 20px;text-align:center;margin-bottom:28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 40px ${glowColor}">
              <p style="margin:0 0 16px;color:#5a5a7a;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:600">${t.codeLabel}</p>

              <!-- Individual digit boxes -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px">
                <tr>${digitBoxes}</tr>
              </table>

              <!-- Timer bar -->
              <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.05);border-radius:20px;padding:5px 12px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><circle cx="12" cy="12" r="9" stroke="#7878a0" stroke-width="2"/><path d="M12 7v5l3 3" stroke="#7878a0" stroke-width="2" stroke-linecap="round"/></svg>
                <span style="color:#5a5a7a;font-size:12px;font-weight:500">${t.validity}</span>
              </div>
            </div>

            <!-- Warning note -->
            <div style="display:flex;align-items:flex-start;gap:10px;background:rgba(255,255,255,.03);border-radius:10px;padding:14px 16px;border:1px solid rgba(255,255,255,.05)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:1px"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#5a5a7a" stroke-width="1.5"/><path d="M12 8v4m0 4h.01" stroke="#5a5a7a" stroke-width="1.5" stroke-linecap="round"/></svg>
              <p style="margin:0;color:#5a5a7a;font-size:13px;line-height:1.5">${t.ignore}</p>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,.04);text-align:center">
            <p style="margin:0;color:#2e2e42;font-size:12px">
              © 2026 Bloomly &nbsp;·&nbsp;
              <a href="https://bloomly.fun" style="color:#5a3aed;text-decoration:none">bloomly.fun</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td></tr>
  </table>
</body>
</html>`
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @param to       recipient email
 * @param code     OTP code
 * @param purpose  'register' | 'reset'
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