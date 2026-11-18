/**
 * 백엔드 호출 공통부. docs/API.md 0절.
 * 같은 출처라 항상 상대 경로로 부르고, 쓰기 요청에는 XSRF 쿠키 값을 헤더에 붙인다.
 */
const cookie = (name) =>
  document.cookie.split(';').map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))?.slice(name.length + 1);

/** 앱을 열 때 한 번. 로그인·로그아웃 뒤에도 다시 받는다. */
export const ensureCsrf = () =>
  cookie('XSRF-TOKEN') ? Promise.resolve() : fetch('/api/auth/csrf', { credentials: 'same-origin' }).then(() => {});

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = body?.code ?? null;
    this.fieldErrors = body?.fieldErrors ?? null;
  }
}

/**
 * @param {string} path  '/api/...'
 * @param {{method?: string, body?: object, idempotencyKey?: string}} opts
 * @throws {ApiError} 2xx가 아니면. code로 화면을 분기한다(401 UNAUTHENTICATED 등)
 */
export async function api(path, { method = 'GET', body, idempotencyKey } = {}) {
  const write = method !== 'GET';
  if (write) await ensureCsrf();

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (write) headers['X-XSRF-TOKEN'] = cookie('XSRF-TOKEN') ?? '';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(path, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
