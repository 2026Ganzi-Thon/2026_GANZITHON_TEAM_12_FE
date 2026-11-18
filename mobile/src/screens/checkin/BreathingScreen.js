import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Animated, Easing, AccessibilityInfo,
} from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest } from '../../api/client';

/**
 * B5 천천히 숨쉬기 — POST /api/morning-checks/today/breathing (API 명세 6절)
 * 건너뛸 수 있고 결과에 영향이 없다. 결과는 컨디션 저장 때 이미 계산돼 있다.
 */
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

export default function BreathingScreen({
  baseline,
  onDone,
  onBack,
}) {
  const validDays = baseline?.validDays ?? 0;
  const requiredDays = baseline?.required ?? 7;
  const [elapsed, setElapsed] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(null);
  const elapsedRef = useRef(0);
  const timer = useRef(null);
  const finished = useRef(false);
  const alive = useRef(true);
  const onDoneRef = useRef(onDone);
  const scale = useRef(new Animated.Value(0.78)).current;
  const animation = useRef(null);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  /** 완료·중단 모두 실제 호흡한 시간을 보낸다. 실패해도 결과 화면을 막지 않는다. */
  const finish = useCallback(async (skip = false) => {
    // 완료 직전 연속 터치에도 기록과 화면 전환은 한 번만 실행한다.
    if (finished.current) return;
    finished.current = true;
    clearInterval(timer.current);
    timer.current = null;
    animation.current?.stop();
    setFinishing(true);
    if (!skip && elapsedRef.current >= 1) {
      try {
        await apiRequest('/api/morning-checks/today/breathing', {
          method: 'POST',
          body: { durationSec: Math.min(elapsedRef.current, 3600) },
        });
      } catch {
        /* 호흡 기록은 결과에 영향이 없다 */
      }
    }
    if (alive.current) onDoneRef.current?.();
  }, []);

  useEffect(() => {
    alive.current = true;
    timer.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= TOTAL_SEC) finish();
    }, 1000);
    return () => {
      alive.current = false;
      clearInterval(timer.current);
      timer.current = null;
    };
  }, [finish]);

  useEffect(() => {
    let active = true;
    let changed = false;
    // 웹의 동작 줄이기 설정을 네이티브 접근성 설정으로 대체한다.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changed = true;
      if (active) setReduceMotion(enabled);
    });
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !changed) setReduceMotion(enabled);
    }).catch(() => {
      if (active && !changed) setReduceMotion(false);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (finishing || reduceMotion !== false) {
      if (reduceMotion) scale.setValue(1);
      return;
    }
    scale.setValue(0.78);
    // 4초 들숨 · 6초 날숨: CSS 키프레임 대신 네이티브 드라이버로 원을 확대·축소한다.
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1, duration: INHALE_SEC * 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
      Animated.timing(scale, { toValue: 0.78, duration: EXHALE_SEC * 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
    ]));
    animation.current = loop;
    loop.start();
    return () => {
      loop.stop();
      animation.current = null;
    };
  }, [finishing, reduceMotion, scale]);

  // 원본의 초기 안내는 들숨 4초이고, 첫 타이머 갱신부터 phaseAt을 적용한다.
  const phase = elapsed === 0 ? { inhaling: true, left: INHALE_SEC } : phaseAt(elapsed);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>아침 1분 체크</Text>
        <View style={styles.chip}>
          <Text style={styles.statusPillText}>
            기준선 만드는 중 {validDays}/{requiredDays}
          </Text>
        </View>
      </View>
      <View style={styles.steps} accessibilityLabel="측정 단계">
        <Text style={styles.stepDone}>✓ 손가락 측정</Text>
        <Text style={styles.step}>→</Text>
        <Text style={styles.stepDone}>✓ 컨디션 체크</Text>
        <Text style={styles.step}>→</Text>
        <Text style={styles.stepCurrent}>3. 천천히 숨쉬기</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.stage}>
          <View style={styles.circle}>
            <View style={styles.ring} />
            <Animated.View style={[styles.core, { transform: [{ scale }] }]}>
              <Text style={styles.phase}>{phase.inhaling ? '들이쉬세요' : '내쉬세요'}</Text>
              <Text style={styles.phaseCount}>{phase.left}초</Text>
            </Animated.View>
          </View>
          <Text style={styles.hint}>원이 {INHALE_SEC}초 동안 커지고(들숨) {EXHALE_SEC}초 동안 작아져요(날숨)</Text>
        </View>

        <View style={styles.timer}>
          <Text style={styles.timerValue}>{fmt(Math.max(0, TOTAL_SEC - elapsed))}</Text>
          <Text style={styles.timerLabel}>남은 시간</Text>
        </View>
        <View style={styles.caution}>
          <Text style={styles.cautionIcon}>⚠</Text>
          <Text style={styles.cautionText}>어지러우면 바로 멈추세요</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.button, finishing && styles.disabled]} onPress={() => finish()} disabled={finishing} accessibilityRole="button" accessibilityState={{ disabled: finishing }}>
            <Text style={styles.buttonText}>멈추기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, finishing && styles.disabled]} onPress={() => finish(true)} disabled={finishing} accessibilityRole="button" accessibilityState={{ disabled: finishing }}>
            <Text style={styles.buttonText}>건너뛰기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontFamily: Fonts.display, fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  chip: { marginLeft: 'auto', backgroundColor: Colors.surfaceAccent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  chipValue: { fontWeight: '700', color: Colors.primary },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 20, paddingBottom: 16 },
  step: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textMuted },
  stepDone: { fontFamily: Fonts.body, fontSize: 11, color: Colors.accentBar },
  stepCurrent: { fontFamily: Fonts.body, fontSize: 11, fontWeight: '700', color: Colors.primary },
  body: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, gap: 20 },
  stage: { alignItems: 'center', gap: 24, paddingTop: 24 },
  circle: { width: 248, height: 248, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 216, height: 216, borderWidth: 1, borderColor: Colors.border, borderRadius: 108 },
  core: { width: 188, height: 188, borderRadius: 94, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: Colors.surfaceAccent },
  phase: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  phaseCount: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  hint: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  timer: { alignItems: 'center' },
  timerValue: { fontFamily: Fonts.display, fontSize: 46, fontWeight: '700', fontVariant: ['tabular-nums'], color: Colors.textPrimary, marginBottom: 8 },
  timerLabel: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textMuted },
  caution: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 17, backgroundColor: Colors.warningBg, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, borderRadius: 12 },
  cautionIcon: { fontSize: 16, color: Colors.warningText },
  cautionText: { flex: 1, fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 'auto', paddingTop: 16, paddingBottom: 28 },
  button: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  buttonText: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '600', color: Colors.primary },
  disabled: { opacity: 0.4 },
});
