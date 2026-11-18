/**
 * C1 회복 리포트 (docs/API.md 7절)
 *  - C1-1 locked: 유효 측정 7일을 모으는 중. 진행 점 + 일정 부하 + 앞으로 4주 위험 주차
 *  - C1-2 그래프: 시안 수정 대기 ("수정 요청사항 2" 1-9 날짜축 공유)
 * 잠금 해제 전에도 일정 쪽 카드는 보여준다.
 */
import { mountShell } from './shell.js';
import { api, ApiError } from './api.js';

const RISK = {
  RISK:  { label: '위험', bar: '#D98D74', dot: '#D98D74' },
  WATCH: { label: '주의', bar: '#F2C8AB', dot: '#DBA07C' },
  NONE:  { label: '보통', bar: '#A9C0A4', dot: '#8FA98A' },
};
const BAR_MAX_PX = 140;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const info = () => {
  const n = document.createElement('img');
  n.src = '../assets/icons/info-md.svg'; n.width = 13; n.height = 13; n.alt = '';
  return n;
};
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const signed = (n) => `${n > 0 ? '+' : ''}${round1(n)}%`;

/** 서울 기준 이번 주 월요일 (주는 월요일 시작, API.md 0절) */
export function mondayOf(date = new Date()) {
  const seoul = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const diff = (seoul.getDay() + 6) % 7;
  seoul.setDate(seoul.getDate() - diff);
  return `${seoul.getFullYear()}-${String(seoul.getMonth() + 1).padStart(2, '0')}-${String(seoul.getDate()).padStart(2, '0')}`;
}

/** 주차 막대 높이. 가장 높은 주를 꽉 채우고 나머지를 비율로 */
export function barHeights(weeks) {
  const max = Math.max(...weeks.map((w) => w.loadScore ?? 0), 1);
  return weeks.map((w) => Math.round(((w.loadScore ?? 0) / max) * BAR_MAX_PX));
}

export const weekLabel = (idx) => ['이번 주', '다음 주', '3주차', '4주차'][idx] ?? `${idx + 1}주차`;

let app;
// 테스트에서 불러올 때는 화면을 만들지 않는다
if (typeof document !== 'undefined') {
  // 화면이 자기 제목을 그리므로 셸 머리말은 두지 않는다
  mountShell({ head: false, tab: 'report' });
  app = document.getElementById('app');
  if (window.__reportMock) render(window.__reportMock.report, window.__reportMock.weeks);
  else load();
}

async function load() {
  try {
    const [report, weeks] = await Promise.all([
      api('/api/reports/recovery?days=14'),
      api(`/api/schedule/weeks?from=${mondayOf()}&count=4`).catch(() => ({ weeks: [] })),
    ]);
    render(report, weeks.weeks ?? []);
  } catch (e) {
    app.replaceChildren(el('p', 'rs-empty', e instanceof ApiError ? e.message : '리포트를 불러오지 못했어요.'));
  }
}

function render(report, weeks) {
  app.replaceChildren(el('h1', 'rp-title', '회복 리포트'));

  if (report.locked) {
    app.append(lockedCard(report.unlock ?? {}));
  } else {
    // C1-2 그래프는 시안 수정 대기. 그 전까지 요약만 보여준다.
    app.append(summaryCard(report));
  }

  app.append(loadCard(report.loadVsUsualPct));
  if (weeks.length) app.append(riskCard(weeks));
}

function lockedCard({ requiredDays = 7, validDays = 0 }) {
  const card = el('section', 'rp-card rp-locked');
  const top = el('div', 'rp-locked__top');
  top.append(el('p', null, '기준선 만드는 중'), el('p', null, `${validDays}/${requiredDays}`));
  const dots = el('div', 'rp-locked__dots');
  for (let i = 0; i < requiredDays; i++) dots.append(el('span', i < validDays ? 'is-on' : null));
  card.append(top, dots,
    el('p', 'rp-locked__note', `${requiredDays}일째부터 회복 리포트를 볼 수 있어요.`),
    el('p', 'rp-locked__note', "매일 아침 재면 '내 평소'가 만들어져요."));
  return card;
}

function summaryCard(report) {
  const card = el('section', 'rp-card rp-value');
  const head = el('div', 'rp-card__head');
  head.append(el('h2', null, '평소 대비 회복'), info());
  const pct = report.hrvVsUsualPct;
  card.append(head, el('p', 'rp-value__num', pct == null ? '—' : signed(pct)));
  if (report.interpretation?.text) card.append(el('p', 'rp-value__note', report.interpretation.text));
  return card;
}

function loadCard(pct) {
  const card = el('section', 'rp-card rp-value');
  const head = el('div', 'rp-card__head');
  head.append(el('h2', null, '평소 대비 일정 부하'), info());
  card.append(head, el('p', 'rp-value__num is-load', pct == null ? '—' : signed(pct)));
  if (pct == null) card.append(el('p', 'rp-value__note', '캘린더를 연결하면 알려드려요'));
  return card;
}

function riskCard(weeks) {
  const card = el('section', 'rp-card rp-risk');
  const head = el('div', 'rp-card__head');
  head.append(el('h2', null, '앞으로 4주 위험 주차'), info());
  card.append(head);

  const chart = el('div', 'rp-risk__chart');
  const heights = barHeights(weeks);
  weeks.forEach((w, i) => {
    const level = RISK[w.riskLevel] ?? RISK.NONE;
    const col = el('div', 'rp-risk__col');
    const track = el('div', 'rp-risk__track');
    const bar = el('div', 'rp-risk__bar');
    bar.style.height = `${heights[i]}px`;
    bar.style.background = level.bar;
    track.append(bar);
    const legend = el('p', 'rp-risk__legend');
    const dot = el('span', 'rp-risk__dot');
    dot.style.background = level.dot;
    legend.append(dot, el('span', null, level.label));
    col.append(track, el('p', 'rp-risk__week', weekLabel(i)), legend);
    chart.append(col);
  });
  card.append(chart);
  return card;
}
