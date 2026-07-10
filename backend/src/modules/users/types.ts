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
  fursona_gender: string | null;
  fursona_description: string | null;
  fursona_photo_url: string | null;
  has_fursuit: boolean;
  fursuit_photo_url: string | null;
  fursuit_description: string | null;
  fursuit_maker: string | null;
  birth_date: Date | null;
  birth_date_visibility: string;
  relationship_since: Date | null;
  pinned_post_id: string | null;
  social_links: Record<string, string> | null;
  interests: string[];
  created_at: Date;
  subscription_tier: string;
  profile_theme: string | null;
  profile_bg_url: string | null;
  profile_frame: string | null;
  is_verified: boolean;
  verified_at: Date | null;
  verification_type: string | null;
  artist_since: Date | null;
  donate_url: string | null;
  messages_privacy: string;
  comments_privacy: string;
  mentions_privacy: string;
  online_status_visibility: string;
  friends_list_visibility: string;
  profile_visibility: string;
}

export interface UpdateUserInput {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  status?: string;
  persona?: string;
  fursona_name?: string;
  fursona_gender?: string;
  fursona_description?: string;
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
  birth_date_visibility?: string;
  social_links?: Record<string, string> | null;
  interests?: string[];
  profile_theme?: string | null;
  profile_bg_url?: string | null;
  profile_frame?: string | null;
  artist_since?: string | null;
  relationship_since?: string | null;
  onboarding_done?: boolean;
  donate_url?: string | null;
  messages_privacy?: string;
  comments_privacy?: string;
  mentions_privacy?: string;
  online_status_visibility?: string;
  friends_list_visibility?: string;
  profile_visibility?: string;
}

export interface JwtPayload {
  id: string;
  role: string;
}

// ── Fursona ───────────────────────────────────────────────────────────────────

export interface UpsertFursonaInput {
  name?: string;
  species?: string[];
  colors?: string[];
  likes_dislikes_visible?: boolean;
  likes?: string[];
  dislikes?: string[];
  reference_image_url?: string | null;
  reference_is_nsfw?: boolean;
  reference_artist_name?: string | null;
  reference_artist_url?: string | null;
}

// ── Fursuit ───────────────────────────────────────────────────────────────────

export interface UpsertFursuitInput {
  image_url?: string | null;
  maker_id?: string | null;
  external_maker_links?: string[];
  description?: string | null;
  is_nsfw?: boolean;
}
