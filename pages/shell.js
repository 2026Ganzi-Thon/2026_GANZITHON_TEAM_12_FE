/**
 * 화면 공통 머리말·단계 표시·하단 탭. 페이지마다 복사하지 않으려고 모듈로 둔다.
 * 시안은 화면마다 머리말 크기·칩 모양이 조금씩 달랐는데
 * ("수정 요청사항 2" 3장 일관성) 한 벌로 통일했다.
 */
const ICON = '../assets/icons';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {object} o
 * @param {string}  [o.title]   머리말 제목. 없으면 로고만
 * @param {string}  [o.chip]    오른쪽 칩 (예: '기준선 만드는 중'), chipValue와 함께
 * @param {string}  [o.chipValue]
 * @param {boolean} [o.back]    뒤로 버튼
 * @param {Array<{label: string, state: 'done'|'current'|'todo'}>} [o.steps]
 * @param {string|false} [o.tab] 하단 탭에서 현재 위치. false면 탭 없음
 */
export function mountShell({ title, chip, chipValue, back = false, steps, tab = false } = {}) {
  const main = document.querySelector('main');

  const head = el('header', 'm-head');
  if (back) {
    const b = el('button', 'm-head__back');
    b.type = 'button';
    b.setAttribute('aria-label', '뒤로');
    b.addEventListener('click', () => history.back());
    const i = document.createElement('img');
    i.src = `${ICON}/back.svg`; i.width = 10; i.height = 16; i.alt = '';
    b.append(i);
    head.append(b);
  }
  if (title) {
    head.append(el('h1', 'm-head__title', title));
  } else {
    const brand = el('span', 'm-head__brand');
    const logo = document.createElement('img');
    logo.src = `${ICON}/logo.svg`; logo.width = 20; logo.height = 20; logo.alt = '';
    brand.append(logo, el('span', null, 'Come & Down'));
    head.append(brand);
  }
  if (chip) {
    const c = el('span', 'm-chip');
    c.append(el('span', null, chip));
    if (chipValue) c.append(el('b', null, chipValue));
    head.append(c);
  }
  main.before(head);

  if (steps) {
    const nav = el('nav', 'm-steps');
    nav.setAttribute('aria-label', '측정 단계');
    const ol = document.createElement('ol');
    steps.forEach((s, idx) => {
      if (idx) {
        const sep = el('li', null, '→');
        sep.setAttribute('aria-hidden', 'true');
        ol.append(sep);
      }
      const li = el('li', `is-${s.state}`, s.state === 'done' ? `✓ ${s.label}` : s.label);
      if (s.state === 'current') li.setAttribute('aria-current', 'step');
      ol.append(li);
    });
    nav.append(ol);
    main.before(nav);
  }

  if (tab) {
    const nav = el('nav', 'm-tabs');
    nav.setAttribute('aria-label', '메뉴');
    for (const [key, label, href, w] of [
      ['home', '홈', '../index.html', 19], ['calendar', '캘린더', './calendar.html', 15],
      ['measure', '측정', './measure.html', 17], ['report', '리포트', './report.html', 15],
      ['my', 'MY', './mypage.html', 15],
    ]) {
      const a = el('a', null);
      a.href = href;
      if (key === tab) a.setAttribute('aria-current', 'page');
      const i = document.createElement('img');
      i.src = `${ICON}/tab-${key}.svg`; i.width = w; i.height = 17; i.alt = '';
      a.append(i, el('span', null, label));
      nav.append(a);
    }
    main.after(nav);
  }
}
