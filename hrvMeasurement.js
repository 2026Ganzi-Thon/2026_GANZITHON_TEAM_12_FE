/**
 * HRV 손가락 PPG 밝기 수집 모듈
 */

export const HRV_STATES = {
  PREPARING_CAMERA: 'PREPARING_CAMERA',
  WAITING_FINGER: 'WAITING_FINGER',
  WARMUP: 'WARMUP',
  MEASURING: 'MEASURING',
  UPLOADING: 'UPLOADING',
  DONE: 'DONE',
  ERROR: 'ERROR',
  STOPPED: 'STOPPED',
};

export const HRV_ERRORS = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NO_CAMERA: 'NO_CAMERA',
  INSECURE_CONTEXT: 'INSECURE_CONTEXT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
};

const TOTAL_DURATION_MS = 70000;   // 총 70초 (준비 10초 + 측정 60초)
const WARMUP_DURATION_MS = 10000;  // 준비 10초
const FINGER_HOLD_MS = 1000;       // 측정 시작을 위한 손가락 연속 감지 시간 (1초)
const FINGER_LOST_RESET_MS = 3000; // 측정 중 데이터 초기화 기준 이탈 시간 (3초)
const SAMPLE_SIZE = 32;            // 32x32 캔버스

/**
 * 로컬 시간대 오프셋이 포함된 ISO 8601 문자열 반환 (예: 2026-11-12T07:12:03+09:00)
 */
function toLocalISOString(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offsetHours = pad(offsetMin / 60);
  const offsetMinutes = pad(offsetMin % 60);

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${offsetHours}:${offsetMinutes}`
  );
}

function round2(num) {
  return Math.round(num * 100) / 100;
}

/**
 * 노출·화이트밸런스·초점 고정 (Android Chrome 등 지원 기기만 적용)
 */
async function lockCamera(track) {
  if (!track) return false;
  const caps = track.getCapabilities?.() ?? {};
  const adv = {};
  if (caps.exposureMode?.includes('manual')) adv.exposureMode = 'manual';
  if (caps.whiteBalanceMode?.includes('manual')) adv.whiteBalanceMode = 'manual';
  if (caps.focusMode?.includes('manual')) adv.focusMode = 'manual';
  if (Object.keys(adv).length === 0) return false;
  try {
    await track.applyConstraints({ advanced: [adv] });
    return true;
  } catch (_) {
    return false; // 실패해도 측정은 계속
  }
}

/**
 * 3초 이탈 시 노출·화이트밸런스·초점 고정 해제
 */
async function unlockCamera(track) {
  if (!track) return;
  const caps = track.getCapabilities?.() ?? {};
  const adv = {};
  if (caps.exposureMode?.includes('continuous')) adv.exposureMode = 'continuous';
  if (caps.whiteBalanceMode?.includes('continuous')) adv.whiteBalanceMode = 'continuous';
  if (caps.focusMode?.includes('continuous')) adv.focusMode = 'continuous';
  if (Object.keys(adv).length === 0) return;
  try {
    await track.applyConstraints({ advanced: [adv] });
  } catch (_) {
    // 해제 미지원 시 무시
  }
}

export function createHrvMeasurement(options = {}) {
  const {
    onStateChange = () => {},
    onSignal = () => {},
    onProgress = () => {},
    endpoint = '/api/hrv/measurements',
    skipUpload = false, // 백엔드 미준비 시 업로드 건너뛰고 즉시 완료 처리 옵션
  } = options;

  let currentState = null;
  let stream = null;
  let videoTrack = null;
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let wakeLock = null;

  let frameCallbackId = null;
  let useRVFC = false;
  let isActive = false;
  let isCanceled = false;
  let sessionSeq = 0; // 비동기 경합 방지용 세션 ID

  // 세션 측정 메타데이터 및 수집 배열
  let torchEnabled = false;
  let exposureLocked = false;
  let timeSource = null; // 'captureTime' | 'mediaTime' | 'performance'
  let startedAtISO = null;
  let measurementStartTimestamp = null;
  let lastRawTimestamp = -Infinity;

  let tArr = [];
  let rArr = [];
  let gArr = [];
  let lastPayload = null; // 서버 전송용
  let lastDownloadData = null; // 로컬 다운로드용 페이로드 (exposureLocked 포함)

  // 손가락 상태 및 1초 슬라이딩 윈도우 버퍼
  let fingerDetectStartTime = null;
  let fingerLostStartTime = null;
  let recentFrames = []; // { time, r, g, status }

  function setState(nextState, payload = undefined) {
    if (currentState === nextState && nextState !== HRV_STATES.ERROR) return;
    currentState = nextState;
    onStateChange(nextState, payload);
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) {
      // WakeLock 미지원 또는 배터리 절약 모드 거부 시 무시하고 진행
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (_) {}
      wakeLock = null;
    }
  }

  function cleanupCamera() {
    isActive = false;
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (frameCallbackId !== null && videoEl) {
      if (useRVFC && typeof videoEl.cancelVideoFrameCallback === 'function') {
        videoEl.cancelVideoFrameCallback(frameCallbackId);
      } else {
        cancelAnimationFrame(frameCallbackId);
      }
      frameCallbackId = null;
    }

    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      stream = null;
    }
    videoTrack = null;

    if (videoEl) {
      videoEl.srcObject = null;
      videoEl = null;
    }

    releaseWakeLock();
  }

  function handleVisibilityChange() {
    if (document.hidden && (isActive || currentState === HRV_STATES.PREPARING_CAMERA)) {
      stop();
    }
  }

  function resetCollectedData() {
    tArr = [];
    rArr = [];
    gArr = [];
    startedAtISO = null;
    measurementStartTimestamp = null;
    fingerDetectStartTime = null;
    fingerLostStartTime = null;
  }

  /**
   * 프레임 단위 상태 판정 및 1초 윈도우 통계 계산
   */
  function evaluateSignal(nowMs, rAvg, gAvg) {
    let rawStatus = 'OK';
    if (rAvg < 120) {
      rawStatus = 'TOO_DARK';
    } else if (gAvg === 0 || rAvg / gAvg < 2.5) {
      rawStatus = 'NO_FINGER';
    } else if (rAvg >= 250) {
      rawStatus = 'TOO_BRIGHT';
    }

    recentFrames.push({ time: nowMs, r: rAvg, g: gAvg, status: rawStatus });

    // 최근 1초(1000ms) 데이터만 유지
    const cutoff = nowMs - 1000;
    while (recentFrames.length > 0 && recentFrames[0].time < cutoff) {
      recentFrames.shift();
    }

    const count = recentFrames.length;
    const fps = count;

    // 1초 R 평균 및 표준편차 계산
    let sumR = 0;
    for (let i = 0; i < count; i++) sumR += recentFrames[i].r;
    const meanR = count > 0 ? sumR / count : rAvg;

    let varianceSum = 0;
    const issueCounts = { TOO_DARK: 0, NO_FINGER: 0, TOO_BRIGHT: 0 };

    for (let i = 0; i < count; i++) {
      const f = recentFrames[i];
      const diff = f.r - meanR;
      varianceSum += diff * diff;
      if (f.status !== 'OK') {
        issueCounts[f.status] = (issueCounts[f.status] || 0) + 1;
      }
    }

    const stdDevR = count > 1 ? Math.sqrt(varianceSum / count) : 0;
    const moving = stdDevR > 3;

    // 최근 1초 동안 문제 프레임이 20%를 초과할 때만 문제 상태로 판정
    let finalFinger = 'OK';
    if (count > 0) {
      const issueEntries = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);
      const [topIssue, topCount] = issueEntries[0];
      if (topCount / count > 0.2) {
        finalFinger = topIssue;
      }
    }

    // 파형 값: 최근 1초 R 평균 - 현재 R 값 (박동 시 R 감소 -> 양수 피크)
    const wave = round2(meanR - rAvg);

    return {
      finger: finalFinger,
      moving,
      wave,
      fps,
    };
  }

  /**
   * 매 프레임 처리 루프
   */
  function processFrame(now, metadata) {
    if (!isActive || isCanceled || !videoEl) return;

    // 다음 프레임 예약
    scheduleNextFrame();

    if (videoEl.readyState < videoEl.HAVE_CURRENT_DATA) return;

    // 1. 촬영 시각 추출 (첫 프레임에서 결정된 방식을 세션 끝까지 유지)
    let rawTimestamp;
    if (useRVFC && metadata) {
      if (timeSource === null) {
        if (typeof metadata.captureTime === 'number' && metadata.captureTime > 0) {
          timeSource = 'captureTime';
        } else if (typeof metadata.mediaTime === 'number') {
          timeSource = 'mediaTime';
        } else {
          timeSource = 'performance';
        }
      }

      if (timeSource === 'captureTime') {
        rawTimestamp = metadata.captureTime;
      } else if (timeSource === 'mediaTime') {
        rawTimestamp = metadata.mediaTime * 1000;
      } else {
        rawTimestamp = now;
      }
    } else {
      if (timeSource === null) {
        timeSource = 'performance';
      }
      rawTimestamp = performance.now();
    }

    // 중복 프레임 제외 (촬영 시각이 이전 프레임과 같거나 앞서면 건너뜀)
    if (rawTimestamp <= lastRawTimestamp) {
      return;
    }
    lastRawTimestamp = rawTimestamp;

    // 2. 밝기 계산: 가운데 가로·세로 50% 영역을 32x32 캔버스에 축소 렌더링
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return;

    const sx = vw * 0.25;
    const sy = vh * 0.25;
    const sw = vw * 0.5;
    const sh = vh * 0.5;

    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

    let rSum = 0;
    let gSum = 0;
    const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;

    for (let i = 0; i < imageData.length; i += 4) {
      rSum += imageData[i];
      gSum += imageData[i + 1];
    }

    const rAvg = rSum / pixelCount;
    const gAvg = gSum / pixelCount;

    // 5. 손가락 상태 판정 및 이벤트 전달
    const signal = evaluateSignal(rawTimestamp, rAvg, gAvg);
    onSignal(signal);

    // 상태별 전환 및 데이터 수집 로직
    if (currentState === HRV_STATES.WAITING_FINGER) {
      if (signal.finger === 'OK') {
        if (fingerDetectStartTime === null) {
          fingerDetectStartTime = rawTimestamp;
        } else if (rawTimestamp - fingerDetectStartTime >= FINGER_HOLD_MS) {
          // 1초 이상 연속 감지 완료 -> WARMUP 시작 (0초 기준점)
          resetCollectedData();
          startedAtISO = toLocalISOString(new Date());
          measurementStartTimestamp = rawTimestamp;
          setState(HRV_STATES.WARMUP);
          recordSample(0, rAvg, gAvg);
          onProgress({ elapsedMs: 0, totalMs: TOTAL_DURATION_MS, warmupMs: WARMUP_DURATION_MS });

          // WARMUP 진입 순간 노출·화이트밸런스·초점 고정
          const activeTrack = videoTrack;
          const currentSeq = sessionSeq;
          lockCamera(activeTrack).then((locked) => {
            if (isCanceled || currentSeq !== sessionSeq) return;
            if (currentState === HRV_STATES.WARMUP || currentState === HRV_STATES.MEASURING) {
              exposureLocked = locked;
            }
          });
        }
      } else {
        fingerDetectStartTime = null;
      }
    } else if (currentState === HRV_STATES.WARMUP || currentState === HRV_STATES.MEASURING) {
      // 측정 중 초기화 대상: NO_FINGER, TOO_DARK만 3초 이상 지속 시 초기화 (TOO_BRIGHT, moving은 안내만)
      const isLostCondition = signal.finger === 'NO_FINGER' || signal.finger === 'TOO_DARK';
      if (isLostCondition) {
        if (fingerLostStartTime === null) {
          fingerLostStartTime = rawTimestamp;
        } else if (rawTimestamp - fingerLostStartTime >= FINGER_LOST_RESET_MS) {
          resetCollectedData();
          exposureLocked = false;
          unlockCamera(videoTrack); // [1-1] 3초 이탈 시 고정 해제
          onProgress({ elapsedMs: 0, totalMs: TOTAL_DURATION_MS, warmupMs: WARMUP_DURATION_MS });
          setState(HRV_STATES.WAITING_FINGER);
          return;
        }
      } else {
        fingerLostStartTime = null;
      }

      const elapsedMs = rawTimestamp - measurementStartTimestamp;
      recordSample(elapsedMs, rAvg, gAvg);
      onProgress({
        elapsedMs: Math.min(elapsedMs, TOTAL_DURATION_MS),
        totalMs: TOTAL_DURATION_MS,
        warmupMs: WARMUP_DURATION_MS,
      });

      // 10초 경과 시 WARMUP -> MEASURING 전환
      if (currentState === HRV_STATES.WARMUP && elapsedMs >= WARMUP_DURATION_MS) {
        setState(HRV_STATES.MEASURING);
      }

      // 70초 완료 시 수집 종료 및 업로드
      if (elapsedMs >= TOTAL_DURATION_MS) {
        completeMeasurement();
      }
    }
  }

  function recordSample(elapsedMs, rAvg, gAvg) {
    const tVal = round2(elapsedMs);
    // 반올림으로 인해 이전 t 값과 동일해지는 경우 미세 보정하여 엄격한 증가 순서 보장
    const prevT = tArr.length > 0 ? tArr[tArr.length - 1] : -1;
    const safeT = tVal <= prevT ? round2(prevT + 0.01) : tVal;

    tArr.push(safeT);
    rArr.push(round2(rAvg));
    gArr.push(round2(gAvg));
  }

  function scheduleNextFrame() {
    if (!isActive|| isCanceled || !videoEl) return;
    if (useRVFC) {
      frameCallbackId = videoEl.requestVideoFrameCallback(processFrame);
    } else {
      frameCallbackId = requestAnimationFrame((ts) => processFrame(ts, null));
    }
  }

  async function completeMeasurement() {
    cleanupCamera();

    lastPayload = {
      startedAt: startedAtISO,
      torch: torchEnabled,
      timeSource: timeSource || 'performance',
      t: tArr,
      r: rArr,
      g: gArr,
    };

    // 테스트 페이지 다운로드용 JSON 데이터 (exposureLocked 포함)
    lastDownloadData = {
      ...lastPayload,
      exposureLocked,
    };

    if (skipUpload) {
      setState(HRV_STATES.DONE, { skippedUpload: true, payload: lastDownloadData });
      return;
    }

    await uploadData(lastPayload);
  }

  async function uploadData(payload) {
    setState(HRV_STATES.UPLOADING);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const data = await response.json();
      setState(HRV_STATES.DONE, data);
      return data;
    } catch (err) {
      setState(HRV_STATES.ERROR, HRV_ERRORS.UPLOAD_FAILED);
      return null;
    }
  }

  /**
   * 측정 세션 시작
   */
  async function start() {
    if (isActive || currentState === HRV_STATES.PREPARING_CAMERA) return;

    // 6. HTTPS 보안 컨텍스트 검증
    if (!window.isSecureContext) {
      setState(HRV_STATES.ERROR, HRV_ERRORS.INSECURE_CONTEXT);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState(HRV_STATES.ERROR, HRV_ERRORS.NO_CAMERA);
      return;
    }

    const mySession = ++sessionSeq;
    isCanceled = false;

    resetCollectedData();
    recentFrames = [];
    lastRawTimestamp = -Infinity;
    timeSource = null;
    torchEnabled = false;
    exposureLocked = false;
    lastPayload = null;
    lastDownloadData = null;

    setState(HRV_STATES.PREPARING_CAMERA);

    let acquiredStream = null;
    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60 },
        },
      });
    } catch (err) {
      if (isCanceled || mySession !== sessionSeq) return;

      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setState(HRV_STATES.ERROR, HRV_ERRORS.PERMISSION_DENIED);
      } else {
        setState(HRV_STATES.ERROR, HRV_ERRORS.NO_CAMERA);
      }
      return;
    }

    if (isCanceled || mySession !== sessionSeq) {
      acquiredStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
      return;
    }

    stream = acquiredStream;
    videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      cleanupCamera();
      setState(HRV_STATES.ERROR, HRV_ERRORS.NO_CAMERA);
      return;
    }

    // 플래시(torch) 지원 여부 확인 및 활성화 (미지원 시 오류 없이 false 진행)
    try {
      const capabilities = typeof videoTrack.getCapabilities === 'function'
        ? videoTrack.getCapabilities()
        : {};
      if (capabilities.torch) {
        await videoTrack.applyConstraints({
          advanced: [{ torch: true }],
        });
        if (isCanceled || mySession !== sessionSeq) {
          cleanupCamera();
          return;
        }
        torchEnabled = true;
      }
    } catch (_) {
      if (isCanceled || mySession !== sessionSeq) {
        cleanupCamera();
        return;
      }
      torchEnabled = false;
    }

    // 오프스크린 비디오 및 32x32 캔버스 준비
    videoEl = document.createElement('video');
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    videoEl.srcObject = stream;

    canvasEl = document.createElement('canvas');
    canvasEl.width = SAMPLE_SIZE;
    canvasEl.height = SAMPLE_SIZE;
    ctx = canvasEl.getContext('2d', { willReadFrequently: true });

    try {
      await videoEl.play();
    } catch (_) {
      if (isCanceled || mySession !== sessionSeq) {
        cleanupCamera();
        return;
      }
      cleanupCamera();
      setState(HRV_STATES.ERROR, HRV_ERRORS.NO_CAMERA);
      return;
    }

    // videoEl.play() 직후 중단 여부 재확인
    if (isCanceled || mySession !== sessionSeq) {
      cleanupCamera();
      return;
    }

    useRVFC = typeof videoEl.requestVideoFrameCallback === 'function';
    isActive = true;

    await requestWakeLock();
    if (isCanceled || mySession !== sessionSeq) {
      cleanupCamera();
      return;
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    setState(HRV_STATES.WAITING_FINGER);
    scheduleNextFrame();
  }

  /**
   * 사용자 중단
   */
  function stop() {
    if (!isActive && currentState !== HRV_STATES.PREPARING_CAMERA) return;
    isCanceled = true;
    sessionSeq += 1;
    cleanupCamera();
    resetCollectedData();
    exposureLocked = false;
    setState(HRV_STATES.STOPPED);
  }

  /**
   * 전송 실패 시 메모리에 유지된 동일 데이터로 재전송
   */
  async function retryUpload() {
    if (!lastPayload) {
      throw new Error('재전송할 수집 데이터가 없습니다.');
    }
    return await uploadData(lastPayload);
  }

  /**
   * 테스트/디버깅용: 수집 완료된 페이로드 반환 (또는 측정 중 현재 스냅샷 반환)
   */
  function getCollectedData() {
    if (lastDownloadData) return lastDownloadData;
    return {
      startedAt: startedAtISO,
      torch: torchEnabled,
      exposureLocked,
      timeSource: timeSource || 'performance',
      t: [...tArr],
      r: [...rArr],
      g: [...gArr],
    };
  }

  return {
    start,
    stop,
    retryUpload,
    getCollectedData,
  };
}