// node pages/measure-error.test.js — 분기만 확인한다 (DOM 없음)
import assert from 'node:assert/strict';
import { pickView } from './measure-error.js';
import { HRV_STATES, HRV_ERRORS } from '../hrvMeasurement.js';

const { DONE, ERROR, STOPPED, MEASURING } = HRV_STATES;

// 정상 상태는 건드리지 않는다 (measure.js 담당)
assert.equal(pickView(MEASURING), null);
assert.equal(pickView(DONE, { measurement: { retryRequired: false } }), null);

// B3-9 — 해당 사유 1개만. LOW_FPS 포함 4종이 서로 다른 문구를 가져야 한다
const texts = new Set();
for (const reason of ['NO_PULSE', 'TOO_NOISY', 'TOO_SHORT', 'LOW_FPS']) {
  const v = pickView(DONE, { measurement: { retryRequired: true, retryReason: reason } });
  assert.equal(v.view, 'RETRY');
  assert.ok(v.reason?.title, `${reason} 문구 없음`);
  texts.add(v.reason.title);
}
assert.equal(texts.size, 4, '사유마다 다른 문구여야 한다');
// 모르는 사유가 와도 빈 화면이 되면 안 된다
assert.ok(pickView(DONE, { measurement: { retryRequired: true, retryReason: 'WAT' } }).reason.title);

assert.equal(pickView(STOPPED).view, 'STOPPED');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.PERMISSION_DENIED }).view, 'PERMISSION');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.NO_CAMERA }).view, 'UNSUPPORTED');

// http로 열었을 때는 "브라우저 바꾸세요"가 아니라 https 안내여야 한다
assert.match(pickView(ERROR, { type: HRV_ERRORS.INSECURE_CONTEXT }).body, /https/);

// 전송 실패는 재전송 가능, 400은 재전송 버튼이 없어야 한다
assert.deepEqual(pickView(ERROR, { type: HRV_ERRORS.UPLOAD_FAILED }).buttons, ['retryUpload', 'restart']);
assert.ok(!pickView(ERROR, { type: HRV_ERRORS.INVALID_DATA }).buttons.includes('retryUpload'));

// 403은 담당 화면으로 보낸다
assert.equal(pickView(ERROR, { type: HRV_ERRORS.AUTH_REQUIRED, code: 'HRV_CONSENT_REQUIRED' }).goto, 'consent');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.AUTH_REQUIRED, code: 'HRV_DISABLED' }).goto, 'mypage');
assert.equal(pickView(ERROR, { type: HRV_ERRORS.AUTH_REQUIRED }).goto, 'login');

// 모르는 오류도 막다른 길이 되면 안 된다
assert.equal(pickView(ERROR, { type: 'SOMETHING_NEW' }).view, 'UNKNOWN');

console.log('ok');
