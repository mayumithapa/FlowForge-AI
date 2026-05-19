import { useAuthStore } from '@/stores/auth';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

interface RequestOptions extends RequestInit {
  json?: unknown;
  auth?: boolean;
}

class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { json, auth = true, headers, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  };
  if (json !== undefined) init.body = JSON.stringify(json);

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) (init.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}/api${path}`, init);
  if (res.status === 401 && auth) {
    const refreshed = await useAuthStore.getState().refresh().catch(() => false);
    if (refreshed) return request<T>(path, opts);
    useAuthStore.getState().logout();
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message ?? res.statusText;
    throw new ApiError(res.status, body, Array.isArray(msg) ? msg.join('; ') : String(msg));
  }
  return body as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, json?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', json }),
  patch: <T>(path: string, json?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PATCH', json }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
};

export { ApiError };
