export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  cachedCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  // If body is an object or string and not FormData, ensure Content-Type is json
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Inject CSRF token for mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && cachedCsrfToken) {
    headers['x-csrf-token'] = cachedCsrfToken;
  }

  try {
    const res = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      signal: controller.signal,
      headers,
    });

    // Check if new CSRF token is provided in response headers or body
    const respCsrf = res.headers.get('x-csrf-token');
    if (respCsrf) {
      setCsrfToken(respCsrf);
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        body.code ?? (res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED'),
        body.message ?? (res.status === 403 ? 'Access denied' : 'Request failed'),
        body.details
      );
    }

    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    const data = await res.json();
    if (data && typeof data === 'object' && 'csrfToken' in data && typeof data.csrfToken === 'string') {
      setCsrfToken(data.csrfToken);
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}
