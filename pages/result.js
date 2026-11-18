/**
 * B6 오늘의 측정 결과 (docs/API.md 6절 TodayResult)
 * 한 화면이 두 단계를 그린다.
 *  - BUILDING(B6-1)    기준선 만드는 중. HRV 수치는 보여주되 판단은 하지 않는다.
 *  - ESTABLISHED(B6-2) 평소 대비 % + 상태 + AI 해석.
 * 값은 컨디션 저장 응답을 sessionStorage로 받고, 없으면 오늘 체크를 다시 조회한다.
 */
import { mountShell } from './shell.js';
import { api, ApiError } from './api.js';

const RECOVERY_LABEL = { LOW: '낮음', NORMAL: '평소 범위', INSUFFICIENT: '측정 부족', BUILDING: '기준선 만드는 중' };
const QUALITY_LABEL = { GOOD: '좋음', FAIR: '보통', RETRY: '재측정 필요', UNVERIFIED: '참고용' };
// 추천 이유. 1~7일차에는 회복을 판단할 수 없어 일정만 근거다 ("수정 요청사항 2" 1-8).
const REASON_LABEL = { OVERLOAD: '일정 많음', LOW_RECOVERY: '일정 많음 + 회복 낮음' };

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (file, w, h = w) => {
  const n = document.createElement('img');
  n.src = `../assets/icons/${file}`; n.width = w; n.height = h; n.alt = '';
  return n;
};
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const dateLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00+09:00`);
  return `${iso.replaceAll('-', '.')} ${'일월화수목금토'[d.getDay()]}요일`;
};

// 화면이 자기 머리말(로고·날짜·제목)을 그리므로 셸 머리말·탭은 두지 않는다
mountShell({ head: false });

const app = document.getElementById('app');
load();

async function load() {
  let result = null;
  const cached = sessionStorage.getItem('todayResult');
  if (cached) {
    result = JSON.parse(cached);
  } else {
    try {
      result = (await api('/api/morning-checks/today'))?.result;
    } catch (e) {
      return fail(e);
    }
  }
  if (!result) return fail(new Error('아직 오늘 체크를 마치지 않았어요.'));
  render(result);
}

function fail(e) {
  app.replaceChildren(
    el('p', 'rs-empty', e instanceof ApiError ? e.message : e.message || '결과를 불러오지 못했어요.'),
  );
  app.append(homeButton());
}

function homeButton() {
  const b = el('button', 'cd-btn cd-btn--ghost rs-home', '홈으로');
  b.type = 'button';
  b.addEventListener('click', () => { location.href = '../index.html'; });
  return b;
}

function render(r) {
  const building = r.phase === 'BUILDING';
  app.replaceChildren();

  // 머리말
  const head = el('div', 'rs-head');
  head.append(icon('logo.svg', 40), (() => {
    const t = el('div');
    t.append(el('p', 'rs-head__date', dateLabel(r.date)), el('h1', 'rs-head__title', '오늘의 측정 결과'));
    return t;
  })());
  app.append(head);

  app.append(building ? baselineCard(r) : recoveryCard(r));
  app.append(qualityCard(r, building));
  if (!building && r.interpretation?.text) app.append(interpretationCard(r.interpretation));
  if (r.excludedFromBaseline) app.append(excludedNote());
  for (const s of r.suggestions ?? []) app.append(suggestionCard(s, building));
  app.append(homeButton());
}

/** B6-1 — 7일 중 며칠 모았는지 */
function baselineCard(r) {
  const { validDays = 0, required = 7 } = r.baseline ?? {};
  const card = el('section', 'rs-card rs-baseline');
  const title = el('p', 'rs-baseline__title');
  title.append(el('span', null, '기준선 만드는 중'), el('b', null, `${validDays}/${required}`));
  const dots = el('div', 'rs-baseline__dots');
  for (let i = 0; i < required; i++) dots.append(el('span', i < validDays ? 'is-on' : null));
  card.append(title, dots, el('p', 'rs-baseline__note', `${required}일째부터 평소 대비 회복을 알려드려요`));
  return card;
}

/** B6-2 — 평소 대비 % + 상태 칩 */
function recoveryCard(r) {
  const card = el('section', 'rs-card rs-recovery');
  const top = el('div', 'rs-card__top');
  const label = el('div', 'rs-card__label');
  label.append(el('span', null, '오늘의 회복'), icon('info-sm.svg', 11));
  top.append(label, el('span', 'rs-chip rs-chip--solid', RECOVERY_LABEL[r.recovery?.status] ?? '—'));

  const pct = r.recovery?.changePct;
  const body = el('div', 'rs-recovery__body');
  if (pct == null) {
    body.append(el('p', 'rs-recovery__na', '평소와 비교할 자료가 아직 부족해요'));
  } else {
    body.append(el('p', 'rs-recovery__lead', '평소보다'));
    const row = el('p', 'rs-recovery__value');
    row.append(el('b', null, `${Math.abs(round1(pct))}%`), el('span', null, pct < 0 ? '낮아요' : '높아요'));
    body.append(row);
  }
  card.append(top, body);
  return card;
}

/** BUILDING은 HRV·심박수를 큰 카드 둘로, ESTABLISHED는 품질 한 줄로 보여준다 */
function qualityCard(r, building) {
  if (building) {
    const wrap = el('section', 'rs-metrics');
    wrap.append(metric('HRV', round1(r.rmssdMs), 'ms'), metric('심박수', round1(r.heartRateBpm), 'bpm'));
    const q = el('section', 'rs-card rs-quality');
    const label = el('div', 'rs-card__label');
    label.append(el('span', null, '측정 품질'), icon('info-sm.svg', 11));
    q.append(label, el('span', 'rs-chip', QUALITY_LABEL[r.qualityLevel] ?? '—'));
    const box = document.createDocumentFragment();
    box.append(wrap, q);
    return box;
  }
  const card = el('section', 'rs-card rs-quality-line');
  const label = el('div', 'rs-card__label');
  label.append(el('span', null, '측정 품질'), icon('info-sm.svg', 11));
  const row = el('div', 'rs-quality-line__row');
  row.append(el('span', 'rs-chip rs-chip--dot', QUALITY_LABEL[r.qualityLevel] ?? '—'));
  if (r.rmssdMs != null) row.append(el('span', 'rs-sep', '·'), el('span', null, `HRV ${round1(r.rmssdMs)}ms`));
  if (r.heartRateBpm != null) row.append(el('span', 'rs-sep', '·'), el('span', null, `심박수 ${round1(r.heartRateBpm)}bpm`));
  card.append(label, row);
  return card;
}

function metric(name, value, unit) {
  const card = el('div', 'rs-card rs-metric');
  const label = el('div', 'rs-card__label');
  label.append(el('span', null, name), icon('info-sm.svg', 11));
  const v = el('p', 'rs-metric__value');
  v.append(el('b', null, value == null ? '—' : String(value)), el('span', null, unit));
  card.append(label, v);
  return card;
}

function aiBadge() {
  const b = el('span', 'rs-badge');
  b.append(icon('ai.svg', 11, 10), el('span', null, 'AI 생성'));
  return b;
}

function interpretationCard(interpretation) {
  const card = el('section', 'rs-card rs-ai');
  const top = el('div', 'rs-card__top');
  // fallback(규칙 기반)일 때는 배지를 달지 않는다 (API.md 0절 "AI 문구 표시")
  top.append(interpretation.aiGenerated ? aiBadge() : el('span'), el('span', 'rs-card__hint', 'AI 해석'));
  card.append(top, el('p', 'rs-ai__text', interpretation.text));
  return card;
}

function excludedNote() {
  const note = el('p', 'rs-excluded');
  note.append(icon('info-sm.svg', 12), el('span', null, "오늘 값은 '내 평소' 계산에서 빠져요"));
  return note;
}

function suggestionCard(s, building) {
  const card = el('section', 'rs-card rs-suggest');
  const top = el('div', 'rs-card__top');
  top.append(el('h2', 'rs-suggest__title', '오늘의 운동·휴식 추천'), s.message?.aiGenerated ? aiBadge() : el('span'));
  card.append(top);

  const reason = REASON_LABEL[s.reasonCode] ?? null;
  const reasonText = [reason, s.title].filter(Boolean).join(' · ');
  if (reasonText) card.append(el('p', building ? 'rs-suggest__reason' : 'rs-suggest__reason is-boxed', reasonText));

  const when = el('div', 'rs-suggest__when');
  const art = el('span', 'rs-suggest__icon');
  art.append(icon('walk.svg', 9, 14));
  const texts = el('div');
  texts.append(el('p', 'rs-suggest__slot', slotLabel(s)), el('p', 'rs-suggest__hint', '승인 시 구글 캘린더에 반영'));
  when.append(art, texts);
  card.append(when);

  const actions = el('div', 'rs-suggest__actions');
  const later = el('button', 'cd-btn cd-btn--ghost', '다음에');
  const add = el('button', 'cd-btn', '캘린더에 추가');
  later.type = add.type = 'button';
  const status = el('p', 'rs-suggest__status');
  status.hidden = true;

  const act = async (path, label, el2) => {
    later.disabled = add.disabled = true;
    try {
      await api(`/api/suggestions/${s.id}/${path}`, { method: 'POST', idempotencyKey: crypto.randomUUID() });
      actions.remove();
      status.hidden = false;
      status.textContent = label;
    } catch (e) {
      later.disabled = add.disabled = false;
      status.hidden = false;
      status.textContent = e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.';
    }
  };
  later.addEventListener('click', () => act('dismiss', '다음에 다시 알려드릴게요'));
  add.addEventListener('click', () => act('approve', '구글 캘린더에 넣었어요'));
  actions.append(later, add);
  card.append(actions, status);
  return card;
}

function slotLabel(s) {
  if (!s.start) return s.title ?? '';
  const d = new Date(s.start);
  const day = '일월화수목금토'[d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${hh}:${mm} · ${s.title ?? ''}`.trim();
}
