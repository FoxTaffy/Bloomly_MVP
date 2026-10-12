import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

describe('support: адрес для ответа', () => {
  beforeEach(resetDb);

  it('contact_email, который не является email, отклоняется', async () => {
    const { auth } = await createUser();
    const res = await api('POST', '/api/support/tickets', {
      headers: auth,
      body: { type: 'question', subject: 'Вопрос', message: 'Текст', contact_email: 'victim@x.com\r\nBcc: evil@x.com' },
    });
    expect(res.status).toBe(400);
    expect(await prisma.supportTicket.count()).toBe(0);
  });

  it('корректный contact_email сохраняется', async () => {
    const { auth } = await createUser();
    const res = await api('POST', '/api/support/tickets', {
      headers: auth,
      body: { type: 'question', subject: 'Вопрос', message: 'Текст', contact_email: 'reply@example.com' },
    });
    expect(res.status).toBe(201);
    expect(res.json.data.ticket.contact_email).toBe('reply@example.com');
  });
});
