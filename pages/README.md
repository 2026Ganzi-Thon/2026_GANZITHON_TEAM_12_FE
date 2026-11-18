# 프론트 분업 (B3 아침 1분 체크)

## 누가 뭘 맡나

화면 단위로 나눈다. **B(나)** = B3 예외·재측정, 컨디션·호흡·결과, 리포트·마이페이지.

| | 화면 |
|---|---|
| **A** | A1~A4 온보딩 · B1 홈 · B2 캘린더 · B3-1~B3-8 측정 정상 플로우 |
| **B** | B3-9 · E1~E5 · B4 컨디션 · B5 호흡 · B6-1·B6-2 결과 · C1-1·C1-2 리포트 · C2 마이페이지 · C3 안전 안내 · C4 용어 팝업 · 용어 사전 |

주의: **E3(손가락 대기)와 E4(측정 시작·플래시 배너)는 화면은 B가 그리지만
상태는 정상 플로우**(`WAITING_FINGER`, 시작 전)다. 그래서 A의 `measure.js`가
`renderError`를 부르는 지점이 예외 상태에만 걸리지 않는다 — 아래 접점 참고.

E4는 B3-1(측정 시작 전)과 같은 화면에 배너만 더한 것이라 둘이 겹친다.
B3-2(측정 중단)도 같은 모양이라, 둘 다 `#banner`에 얹는 조각으로 넘긴다.

## 접점은 이것뿐

```js
// measure.js (A)
import { renderError } from './measure-error.js';
const stateEl = document.getElementById('state');

onStateChange(state, payload, detail) {
  if (renderError(stateEl, state, detail ?? payload, actions)) return;  // 예외면 여기서 끝
  renderNormal(state, payload);
}
```
`renderError`는 자기 화면이 아니면 `false`를 돌려준다. A는 어떤 상태가 예외인지 알 필요가 없다.

`actions`는 `{ restart, skipToday, retryUpload, home, goto }`. 화면 전환은 A가 쥐고 있으므로 A가 넘긴다.

셸과의 약속 두 가지:
- `renderError`가 `body[data-chrome]`을 `full`/`none`으로 바꾼다. `none`이면 머리말·단계·탭이 숨는다(E1·E2처럼 단독으로 서는 화면).
- B3-2(측정 중단)는 전체 화면이 아니라 **시작 화면 위에 얹는 토스트**다. 이때만 `renderError`가 `#toast`를 채우고 `false`를 돌려주므로, A는 평소대로 시작 화면을 그리면 된다.

## 파일

| 파일 | 화면 |
|---|---|
| `measure-error.js/css` | B3-9 · E1~E5 · B3-2 토스트 |
| `condition.html/js` | B4 컨디션 체크 |
| `breathing.html/js` | B5 천천히 숨쉬기 |
| `checkin.css` | B4·B5 공용 |
| `shell.js` | 머리말·단계 표시·하단 탭. 페이지마다 복사하지 않으려고 모듈로 둔다 |
| `api.js` | `api(path, {method, body})` — CSRF 헤더·쿠키·오류 코드 처리 (API.md 0절) |

아침 체크 흐름: `measure.html` → `condition.html` → `breathing.html` → `result.html`.
컨디션 저장 응답(TodayResult)을 `sessionStorage.todayResult`에 넣고 결과 화면이 그대로 쓴다.
호흡은 건너뛸 수 있어 결과 계산은 컨디션 저장 시점이다.

## 공용 파일 — 바꾸기 전에 서로 말한다

- `pages/measure.html` — 셸. `#state`가 공유 지점
- `styles/base.css` — 색·글자·간격 토큰
- `hrvMeasurement.js` — 측정 엔진. **둘 다 읽기만**

장수 브랜치(`FE-A`/`FE-B`)에 공용 파일 변경을 쌓아두지 않는다. 따로 올려 바로 머지한다.

## 브랜치

사람당 하나(`FE-A`, `FE-B`). 머지는 **squash 말고 일반 merge** — 브랜치를 계속 재사용하므로
squash하면 다음 PR에 이전 변경이 또 올라온다. 하루 한 번 `git pull --rebase origin main`.

## 알아둘 것

- `B3-9`는 `ERROR`가 아니라 **`DONE`**으로 온다. 저장은 성공했고 품질만 미달(`measurement.retryRequired`)이라서다.
- `GET /api/morning-checks/today`가 `steps.measurement.qualityLevel: 'RETRY'` + `done: false`면
  **측정 탭 진입 시점에도** B3-9를 띄워야 한다. 진입 분기는 A 담당.
- 확인용: `npx vite` → `/pages/measure-error.dev.html` (예외 화면 14가지를 measure.js 없이 띄운다)
- 목업: `?mockStatus=retry|drop-once|csrf-once|400|401|403|500`

## 디자이너에게 확인 필요

1. `retryReason` **LOW_FPS** 문구 — 시안은 사유 3개, API 명세는 4개
2. **401·403 화면 없음** — 건강정보 미동의, 측정 꺼짐, 온보딩 미완료, 로그인 만료, 탈퇴 처리 중
3. `--cd-ink-mute`(보조 글자), `--cd-line`(구분선) 색 — 시안에 단독으로 안 나와 눈대중
