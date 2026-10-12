export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_video_url: string | null;
  bio: string | null;
  status: string | null;
  is_verified: boolean;
  verification_type: string | null;
  badge_type: string | null;
  email_verified: boolean;
  onboarding_done: boolean;
}

export interface PostAuthor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  verification_type: string | null;
  role?: string;
}

export interface Post {
  id: string;
  content: string | null;
  author_id: string;
  rating: number;
  is_nsfw: boolean;
  is_announcement: boolean;
  subscriber_only: boolean;
  created_at: string;
  updated_at: string;
  category: string | null;
  title: string | null;
  post_type: string;
  media_urls: string[];
  media_original_urls: string[];
  author: PostAuthor | null;
  rewardForUser: PostAuthor | null;
  tags: { tag: { id: string; name: string } }[];
  _count: { votes: number; repaws: number; comments: number };
  my_vote?: -1 | 0 | 1;
  groupPosts?: { group: { id: string; slug: string; name: string; avatar_url: string | null; accent_color: string | null } }[];
}

export interface Story {
  id: string;
  user_id: string;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  expires_at: string;
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null };
  score: number;
  my_vote: -1 | 0 | 1;
  view_count: number;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_video_url: string | null;
  banner_url: string | null;
  pronouns: string | null;
  fursona_name: string | null;
  fursona_color: string | null;
  fursona_description: string | null;
  interests: string[];
  is_verified: boolean;
  verification_type: string | null;
  badge_type: string | null;
  badge_level?: string | null;
  _count: { followers: number; following: number; posts: number };
  is_private?: boolean;
  is_following?: boolean;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  unread_count: number;
  last_message: Message | null;
  participants: { id: string; username: string; display_name: string | null; avatar_url: string | null }[];
  pinned?: boolean;
  archived?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  encrypted_text: string | null;
  type: 'text' | 'voice' | 'audio' | 'sticker' | 'payment_request' | 'payment_confirmation' | 'tip';
  file_url: string | null;
  reactions: Record<string, string[]> | null;
  reply_to_id: string | null;
  created_at: string;
  sender?: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}

export interface Group {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  member_count: number;
  description: string | null;
}

export interface GroupEvent {
  id: string;
  group_id: string;
  title: string;
  short_code: string;
  description: string | null;
  banner_url: string | null;
  location_name: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  attendee_count: number;
  is_top: boolean;
  group?: Group;
}

export interface EventAttendee {
  event_id: string;
  user_id: string;
  status: 'going' | 'maybe' | 'not_going';
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null };
}

export interface AppNotification {
  id: string;
  receiver_id: string;
  sender_id: string | null;
  type: string;
  post_id: string | null;
  comment_id: string | null;
  ref_id: string | null;
  read: boolean;
  created_at: string;
  meta: Record<string, unknown> | null;
  sender: { id: string; username: string; display_name: string | null; avatar_url: string | null; badge_type: string | null } | null;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  verification_type: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author: PostAuthor | null;
  group: { id: string; slug: string; name: string; avatar_url: string | null } | null;
  _count: { replies: number };
  replies?: Comment[];
}
