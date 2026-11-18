/**
 * C4 용어 팝업. 화면 곳곳의 ⓘ를 눌렀을 때 그 용어만 보여준다.
 * 본문은 용어 사전과 같은 데이터를 쓴다(glossary-data.js).
 */
import { findTerm } from './glossary-data.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (file, w, h) => {
  const n = document.createElement('img');
  n.src = `../assets/icons/${file}`; n.width = w; n.height = h; n.alt = '';
  return n;
};

let dialog = null;

/**
 * @param {string} key  glossary-data.js의 key
 * @param {{label?: string, value?: string}} [chip]  팝업 위에 띄우는 현재 값
 */
export function openTerm(key, chip) {
  const term = findTerm(key);
  if (!term) return;

  if (!dialog) {
    dialog = el('dialog', 'tp');
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  dialog.replaceChildren();

  const wrap = el('div', 'tp__wrap');
  if (chip?.label) {
    const c = el('div', 'tp__chip');
    c.append(el('span', null, chip.label));
    if (chip.value) c.append(el('b', null, chip.value));
    c.append(icon('info-sm.svg', 10, 13));
    wrap.append(c);
  }

  const card = el('section', 'tp__card');
  card.append(el('h2', 'tp__title', `${term.easy} = ${term.formal}`));
  card.append(el('p', 'tp__desc', term.desc));

  const more = el('a', 'cd-btn cd-btn--ghost tp__more');
  more.href = './glossary.html';
  more.append(icon('book.svg', 15, 13), el('span', null, '마이페이지 용어 사전 보기'));
  card.append(more);

  const close = el('button', 'tp__close');
  close.type = 'button';
  close.setAttribute('aria-label', '닫기');
  close.append(icon('close.svg', 13, 13));
  close.addEventListener('click', () => dialog.close());

  wrap.append(card);
  dialog.append(close, wrap);
  dialog.showModal();
}

/** ⓘ 버튼 하나 만들기. 화면에서 term 키만 넘기면 된다 */
export function infoButton(key, chip) {
  const b = el('button', 'tp__info');
  b.type = 'button';
  b.setAttribute('aria-label', `${key} 설명 보기`);
  b.append(icon('info-sm.svg', 11, 11));
  b.addEventListener('click', () => openTerm(key, typeof chip === 'function' ? chip() : chip));
  return b;
}
