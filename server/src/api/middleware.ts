import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Db } from '../db/index.js';
import { ApiError } from '../domain/errors.js';
import type { AppConfig } from '../config.js';
import { readSession, requireSessionCsrf } from '../auth/session.js';
import type { ApiRequest, AuthenticatedUser } from '../auth/types.js';

export function attachSession(db: Db, config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    (request as ApiRequest).authSession = readSession(db, config, request);
    next();
  };
}

export function requireTrustedOrigin(config: AppConfig): RequestHandler {
  return (request, _response, next) => {
    const origin = request.header('origin');
    if (!origin) return next();
    if (request.header('sec-fetch-site') === 'cross-site') {
      return next(new ApiError(403, 'origin_rejected', 'This request origin is not allowed.'));
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return next(new ApiError(403, 'origin_rejected', 'This request origin is not allowed.'));
    }
    if (url.origin !== config.webOrigin) {
      return next(new ApiError(403, 'origin_rejected', 'This request origin is not allowed.'));
    }
    next();
  };
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  try {
    requireSessionCsrf(request, (request as ApiRequest).authSession ?? null);
    next();
  } catch (error) {
    next(error);
  }
};

export function requireUser(db: Db): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const apiRequest = request as ApiRequest;
    const userId = apiRequest.authSession?.record.userId;
    if (!userId) return next(new ApiError(401, 'unauthenticated', 'Sign in to continue.'));
    const row = db.prepare(`SELECT id, email, display_name AS displayName, is_demo AS isDemo
      FROM users WHERE id = ? AND login_enabled = 1`).get(userId) as {
        id: string;
        email: string;
        displayName: string;
        isDemo: number;
      } | undefined;
    if (!row) return next(new ApiError(401, 'unauthenticated', 'Sign in to continue.'));
    const user: AuthenticatedUser = { ...row, isDemo: row.isDemo === 1 };
    apiRequest.authUser = user;
    next();
  };
}
