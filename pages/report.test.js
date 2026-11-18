// node pages/report.test.js — 주 시작일과 막대 높이만 확인한다
import assert from 'node:assert/strict';
import { mondayOf, barHeights, weekLabel } from './report.js';

// 주는 월요일 시작 (API.md 0절)
assert.equal(mondayOf(new Date('2026-11-18T03:00:00Z')), '2026-11-16'); // 수요일 → 그 주 월요일
assert.equal(mondayOf(new Date('2026-11-16T03:00:00Z')), '2026-11-16'); // 월요일은 그대로
assert.equal(mondayOf(new Date('2026-11-22T03:00:00Z')), '2026-11-16'); // 일요일은 같은 주

// 가장 높은 주가 꽉 차고 나머지는 비율
assert.deepEqual(barHeights([{ loadScore: 50 }, { loadScore: 100 }, { loadScore: 0 }]), [70, 140, 0]);
// 값이 없어도 터지지 않는다 (캘린더 미연결 → loadScore null)
assert.deepEqual(barHeights([{ loadScore: null }, { loadScore: null }]), [0, 0]);

assert.equal(weekLabel(0), '이번 주');
assert.equal(weekLabel(1), '다음 주');
assert.equal(weekLabel(3), '4주차');
console.log('ok');
