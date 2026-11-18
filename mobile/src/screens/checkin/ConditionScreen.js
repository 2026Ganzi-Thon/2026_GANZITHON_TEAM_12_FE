import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest, ApiError } from '../../api/client';

/** B4 컨디션 체크 — PUT /api/morning-checks/today/condition (API 명세 6절) */
const DISTURBANCES = [
  { key: 'alcohol', label: '어제 술을 마셨어요' },
  { key: 'sick', label: '몸이 아파요' },
  { key: 'caffeine', label: '측정 직전에 카페인을 마셨어요' },
];

export default function ConditionScreen({
  baseline,
  onNext,
  onBack,
}) {
  const validDays = baseline?.validDays ?? 0;
  const requiredDays = baseline?.required ?? 7;
  const [score, setScore] = useState(null);
  const [disturbances, setDisturbances] = useState({ alcohol: false, sick: false, caffeine: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const submittingRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const next = async () => {
    if (score === null || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      // 응답 TodayResult를 B6 결과 화면이 그대로 쓴다. 호흡을 건너뛰어도 결과는 이미 계산돼 있다.
      // 웹 저장소 대신 부모에게 전달하며 null 응답도 변형하지 않는다.
      const result = await apiRequest('/api/morning-checks/today/condition', {
        method: 'PUT',
        body: { score, ...disturbances },
      });
      if (alive.current) onNext?.(result);
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.message : '잠시 후 다시 시도해주세요.');
    } finally {
      submittingRef.current = false;
      if (alive.current) setSubmitting(false);
    }
  };

  const disabled = score === null || submitting;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로">
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
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
        <Text style={styles.stepCurrent}>2. 컨디션 체크</Text>
        <Text style={styles.step}>→</Text>
        <Text style={styles.step}>3. 천천히 숨쉬기</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.scoreCard}>
          <Text style={styles.title}>오늘 아침 컨디션은 어때요?</Text>
          <View style={styles.scoreRow} accessibilityRole="radiogroup" accessibilityLabel="컨디션 점수">
            {[1, 2, 3, 4, 5].map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.scoreButton, score === value && styles.scoreSelected]}
                accessibilityRole="radio"
                accessibilityLabel={`${value}점`}
                accessibilityState={{ checked: score === value }}
                onPress={() => setScore(value)}
              >
                <Text style={[styles.scoreText, score === value && styles.scoreTextSelected]}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.scoreEnds}>
            <Text style={styles.noteText}>매우 나쁨</Text>
            <Text style={styles.noteText}>매우 좋음</Text>
          </View>
        </View>

        <View style={styles.disturbances}>
          <Text style={styles.disturbanceTitle}>해당하는 것이 있으면 체크해주세요</Text>
          {DISTURBANCES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={styles.disturbanceRow}
              accessibilityRole="checkbox"
              accessibilityLabel={label}
              accessibilityState={{ checked: disturbances[key] }}
              onPress={() => setDisturbances((current) => ({ ...current, [key]: !current[key] }))}
            >
              <View style={[styles.checkbox, disturbances[key] && styles.checkboxChecked]}>
                {disturbances[key] && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.disturbanceLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.note}>
            <Text style={styles.noteIcon}>ⓘ</Text>
            <Text style={styles.noteText}>체크한 날은 '내 평소' 계산에서 빠져요</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {error !== null && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
          <TouchableOpacity
            style={[styles.nextButton, disabled && styles.disabled]}
            onPress={next}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ disabled, busy: submitting }}
          >
            <Text style={styles.nextText}>다음 (호흡 훈련)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  backButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 26, color: Colors.textPrimary },
  headerTitle: { fontFamily: Fonts.display, fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  chip: { marginLeft: 'auto', backgroundColor: Colors.surfaceAccent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  chipValue: { fontWeight: '700', color: Colors.primary },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 20, paddingBottom: 16 },
  step: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textMuted },
  stepDone: { fontFamily: Fonts.body, fontSize: 11, color: Colors.accentBar },
  stepCurrent: { fontFamily: Fonts.body, fontSize: 11, fontWeight: '700', color: Colors.primary },
  body: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, gap: 20 },
  scoreCard: { padding: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 16 },
  title: { fontFamily: Fonts.display, fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 20 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.surface },
  scoreSelected: { backgroundColor: Colors.primary, borderColor: Colors.borderSelected },
  scoreText: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  scoreTextSelected: { color: Colors.primaryText, fontWeight: '700', fontSize: 16 },
  scoreEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  disturbances: { gap: 8 },
  disturbanceTitle: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  disturbanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 17, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { fontSize: 14, fontWeight: '700', color: Colors.primaryText },
  disturbanceLabel: { flex: 1, fontFamily: Fonts.body, fontSize: 14, color: Colors.textPrimary },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  noteIcon: { padding: 5, borderRadius: 6, backgroundColor: Colors.warningBg, color: Colors.textSecondary },
  noteText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textMuted, flexShrink: 1 },
  actions: { marginTop: 'auto', paddingTop: 16, paddingBottom: 28 },
  errorText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.warningText, textAlign: 'center', marginBottom: 12 },
  nextButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.primary },
  nextText: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '600', color: Colors.primaryText },
  disabled: { opacity: 0.4 },
});
