/**
 * Brevo transactional email service for OTP codes and password resets.
 * Environment variables required:
 *   BREVO_API_KEY  – API key from brevo.com (Settings → SMTP & API → API Keys)
 *   EMAIL_FROM     – sender address, e.g. "Bloomly <noreply@bloomly.fun>"
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

function parseSender(from: string): { name: string; email: string } {
  const m = from.match(/^(.+?)\s*<(.+?)>$/)
  if (m) return { name: m[1].trim(), email: m[2].trim() }
  return { name: 'Bloomly', email: from.trim() }
}

// ── HTML шаблоны ──────────────────────────────────────────────────────────────

function otpHtml(code: string, purpose: 'register' | 'reset'): string {
  const title    = purpose === 'register' ? 'Подтверждение почты' : 'Сброс пароля'
  const subtitle = purpose === 'register'
    ? 'Введи этот код на сайте Bloomly, чтобы завершить регистрацию.'
    : 'Введи этот код для сброса пароля.'
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f18;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f18;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:16px;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,.4)">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#a855f7,#ec4899);padding:32px 40px;text-align:center;">
            <img src="https://bloomly.fun/bloomly.png" height="36" alt="Bloomly" style="display:block;margin:0 auto 8px">
            <p style="margin:0;color:rgba(255,255,255,.7);font-size:13px;letter-spacing:.5px">bloomly.fun</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px">
            <h1 style="margin:0 0 8px;color:#fff;font-size:24px;font-weight:700">${title}</h1>
            <p style="margin:0 0 28px;color:#a0a0c0;font-size:15px;line-height:1.6">${subtitle}</p>
            <div style="background:#0f0f18;border:1px solid rgba(168,85,247,.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <p style="margin:0 0 6px;color:#a0a0c0;font-size:12px;text-transform:uppercase;letter-spacing:1px">Код подтверждения</p>
              <p style="margin:0;color:#fff;font-size:40px;font-weight:800;letter-spacing:10px;font-variant-numeric:tabular-nums">${code}</p>
              <p style="margin:8px 0 0;color:#6b6b8a;font-size:12px">Действует 15 минут</p>
            </div>
            <p style="margin:0;color:#6b6b8a;font-size:13px;line-height:1.5">Если это не ты — просто проигнорируй письмо.</p>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid rgba(255,255,255,.05);padding:20px 40px;text-align:center">
            <p style="margin:0;color:#3d3d55;font-size:12px">© 2026 Bloomly · <a href="https://bloomly.fun" style="color:#7c3aed;text-decoration:none">bloomly.fun</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function sendOtpEmail(to: string, code: string, purpose: 'register' | 'reset') {
  const subjectMap = { register: '🌸 Код подтверждения Bloomly', reset: '🔑 Сброс пароля Bloomly' }

  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL][DEV] ${purpose} OTP for ${to}: ${code}`)
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
      subject: subjectMap[purpose],
      htmlContent: otpHtml(code, purpose),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[EMAIL] Brevo error:', res.status, body)
    throw new Error(`Email delivery failed: ${res.status}`)
  }
}
