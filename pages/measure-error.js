/**
 * B3 측정 — B가 맡은 화면 (B3-9, E1~E5, B3-2 토스트)
 *
 * 이름은 error지만 E3(손가락 대기)·E4(측정 시작)처럼 정상 상태 화면도 들어 있다.
 * A의 measure.js가 import 중이라 파일명은 그대로 둔다.
 *
 * 접점은 pickView/renderError 둘뿐. 정상 플로우(measure.js)는 이 파일을 고치지 않는다.
 * 상태는 hrvMeasurement.js의 HRV_STATES / HRV_ERRORS, 서버 코드는 docs/API.md 0절·6절.
 * 레이아웃·수치는 디자인 시안 B3-9(1:4271) B3-2(1:5280) E1(1:4525) E2(1:4737) E5(1:3789).
 */
import { HRV_STATES, HRV_ERRORS } from '../hrvMeasurement.js';

const ICON = '../assets/icons';

/** 측정 시작 전(E4/B3-1). 엔진이 아직 안 돌 때라 HRV_STATES에 없는 화면 전용 상태다. */
export const IDLE = 'IDLE';

// B3-9 카드 — 해당하는 사유 1개만 보여준다
// ("와이어프레임 수정 요청사항 2" 2장: 시안의 "사유별 문구" 목록은 설명용 주석이라 삭제).
// guide는 같은 문서 3장의 통일 문구를 쓴다. LOW_FPS는 시안에 없어 임시다(API 사유 4개, 시안 3개).
const RETRY_REASONS = {
  NO_PULSE:  { guide: '손가락 끝으로 카메라와 플래시를 함께 가볍게 덮어요', reason: '맥박이 잡히지 않았어요' },
  TOO_NOISY: { guide: '움직이지 말고 손을 편하게 둔 채 다시 측정해주세요', reason: '잡음·움직임이 컸어요' },
  TOO_SHORT: { guide: '처음부터 다시 측정해주세요',                      reason: '측정이 중간에 끊겼어요' },
  LOW_FPS:   { guide: '다른 앱을 닫고 다시 측정해주세요',                 reason: '화면이 느렸어요' },
};
// 서버가 새 사유를 추가해도 화면이 비지 않게 한다.
const UNKNOWN_REASON = { guide: '손을 편하게 둔 채 다시 측정해주세요', reason: '측정이 잘 되지 않았어요' };

// 401·403·409는 측정 화면에서 풀 수 없다 → 담당 화면으로 보낸다 (API.md 0절 "접근 조건").
// 시안이 없어 제목 + 이동 버튼만 둔다(디자인 요청함).
const ACCESS_ERRORS = {
  UNAUTHENTICATED:      { title: '로그인이 필요해요',                   goto: 'login' },
  ONBOARDING_REQUIRED:  { title: '설정을 먼저 마쳐주세요',               goto: 'onboarding' },
  HRV_CONSENT_REQUIRED: { title: '건강정보 동의가 필요해요',             goto: 'consent' },
  // 동의는 했지만 생활 정보를 저장하지 않아도 측정 꺼짐이 된다 (API.md 6절)
  HRV_DISABLED:         { title: '측정 시간·수면 시간을 먼저 설정해주세요', goto: 'settings' },
  INVALID_STATE:        { title: '탈퇴를 처리하고 있어요',               goto: 'home' },
};

const BTN = {
  restart:     (label = '다시 측정하기') => ({ action: 'restart', label, kind: 'primary' }),
  skipToday:   () => ({ action: 'skipToday',   label: '오늘은 건너뛰기',        kind: 'ghost' }),
  retryUpload: () => ({ action: 'retryUpload', label: '다시 보내기',            kind: 'primary' }),
  restartText: () => ({ action: 'restart',     label: '처음부터 다시 측정하기', kind: 'text' }),
  home:        () => ({ action: 'home',        label: '홈으로',                 kind: 'ghost' }),
  goto:        () => ({ action: 'goto',        label: '이동하기',               kind: 'primary' }),
};

/**
 * 무엇을 그릴지만 고른다 (DOM 없음 → 테스트 가능).
 * chrome: 'full'이면 셸의 머리말·단계·탭을 그대로 두고, 'none'이면 감춘다.
 * @returns {object|null} 이 파일이 그릴 화면이 아니면 null
 */
export function pickView(state, detail) {
  // B3-9 — 측정은 저장됐지만 품질 미달. ERROR가 아니라 DONE으로 온다.
  if (state === HRV_STATES.DONE && detail?.measurement?.retryRequired) {
    const r = RETRY_REASONS[detail.measurement.retryReason] ?? UNKNOWN_REASON;
    return {
      view: 'RETRY', chrome: 'full',
      ring: 'sm', mark: '!',
      title: '다시 측정이 필요해요',
      card: { icon: 'camera.svg', guide: r.guide, reason: r.reason },
      buttons: [BTN.restart(), BTN.skipToday()],
    };
  }

  // B3-2 — 측정 중단. 시작 화면 위에 얹는 토스트라 #state를 비우지 않는다.
  if (state === HRV_STATES.STOPPED) {
    return { view: 'STOPPED', chrome: 'full', toast: '측정이 중단됐어요. 다시 시작해주세요', buttons: [] };
  }

  // E3 — 손가락 대기. 정상 상태지만 화면은 B가 그린다.
  if (state === HRV_STATES.WAITING_FINGER) {
    return {
      view: 'WAITING', chrome: 'steps',
      camera: { chip: '감지 대기 중', placeholder: ['카메라 화면', '(손가락 없음)'] },
      title: '손가락을 대주세요',
      body: ['카메라와 플래시를 함께 덮으면', '자동으로 시작해요'],
      tip: {
        title: '이렇게 하면 잘 인식돼요',
        lines: ['손가락 전체로 렌즈와 플래시를 덮고, 인식될 때까지 그대로 유지해 주세요.'],
      },
      buttons: [{ action: 'stop', label: '중단', kind: 'ghost' }],
    };
  }

  // E4 / B3-1 — 측정 시작 전. 같은 화면이고 플래시를 못 켜는 기기에만 배너가 붙는다
  // ("수정 요청사항 2" 2장: "(플래시를 켤 수 없는 기기만)" 괄호는 주석이라 삭제).
  if (state === IDLE) {
    return {
      view: 'START', chrome: 'full',
      banner: detail?.torch === false ? {
        title: '밝은 곳에서 측정해주세요',
        lines: ['이 기기는 플래시를 켤 수 없어요. 밝은 창가나 조명 아래에서 재면 더 정확해요.'],
      } : null,
      figure: '후면 카메라를 손가락 끝으로 가볍게 덮어요',
      bullets: ['세게 누르지 말고 가볍게 대주세요', '1분 동안 편하게 앉아 움직이지 마세요'],
      buttons: [{ action: 'start', label: '측정 시작', kind: 'primary' }],
    };
  }

  if (state !== HRV_STATES.ERROR) return null; // 그 밖의 정상 상태 → measure.js 담당

  const error = detail?.type ?? detail;

  // E1 — 카메라 권한 거부. 권한 팝업 자체는 브라우저 기본 창이라 만들지 않는다.
  if (error === HRV_ERRORS.PERMISSION_DENIED) {
    return {
      view: 'PERMISSION', chrome: 'none',
      ring: 'md', icon: 'camera.svg',
      title: '카메라 권한이 필요해요',
      sections: [
        { title: '왜 필요한가요?', lines: ['손가락 끝의 밝기 변화로 맥박을 재요. 영상은 저장·전송되지 않아요.'] },
        { title: '권한 다시 허용하기', dashed: true, lines: [
          '· 안드로이드 크롬: 주소창 왼쪽 아이콘 → 권한 → 카메라 허용',
          "· 아이폰 사파리: 주소창 '가가' → 웹 사이트 설정 → 카메라 허용",
        ] },
      ],
      buttons: [BTN.restart('다시 시도')],
    };
  }

  // E2 — 기기·브라우저. http로 열면 INSECURE_CONTEXT라 안내가 다르다.
  if (error === HRV_ERRORS.INSECURE_CONTEXT || error === HRV_ERRORS.NO_CAMERA) {
    return {
      view: 'UNSUPPORTED', chrome: 'none',
      ring: 'lg', icon: 'x.svg',
      title: '이 기기에서는 측정할 수 없어요',
      body: error === HRV_ERRORS.INSECURE_CONTEXT
        ? ['주소가 https로 시작하는 곳에서 열어주세요.']
        : ['카메라가 없거나 지원하지 않는 브라우저예요.', '휴대폰의 크롬 또는 사파리에서 열어주세요.'],
      buttons: [BTN.home()],
    };
  }

  // E5 — 전송 실패. 데이터가 남아 있어 같은 Idempotency-Key로 재전송한다 (API.md 0절)
  if (error === HRV_ERRORS.UPLOAD_FAILED) {
    return {
      view: 'UPLOAD_FAILED', chrome: 'full',
      ring: 'xl', icon: 'refresh.svg',
      title: '전송에 실패했어요',
      body: ['측정한 데이터는 그대로 있어요.', '다시 측정하지 않아도 돼요.', '인터넷 연결을 확인해주세요.'],
      buttons: [BTN.retryUpload(), BTN.restartText()],
    };
  }

  // 400 — 보낸 값이 잘못됐으니 재전송은 소용없다. 다시 측정만.
  if (error === HRV_ERRORS.INVALID_DATA) {
    return {
      view: 'UPLOAD_FAILED', chrome: 'full',
      ring: 'xl', icon: 'refresh.svg',
      title: '측정을 다시 해주세요',
      body: ['보낸 값에 문제가 있어서', '이번 측정은 저장되지 않았어요.'],
      buttons: [BTN.restart()],
    };
  }

  // 401·403·409
  const access = ACCESS_ERRORS[detail?.code]
    ?? (error === HRV_ERRORS.AUTH_REQUIRED ? ACCESS_ERRORS.UNAUTHENTICATED : null);
  if (access) {
    return { view: 'ACCESS', chrome: 'none', title: access.title, body: detail?.message ? [detail.message] : [], goto: access.goto, buttons: [BTN.goto()] };
  }

  return { view: 'UNKNOWN', chrome: 'none', title: '잠시 후 다시 시도해주세요', body: detail?.message ? [detail.message] : [], buttons: [BTN.restart(), BTN.home()] };
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const img = (file, w, h) => {
  const n = document.createElement('img');
  n.src = `${ICON}/${file}`;
  n.width = w; n.height = h; n.alt = '';
  return n;
};
const RING_ICON = { md: [26, 26], lg: [28, 38], xl: [26, 26] };

/**
 * @param {HTMLElement} root    measure.html의 <div id="state">
 * @param {object} actions      { restart, skipToday, retryUpload, home, goto }
 * @returns {boolean} 이 파일이 화면을 그렸으면 true (false면 measure.js가 그린다)
 */
export function renderError(root, state, detail, actions = {}) {
  const v = pickView(state, detail);
  const toastEl = document.getElementById('toast');

  if (!v) { // 정상 상태 — 남아 있던 토스트만 치운다
    if (toastEl) toastEl.hidden = true;
    return false;
  }

  document.body.dataset.chrome = v.chrome;

  // B3-2 — 토스트는 시작 화면 위에 얹는다. #state는 measure.js 것이므로 건드리지 않는다.
  if (v.toast) {
    if (toastEl) {
      toastEl.replaceChildren(img('warn.svg', 15, 15), el('span', null, v.toast));
      toastEl.hidden = false;
    }
    return false;
  }
  if (toastEl) toastEl.hidden = true;

  root.dataset.view = v.view;
  root.replaceChildren();

  if (v.ring) {
    const ring = el('div', `err__ring err__ring--${v.ring}`);
    const inner = el('div', 'err__ring-inner');
    inner.append(v.mark ? el('span', 'err__mark', v.mark) : img(v.icon, ...RING_ICON[v.ring]));
    ring.append(inner);
    root.append(ring);
  }

  // E4 상단 배너 (플래시 불가 기기)
  if (v.banner) {
    const b = el('div', 'err__banner');
    const texts = el('div');
    texts.append(el('p', 'err__banner-title', v.banner.title));
    for (const line of v.banner.lines) texts.append(el('p', 'err__banner-body', line));
    b.append(img('warn-sun.svg', 11, 15), texts);
    root.append(b);
  }

  // E3 카메라 영역 — 실제 영상은 A가 .err__camera 안으로 <video>를 옮겨 넣는다
  if (v.camera) {
    const cam = el('div', 'err__camera');
    const chip = el('span', 'err__chip');
    chip.append(el('span', 'err__chip-dot'), el('span', null, v.camera.chip));
    const ph = el('div', 'err__camera-ph');
    ph.append(img('camera-sm.svg', 16, 16));
    for (const line of v.camera.placeholder) ph.append(el('p', null, line));
    cam.append(chip, ph);
    root.append(cam);
  }

  // E4 그림 자리
  if (v.figure) {
    const f = el('div', 'err__figure');
    f.append(img('camera-md.svg', 22, 22), el('p', null, v.figure));
    root.append(f);
  }

  if (v.title) root.append(el('h2', 'err__title', v.title));

  for (const line of v.body ?? []) root.append(el('p', 'err__body', line));

  // B3-9 사유 카드
  if (v.card) {
    const card = el('div', 'err__card');
    const box = el('div', 'err__card-figure');
    box.append(img(v.card.icon, 26, 26));
    card.append(box, el('p', 'err__card-guide', v.card.guide), el('p', 'err__card-reason', v.card.reason));
    root.append(card);
  }

  // E3 도움말 카드
  if (v.tip) {
    const t = el('div', 'err__tip');
    const icon = el('div', 'err__tip-icon');
    icon.append(img('bulb.svg', 9, 12));
    const body = el('div');
    body.append(el('p', 'err__tip-title', v.tip.title));
    for (const line of v.tip.lines) body.append(el('p', 'err__tip-body', line));
    t.append(icon, body);
    root.append(t);
  }

  // E4 주의사항
  if (v.bullets) {
    const ul = el('ul', 'err__bullets');
    for (const line of v.bullets) ul.append(el('li', null, line));
    root.append(ul);
  }

  // E1 안내 카드
  for (const s of v.sections ?? []) {
    const sec = el('section', `err__section${s.dashed ? ' err__section--dashed' : ''}`);
    sec.append(el('h3', 'err__section-title', s.title));
    for (const line of s.lines) sec.append(el('p', 'err__section-body', line));
    root.append(sec);
  }

  if (v.buttons.length) {
    const bar = el('div', 'err__actions');
    for (const b of v.buttons) {
      const btn = el('button', `cd-btn cd-btn--${b.kind} err__btn--${b.action}`, b.label);
      btn.type = 'button';
      btn.addEventListener('click', () => actions[b.action]?.(v.goto));
      bar.append(btn);
    }
    root.append(bar);
  }
  return true;
}
