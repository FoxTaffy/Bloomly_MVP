import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_URL } from '../lib/config';
import { useSession } from '../stores/session';
import type { Message } from '../types/api';

export function useChatSocket(conversationId: string, onMessage: (msg: Message) => void) {
  const token = useSession((s) => s.token);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'auth_ok') setConnected(true);
        if (data.type === 'new_message' && data.data?.conversation_id === conversationId) {
          onMessageRef.current(data.data as Message);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
    };
  }, [token, conversationId]);

  const sendTyping = useCallback(() => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'typing', conversationId }));
  }, [conversationId]);

  return { connected, sendTyping };
}
