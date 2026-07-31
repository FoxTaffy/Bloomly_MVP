import { ImapFlow } from 'imapflow';
import { simpleParser, Attachment } from 'mailparser';
import { extname } from 'path';
import prisma from '../../config/prisma.js';
import { uploadRawToMinIO } from '../media/service.js';
import { isBridgeHost } from './mailTransport.js';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function uploadAttachments(attachments: Attachment[] = []): Promise<string[]> {
  const urls: string[] = [];
  for (const att of attachments.slice(0, MAX_ATTACHMENTS)) {
    if (!att.content || att.size > MAX_ATTACHMENT_BYTES) continue;
    const ext = (att.filename && extname(att.filename)) || EXT_BY_MIME[att.contentType] || '.bin';
    try {
      const url = await uploadRawToMinIO(att.content, ext, att.contentType || 'application/octet-stream', 'support');
      urls.push(url);
    } catch (err) {
      console.error('[SUPPORT_MAIL] Failed to upload attachment:', err);
    }
  }
  return urls;
}

function referencesOf(parsed: { inReplyTo?: string; references?: string | string[] }): string[] {
  const refs = new Set<string>();
  if (parsed.inReplyTo) refs.add(parsed.inReplyTo);
  if (Array.isArray(parsed.references)) parsed.references.forEach((r) => refs.add(r));
  else if (parsed.references) refs.add(parsed.references);
  return [...refs];
}

async function processUid(client: ImapFlow, uid: number) {
  const download = await client.download(String(uid), undefined, { uid: true });
  const parsed = await simpleParser(download.content);

  const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (!fromAddr) return;

  const messageId = parsed.messageId || null;
  const subject = (parsed.subject || '(без темы)').trim().slice(0, 150);
  const rawBody = parsed.text || (parsed.html ? stripHtml(parsed.html) : '');
  const body = (rawBody || '(пустое сообщение)').trim().slice(0, 5000);
  const attachmentUrls = await uploadAttachments(parsed.attachments);

  const refs = referencesOf(parsed);
  const existing = refs.length
    ? await prisma.supportTicketMessage.findFirst({
        where: { email_message_id: { in: refs } },
        select: { ticket_id: true },
      })
    : null;

  // A Message-ID isn't a secret — it can leak via a forward, a CC'd bystander, or just
  // reading the raw source of an email you received — and the `From` header on inbound
  // mail is trivially spoofable. Without checking the sender actually owns the thread,
  // anyone who obtains one of these IDs could inject messages into a stranger's support
  // ticket. Only treat it as a continuation if the sender matches who the ticket is with.
  const existingTicket = existing
    ? await prisma.supportTicket.findUnique({ where: { id: existing.ticket_id }, include: { user: { select: { email: true } } } })
    : null;
  const ownerEmail = existingTicket
    ? (existingTicket.external_email || existingTicket.user?.email || existingTicket.contact_email)?.toLowerCase()
    : null;

  if (existingTicket && ownerEmail && ownerEmail === fromAddr) {
    const ticket = existingTicket;
    await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: {
          ticket_id: ticket.id,
          sender_type: 'external',
          body,
          email_message_id: messageId,
          attachment_urls: attachmentUrls,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          email_message_id: messageId ?? ticket.email_message_id,
          // A reply from the user should surface the ticket again if it had been closed out.
          status: ticket.status === 'resolved' || ticket.status === 'closed' ? 'open' : ticket.status,
        },
      }),
    ]);
    return;
  }

  const linkedUser = await prisma.user.findUnique({ where: { email: fromAddr }, select: { id: true } });
  await prisma.supportTicket.create({
    data: {
      user_id: linkedUser?.id,
      type: 'question',
      subject,
      source: 'email',
      external_email: fromAddr,
      email_message_id: messageId,
      messages: {
        create: {
          sender_type: 'external',
          body,
          email_message_id: messageId,
          attachment_urls: attachmentUrls,
        },
      },
    },
  });
}

export async function pollSupportInbox(): Promise<void> {
  const host = process.env.SUPPORT_IMAP_HOST;
  const user = process.env.SUPPORT_IMAP_USER;
  const pass = process.env.SUPPORT_IMAP_PASS;
  if (!host || !user || !pass) return; // not configured yet

  const client = new ImapFlow({
    host,
    port: Number(process.env.SUPPORT_IMAP_PORT) || 1143,
    secure: true,
    tls: { rejectUnauthorized: !isBridgeHost(host) },
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids) return;
      for (const uid of uids) {
        try {
          await processUid(client, uid);
        } catch (err) {
          console.error('[SUPPORT_MAIL] Failed to process message uid', uid, err);
        }
        // Mark seen regardless of success — a message we can't parse would otherwise be retried forever.
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
