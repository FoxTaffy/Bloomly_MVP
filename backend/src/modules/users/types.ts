export interface UserPublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  status: string | null;
  persona: string | null;
  likes: string[];
  dislikes: string[];
  accent_color: string | null;
  website: string | null;
  location: string | null;
  pronouns: string | null;
  badge_type: string | null;
  job_title: string | null;
  relationship_status: string | null;
  relationship_with: string | null;
  country: string | null;
  fursona_name: string | null;
  fursona_color: string | null;
  fursona_photo_url: string | null;
  birth_date: Date | null;
  relationship_since: Date | null;
  pinned_post_id: string | null;
  social_links: Record<string, string> | null;
  interests: string[];
  created_at: Date;
}

export interface UpdateUserInput {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  status?: string;
  persona?: string;
  fursona_name?: string;
  likes?: string[];
  dislikes?: string[];
  accent_color?: string;
  website?: string;
  location?: string;
  pronouns?: string;
  job_title?: string;
  relationship_status?: string;
  relationship_with?: string | null;
  country?: string;
  fursona_color?: string;
  fursona_photo_url?: string;
  birth_date?: string | null;
  social_links?: Record<string, string> | null;
  interests?: string[];
  role?: string;
}

export interface JwtPayload {
  id: string;
  role: string;
}
