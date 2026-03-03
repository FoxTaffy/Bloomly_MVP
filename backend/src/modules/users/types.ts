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
  has_fursuit: boolean;
  fursuit_photo_url: string | null;
  fursuit_description: string | null;
  fursuit_maker: string | null;
  birth_date: Date | null;
  relationship_since: Date | null;
  pinned_post_id: string | null;
  social_links: Record<string, string> | null;
  interests: string[];
  created_at: Date;
  subscription_tier: string;
  profile_theme: string | null;
  profile_bg_url: string | null;
  profile_frame: string | null;
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
  has_fursuit?: boolean;
  fursuit_photo_url?: string | null;
  fursuit_description?: string | null;
  fursuit_maker?: string | null;
  birth_date?: string | null;
  social_links?: Record<string, string> | null;
  interests?: string[];
  role?: string;
  profile_theme?: string | null;
  profile_bg_url?: string | null;
  profile_frame?: string | null;
}

export interface JwtPayload {
  id: string;
  role: string;
}
