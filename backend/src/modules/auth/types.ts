export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export interface JwtPayload {
  id: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface UserPublic {
  id: string;
  email: string;
  username: string;
  role: string;
  created_at: Date;
}
