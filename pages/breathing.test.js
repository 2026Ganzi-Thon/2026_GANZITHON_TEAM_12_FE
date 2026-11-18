// node pages/breathing.test.js — 들숨·날숨 전환만 확인한다
import assert from 'node:assert/strict';
import { phaseAt } from './breathing.js';

// 1~4초: 들숨, 남은 초가 4→1로 줄어든다
assert.deepEqual([1, 2, 3, 4].map((s) => phaseAt(s)), [
  { inhaling: true, left: 4 }, { inhaling: true, left: 3 },
  { inhaling: true, left: 2 }, { inhaling: true, left: 1 },
]);
// 5~10초: 날숨, 6→1
assert.deepEqual([5, 6, 7, 8, 9, 10].map((s) => phaseAt(s).left), [6, 5, 4, 3, 2, 1]);
assert.ok([5, 6, 7, 8, 9, 10].every((s) => !phaseAt(s).inhaling));
// 11초째 다시 들숨 — 주기가 이어진다
assert.deepEqual(phaseAt(11), { inhaling: true, left: 4 });
// 남은 초가 주기를 넘지 않는다
for (let s = 0; s <= 60; s++) {
  const { left } = phaseAt(s);
  assert.ok(left >= 1 && left <= 6, `elapsed=${s} left=${left}`);
}
console.log('ok');
