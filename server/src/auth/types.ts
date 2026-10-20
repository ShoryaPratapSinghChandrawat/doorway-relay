import type { Request } from 'express';
import type { SessionCookieData } from './session.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  isDemo: boolean;
}

export interface ApiRequest extends Request {
  authSession?: SessionCookieData | null;
  authUser?: AuthenticatedUser;
}
