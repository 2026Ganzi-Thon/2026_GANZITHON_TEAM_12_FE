# 프론트 분업 (B3 아침 1분 체크)

## 누가 뭘 맡나

| | 화면 | 파일 |
|---|---|---|
| **A** | B3-1·3·4·5·6·7·8 (정상 플로우), E3, E4 | `measure.js`, `measure.css` |
| **B** | B3-2, B3-9, E1, E2, E5 (예외·중단·재측정) | `measure-error.js`, `measure-error.css` |

와이어프레임의 위/아래 경계와 달리 **화면 2장을 맞바꿨다**. 코드 상태가 기준이라서다.
- `E3`(손가락을 대주세요)는 `WAITING_FINGER` — 정상 측정 루프의 상태다. B3-5·B3-7과 같은 카메라 뷰를 쓴다 → **A**
- `E4`(밝은 곳에서 측정해주세요)는 B3-1 시작 화면 + 플래시 미지원 배너다 → **A**
- `B3-2`(측정이 중단됐어요)는 `STOPPED` — 예외 묶음이다 → **B**

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
