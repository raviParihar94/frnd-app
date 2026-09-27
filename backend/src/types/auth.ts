export interface AccessTokenPayload {
  sub: string; // user id
  phone: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  phone: string;
}
