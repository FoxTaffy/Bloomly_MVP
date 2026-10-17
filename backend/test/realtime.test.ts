import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { api, createUser, getApp, resetDb, prisma } from './helpers.js';
import { messageSubscriptions } from '../src/modules/messages/service.js';
import { notificationService } from '../src/modules/notifications/service.js';

let wsUrl = '';

beforeAll(async () => {
  const app = await getApp();
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  wsUrl = address.replace(/^http/, 'ws') + '/api/';
});

afterAll(async () => {
  await (await getApp()).close();
});

// Opens a socket and returns helpers to send frames and await the next frame of a given type.
async function connect() {
  const ws = new WebSocket(wsUrl, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0' } });
  const inbox: any[] = [];
  const waiters: { type: string; resolve: (m: any) => void }[] = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const next = (type: string, timeoutMs = 2000) => new Promise<any>((resolve, reject) => {
    const i = inbox.findIndex((m) => m.type === type);
    if (i >= 0) return resolve(inbox.splice(i, 1)[0]);
    const timer = setTimeout(() => reject(new Error(`no "${type}" frame`)), timeoutMs);
    waiters.push({ type, resolve: (m) => { clearTimeout(timer); resolve(m); } });
  });
  const send = (msg: unknown) => ws.send(JSON.stringify(msg));
  const closed = () => new Promise((resolve) => { if (ws.readyState === WebSocket.CLOSED) resolve(null); else ws.once('close', resolve); });
  return { ws, send, next, inbox, closed };
}

async function onlineStatus(id: string) {
  const res = await api('GET', `/api/users/online?ids=${id}`);
  return { online: res.json.data[id] as boolean, device: res.json.deviceData[id] as string | null };
}

describe('realtime websocket', () => {
  beforeEach(resetDb);

  it('answers ping before auth and ignores authed-only frames', async () => {
    const c = await connect();
    c.send({ type: 'ping' });
    expect((await c.next('pong')).type).toBe('pong');

    c.send({ type: 'typing', conversationId: 'x' });
    c.send({ type: 'unknown_type' });
    c.ws.send('not json');
    c.send({ type: 'ping' });
    await c.next('pong');
    expect(c.inbox).toEqual([]);
    c.ws.close();
  });

  it('auth marks the user online with a device label, close marks them offline', async () => {
    const { user, token } = await createUser();
    expect((await onlineStatus(user.id)).online).toBe(false);

    const c = await connect();
    c.send({ type: 'auth', token });
    await c.next('auth_ok');

    const status = await onlineStatus(user.id);
    expect(status.online).toBe(true);
    expect(status.device).toBeTruthy();
    expect((await api('GET', '/api/auth/stats')).json.data.online).toBe(1);

    c.ws.close();
    await c.closed();
    await new Promise((r) => setTimeout(r, 50));
    expect((await onlineStatus(user.id)).online).toBe(false);
    expect((await api('GET', '/api/auth/stats')).json.data.online).toBe(0);
  });

  it('rejects a bad token and closes for a frozen account', async () => {
    const bad = await connect();
    bad.send({ type: 'auth', token: 'garbage' });
    await bad.next('auth_err');
    bad.ws.close();

    const { token } = await createUser({ frozen_at: new Date() });
    const frozen = await connect();
    frozen.send({ type: 'auth', token });
    await frozen.next('auth_err');
    await frozen.closed();
  });

  it('повторная авторизация не дублирует доставку сообщения', async () => {
    const user = await createUser();
    const c = await connect();
    for (let i = 0; i < 3; i++) {
      c.send({ type: 'auth', token: user.token });
      await c.next('auth_ok');
    }
    messageSubscriptions.push(user.user.id, { type: 'audit_probe' });
    await c.next('audit_probe');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(c.inbox.filter(message => message.type === 'audit_probe')).toHaveLength(0);
    c.ws.close(); await c.closed();
  });

  it('после заморозки открытый сокет прекращает доставку приватных данных', async () => {
    const user = await createUser(); const c = await connect();
    c.send({ type: 'auth', token: user.token }); await c.next('auth_ok');
    await prisma.user.update({ where: { id: user.user.id }, data: { frozen_at: new Date() } });
    messageSubscriptions.push(user.user.id, { type: 'private_probe' });
    await Promise.race([c.closed(), new Promise((_, reject) => setTimeout(() => reject(new Error('Frozen socket remained open')), 2000))]);
    expect(c.inbox.some(message => message.type === 'private_probe')).toBe(false);
  });

  it('сокет закрывается после истечения JWT', async () => {
    const user = await createUser(); const c = await connect();
    const token = (await getApp()).jwt.sign({ id: user.user.id, role: 'user' }, { expiresIn: '2s' });
    c.send({ type: 'auth', token }); await c.next('auth_ok');
    await Promise.race([c.closed(), new Promise((_, reject) => setTimeout(() => reject(new Error('Expired socket remained open')), 3000))]);
  });

  it('слишком большой кадр отсекается транспортом до JSON-разбора', async () => {
    const c = await connect();
    c.send({ type: 'ping', oversized: 'a'.repeat(128 * 1024) });
    await Promise.race([c.closed(), new Promise((_, reject) => setTimeout(() => reject(new Error('Oversized frame accepted')), 2000))]);
  });

  it('SSE прекращает доставку после заморозки аккаунта', async () => {
    const user = await createUser();
    const controller = new AbortController();
    const response = await fetch(wsUrl.replace(/^ws/, 'http') + `notifications/stream?token=${user.token}`, { signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    try {
      await reader.read();
      await prisma.user.update({ where: { id: user.user.id }, data: { frozen_at: new Date() } });
      notificationService.push(user.user.id, { type: 'private_probe' });
      const next = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Frozen SSE remained open')), 2000))]);
      expect(next.done).toBe(true);
    } finally { await reader.cancel().catch(() => {}); controller.abort(); }
  });
});
