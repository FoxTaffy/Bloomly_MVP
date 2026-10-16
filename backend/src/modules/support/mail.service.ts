import nodemailer, { Transporter } from 'nodemailer';
import { isBridgeHost } from './mailTransport.js';
import { logger } from '../../lib/logger.js';

let transporter: Transporter | null = null;
let configured = false;

function getTransporter(): Transporter | null {
  if (configured) return transporter;
  configured = true;

  const host = process.env.SUPPORT_SMTP_HOST;
  const user = process.env.SUPPORT_SMTP_USER;
  const pass = process.env.SUPPORT_SMTP_PASS;
  if (!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SUPPORT_SMTP_PORT) || 1025,
    secure: false, // Bridge negotiates STARTTLS on its local port, not implicit TLS
    auth: { user, pass },
    tls: { rejectUnauthorized: !isBridgeHost(host) },
  });
  return transporter;
}

export async function sendSupportEmail(
  to: string,
  subject: string,
  body: string,
  opts: { inReplyTo?: string; references?: string[] } = {},
): Promise<string | null> {
  const t = getTransporter();
  const from = process.env.SUPPORT_EMAIL_ADDRESS || 'bloomly_support@pm.me';

  if (!t) {
    logger.info(`[SUPPORT_MAIL][NO_CONFIG] to=${to} subject="${subject}"`);
    return null;
  }

  const info = await t.sendMail({
    from: `Bloomly Support <${from}>`,
    to,
    subject,
    text: body,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  });
  return info.messageId ?? null;
}
