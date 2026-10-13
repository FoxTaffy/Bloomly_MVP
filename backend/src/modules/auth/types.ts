export interface ConsentInput {
  personalData?: boolean;
  cookies?: boolean;
  marketingEmails?: boolean;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  consent?: ConsentInput;
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
