import { Platform } from 'react-native';

// 목업 스위치. 기본은 꺼짐(실제 API)이라 어디에 배포하든 안전하다.
// 로컬에서 화면만 볼 때: 환경변수 EXPO_PUBLIC_USE_MOCK 을 참으로 두고 expo 를 띄운다.
// (BE 저장소 CD 는 목업이 켜진 채로 배포되는 것을 막는다. 이 형태면 그 검사를 그대로 통과한다.)
const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';
const MOCK_DAY28 = USE_MOCK && process.env.EXPO_PUBLIC_MOCK_DAY28 === 'true';

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

// --- 프리뷰용 인메모리 목업 상태 ---
const mockState = {
  day28Completed: false,
  nickname: '유진',
  hrvConsent: true,
  conditionScore: null,
  onboardingStep: 'PROFILE',
  suggestions: [
    {
      id: 'sug-1',
      type: 'PRE_START',
      status: 'PROPOSED',
      title: '가벼운 저녁 산책',
      start: new Date(Date.now() + 86400000).toISOString(),
      end: new Date(Date.now() + 86400000 + 1800000).toISOString(),
      message: {
        text: '이번 주 마감 일정이 몰려 있어요. 목요일 저녁 30분 산책을 미리 비워둘까요?',
        aiGenerated: true,
      },
    },
  ],
  events: [
    {
      id: 'ev-1',
      title: '운영체제 강의',
      category: 'CLASS',
      isDeadline: false,
      recurring: true,
      allDay: false,
      start: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
      end: new Date(new Date().setHours(12, 0, 0, 0)).toISOString(),
    },
    {
      id: 'ev-2',
      title: '캡스톤 설계 중간 발표 자료',
      category: 'ASSIGNMENT',
      isDeadline: true,
      recurring: false,
      allDay: false,
      start: new Date(new Date().setHours(15, 0, 0, 0)).toISOString(),
      end: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(),
    },
    {
      id: 'ev-3',
      title: '팀 프로젝트 주간 회의',
      category: 'WORK_MEETING',
      isDeadline: false,
      recurring: true,
      allDay: false,
      start: new Date(new Date().setHours(20, 0, 0, 0)).toISOString(),
      end: new Date(new Date().setHours(21, 30, 0, 0)).toISOString(),
    },
  ],
};

function handleMockRequest(path, method, body) {
  const cleanPath = path.split('?')[0];

  // A1~A2 프로필·동의
  if (cleanPath === '/api/me') {
    return {
      email: 'preview@comedown.app',
      nickname: mockState.nickname,
      onboardingStep: mockState.onboardingStep,
    };
  }
  if (cleanPath === '/api/onboarding/profile' && method === 'PUT') {
    mockState.nickname = body?.nickname || '유진';
    mockState.onboardingStep = 'CBI';
    return { onboardingStep: 'CBI' };
  }

  // A3 CBI 문항 및 제출 (13문항)
  if (cleanPath === '/api/cbi/questions') {
    const scaleFreq = ['전혀 그렇지 않다', '거의 그렇지 않다', '가끔 그렇다', '자주 그렇다', '항상 그렇다'];
    const scaleDeg = ['전혀 느끼지 않는다', '거의 느끼지 않는다', '어느 정도 느낀다', '많이 느낀다', '매우 많이 느낀다'];
    const items = [
      { no: 1, subscale: 'PERSONAL', scale: 'FREQ', text: '얼마나 자주 피곤함을 느끼시나요?' },
      { no: 2, subscale: 'PERSONAL', scale: 'FREQ', text: '얼마나 자주 몸이 \n지쳐 있나요?' },
      { no: 3, subscale: 'PERSONAL', scale: 'FREQ', text: '얼마나 자주 정서적으로 \n소진되었다고 느끼시나요?' },
      { no: 4, subscale: 'PERSONAL', scale: 'FREQ', text: '"더 이상은 못 버티겠다"고 \n얼마나 자주 생각하시나요?' },
      { no: 5, subscale: 'PERSONAL', scale: 'FREQ', text: '얼마나 자주 기운이 \n바닥난 느낌이 드시나요?' },
      { no: 6, subscale: 'PERSONAL', scale: 'FREQ', text: '얼마나 자주 몸이 약해지고 \n병에 걸릴 것 같다고 느끼시나요?' },
      { no: 7, subscale: 'WORK', scale: 'DEG', text: '일이나 학업이 \n정서적으로 지치게 만드나요?' },
      { no: 8, subscale: 'WORK', scale: 'DEG', text: '일이나 학업 때문에 몸과 마음이\n소진된 느낌이 드나요?' },
      { no: 9, subscale: 'WORK', scale: 'DEG', text: '일이나 학업이 좌절감을 주나요?' },
      { no: 10, subscale: 'WORK', scale: 'FREQ', text: '하루 일과를 마칠 때 \n기진맥진한 느낌이 드나요?' },
      { no: 11, subscale: 'WORK', scale: 'FREQ', text: '아침에 또 하루를 시작해야 한다는 \n생각에 피곤함을 느끼나요?' },
      { no: 12, subscale: 'WORK', scale: 'FREQ', text: '일하거나 공부하는 매 시간이 \n버겁게 느껴지나요?' },
      { no: 13, subscale: 'WORK', scale: 'FREQ', text: '가족이나 친구와 보낼 에너지가 \n부족하다고 느끼나요?' },
    ];
    return {
      version: 'CBI-KO-1.0',
      scales: { FREQ: scaleFreq, DEG: scaleDeg },
      items,
    };
  }
  if (cleanPath === '/api/cbi/assessments' && method === 'POST') {
    if (body?.round === 'DAY28') {
      mockState.day28Completed = true;
      return { onboardingStep: 'DONE', personal: { score: 50, level: 'HIGH' }, work: { score: 46.4, level: 'LOW' }, safety: { show: false } };
    }
    mockState.onboardingStep = 'LIFESTYLE';
    return {
      onboardingStep: 'LIFESTYLE',
      personal: { score: 62, level: 'HIGH' },
      work: { score: 54, level: 'HIGH' },
      highRisk: false,
      safety: { show: false },
    };
  }

  // A4 생활 패턴 설정
  if (cleanPath === '/api/me/settings' && method === 'PUT') {
    mockState.onboardingStep = 'SCHEDULE_REPORT';
    return { onboardingStep: 'SCHEDULE_REPORT' };
  }

  // A5 일정 분석 & 리포트
  if (cleanPath === '/api/calendar/sync' && method === 'POST') {
    return { synced: true };
  }
  if (cleanPath === '/api/schedule/report') {
    const now = new Date();
    const weekStr = (offsetDays) => {
      const d = new Date(now.getTime() + offsetDays * 86400000);
      return d.toISOString().slice(0, 10);
    };
    return {
      enoughData: true,
      pastMonth: {
        from: weekStr(-30),
        to: weekStr(0),
        restDays: 3,
        lateNightCount: 6,
        deadlineCount: 5,
        totalHours: 118,
      },
      classification: { total: 42 },
      upcomingWeeks: [
        { weekStart: weekStr(0), vsUsualPct: 12, riskLevel: 'WATCH', loadScore: 68 },
        { weekStart: weekStr(7), vsUsualPct: 34, riskLevel: 'RISK', loadScore: 86 },
        { weekStart: weekStr(14), vsUsualPct: -10, riskLevel: 'NONE', loadScore: 42 },
        { weekStart: weekStr(21), vsUsualPct: 5, riskLevel: 'NONE', loadScore: 50 },
      ],
    };
  }
  if (cleanPath === '/api/onboarding/complete' && method === 'POST') {
    mockState.onboardingStep = 'DONE';
    return { onboardingStep: 'DONE' };
  }

  // B1 홈 & 추천 활동
  if (cleanPath === '/api/home') {
    return {
      nickname: mockState.nickname,
      phase: 'BUILDING',
      recovery: {
        status: 'NORMAL',
        changePct: 4,
        baseline: { validDays: 3, required: 7 },
      },
      thisWeekLoad: { vsUsualPct: 18 },
      todayCheck: { status: 'PENDING' },
      todaySuggestions: mockState.suggestions,
      safety: { show: true },
    };
  }
  if (cleanPath === '/api/suggestions') {
    return { suggestions: mockState.suggestions };
  }
  if (cleanPath.endsWith('/approve') && method === 'POST') {
    const id = cleanPath.split('/')[3];
    let approvedItem = null;
    mockState.suggestions = mockState.suggestions.map((s) => {
      if (s.id === id) {
        approvedItem = { ...s, status: 'APPROVED' };
        return approvedItem;
      }
      return s;
    });
    return approvedItem || { id, status: 'APPROVED' };
  }
  if (cleanPath.endsWith('/dismiss') && method === 'POST') {
    const id = cleanPath.split('/')[3];
    mockState.suggestions = mockState.suggestions.filter((s) => s.id !== id);
    return { ok: true };
  }

  // B2 캘린더 & B2-1 카테고리 변경
  if (cleanPath === '/api/calendar/events') {
    return { events: mockState.events };
  }
  if (cleanPath === '/api/calendar/week-load') {
    return { totalHours: 28, vsUsualPct: 18, deadlineCount: 2, riskLevel: 'WATCH' };
  }
  if (cleanPath === '/api/calendar/four-weeks') {
    return { weeks: [] };
  }
  if (cleanPath.startsWith('/api/calendar/events/') && cleanPath.endsWith('/category') && method === 'PATCH') {
    const evId = cleanPath.split('/')[4];
    let updatedEv = null;
    mockState.events = mockState.events.map((ev) => {
      if (ev.id === evId) {
        updatedEv = {
          ...ev,
          category: body?.category || ev.category,
          customCategory: body?.customCategory ?? null,
          isDeadline: body?.isDeadline ?? ev.isDeadline,
        };
        return updatedEv;
      }
      return ev;
    });
    return updatedEv || { id: evId, ...body };
  }

  // B3 HRV 측정
  if (cleanPath === '/api/hrv/measurements' && method === 'POST') {
    return {
      measurement: {
        id: 'hrv-mock-1',
        qualityLevel: 'GOOD',
        retryRequired: false,
        rmssd: 48.2,
        hr: 68,
      },
    };
  }

  // ── B3 측정 탭 진입 · B4 컨디션 · B5 호흡 (명세 6절) ──────────────
  if (cleanPath === '/api/morning-checks/today') {
    // 컨디션까지 저장했으면 result 가 채워져 온다(명세 6절). 목업도 그대로 흉내 낸다.
    if (mockState.conditionScore != null) {
      return {
        date: new Date().toISOString().slice(0, 10),
        dayIndex: 3,
        phase: 'BUILDING',
        steps: {
          measurement: { done: true, measurementId: 77, qualityLevel: 'GOOD' },
          condition: { done: true },
          breathing: { done: false },
        },
        baseline: { validDays: 3, required: 7 },
        result: handleMockRequest('/api/morning-checks/today/condition', 'PUT', {
          score: mockState.conditionScore,
        }),
      };
    }
    return {
      date: new Date().toISOString().slice(0, 10),
      dayIndex: 3,
      phase: 'BUILDING',
      steps: {
        measurement: { done: false, measurementId: null, qualityLevel: null },
        condition: { done: false },
        breathing: { done: false },
      },
      baseline: { validDays: 3, required: 7 },
      result: null,
    };
  }
  if (cleanPath === '/api/morning-checks/today/condition' && method === 'PUT') {
    mockState.conditionScore = body?.score ?? 3;
    // 교란 요인을 하나라도 체크하면 '내 평소' 계산에서 빠진다
    const excluded = Boolean(body?.alcohol || body?.sick || body?.caffeine);
    return {
      date: new Date().toISOString().slice(0, 10),
      phase: 'BUILDING',
      recovery: { status: 'BUILDING', changePct: null, trendRmssdMs: null, normalRange: null },
      qualityLevel: 'GOOD',
      rmssdMs: 41.0,
      heartRateBpm: 64.0,
      excludedFromBaseline: excluded,
      baseline: { validDays: 3, required: 7, established: false, frozen: false },
      conditionScore: mockState.conditionScore,
      judgment: 'BUILDING',
      interpretation: null,
      suggestions: [{ ...mockState.suggestions[0], type: 'RECOVERY', reasonCode: 'OVERLOAD' }],
    };
  }
  if (cleanPath === '/api/morning-checks/today/breathing' && method === 'POST') {
    return null;
  }

  // ── C1 회복 리포트 (명세 7절) ─────────────────────────────────
  if (cleanPath === '/api/reports/recovery') {
    // 기준선이 확정된 뒤 모습(그래프 포함)도 확인할 수 있게 둔다.
    // ?mockUnlocked=1 을 붙이면 잠금이 풀린 응답을 돌려준다.
    if (MOCK_DAY28 || new URLSearchParams(path.split('?')[1]).get('mockUnlocked') === '1') {
      const day = (back) => {
        const d = new Date();
        d.setDate(d.getDate() - back);
        return d.toISOString().slice(0, 10);
      };
      const points = [];
      const trend = [];
      const normalBand = [];
      for (let i = 27; i >= 0; i--) {
        const date = day(i);
        const base = 41 + Math.sin(i / 3) * 5;
        if (i % 5 !== 2) points.push({ date, rmssdMs: Math.round(base * 10) / 10, excluded: i % 7 === 3, qualityLevel: 'GOOD' });
        trend.push({ date, rmssdMs: Math.round((base - 1) * 10) / 10 });
        normalBand.push({ date, lowerMs: Math.round((base - 6) * 10) / 10, upperMs: Math.round((base + 6) * 10) / 10 });
      }
      const weekStart = (back) => day(back);
      return {
        locked: false,
        unlock: { requiredDays: 7, validDays: 28 },
        graph: {
          from: day(27),
          to: day(-3),
          points,
          trend,
          normalBand,
          normalRange: { lowerMs: 38.1, upperMs: 51.6 },
          loadWeeks: [
            { week: 1, weekStart: weekStart(27), weekEnd: weekStart(21), current: false, loadScore: 41 },
            { week: 2, weekStart: weekStart(20), weekEnd: weekStart(14), current: false, loadScore: 58 },
            { week: 3, weekStart: weekStart(13), weekEnd: weekStart(7), current: false, loadScore: 36 },
            { week: 4, weekStart: weekStart(6), weekEnd: weekStart(0), current: true, loadScore: 52 },
          ],
        },
        hrvVsUsualPct: -6.0,
        recoveryStatus: 'LOW',
        latestQuality: 'GOOD',
        // 명세 7절: dayIndex 28 이상 + 7일 추세 20개 이상일 때만 공개된다.
        rangePosition: {
          available: true,
          availableFrom: null,
          recovery: { position: 35, low: 33.2, high: 55.0 },
          load: { position: 62, low: 28.0, high: 74.0 },
        },
        loadVsUsualPct: 18.0,
        interpretation: { text: '이번 주 일정이 평소보다 많고 회복이 낮은 편이에요.', aiGenerated: true, fallback: false },
      };
    }
    return {
      locked: true,
      unlock: { requiredDays: 7, validDays: 3 },
      loadVsUsualPct: 18.0,
      hrvVsUsualPct: null,
      recoveryStatus: null,
      interpretation: null,
    };
  }
  if (cleanPath === '/api/reports/four-week') {
    if (!mockState.hrvConsent) return { available: false, cbiDue: false, unavailableReason: 'CONSENT_REQUIRED' };
    if (!MOCK_DAY28) return { available: false, cbiDue: false, unavailableReason: null, availableFrom: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10) };
    if (!mockState.day28Completed) return { available: false, cbiDue: true, unavailableReason: null };
    return {
      available: true, cbiDue: false, unavailableReason: null,
      cbi: { initial: { personal: 62.5, work: 55.4 }, day28: { personal: 50, work: 46.4 }, diff: { personal: -12.5, work: -9 } },
      recovery: { firstWeekAvgMs: 41, lastWeekAvgMs: 44.2, changePct: 7.8 },
      load: { firstWeekVsUsualPct: 22, lastWeekVsUsualPct: 5 },
      suggestions: { approved: 11, done: 8 },
      interpretation: { text: '시연용 데이터로 재현한 화면이에요. 처음과 4주 후 기록을 비교해 보세요.', aiGenerated: false, fallback: true },
      plan: { plan: 'TRIAL', daysLeft: 0 },
    };
  }
  if (cleanPath === '/api/schedule/weeks') {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekStr = (offsetWeeks) => {
      const d = new Date(monday.getTime() + offsetWeeks * 7 * 86400000);
      return d.toISOString().slice(0, 10);
    };
    return {
      weeks: [
        { weekStart: weekStr(0), loadScore: 52, riskLevel: 'WATCH' },
        { weekStart: weekStr(1), loadScore: 86, riskLevel: 'RISK' },
        { weekStart: weekStr(2), loadScore: 52, riskLevel: 'WATCH' },
        { weekStart: weekStr(3), loadScore: 30, riskLevel: 'NONE' },
      ],
    };
  }

  // ── C3 안전 안내 (명세 9절) ───────────────────────────────────
  if (cleanPath === '/api/safety') {
    return {
      show: true,
      alerts: [
        { id: 3, triggerType: 'LOW_RECOVERY_2W', message: '최근 2주 동안 회복이 평소보다 낮게 이어졌어요.' },
      ],
      resources: [
        { id: 'mental-health-crisis-1577-0199', name: '정신건강위기상담', phone: '1577-0199', url: 'https://www.mohw.go.kr' },
        { id: 'suicide-prevention-109', name: '자살예방상담전화', phone: '109', url: 'https://www.129.go.kr/109' },
      ],
      disclaimer: 'Come & Down은 의료 서비스가 아니며 질병 유무를 판단하지 않아요.',
    };
  }
  if (cleanPath.startsWith('/api/safety/alerts/') && cleanPath.endsWith('/acknowledge')) {
    return null;
  }

  // ── C2 마이페이지 (명세 8절) ──────────────────────────────────
  if (cleanPath === '/api/me/settings' && method === 'GET') {
    return {
      measureTime: '07:30',
      sleepStart: '23:00',
      sleepEnd: '07:00',
      preferredActivities: ['WALK', 'STRETCH'],
      hrvEnabled: true,
    };
  }
  if (cleanPath === '/api/me' && method === 'PATCH') {
    mockState.nickname = body?.nickname || mockState.nickname;
    return { nickname: mockState.nickname };
  }
  if (cleanPath === '/api/me/consents') {
    if (method === 'POST') {
      mockState.hrvConsent = true;
      return null;
    }
    return {
      consents: [
        { type: 'TERMS', agreed: true, version: '2026-11-01' },
        { type: 'PRIVACY', agreed: true, version: '2026-11-01' },
        { type: 'AGE_14', agreed: true, version: '2026-11-01' },
        { type: 'SENSITIVE_HRV', agreed: mockState.hrvConsent, version: '2026-11-01' },
        { type: 'CALENDAR', agreed: true, version: '2026-11-01' },
        { type: 'AI_NOTICE', agreed: true, version: '2026-11-01' },
      ],
    };
  }
  if (cleanPath.startsWith('/api/me/consents/') && method === 'DELETE') {
    mockState.hrvConsent = false;
    return null;
  }
  if (cleanPath === '/api/hrv/data' && method === 'DELETE') return null;
  if (cleanPath === '/api/calendar/connection' && method === 'DELETE') return null;

  // ── B6 추천 다른 시간 보기 (명세 5절) ──────────────────────────
  if (cleanPath.endsWith('/slots')) {
    const base = new Date();
    base.setHours(16, 0, 0, 0);
    return {
      slots: [0, 1, 2].map((i) => ({
        start: new Date(base.getTime() + i * 3600000).toISOString(),
        end: new Date(base.getTime() + i * 3600000 + 1200000).toISOString(),
      })),
    };
  }

  return {};
}

let cachedCsrfToken = null;
const unauthorizedListeners = new Set();
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function readWebCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function refreshCsrfToken() {
  if (USE_MOCK) return 'mock-csrf-token';
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

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 250));
    return handleMockRequest(path, upperMethod, body);
  }

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

  if (response.status === 401) {
    cachedCsrfToken = null;
    unauthorizedListeners.forEach((listener) => listener());
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