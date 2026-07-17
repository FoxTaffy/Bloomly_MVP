/**
 * Singleton WebSocket client — one connection shared app-wide (not per-screen),
 * so chat state (new messages, edits, deletes, read receipts) stays live no
 * matter which screen is open, and other devices logged into the same
 * account see updates without a manual refresh.
 */
import { useSession } from '../stores/session';
import { WS_URL } from './config';

type Handler = (msg: Record<string, unknown>) => void;

const handlers = new Map<string, Set<Handler>>();

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let destroyed = true;
let authed = false;

function send(data: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function stopTimers() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function scheduleReconnect() {
  if (destroyed || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSocket(); }, 5_000);
}

function connectSocket() {
  if (destroyed) return;
  const token = useSession.getState().token;
  if (!token) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    send({ type: 'auth', token: useSession.getState().token });
    pingTimer = setInterval(() => send({ type: 'ping' }), 25_000);
  };

  ws.onclose = () => {
    authed = false;
    stopTimers();
    handlers.get('_disconnected')?.forEach((fn) => { try { fn({ type: '_disconnected' }); } catch { /* ignore handler errors */ } });
    scheduleReconnect();
  };

  ws.onerror = () => {};

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;
      const type = msg.type as string | undefined;
      if (!type) return;
      if (type === 'auth_ok') authed = true;
      handlers.get(type)?.forEach((fn) => { try { fn(msg); } catch { /* ignore handler errors */ } });
      handlers.get('*')?.forEach((fn) => { try { fn(msg); } catch { /* ignore handler errors */ } });
    } catch { /* non-JSON frame */ }
  };
}

export const wsClient = {
  connect() { destroyed = false; connectSocket(); },

  disconnect() {
    destroyed = true;
    authed = false;
    stopTimers();
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      ws = null;
    }
  },

  isAuthed() { return authed; },

  send,

  on(type: string, fn: Handler): () => void {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(fn);
    return () => handlers.get(type)?.delete(fn);
  },
};
