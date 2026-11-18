/**
 * C2 마이페이지 (docs/API.md 8절)
 * 시안은 메뉴 줄만 있고 하위 화면이 없다. 누를 수 없는 줄을 두지 않으려고
 * 각 항목은 명세에 있는 필드 하나만 고치는 작은 시트로 연다(시트 시안 없음).
 */
import { mountShell } from './shell.js';
import { api, ApiError } from './api.js';

/** 동의 6종 (API.md 2절 PUT /api/onboarding/profile) */
const CONSENTS = [
  ['TERMS', '이용약관'], ['PRIVACY', '개인정보 처리방침'], ['AGE_14', '만 14세 이상'],
  ['SENSITIVE_HRV', '건강정보'], ['CALENDAR', '구글 캘린더'], ['AI_NOTICE', 'AI 활용 안내'],
];

/** 백엔드 기준 6가지 ("수정 요청사항 2" 1-5: 직접 추가 없음) */
const ACTIVITIES = [
  ['WALK', '걷기'], ['STRETCH', '스트레칭'], ['NAP', '낮잠'],
  ['YOGA', '요가'], ['MEDITATION', '명상'], ['LIGHT_RUN', '가벼운 러닝'],
];

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const chevron = () => {
  const n = document.createElement('img');
  n.src = '../assets/icons/chevron.svg'; n.width = 7; n.height = 11; n.alt = '';
  return n;
};

let me = null;
let settings = null;
let app;
const sheet = typeof document !== 'undefined' ? document.getElementById('sheet') : null;

if (typeof document !== 'undefined') {
  mountShell({ head: false, tab: 'my' });
  app = document.getElementById('app');
  if (window.__myMock) { ({ me, settings } = window.__myMock); render(); } else load();
}

async function load() {
  try {
    [me, settings] = await Promise.all([api('/api/me'), api('/api/me/settings')]);
    render();
  } catch (e) {
    app.replaceChildren(el('p', 'rs-empty', e instanceof ApiError ? e.message : '정보를 불러오지 못했어요.'));
  }
}

function render() {
  app.replaceChildren(el('h1', 'mp-title', '마이페이지'));

  const list = el('nav', 'mp-list');
  list.append(
    row('닉네임 수정', () => editNickname()),
    row('아침 측정 시간 수정', () => editMeasureTime()),
    row('선호 회복 활동 수정', () => editActivities()),
    row('캘린더 연동 관리', () => manageCalendar()),
    consentRow(),
    link('용어 사전', './glossary.html'),
  );
  app.append(list);

  app.append(link('도움 받을 수 있는 곳', './safety.html', 'is-help'));

  const account = el('section', 'mp-account');
  account.append(el('p', 'mp-account__label', '계정 관리'));
  const pair = el('div', 'mp-account__pair');
  pair.append(
    button('로그아웃', 'cd-btn cd-btn--ghost', logout),
    button('회원 탈퇴', 'cd-btn cd-btn--ghost', withdraw),
  );
  account.append(pair);
  app.append(account);
}

function row(label, onClick) {
  const b = el('button', 'mp-row');
  b.type = 'button';
  b.append(el('span', null, label), chevron());
  b.addEventListener('click', onClick);
  return b;
}
function link(label, href, tone = '') {
  const a = el('a', `mp-row ${tone}`.trim());
  a.href = href;
  a.append(el('span', null, label), tone ? helpIcon() : chevron());
  return a;
}
function helpIcon() {
  const n = document.createElement('img');
  n.src = '../assets/icons/help.svg'; n.width = 12; n.height = 12; n.alt = '';
  return n;
}
function button(label, cls, onClick) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** 동의 관리 — 시안은 오른쪽에 'AI 활용 안내 다시 보기'만 있고 화살표가 없다 */
function consentRow() {
  const b = el('button', 'mp-row');
  b.type = 'button';
  b.append(el('span', null, '동의 관리'), el('span', 'mp-row__sub', 'AI 활용 안내 다시 보기'));
  b.addEventListener('click', manageConsents);
  return b;
}

/* ── 시트 ───────────────────────────────── */
function openSheet(title, nodes, onSave) {
  sheet.replaceChildren();
  sheet.append(el('h2', 'mp-sheet__title', title), ...nodes);
  const actions = el('div', 'mp-sheet__actions');
  actions.append(button('닫기', 'cd-btn cd-btn--ghost', () => sheet.close()));
  if (onSave) {
    const save = button('저장', 'cd-btn', async () => {
      save.disabled = true;
      try {
        await onSave();
        sheet.close();
      } catch (e) {
        save.disabled = false;
        error.hidden = false;
        error.textContent = e instanceof ApiError ? e.message : '저장하지 못했어요.';
      }
    });
    actions.append(save);
  }
  const error = el('p', 'mp-sheet__error');
  error.hidden = true;
  sheet.append(error, actions);
  sheet.showModal();
}

function field(type, value, attrs = {}) {
  const i = document.createElement('input');
  i.type = type;
  i.className = 'mp-input';
  i.value = value ?? '';
  Object.assign(i, attrs);
  return i;
}

function editNickname() {
  const input = field('text', me?.nickname, { maxLength: 20, minLength: 1 });
  openSheet('닉네임 수정', [input], async () => {
    me = await api('/api/me', { method: 'PATCH', body: { nickname: input.value.trim() } });
    render();
  });
}

function editMeasureTime() {
  const input = field('time', settings?.measureTime);
  openSheet('아침 측정 시간', [el('p', 'mp-sheet__text', '일어난 직후에 재면 가장 정확해요.'), input], async () => {
    settings = await api('/api/me/settings', { method: 'PUT', body: { ...settings, measureTime: input.value } });
    render();
  });
}

function editActivities() {
  const boxes = ACTIVITIES.map(([code, label]) => {
    const wrap = el('label', 'mp-check');
    const input = field('checkbox', '', { checked: settings?.preferredActivities?.includes(code) ?? false });
    input.value = code;
    wrap.append(input, el('span', null, label));
    return wrap;
  });
  openSheet('선호 회복 활동', [el('p', 'mp-sheet__text', '하나 이상 골라주세요.'), ...boxes], async () => {
    const picked = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    if (!picked.length) throw new ApiError(400, { message: '하나 이상 골라주세요.' });
    settings = await api('/api/me/settings', { method: 'PUT', body: { ...settings, preferredActivities: picked } });
    render();
  });
}

function manageCalendar() {
  const connected = me?.calendar?.connected;
  const nodes = [el('p', 'mp-sheet__text', connected ? '구글 캘린더가 연결돼 있어요.' : '구글 캘린더가 연결돼 있지 않아요.')];
  nodes.push(button(connected ? '연결 해제' : '다시 연결', 'cd-btn cd-btn--ghost', async () => {
    if (!connected) { location.href = '/oauth2/authorization/google-calendar'; return; }
    await api('/api/calendar/connection', { method: 'DELETE' }).catch(() => {});
    sheet.close();
    load();
  }));
  openSheet('캘린더 연동 관리', nodes);
}

/** 동의 관리 (API.md 8절). 시안이 없어 목록 + 철회·재동의·기록 삭제만 둔다. */
async function manageConsents() {
  let list = [];
  try {
    list = (await api('/api/me/consents')).consents ?? [];
  } catch (_) { /* 못 불러와도 안내는 보여준다 */ }
  const by = Object.fromEntries(list.map((c) => [c.type, c]));
  const hrv = by.SENSITIVE_HRV;

  const nodes = [
    el('p', 'mp-sheet__text', 'Come & Down은 해석 문구·추천 문구·일정 분류에 AI를 씁니다. 수치와 일정 제목만 보내고 닉네임·이메일·측정 원신호는 보내지 않아요.'),
  ];
  const rows = el('ul', 'mp-consents');
  for (const [type, label] of CONSENTS) {
    const li = el('li');
    li.append(el('span', null, label), el('b', by[type]?.agreed ? 'is-on' : null, by[type]?.agreed ? '동의함' : '철회됨'));
    rows.append(li);
  }
  nodes.push(rows);

  if (hrv?.agreed) {
    nodes.push(
      el('p', 'mp-sheet__text', '건강정보 동의를 철회하면 측정이 꺼져요. 기록은 남겨둘 수도, 함께 지울 수도 있어요.'),
      button('동의만 철회', 'cd-btn cd-btn--ghost', () => revokeHrv(false)),
      button('철회하고 기록도 삭제', 'cd-btn cd-btn--ghost', () => revokeHrv(true)),
    );
  } else {
    nodes.push(button('건강정보 다시 동의하기', 'cd-btn', async () => {
      await api('/api/me/consents', { method: 'POST', body: { type: 'SENSITIVE_HRV', version: hrv?.version ?? CONSENT_VERSION } });
      sheet.close();
      load();
    }));
  }
  nodes.push(button('건강 기록 전체 삭제', 'cd-btn cd-btn--ghost', deleteHealthData));
  openSheet('동의 관리', nodes);
}

/** 동의 버전을 모를 때 쓰는 기본값. 백엔드가 올리면 같이 올린다. */
const CONSENT_VERSION = '2026-11-01';

async function revokeHrv(deleteData) {
  if (!confirm(deleteData ? '동의를 철회하고 측정 기록도 모두 지울까요?' : '건강정보 동의를 철회할까요? 측정이 꺼져요.')) return;
  await api(`/api/me/consents/SENSITIVE_HRV${deleteData ? '?deleteData=true' : ''}`, { method: 'DELETE' });
  sheet.close();
  load();
}

async function deleteHealthData() {
  if (!confirm('측정·컨디션·번아웃 체크 기록을 모두 지울까요? 되돌릴 수 없어요.')) return;
  await api('/api/hrv/data', { method: 'DELETE' });
  sheet.close();
  load();
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.href = '../index.html';
}

async function withdraw() {
  if (!confirm('탈퇴하면 측정 기록과 설정이 모두 지워져요. 계속할까요?')) return;
  try {
    await api('/api/me', { method: 'DELETE' });
    location.href = '../index.html';
  } catch (e) {
    alert(e instanceof ApiError ? e.message : '탈퇴를 처리하지 못했어요.');
  }
}
