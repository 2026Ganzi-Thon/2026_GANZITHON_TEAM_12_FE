/**
 * B5 천천히 숨쉬기 — POST /api/morning-checks/today/breathing (docs/API.md 6절)
 * 건너뛸 수 있고 결과에 영향이 없다. 결과는 컨디션 저장 때 이미 계산돼 있다.
 */
import { mountShell } from './shell.js';
import { api } from './api.js';

const TOTAL_SEC = 60;
const INHALE_SEC = 4;
const EXHALE_SEC = 6;
const CYCLE_SEC = INHALE_SEC + EXHALE_SEC;

/**
 * 경과 초 → 지금 들숨인지와 그 단계의 남은 초. 4초 들숨 → 6초 날숨을 반복한다.
 * @returns {{inhaling: boolean, left: number}}
 */
export function phaseAt(elapsed) {
  const inCycle = elapsed % CYCLE_SEC;
  if (inCycle === 0) return { inhaling: false, left: 1 };       // 날숨 마지막 초
  if (inCycle <= INHALE_SEC) return { inhaling: true, left: INHALE_SEC - inCycle + 1 };
  return { inhaling: false, left: CYCLE_SEC - inCycle + 1 };
}

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// 테스트에서 불러올 때는 화면을 만들지 않는다
if (typeof document !== 'undefined') start();

function start() {
  mountShell({
    title: '아침 1분 체크',
    chip: '기준선 만드는 중', chipValue: '3/7',
    steps: [
      { label: '손가락 측정', state: 'done' },
      { label: '컨디션 체크', state: 'done' },
      { label: '3. 천천히 숨쉬기', state: 'current' },
    ],
  });

  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="br-stage">
      <div class="br-circle">
        <div class="br-circle__ring"></div>
        <div class="br-circle__core is-running">
          <p class="br-circle__phase" id="phase">들이쉬세요</p>
          <p class="br-circle__count" id="phaseSec">${INHALE_SEC}초</p>
        </div>
      </div>
      <p class="br-hint">원이 ${INHALE_SEC}초 동안 커지고(들숨) ${EXHALE_SEC}초 동안 작아져요(날숨)</p>
    </section>

    <section class="br-timer">
      <p class="br-timer__value" id="remain">${fmt(TOTAL_SEC)}</p>
      <p class="br-timer__label">남은 시간</p>
    </section>

    <p class="br-caution">
      <img src="../assets/icons/caution.svg" width="13" height="13" alt="">
      어지러우면 바로 멈추세요
    </p>

    <div class="br-actions">
      <button type="button" class="cd-btn cd-btn--ghost" id="stop">멈추기</button>
      <button type="button" class="cd-btn cd-btn--ghost" id="skip">건너뛰기</button>
    </div>
  `;

  const $ = (id) => document.getElementById(id);
  let elapsed = 0;
  let timer = setInterval(tick, 1000);

  function tick() {
    elapsed += 1;
    $('remain').textContent = fmt(Math.max(0, TOTAL_SEC - elapsed));
    const { inhaling, left } = phaseAt(elapsed);
    $('phase').textContent = inhaling ? '들이쉬세요' : '내쉬세요';
    $('phaseSec').textContent = `${left}초`;
    if (elapsed >= TOTAL_SEC) finish();
  }

  /** 완료·중단 모두 실제 호흡한 시간을 보낸다. 실패해도 결과 화면을 막지 않는다. */
  async function finish() {
    clearInterval(timer);
    timer = null;
    if (elapsed >= 1) {
      try {
        await api('/api/morning-checks/today/breathing', { method: 'POST', body: { durationSec: Math.min(elapsed, 3600) } });
      } catch (_) { /* 호흡 기록은 결과에 영향이 없다 */ }
    }
    location.href = './result.html';
  }

  $('stop').addEventListener('click', finish);
  $('skip').addEventListener('click', () => { clearInterval(timer); location.href = './result.html'; });
}
