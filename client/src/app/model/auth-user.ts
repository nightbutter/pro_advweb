export type Role = 'admin' | 'rider' | 'customer';

export interface AuthUser {
  userId: number;
  username: string;
  role: Role;
  riderId: number | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
