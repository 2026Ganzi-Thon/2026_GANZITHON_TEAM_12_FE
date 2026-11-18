import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { createHrvMeasurement } from '../../utils/hrvMeasurement';

const PREPARE_SEC = 10;
const MEASURE_SEC = 60;

const RETRY_REASON_MESSAGES = {
  TOO_SHORT: '측정 시간이 조금 짧았어요. 1분 동안 끝까지 유지해 주세요.',
  LOW_FPS: '카메라 프레임 속도가 낮아 분석이 어려워요. 다른 앱을 닫고 다시 시도해 주세요.',
  NO_PULSE: '맥박 신호가 뚜렷하지 않아요. 손가락을 카메라에 가볍게 밀착해 주세요.',
  TOO_NOISY: '측정 중 움직임이나 빛 번짐이 많았어요. 편안히 앉아 다시 측정해 주세요.',
};

export default function HrvMeasurementScreen({
  baseline,
  onMeasurementSuccess,
  onSkipToCondition,
}) {
  // 상태: IDLE | WAITING_FINGER | PREPARING | MEASURING | ANALYZING | RETRY_NETWORK
  const [phase, setPhase] = useState('IDLE');
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [bannerMessage, setBannerMessage] = useState(null);
  const [torchSupported, setTorchSupported] = useState(true);

  // 실시간 센서 상태: OK | NO_FINGER | TOO_DARK | TOO_BRIGHT | MOTION
  const [fingerStatus, setFingerStatus] = useState('NO_FINGER');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [waveSamples, setWaveSamples] = useState(Array(24).fill(0.3));

  const engineRef = useRef(null);
  const sessionActiveRef = useRef(false);

  const validDays = baseline?.validDays ?? 0;
  const requiredDays = baseline?.required ?? 7;

  const handleEngineResult = useCallback(
    (res) => {
      sessionActiveRef.current = false;
      const measurement = res?.measurement;
      if (measurement?.retryRequired || measurement?.qualityLevel === 'RETRY') {
        const reasonText =
          RETRY_REASON_MESSAGES[measurement.retryReason] ||
          '신호 품질이 충분하지 않아 다시 측정이 필요해요.';
        setPhase('IDLE');
        setBannerMessage(reasonText);
        return;
      }
      onMeasurementSuccess(res);
    },
    [onMeasurementSuccess]
  );

  const handleEngineError = useCallback((err) => {
    sessionActiveRef.current = false;
    if (err?.retryable) {
      setPhase('RETRY_NETWORK');
      setBannerMessage('네트워크 연결이 불안정해요. 측정 데이터는 안전하게 보관 중이에요.');
    } else {
      setPhase('IDLE');
      setBannerMessage(err?.message || '측정 분석 중 오류가 발생했어요. 다시 시도해 주세요.');
    }
  }, []);

  // 엔진 인스턴스 초기화 및 언마운트 정리
  useEffect(() => {
    const engine = createHrvMeasurement({
      credentials: 'include',
      onStateChange: (nextState, payload, detail) => {
        if (!sessionActiveRef.current) return;

        switch (nextState) {
          case 'WAITING_FINGER':
            setElapsedSec(0);
            setPhase('WAITING_FINGER');
            break;
          case 'WARMUP':
            setPhase('PREPARING');
            break;
          case 'MEASURING':
            setPhase('MEASURING');
            break;
          case 'UPLOADING':
            setPhase('ANALYZING');
            break;
          case 'DONE':
            handleEngineResult(payload);
            break;
          case 'ERROR': {
            const errorMessages = {
              PERMISSION_DENIED: '카메라 권한이 거부되었어요. 브라우저 설정에서 허용해 주세요.',
              INSECURE_CONTEXT: 'HTTPS 보안 연결에서만 카메라 측정이 가능해요.',
              CAMERA_UNAVAILABLE: '사용 가능한 후면 카메라를 찾을 수 없어요.',
              UPLOAD_FAILED: '측정 결과 전송에 실패했어요. 네트워크를 확인해 주세요.',
            };
            handleEngineError(
              detail || {
                message: errorMessages[payload] || '카메라 측정 중 오류가 발생했어요.',
              }
            );
            break;
          }
          default:
            break;
        }
      },
      onProgress: ({ elapsedMs }) => {
        if (!sessionActiveRef.current) return;
        setElapsedSec(Math.floor(elapsedMs / 1000));
      },
      onSignal: ({ finger, moving, wave }) => {
        if (!sessionActiveRef.current) return;

        if (finger && finger !== 'OK') {
          setFingerStatus(finger);
        } else if (moving) {
          setFingerStatus('MOTION');
        } else {
          setFingerStatus('OK');
        }

        if (typeof wave === 'number') {
          setWaveSamples((prev) => {
            const normalized = Math.min(1, Math.max(0.15, 0.5 + wave / 12));
            return [...prev.slice(1), normalized];
          });
        }
      },
    });

    engineRef.current = engine;

    return () => {
      sessionActiveRef.current = false;
      engine.stop();
    };
  }, [handleEngineResult, handleEngineError]);

  const beginCameraSession = async () => {
    setPermissionModalVisible(false);
    setBannerMessage(null);
    setElapsedSec(0);

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      sessionActiveRef.current = true;
      await engineRef.current.start();
      const info = engineRef.current.getCollectedData();
      setTorchSupported(Boolean(info?.torch));
    } else {
      // 네이티브/시뮬레이터 폴백 흐름
      sessionActiveRef.current = true;
      setPhase('WAITING_FINGER');
    }
  };

  // 3. 측정 중단
  const handleAbort = () => {
    sessionActiveRef.current = false;
    engineRef.current?.stop();
    setElapsedSec(0);
    setPhase('IDLE');
    setBannerMessage('측정이 중단됐어요. 다시 시작해주세요');
  };

  const handleRetryUpload = async () => {
    if (!engineRef.current) return;
    setBannerMessage(null);
    setPhase('ANALYZING');
    sessionActiveRef.current = true;
    await engineRef.current.retryUpload();
  };

  const renderStepperHeader = (rightBadgeText) => (
    <View style={styles.topSection}>
      <View style={styles.brandRow}>
        <Text style={styles.headerTitle}>
          {phase === 'IDLE' ? '아침 1분 체크' : 'Come & Down'}
        </Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{rightBadgeText}</Text>
        </View>
      </View>

      <View style={styles.stepperRow}>
        <Text style={styles.stepActive}>1. 손가락 측정</Text>
        <Text style={styles.stepArrow}>›</Text>
        <Text style={styles.stepInactive}>2. 컨디션 체크</Text>
        <Text style={styles.stepArrow}>›</Text>
        <Text style={styles.stepInactive}>3. 천천히 숨쉬기</Text>
      </View>
    </View>
  );

  // 네트워크 전송 재시도 화면 (Idempotency-Key 유지 재전송)
  if (phase === 'RETRY_NETWORK') {
    return (
      <SafeAreaView style={styles.container}>
        {renderStepperHeader('전송 대기')}
        <View style={styles.analyzingBody}>
          <Text style={styles.analyzingTitle}>전송이 잠시 지연됐어요</Text>
          <Text style={styles.analyzingSub}>
            방금 측정한 1분 기록을 다시 전송할 수 있어요
          </Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.startBtn} onPress={handleRetryUpload}>
            <Text style={styles.startBtnText}>다시 전송하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.abortBtn, { marginTop: 10 }]} onPress={handleAbort}>
            <Text style={styles.abortBtnText}>취소하고 처음으로</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // [화면 8] 분석 중이에요
  if (phase === 'ANALYZING') {
    return (
      <SafeAreaView style={styles.container}>
        {renderStepperHeader('손가락 측정')}
        <View style={styles.analyzingBody}>
          <View style={styles.analyzingCircleOuter}>
            <View style={styles.analyzingCircleInner} />
          </View>
          <Text style={styles.analyzingTitle}>분석 중이에요</Text>
          <Text style={styles.analyzingSub}>잠시만 기다려주세요</Text>
        </View>
        <View style={styles.analyzingFooter}>
          <Text style={styles.analyzingFooterText}>
            ✓ 분석이 끝나면 다음 단계로 자동으로 이어져요
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // [화면 4] 준비 중이에요 (0~10초)
  if (phase === 'PREPARING') {
    const remainPrep = Math.max(0, PREPARE_SEC - elapsedSec);
    return (
      <SafeAreaView style={styles.container}>
        {renderStepperHeader('측정 준비')}
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <View style={styles.cameraBoxActive}>
            <View style={styles.detectedBadge}>
              <Text style={styles.detectedBadgeText}>✓ 손가락 감지됨</Text>
            </View>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraGuideTitle}>카메라 화면 (손가락 감지됨)</Text>
            <Text style={styles.cameraGuideSub}>손가락을 카메라에 대고 움직이지 마세요</Text>
          </View>

          <Text style={styles.prepTitle}>준비 중이에요</Text>
          <Text style={styles.prepTimerText}>
            곧 1분 측정을 시작해요 ·{' '}
            <Text style={styles.prepTimerHighlight}>
              00:{String(remainPrep).padStart(2, '0')}
            </Text>
          </Text>

          <View style={styles.prepProgressTrack}>
            <View
              style={[
                styles.prepProgressFill,
                { width: `${Math.min(100, (elapsedSec / PREPARE_SEC) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.prepProgressCaption}>
            준비 10초 중 {Math.min(PREPARE_SEC, elapsedSec)}초 경과
          </Text>

          <View style={styles.waveCard}>
            <View style={styles.waveHeader}>
              <Text style={styles.waveTitle}>● 실시간 파형</Text>
            </View>
            <View style={styles.waveBarsRow}>
              {waveSamples.map((val, i) => (
                <View
                  key={i}
                  style={[styles.waveBar, { height: Math.max(8, Math.round(val * 32)) }]}
                />
              ))}
            </View>
            <Text style={styles.waveFootnote}>
              측정 품질은 측정이 끝난 뒤 서버에서 판정해요
            </Text>
          </View>

          <View style={styles.tipGreenCard}>
            <Text style={styles.tipGreenTitle}>손가락을 화면 중앙에 그대로 두세요</Text>
            <Text style={styles.tipGreenBody}>
              초록 테두리가 계속 유지되면 준비가 끝나요. 손을 떼면 감지부터 다시 시작해요.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.abortBtn} onPress={handleAbort}>
            <Text style={styles.abortBtnText}>✕ 중단</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // [화면 5 & 6] 본 측정 중 (10~70초)
  if (phase === 'MEASURING') {
    const measureElapsed = Math.min(MEASURE_SEC, Math.max(0, elapsedSec - PREPARE_SEC));
    const remainMeasure = Math.max(0, MEASURE_SEC - measureElapsed);

    const renderDynamicStatusCard = () => {
      if (fingerStatus === 'NO_FINGER') {
        return (
          <View style={styles.statusAlertGreen}>
            <Text style={styles.statusAlertTagGreen}>✋ 손가락 없음 · 3초 이상이면 처음부터</Text>
            <Text style={styles.statusAlertMain}>손가락으로 카메라와 플래시를 함께 덮어주세요</Text>
          </View>
        );
      }
      if (fingerStatus === 'TOO_DARK') {
        return (
          <View style={styles.statusAlertPeach}>
            <Text style={styles.statusAlertTagPeach}>🌙 너무 어두움 · 3초 이상이면 처음부터</Text>
            <Text style={styles.statusAlertMain}>밝은 곳에서 측정해주세요</Text>
          </View>
        );
      }
      if (fingerStatus === 'TOO_BRIGHT') {
        return (
          <View style={styles.statusAlertWhite}>
            <Text style={styles.statusAlertTagAmber}>☀ 너무 밝음 (색이 하얗게 날아감) · 안내만</Text>
            <Text style={styles.statusAlertMain}>손가락을 살짝 옮겨주세요</Text>
          </View>
        );
      }
      if (fingerStatus === 'MOTION') {
        return (
          <View style={styles.statusAlertWhite}>
            <Text style={styles.statusAlertTagGreen}>✥ 움직임 · 안내만</Text>
            <Text style={styles.statusAlertMain}>움직이지 말아주세요</Text>
          </View>
        );
      }
      return <View style={styles.statusPlaceholderBox} />;
    };

    return (
      <SafeAreaView style={styles.container}>
        {renderStepperHeader('60초 측정')}
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <Text style={styles.measuringHeadline}>측정 중 · 편안하게 숨 쉬세요</Text>
          <Text style={styles.measuringSub}>
            손가락을 카메라 위에 가볍게 올리고 그대로 유지해 주세요
          </Text>

          <Text style={styles.remainLabel}>남은 시간</Text>
          <Text style={styles.bigTimer}>
            00:{String(remainMeasure).padStart(2, '0')}
          </Text>

          <View style={styles.measureProgressTrack}>
            <View
              style={[
                styles.measureProgressFill,
                { width: `${(measureElapsed / MEASURE_SEC) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.measureProgressLabels}>
            <Text style={styles.progressSmall}>{measureElapsed}초 경과</Text>
            <Text style={styles.progressSmall}>전체 60초</Text>
          </View>

          <View style={styles.waveCard}>
            <View style={styles.waveHeader}>
              <Text style={styles.waveTitle}>맥박 신호</Text>
              <View style={styles.livePill}>
                <Text style={styles.livePillText}>● 실시간</Text>
              </View>
            </View>
            <View style={styles.waveBarsRow}>
              {waveSamples.map((val, i) => (
                <View
                  key={i}
                  style={[styles.waveBar, { height: Math.max(10, Math.round(val * 44)) }]}
                />
              ))}
            </View>
          </View>

          {renderDynamicStatusCard()}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.abortBtn} onPress={handleAbort}>
            <Text style={styles.abortBtnText}>중단</Text>
          </TouchableOpacity>
          <Text style={styles.footerCaption}>중단하면 시작 전 화면으로 돌아가요</Text>
        </View>
      </SafeAreaView>
    );
  }

  // [화면 7] 손가락 접촉 대기 중 (WAITING_FINGER)
  if (phase === 'WAITING_FINGER') {
    return (
      <SafeAreaView style={styles.container}>
        {renderStepperHeader('손가락 측정')}
        <View style={styles.scrollBody}>
          {bannerMessage && (
            <View style={styles.darkToastBanner}>
              <Text style={styles.darkToastText}>{bannerMessage}</Text>
            </View>
          )}

          <View style={styles.cameraBoxWaiting}>
            <Text style={styles.cameraGuideSub}>카메라 화면 (손가락 없음)</Text>
          </View>

          <View style={styles.waitingPill}>
            <Text style={styles.waitingPillText}>● 측정 대기 중</Text>
          </View>
          <Text style={styles.waitingTitle}>손가락을 대주세요</Text>
          <Text style={styles.waitingSub}>
            타이머가 초기화됐어요{'\n'}다시 대면 준비 10초부터 시작해요
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.abortBtn} onPress={handleAbort}>
            <Text style={styles.abortBtnText}>중단</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // [화면 1~3] IDLE 측정 시작 전 화면
  return (
    <SafeAreaView style={styles.container}>
      {renderStepperHeader(`기준선 만드는 중 ${validDays}/${requiredDays}`)}

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {bannerMessage && (
          <View style={styles.darkToastBanner}>
            <Text style={styles.darkToastText}>ⓘ {bannerMessage}</Text>
          </View>
        )}

        {!torchSupported && (
          <View style={styles.brightPlaceCard}>
            <Text style={styles.brightPlaceTitle}>💡 밝은 곳에서 측정해주세요</Text>
            <Text style={styles.brightPlaceSub}>
              이 기기는 플래시를 켤 수 없어요. 밝은 창가나 조명 아래에서 재면 더 정확해요.
            </Text>
          </View>
        )}

        <View style={styles.guidePreviewBox}>
          <Text style={styles.cameraIcon}>📷</Text>
          <Text style={styles.guidePreviewText}>
            후면 카메라와 플래시를 손가락 끝으로 함께 가볍게 덮어요
          </Text>
        </View>

        <View style={styles.bulletCard}>
          <Text style={styles.bulletItem}>• 세게 누르지 말고 가볍게 대주세요</Text>
          <Text style={styles.bulletItem}>• 1분 동안 편안하게 앉아 움직이지 마세요</Text>
          <Text style={styles.bulletItem}>• 측정 중에는 화면을 켜둔 채 다른 앱으로 이동하지 마세요</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => setPermissionModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>측정 시작</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkipToCondition} style={styles.skipMeasureLink}>
          <Text style={styles.skipMeasureText}>측정 없이 컨디션만 기록하기</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={permissionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPermissionModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.permissionCard}>
            <View style={styles.permIconCircle}>
              <Text style={styles.permIcon}>📷</Text>
            </View>
            <Text style={styles.permTitle}>카메라 사용을 허용해 주세요</Text>
            <Text style={styles.permBody}>
              손가락 끝의 색 변화를 읽어 심박을 측정해요.{'\n'}
              <Text style={styles.permBold}>카메라와 플래시</Text>를 켜야 측정을 시작할 수 있어요.
            </Text>
            <View style={styles.permPrivacyBox}>
              <Text style={styles.permPrivacyText}>
                🔒 촬영한 영상은 저장하거나 전송하지 않아요
              </Text>
            </View>
            <View style={styles.permActions}>
              <TouchableOpacity
                style={styles.permDenyBtn}
                onPress={() => setPermissionModalVisible(false)}
              >
                <Text style={styles.permDenyText}>허용 안 함</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.permAllowBtn} onPress={beginCameraSession}>
                <Text style={styles.permAllowText}>허용</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topSection: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitle: { fontSize: 19, fontWeight: '700', color: Colors.textPrimary },
  statusPill: {
    backgroundColor: Colors.surfaceAccent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepActive: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
    paddingBottom: 4,
  },
  stepArrow: { fontSize: 20, color: Colors.textMuted, marginBottom: 10 },
  stepInactive: { fontSize: 12, color: Colors.textMuted, paddingBottom: 4 },
  scrollBody: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  darkToastBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  darkToastText: { color: Colors.primaryText, fontSize: 13, fontWeight: '600' },
  brightPlaceCard: {
    backgroundColor: '#FBECE4',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  brightPlaceTitle: { fontSize: 13, fontWeight: '700', color: '#9E4B36', marginBottom: 4 },
  brightPlaceSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  guidePreviewBox: {
    height: 220,
    backgroundColor: '#E5E3DD',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    marginBottom: 14,
  },
  cameraIcon: { fontSize: 28, marginBottom: 10, opacity: 0.6 },
  guidePreviewText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  bulletCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  bulletItem: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  footer: { paddingHorizontal: 20, paddingBottom: 18, paddingTop: 8 },
  startBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: Colors.primaryText },
  skipMeasureLink: { marginTop: 10, alignItems: 'center', paddingVertical: 4 },
  skipMeasureText: { fontSize: 12, color: Colors.textMuted, textDecorationLine: 'underline' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 22,
  },
  permIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  permIcon: { fontSize: 18 },
  permTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  permBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 14 },
  permBold: { fontWeight: '700', color: Colors.textPrimary },
  permPrivacyBox: {
    backgroundColor: '#F6EFEA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  permPrivacyText: { fontSize: 12, color: Colors.textSecondary },
  permActions: { flexDirection: 'row', gap: 10 },
  permDenyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permDenyText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  permAllowBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permAllowText: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  cameraBoxActive: {
    height: 160,
    backgroundColor: '#DDE3DC',
    borderWidth: 2,
    borderColor: Colors.accentBar,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detectedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  detectedBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.accentBar },
  cameraGuideTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  cameraGuideSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  prepTitle: { fontSize: 21, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  prepTimerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  prepTimerHighlight: { color: '#C95A3B', fontWeight: '700' },
  prepProgressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  prepProgressFill: { height: '100%', backgroundColor: Colors.accentBar },
  prepProgressCaption: { fontSize: 11, color: Colors.textMuted, marginBottom: 14 },
  waveCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  waveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  waveTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  waveBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentBar,
  },
  waveFootnote: { fontSize: 11, color: Colors.textMuted, marginTop: 8 },
  tipGreenCard: {
    backgroundColor: Colors.surfaceAccent,
    borderRadius: 14,
    padding: 14,
  },
  tipGreenTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  tipGreenBody: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  abortBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abortBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  measuringHeadline: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 6,
  },
  measuringSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  remainLabel: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  bigTimer: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
    marginVertical: 4,
  },
  measureProgressTrack: {
    height: 5,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  measureProgressFill: { height: '100%', backgroundColor: Colors.primary },
  measureProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 14,
  },
  progressSmall: { fontSize: 11, color: Colors.textMuted },
  livePill: {
    backgroundColor: Colors.surfaceAccent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  livePillText: { fontSize: 10, fontWeight: '700', color: Colors.accentBar },
  statusAlertGreen: {
    backgroundColor: Colors.surfaceAccent,
    borderRadius: 14,
    padding: 14,
  },
  statusAlertPeach: {
    backgroundColor: '#FBECE4',
    borderRadius: 14,
    padding: 14,
  },
  statusAlertWhite: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
  },
  statusPlaceholderBox: {
    height: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  statusAlertTagGreen: { fontSize: 11, fontWeight: '600', color: Colors.accentBar, marginBottom: 4 },
  statusAlertTagPeach: { fontSize: 11, fontWeight: '600', color: '#B8543A', marginBottom: 4 },
  statusAlertTagAmber: { fontSize: 11, fontWeight: '600', color: '#C96A3B', marginBottom: 4 },
  statusAlertMain: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  footerCaption: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, marginTop: 8 },
  cameraBoxWaiting: {
    height: 260,
    backgroundColor: '#E5E3DD',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  waitingPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAccent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 8,
  },
  waitingPillText: { fontSize: 11, fontWeight: '600', color: Colors.accentBar },
  waitingTitle: { fontSize: 21, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  waitingSub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  analyzingBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  analyzingCircleOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.surfaceAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  analyzingCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.accentBar,
  },
  analyzingTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  analyzingSub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  analyzingFooter: { paddingBottom: 28, alignItems: 'center' },
  analyzingFooterText: { fontSize: 12, color: Colors.textSecondary },
});