const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const TOKEN_KEY = 'cas_access_token';

let accessToken: string | null = localStorage.getItem(TOKEN_KEY);
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function doRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      setAccessToken(null);
      return null;
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

function tryRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Set false for endpoints where a 401 is an expected answer */
  skipAuthRetry?: boolean;
}

/** Fetch wrapper: attaches the access token, refreshes once on 401, throws ApiError. */
export function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  return fetchWithToken<T>(path, options, true);
}

async function fetchWithToken<T>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean
): Promise<T> {
  const { method = 'GET', body, headers, skipAuthRetry } = options;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && accessToken && !skipAuthRetry && allowRefresh) {
    const fresh = await tryRefresh();
    if (fresh) return fetchWithToken<T>(path, options, false);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data as { error?: string })?.error ?? 'ERROR',
      (data as { message?: string })?.message ?? `Request failed (${res.status})`,
      (data as { details?: unknown })?.details
    );
  }

  return data as T;
}
