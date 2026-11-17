/**
 * B3 측정 — 예외·중단·재측정 화면 (B3-2, B3-9, E1, E2, E5)
 *
 * 접점은 pickView/renderError 둘뿐. 정상 플로우(measure.js)는 이 파일을 고치지 않는다.
 * 상태는 hrvMeasurement.js의 HRV_STATES / HRV_ERRORS, 서버 코드는 docs/API.md 0절·6절.
 */
import { HRV_STATES, HRV_ERRORS } from '../hrvMeasurement.js';

// B3-9 사유별 문구. 해당하는 사유 1개만 보여준다 (시안의 "사유별 문구" 목록은 설명용 메모).
// 문구는 임시다 — 노션 "와이어프레임 수정 요청사항 2" 확정본으로 교체한다.
const RETRY_REASONS = {
  NO_PULSE:  { title: '맥박이 안 잡힘',   body: '손가락으로 카메라와 플래시를 함께 덮어주세요' },
  TOO_NOISY: { title: '잡음·움직임이 큼', body: '움직이지 말고 손을 편하게 둔 채 다시 측정해주세요' },
  TOO_SHORT: { title: '측정이 끊김',     body: '측정이 중간에 끊겼어요. 다시 측정해주세요' },
  LOW_FPS:   { title: '화면이 느렸어요',  body: '다른 앱을 닫고 다시 측정해주세요' },
};
// 서버가 새 사유를 추가해도 화면이 비지 않게 한다.
const UNKNOWN_REASON = { title: '측정이 잘 되지 않았어요', body: '손을 편하게 둔 채 다시 측정해주세요' };

// 403/401은 측정 화면에서 해결할 수 없다 → 담당 화면으로 보낸다 (API.md 0절 "접근 조건")
const ACCESS_ERRORS = {
  UNAUTHENTICATED:      { title: '로그인이 필요해요',        action: 'login' },
  ONBOARDING_REQUIRED:  { title: '설정을 먼저 마쳐주세요',    action: 'onboarding' },
  HRV_CONSENT_REQUIRED: { title: '건강정보 동의가 필요해요',  action: 'consent' },
  HRV_DISABLED:         { title: '측정이 꺼져 있어요',       action: 'mypage' },
  INVALID_STATE:        { title: '탈퇴를 처리하고 있어요',    action: 'home' },
};

/**
 * 무엇을 그릴지만 고른다 (DOM 없음 → 테스트 가능).
 * @returns {{view: string, title: string, body?: string, reasons?: object, buttons: string[], goto?: string}}
 */
export function pickView(state, detail) {
  // B3-9 — 측정은 됐지만 품질 미달. DONE으로 오고 ERROR가 아니다.
  if (state === HRV_STATES.DONE && detail?.measurement?.retryRequired) {
    return {
      view: 'RETRY',
      title: '다시 측정이 필요해요',
      body: '손가락으로 카메라와 플래시를 함께 덮어주세요',
      reason: RETRY_REASONS[detail.measurement.retryReason] ?? UNKNOWN_REASON,
      buttons: ['restart', 'skipToday'],
    };
  }

  // B3-2 — 측정 중단
  if (state === HRV_STATES.STOPPED) {
    return { view: 'STOPPED', title: '측정이 중단됐어요', body: '다시 시작해주세요', buttons: ['restart'] };
  }

  if (state !== HRV_STATES.ERROR) return null; // 정상 상태 → measure.js 담당

  const error = detail?.type ?? detail;

  // E1 — 카메라 권한
  if (error === HRV_ERRORS.PERMISSION_DENIED) {
    return { view: 'PERMISSION', title: '카메라 권한이 필요해요', buttons: ['restart'] };
  }

  // E2 — 기기·브라우저. http로 열면 INSECURE_CONTEXT라 안내 문구가 다르다.
  if (error === HRV_ERRORS.INSECURE_CONTEXT) {
    return {
      view: 'UNSUPPORTED',
      title: '이 기기에서는 측정할 수 없어요',
      body: '주소가 https로 시작하는 곳에서 열어주세요.',
      buttons: ['home'],
    };
  }
  if (error === HRV_ERRORS.NO_CAMERA) {
    return {
      view: 'UNSUPPORTED',
      title: '이 기기에서는 측정할 수 없어요',
      body: '카메라가 없거나 지원하지 않는 브라우저예요.\n휴대폰의 크롬 또는 사파리에서 열어주세요.',
      buttons: ['home'],
    };
  }

  // E5 — 전송 실패. 데이터는 남아 있으므로 같은 키로 재전송 (API.md 0절 Idempotency-Key)
  if (error === HRV_ERRORS.UPLOAD_FAILED) {
    return {
      view: 'UPLOAD_FAILED',
      title: '전송에 실패했어요',
      body: '측정한 데이터는 그대로 있어요.\n다시 측정하지 않아도 돼요.\n인터넷 연결을 확인해주세요.',
      buttons: ['retryUpload', 'restart'],
    };
  }

  // 400 — 본문이 잘못됐으니 재전송은 소용없다. 다시 측정만.
  if (error === HRV_ERRORS.INVALID_DATA) {
    return { view: 'UPLOAD_FAILED', title: '측정을 다시 해주세요', body: '보낸 값에 문제가 있어요.', buttons: ['restart'] };
  }

  // 401·403·409 — 측정 화면 밖에서 풀어야 하는 문제. 시안 없음(디자인 요청함).
  const access = ACCESS_ERRORS[detail?.code] ?? (error === HRV_ERRORS.AUTH_REQUIRED ? ACCESS_ERRORS.UNAUTHENTICATED : null);
  if (access) return { view: 'ACCESS', title: access.title, body: detail?.message ?? null, buttons: ['goto'], goto: access.action };

  return { view: 'UNKNOWN', title: '잠시 후 다시 시도해주세요', body: detail?.message ?? null, buttons: ['restart', 'home'] };
}

const BUTTON_TEXT = {
  restart: '다시 측정하기',
  skipToday: '오늘은 건너뛰기',
  retryUpload: '다시 보내기',
  home: '홈으로',
  goto: '이동하기',
};

/**
 * @param {HTMLElement} root  measure.html의 <div id="state">
 * @param {object} actions    { restart, skipToday, retryUpload, home, goto }
 * @returns {boolean} 이 파일이 그렸으면 true (아니면 measure.js가 그린다)
 */
export function renderError(root, state, detail, actions = {}) {
  const v = pickView(state, detail);
  if (!v) return false;

  root.dataset.view = v.view;
  root.replaceChildren();

  const h = document.createElement('h2');
  h.className = 'err__title';
  h.textContent = v.title;
  root.append(h);

  if (v.body) {
    const p = document.createElement('p');
    p.className = 'err__body';
    p.textContent = v.body; // \n은 CSS white-space: pre-line으로 처리
    root.append(p);
  }

  if (v.reason) {
    const box = document.createElement('div');
    box.className = 'err__reason';
    const t = document.createElement('p');
    t.className = 'err__reason-title';
    t.textContent = v.reason.title;
    const d = document.createElement('p');
    d.className = 'err__reason-body';
    d.textContent = v.reason.body;
    box.append(t, d);
    root.append(box);
  }

  for (const name of v.buttons) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `err__btn err__btn--${name}`;
    b.textContent = BUTTON_TEXT[name];
    b.addEventListener('click', () => actions[name]?.(v.goto));
    root.append(b);
  }
  return true;
}
