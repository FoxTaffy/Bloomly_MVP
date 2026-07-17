import { useEffect, useRef, useState, useCallback } from 'react';
import { wsClient } from '../lib/wsClient';
import type { Message } from '../types/api';

export function useChatSocket(conversationId: string, onMessage: (msg: Message) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [connected, setConnected] = useState(wsClient.isAuthed());

  useEffect(() => {
    setConnected(wsClient.isAuthed());
    const offAuthOk = wsClient.on('auth_ok', () => setConnected(true));
    const offDisconnected = wsClient.on('_disconnected', () => setConnected(false));
    const offNewMsg = wsClient.on('new_message', (msg) => {
      const data = msg.data as Message | undefined;
      if (data?.conversation_id === conversationId) onMessageRef.current(data);
    });
    return () => {
      offAuthOk();
      offDisconnected();
      offNewMsg();
    };
  }, [conversationId]);

  const sendTyping = useCallback(() => {
    wsClient.send({ type: 'typing', conversationId });
  }, [conversationId]);

  return { connected, sendTyping };
}
