// node pages/measure-error.test.js — 분기만 확인한다 (DOM 없음)
import assert from 'node:assert/strict';
import { pickView, IDLE } from './measure-error.js';
import { HRV_STATES, HRV_ERRORS } from '../hrvMeasurement.js';

const { DONE, ERROR, STOPPED, MEASURING } = HRV_STATES;
const actions = (v) => v.buttons.map((b) => b.action);

// 정상 상태는 건드리지 않는다 (measure.js 담당)
assert.equal(pickView(MEASURING), null);
assert.equal(pickView(DONE, { measurement: { retryRequired: false } }), null);

// B3-9 — 해당 사유 1개만. 사유 4종이 서로 다른 문구를 가져야 한다
const reasons = new Set();
for (const reason of ['NO_PULSE', 'TOO_NOISY', 'TOO_SHORT', 'LOW_FPS']) {
  const v = pickView(DONE, { measurement: { retryRequired: true, retryReason: reason } });
  assert.equal(v.view, 'RETRY');
  assert.ok(v.card?.reason, `${reason} 문구 없음`);
  reasons.add(v.card.reason);
}
assert.equal(reasons.size, 4, '사유마다 다른 문구여야 한다');
// 모르는 사유가 와도 빈 화면이 되면 안 된다
assert.ok(pickView(DONE, { measurement: { retryRequired: true, retryReason: 'WAT' } }).card.reason);

// B3-2 — 토스트라서 #state를 차지하지 않는다
const stopped = pickView(STOPPED);
assert.ok(stopped.toast);
assert.equal(stopped.chrome, 'full');

// E1·E2 — 단독으로 서는 화면이라 셸을 감춘다
assert.equal(pickView(ERROR, { type: HRV_ERRORS.PERMISSION_DENIED }).chrome, 'none');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.NO_CAMERA }).view, 'UNSUPPORTED');

// http로 열었을 때는 "브라우저를 바꾸세요"가 아니라 https 안내여야 한다
assert.match(pickView(ERROR, { type: HRV_ERRORS.INSECURE_CONTEXT }).body.join(' '), /https/);

// E5 — 전송 실패는 같은 키로 재전송, 400은 재전송 버튼이 없어야 한다
assert.deepEqual(actions(pickView(ERROR, { type: HRV_ERRORS.UPLOAD_FAILED })), ['retryUpload', 'restart']);
assert.ok(!actions(pickView(ERROR, { type: HRV_ERRORS.INVALID_DATA })).includes('retryUpload'));

// 403은 담당 화면으로 보낸다
assert.equal(pickView(ERROR, { type: HRV_ERRORS.AUTH_REQUIRED, code: 'HRV_CONSENT_REQUIRED' }).goto, 'consent');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.AUTH_REQUIRED, code: 'HRV_DISABLED' }).goto, 'settings');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.AUTH_REQUIRED }).goto, 'login');

// 모르는 오류도 막다른 길이 되면 안 된다
assert.equal(pickView(ERROR, { type: 'SOMETHING_NEW' }).view, 'UNKNOWN');

// E3 — 손가락 대기는 정상 상태지만 B가 그린다
const waiting = pickView(HRV_STATES.WAITING_FINGER);
assert.equal(waiting.view, 'WAITING');
assert.ok(waiting.camera);

// E4 — 플래시를 켤 수 있으면 배너가 없어야 한다
assert.equal(pickView(IDLE, { torch: true }).banner, null);
assert.ok(pickView(IDLE, { torch: false }).banner);
// 아직 모르는 단계(측정 전 조회 안 됨)에서도 배너를 함부로 띄우지 않는다
assert.equal(pickView(IDLE).banner, null);

// 상태 없이 불러도 화면을 만들지 않는다
assert.equal(pickView(undefined), null);

// 모든 화면이 버튼과 제목을 갖는다
for (const v of [stopped, pickView(ERROR, { type: HRV_ERRORS.NO_CAMERA }), pickView(ERROR, { type: 'SOMETHING_NEW' })]) {
  assert.ok(v.toast || (v.title && v.buttons.length), '막다른 화면');
}

console.log('ok');
