/** 용어 사전 — API 없는 정적 화면 (docs/API.md 8절) */
import { mountShell } from './shell.js';
import { GLOSSARY } from './glossary-data.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

mountShell({ title: '용어 사전', back: true });

const app = document.getElementById('app');
app.append(el('p', 'gl-lead', '화면에 나오는 쉬운 용어와 원래 용어를 함께 정리했어요.'));

for (const group of GLOSSARY) {
  app.append(el('h2', 'gl-section', group.section));
  const list = el('dl', 'gl-list');
  for (const t of group.items) {
    const item = el('div', 'gl-item');
    item.id = `term-${t.key}`;
    item.append(
      el('dt', 'gl-easy', t.easy),
      el('dd', 'gl-formal', t.formal),
      el('dd', 'gl-desc', t.desc),
    );
    list.append(item);
  }
  app.append(list);
}

// 팝업에서 특정 용어로 넘어왔을 때 그 자리로 보낸다
if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });
