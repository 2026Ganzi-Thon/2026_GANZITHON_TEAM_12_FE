import { createHash, randomUUID } from 'node:crypto';

/**
 * 로컬 개발 서버 설정
 * - 기본: 백엔드 없이 목업 API로 테스트 (API 명세 docs/API.md 0절·6절 형태)
 * - 실제 백엔드 연동: HRV_BACKEND_URL=http://localhost:8080 npx vite
 *   → 명세대로 /api, /oauth2, /login/oauth2를 백엔드로 전달하고 목업은 끈다
 */
const BACKEND_URL = process.env.HRV_BACKEND_URL;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * 목업 API
 * - GET  /api/auth/csrf → 204 + XSRF-TOKEN 쿠키
 * - POST /api/hrv/measurements → 201 (명세 응답 형태)
 *   Idempotency-Key 필수, X-XSRF-TOKEN이 쿠키와 같아야 함, 같은 키·같은 본문은 처음 결과를 다시 돌려줌
 *   ?mockStatus= 로 오류 흉내: retry | drop-once | csrf-once | 400 | 401 | 403 | 500
 */
function mockHrvApi() {
  const saved = new Map(); // Idempotency-Key → { hash, status, body }
  const csrfOnceUsed = new Set();
  let nextId = 100;

  return {
    name: 'mock-hrv-api',
    configureServer(server) {
      server.middlewares.use('/api/auth/csrf', (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.statusCode = 204;
        res.setHeader('Set-Cookie', `XSRF-TOKEN=${randomUUID()}; Path=/; SameSite=Lax`);
        res.end();
      });

      server.middlewares.use('/api/hrv/measurements', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
          const mode = new URL(req.originalUrl || req.url, 'http://localhost').searchParams.get('mockStatus');
          const key = req.headers['idempotency-key'];
          const csrfHeader = req.headers['x-xsrf-token'];
          const csrfCookie = readCookie(req, 'XSRF-TOKEN');
          console.log('[HRV 목업] 수신', raw.length, 'bytes, key', key, 'mode', mode || '정상');

          if (!csrfCookie || csrfHeader !== csrfCookie) {
            return sendJson(res, 403, { code: 'CSRF_TOKEN_INVALID', message: '보안 토큰이 만료됐어요. 새로고침 후 다시 시도해 주세요.' });
          }
          if (mode === 'csrf-once' && !csrfOnceUsed.has(key)) {
            csrfOnceUsed.add(key); // 토큰 만료를 한 번 흉내 → 프론트가 토큰을 새로 받아 다시 보내야 함
            return sendJson(res, 403, { code: 'CSRF_TOKEN_INVALID', message: '보안 토큰이 만료됐어요. 새로고침 후 다시 시도해 주세요.' });
          }
          if (mode === '401') return sendJson(res, 401, { code: 'UNAUTHENTICATED', message: '로그인이 필요해요.' });
          if (mode === '403') return sendJson(res, 403, { code: 'HRV_CONSENT_REQUIRED', message: '건강정보 수집 동의가 필요해요.' });
          if (mode === '500') return sendJson(res, 500, { code: 'INTERNAL_ERROR', message: '잠시 후 다시 시도해 주세요.' });
          if (!key || !UUID_RE.test(key)) {
            return sendJson(res, 400, { code: 'VALIDATION_FAILED', message: 'Idempotency-Key 헤더가 필요해요.' });
          }

          let body;
          try {
            body = JSON.parse(raw);
          } catch (_) {
            return sendJson(res, 400, { code: 'VALIDATION_FAILED', message: '입력값을 확인하세요.' });
          }
          const sameLength = Array.isArray(body.t) && body.t.length === body.r?.length && body.t.length === body.g?.length;
          if (mode === '400' || body.source !== 'CAMERA' || !sameLength) {
            return sendJson(res, 400, {
              code: 'VALIDATION_FAILED',
              message: '입력값을 확인하세요.',
              fieldErrors: [{ field: mode === '400' ? 'startedAt' : 'source', message: '목업 검증 실패' }],
            });
          }

          const hash = createHash('sha256').update(raw).digest('hex');
          const prev = saved.get(key);
          if (prev) {
            if (prev.hash !== hash) {
              return sendJson(res, 409, { code: 'IDEMPOTENCY_CONFLICT', message: '같은 재시도 키로 다른 요청을 보냈어요.' });
            }
            console.log('[HRV 목업] 같은 키 재전송 → 처음 결과 반환');
            return sendJson(res, prev.status, prev.body);
          }

          const retry = mode === 'retry';
          const result = {
            measurement: {
              id: nextId++,
              qualityLevel: retry ? 'RETRY' : 'GOOD',
              retryRequired: retry,
              retryReason: retry ? 'TOO_NOISY' : null,
              rmssdMs: retry ? null : 41.2,
              meanHrBpm: retry ? null : 64.0,
            },
            morningCheckId: 40,
          };
          saved.set(key, { hash, status: 201, body: result });

          if (mode === 'drop-once') {
            // 서버에는 저장됐지만 응답이 중간에 끊긴 상황 → 같은 키로 재전송하면 위에서 처음 결과를 돌려줌
            // (응답 전에 끊으면 브라우저가 스스로 다시 보내 버려서, 본문 일부를 보낸 뒤 끊는다)
            console.log('[HRV 목업] 저장 후 응답 끊음');
            const json = JSON.stringify(result);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Length', String(Buffer.byteLength(json)));
            res.write(json.slice(0, 10));
            return setTimeout(() => req.socket.destroy(), 50);
          }
          return sendJson(res, 201, result);
        });
      });
    },
  };
}

export default {
  server: {
    host: true,
    allowedHosts: true,
    proxy: BACKEND_URL
      ? {
          '/api': { target: BACKEND_URL },
          '/oauth2': { target: BACKEND_URL },
          '/login/oauth2': { target: BACKEND_URL },
        }
      : undefined,
  },
  plugins: BACKEND_URL ? [] : [mockHrvApi()],
};
