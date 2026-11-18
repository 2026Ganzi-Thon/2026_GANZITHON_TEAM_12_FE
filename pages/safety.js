/**
 * C3 도움 받을 수 있는 곳 (docs/API.md 9절)
 * 번호는 서버가 확인한 것만 내려오므로 화면에 박아두지 않는다.
 * 안내 문구는 조건에 맞는 1개만 ("수정 요청사항 2" 2장).
 */
import { mountShell } from './shell.js';
import { api, ApiError } from './api.js';

/**
 * 시안의 "학교 상담센터 찾아보기" 카드.
 * API 9절: 학교마다 연락처가 달라 서버 resources에 넣지 않았고, 연결할 주소를 정해야 한다.
 * 주소가 정해지면 여기에 넣으면 카드가 나온다. 그 전까지는 누를 수 없는 줄을 두지 않는다.
 */
const SCHOOL_COUNSELING_URL = null;

const ICON_BY_ID = { 'suicide-prevention-109': 'lifering.svg' };

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (file, size = 15) => {
  const n = document.createElement('img');
  n.src = `../assets/icons/${file}`; n.width = size; n.height = size; n.alt = '';
  return n;
};

let app;
if (typeof document !== 'undefined') {
  mountShell({ aside: '안전 안내' });
  app = document.getElementById('app');
  if (window.__safetyMock) render(window.__safetyMock); else load();
}

async function load() {
  try {
    render(await api('/api/safety'));
  } catch (e) {
    app.replaceChildren(el('p', 'rs-empty', e instanceof ApiError ? e.message : '안내를 불러오지 못했어요.'));
  }
}

function render(data) {
  app.replaceChildren(el('h1', 'sf-title', '혼자 버티지 않아도 괜찮아요'));

  // 열린 안내 중 가장 최근 1건만 (목록을 나열하지 않는다)
  const alert = data.alerts?.[0];
  if (alert?.message) {
    const box = el('section', 'sf-reason');
    box.append(el('span', 'sf-reason__dot'), el('p', null, alert.message));
    app.append(box);
  }

  const list = el('section', 'sf-list');
  for (const r of data.resources ?? []) list.append(resourceRow(r));
  if (SCHOOL_COUNSELING_URL) {
    list.append(linkRow('school.svg', 'is-warm', '학교 상담센터 찾아보기', null, SCHOOL_COUNSELING_URL));
  }
  app.append(list);

  if (data.disclaimer) app.append(el('p', 'sf-disclaimer', data.disclaimer));

  const close = el('button', 'cd-btn sf-close', '닫기');
  close.type = 'button';
  close.addEventListener('click', async () => {
    close.disabled = true;
    // 닫기는 실패해도 화면을 막지 않는다. 조건이 그대로면 다음에 다시 뜬다.
    if (alert?.id != null) await api(`/api/safety/alerts/${alert.id}/acknowledge`, { method: 'POST' }).catch(() => {});
    history.length > 1 ? history.back() : (location.href = '../index.html');
  });
  app.append(close);
}

function resourceRow(r) {
  // 전화번호가 있는 항목에만 전화 버튼을 노출한다 (API.md 9절)
  const href = r.phone ? `tel:${r.phone.replaceAll('-', '')}` : r.url;
  const sub = r.phone ? `${r.phone} · 전화 연결` : (r.url ? '누리집 열기' : null);
  return linkRow(ICON_BY_ID[r.id] ?? 'phone.svg', '', r.name, sub, href);
}

function linkRow(iconFile, tone, title, sub, href) {
  const row = el('a', 'sf-row');
  if (href) row.href = href;
  if (href?.startsWith('http')) { row.target = '_blank'; row.rel = 'noopener'; }
  const badge = el('span', `sf-row__icon ${tone}`.trim());
  badge.append(icon(iconFile));
  const texts = el('div', 'sf-row__texts');
  texts.append(el('p', 'sf-row__title', title));
  if (sub) texts.append(el('p', 'sf-row__sub', sub));
  row.append(badge, texts, icon('chevron.svg', 8));
  return row;
}
