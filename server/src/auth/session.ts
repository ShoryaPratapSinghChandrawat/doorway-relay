import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { parse as parseCookie, serialize } from 'cookie';
import type { Db } from '../db/index.js';
import { ApiError } from '../domain/errors.js';
import type { AppConfig } from '../config.js';

export const SESSION_COOKIE = 'doorway.sid';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionRecord {
  sessionHash: string;
  userId: string | null;
  csrfToken: string;
  expiresAt: string;
}

export interface SessionCookieData {
  id: string;
  record: SessionRecord;
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function signSessionId(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

function safeTextEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueSession(db: Db, config: AppConfig, userId: string | null, response: Response): SessionRecord {
  const id = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const record: SessionRecord = {
    sessionHash: digest(id),
    userId,
    csrfToken,
    expiresAt,
  };
  db.prepare(`INSERT INTO sessions (session_hash, user_id, csrf_token, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(record.sessionHash, userId, csrfToken, now.toISOString(), expiresAt);
  const value = `${id}.${signSessionId(id, config.sessionSecret)}`;
  response.setHeader('Set-Cookie', serialize(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }));
  return record;
}

export function readSession(db: Db, config: AppConfig, request: Request): SessionCookieData | null {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  let cookies: Record<string, string | undefined>;
  try {
    cookies = parseCookie(cookieHeader);
  } catch {
    return null;
  }
  const value = cookies[SESSION_COOKIE];
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!safeTextEqual(signature, signSessionId(id, config.sessionSecret))) return null;

  const sessionHash = digest(id);
  const row = db.prepare(`SELECT session_hash AS sessionHash, user_id AS userId,
    csrf_token AS csrfToken, expires_at AS expiresAt
    FROM sessions WHERE session_hash = ? AND expires_at > ?`)
    .get(sessionHash, new Date().toISOString()) as SessionRecord | undefined;
  if (!row) return null;
  return { id, record: row };
}

export function rotateSession(db: Db, config: AppConfig, existingHash: string | null, userId: string, response: Response): SessionRecord {
  const rotate = db.transaction(() => {
    if (existingHash) db.prepare('DELETE FROM sessions WHERE session_hash = ?').run(existingHash);
    return issueSession(db, config, userId, response);
  });
  return rotate();
}

export function clearSessionCookie(response: Response, config: AppConfig): void {
  response.setHeader('Set-Cookie', serialize(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: 0,
  }));
}

export function requireSessionCsrf(request: Request, session: SessionCookieData | null): void {
  if (!session) throw new ApiError(403, 'csrf_invalid', 'Refresh the page and try again.');
  const supplied = request.header('x-csrf-token') ?? '';
  if (!safeTextEqual(supplied, session.record.csrfToken)) {
    throw new ApiError(403, 'csrf_invalid', 'Refresh the page and try again.');
  }
}

export function createAnonymousSession(db: Db, config: AppConfig, response: Response): SessionRecord {
  return issueSession(db, config, null, response);
}

export function deleteSession(db: Db, session: SessionCookieData | null): void {
  if (session) db.prepare('DELETE FROM sessions WHERE session_hash = ?').run(session.record.sessionHash);
}
