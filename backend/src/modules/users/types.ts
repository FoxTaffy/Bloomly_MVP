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
  created_at: Date;
}

export interface UpdateUserInput {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  status?: string;
  persona?: string;
  likes?: string[];
  dislikes?: string[];
  accent_color?: string;
}

export interface JwtPayload {
  id: string;
  role: string;
}
