import { describe, it, expect, afterEach } from 'vitest';
import { senderAuthenticated } from '../src/modules/support/mailPoller.js';

describe('support mail: доверие к отправителю', () => {
  const env = process.env.MAIL_AUTHSERV_ID;
  afterEach(() => {
    if (env === undefined) delete process.env.MAIL_AUTHSERV_ID;
    else process.env.MAIL_AUTHSERV_ID = env;
  });

  it('без MAIL_AUTHSERV_ID всё входящее непроверенное', () => {
    delete process.env.MAIL_AUTHSERV_ID;
    expect(senderAuthenticated('mx.bloomly.fun; dkim=pass header.d=example.com', 'user@example.com')).toBe(false);
  });

  it('dkim=pass от нашего сервера и совпадающий домен — доверяем', () => {
    process.env.MAIL_AUTHSERV_ID = 'mx.bloomly.fun';
    expect(senderAuthenticated('mx.bloomly.fun; dkim=pass header.d=example.com', 'user@example.com')).toBe(true);
    expect(senderAuthenticated('mx.bloomly.fun; dkim=pass header.d=example.com', 'user@mail.example.com')).toBe(true);
  });

  it('заголовок, подставленный отправителем (чужой authserv-id), не принимается', () => {
    process.env.MAIL_AUTHSERV_ID = 'mx.bloomly.fun';
    expect(senderAuthenticated('evil.example; dkim=pass header.d=example.com', 'user@example.com')).toBe(false);
  });

  it('провал DKIM или чужой домен подписи — не принимаем', () => {
    process.env.MAIL_AUTHSERV_ID = 'mx.bloomly.fun';
    expect(senderAuthenticated('mx.bloomly.fun; dkim=fail header.d=example.com', 'user@example.com')).toBe(false);
    expect(senderAuthenticated('mx.bloomly.fun; dkim=pass header.d=other.org', 'user@example.com')).toBe(false);
    expect(senderAuthenticated(undefined, 'user@example.com')).toBe(false);
  });
});
