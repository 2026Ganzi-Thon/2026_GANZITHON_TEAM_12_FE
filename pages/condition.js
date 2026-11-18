/** B4 컨디션 체크 — PUT /api/morning-checks/today/condition (docs/API.md 6절) */
import { mountShell } from './shell.js';
import { api, ApiError } from './api.js';

const DISTURBANCES = [
  { key: 'alcohol',  label: '어제 술을 마셨어요' },
  { key: 'sick',     label: '몸이 아파요' },
  { key: 'caffeine', label: '측정 직전에 카페인을 마셨어요' },
];

mountShell({
  title: '아침 1분 체크', back: true,
  chip: '기준선 만드는 중', chipValue: '3/7',
  steps: [
    { label: '손가락 측정', state: 'done' },
    { label: '2. 컨디션 체크', state: 'current' },
    { label: '3. 천천히 숨쉬기', state: 'todo' },
  ],
});

const app = document.getElementById('app');
app.innerHTML = `
  <section class="card ck-score">
    <h2 class="card__title">오늘 아침 컨디션은 어때요?</h2>
    <div class="ck-score__row" role="radiogroup" aria-label="컨디션 점수">
      ${[1, 2, 3, 4, 5].map((n) => `
        <button type="button" class="ck-score__btn" role="radio" aria-checked="false" value="${n}">${n}</button>
      `).join('')}
    </div>
    <div class="ck-score__ends"><span>매우 나쁨</span><span>매우 좋음</span></div>
  </section>

  <section class="ck-dist">
    <h2 class="ck-dist__title">해당하는 것이 있으면 체크해주세요</h2>
    ${DISTURBANCES.map((d) => `
      <label class="ck-dist__item">
        <input type="checkbox" name="${d.key}">
        <span class="ck-dist__box" aria-hidden="true"></span>
        <span>${d.label}</span>
      </label>
    `).join('')}
    <p class="ck-dist__note">
      <img src="../assets/icons/info.svg" width="10" height="10" alt="">
      체크한 날은 '내 평소' 계산에서 빠져요
    </p>
  </section>

  <div class="ck-actions">
    <p class="ck-error" role="alert" hidden></p>
    <button type="button" class="cd-btn" id="next" disabled>다음 (호흡 훈련)</button>
  </div>
`;

let score = null;
const next = app.querySelector('#next');
const error = app.querySelector('.ck-error');

app.querySelectorAll('.ck-score__btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    score = Number(btn.value);
    app.querySelectorAll('.ck-score__btn').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    next.disabled = false;
  });
});

next.addEventListener('click', async () => {
  if (score === null) return;
  next.disabled = true;
  error.hidden = true;
  const body = { score, ...Object.fromEntries(DISTURBANCES.map((d) => [d.key, app.querySelector(`[name=${d.key}]`).checked])) };
  try {
    // 응답 TodayResult를 B6 결과 화면이 그대로 쓴다. 호흡을 건너뛰어도 결과는 이미 계산돼 있다.
    const result = await api('/api/morning-checks/today/condition', { method: 'PUT', body });
    sessionStorage.setItem('todayResult', JSON.stringify(result));
    location.href = './breathing.html';
  } catch (e) {
    next.disabled = false;
    error.hidden = false;
    error.textContent = e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.';
  }
});
