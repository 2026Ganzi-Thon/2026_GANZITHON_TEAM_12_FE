import { Platform } from 'react-native';

const API_BASE_URL =
  Platform.OS === 'web'
    ? ''
    : process.env.EXPO_PUBLIC_API_BASE_URL ||
      'https://comedown-166828319064.asia-northeast3.run.app';

export const AuthUrls = {
  googleLogin: `${API_BASE_URL}/oauth2/authorization/google`,
  googleCalendar: `${API_BASE_URL}/oauth2/authorization/google-calendar`,
};

export class ApiError extends Error {
  constructor(message, { status, code, fieldErrors } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors || [];
  }
}

export function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedCsrfToken = null;

function readWebCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function refreshCsrfToken() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const headerToken = res.headers.get('X-XSRF-TOKEN');
    if (headerToken) {
      cachedCsrfToken = headerToken;
      return cachedCsrfToken;
    }

    const cookieToken = readWebCookie('XSRF-TOKEN');
    if (cookieToken) {
      cachedCsrfToken = cookieToken;
      return cachedCsrfToken;
    }

    const text = await res.text();
    if (text) {
      const data = JSON.parse(text);
      const bodyToken = data?.token || data?.csrfToken || data?.parameterValue;
      if (bodyToken) {
        cachedCsrfToken = bodyToken;
      }
    }
    return cachedCsrfToken;
  } catch {
    return cachedCsrfToken;
  }
}

export async function apiRequest(path, options = {}, _retried = false) {
  const { method = 'GET', body, idempotencyKey, headers = {} } = options;
  const upperMethod = method.toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod);

  if (isMutating) {
    const webToken = readWebCookie('XSRF-TOKEN');
    if (webToken) {
      cachedCsrfToken = webToken;
    } else if (!cachedCsrfToken) {
      await refreshCsrfToken();
    }
  }

  const finalHeaders = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(isMutating && cachedCsrfToken ? { 'X-XSRF-TOKEN': cachedCsrfToken } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...headers,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: upperMethod,
    credentials: 'include',
    headers: finalHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const nextHeaderToken = response.headers.get('X-XSRF-TOKEN');
  if (nextHeaderToken) {
    cachedCsrfToken = nextHeaderToken;
  }

  const rawText = await response.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }
  }

  if (response.status === 403 && isMutating && !_retried) {
    cachedCsrfToken = null;
    await refreshCsrfToken();
    return apiRequest(path, options, true);
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || `요청 처리 중 오류가 발생했어요 (${response.status})`,
      {
        status: response.status,
        code: data?.code,
        fieldErrors: data?.fieldErrors,
      }
    );
  }

  return data;
}