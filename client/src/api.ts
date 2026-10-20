import type { ApiFailureShape } from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

export async function refreshCsrf(): Promise<string> {
  csrfPromise = null;
  csrfToken = null;
  return getCsrfToken();
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (csrfPromise) return csrfPromise;
  csrfPromise = fetch('/api/auth/csrf', { headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) throw new ApiError('Could not start a secure session. Reload and try again.', response.status, 'csrf_unavailable');
      const payload = await response.json() as { csrfToken?: unknown };
      if (typeof payload.csrfToken !== 'string') throw new ApiError('Could not start a secure session. Reload and try again.', 500, 'csrf_unavailable');
      csrfToken = payload.csrfToken;
      return csrfToken;
    })
    .finally(() => { csrfPromise = null; });
  return csrfPromise;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', await getCsrfToken());

  let response: Response;
  try {
    response = await fetch(path, { ...init, method, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError('The service could not be reached. Check that the app is running and try again.', 0, 'network_error');
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const failure = payload as ApiFailureShape | null;
    throw new ApiError(
      failure?.error?.message ?? 'The request could not be completed.',
      response.status,
      failure?.error?.code ?? 'request_failed',
      failure?.error?.details,
    );
  }
  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
