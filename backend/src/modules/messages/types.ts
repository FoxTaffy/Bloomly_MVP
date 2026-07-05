export interface JwtUser {
  id: string;
  role: string;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  content: string;
  encrypted_text?: string | null;
  file_url?: string | null;
  media_type?: string;
  reply_to_id?: string | null;
  type?: 'payment_request' | 'tip';
  metadata?: Record<string, unknown> | null;
}

export interface GetMessagesQuery {
  before?: string; // cursor: createdAt ISO string
  limit?: number;
}

export interface GetConversationsQuery {
  archived?: boolean;
}

// Shapes broadcast over WebSocket
export interface WsIncomingMessage {
  type: 'message';
  conversationId: string;
  content: string;
}

export interface WsOutgoingMessage {
  type: 'new_message';
  data: {
    id: string;
    conversation_id: string;
    sender_id: string;
    text: string | null;
    type: string;
    file_url: string | null;
    created_at: string;
    sender: {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    };
  };
}
