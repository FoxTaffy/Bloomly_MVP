import { api } from './client';
import type { Conversation, Message } from '../types/api';

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await api.get('/messages/conversations');
  return res.data.data.conversations as Conversation[];
}

export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  const res = await api.get(`/messages/conversations/${conversationId}/messages`, {
    params: before ? { before } : undefined,
  });
  return res.data.data.messages as Message[];
}

export async function sendMessage(
  conversationId: string,
  body: { content: string; file_url?: string; media_type?: string; reply_to_id?: string },
): Promise<Message> {
  const res = await api.post(`/messages/conversations/${conversationId}/messages`, body);
  return res.data.data.message as Message;
}

export async function markConversationRead(conversationId: string) {
  await api.post(`/messages/conversations/${conversationId}/read`);
}

export async function getOrCreateConversation(userId: string): Promise<Conversation> {
  const res = await api.post('/messages/conversations', { userId });
  return res.data.data.conversation as Conversation;
}
