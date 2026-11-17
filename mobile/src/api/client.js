import { Platform } from 'react-native';

// ★ 로컬 UI 프리뷰 검수 시 true / 백엔드 배포용 빌드(dist) 생성 전 반드시 false로 변경!
const USE_MOCK = true;

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
  nickname: '유진',
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

  return {};
}

let cachedCsrfToken = null;

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