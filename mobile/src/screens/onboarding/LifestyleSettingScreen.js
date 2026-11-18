import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { showAlert } from '../../utils/dialog';
import { apiRequest } from '../../api/client';

// 백엔드 등록 표준 활동 코드 매핑
const PRESET_ACTIVITIES = [
  { code: 'WALK', label: '걷기' },
  { code: 'STRETCH', label: '스트레칭' },
  { code: 'NAP', label: '낮잠' },
  { code: 'YOGA', label: '요가' },
  { code: 'MEDITATION', label: '명상' },
  { code: 'LIGHT_RUN', label: '가벼운 러닝' },
];

function formatWakeTimeKorean(minutesFromMidnight) {
  const normalized = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const min = normalized % 60;
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${period} ${hour12}:${String(min).padStart(2, '0')}`;
}

function formatDurationKorean(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
}

function minutesToHHmm(minutesFromMidnight) {
  const normalized = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function LifestyleSettingScreen({ onBack, onSaved }) {
  // 기본값: 기상 07:00 (420분), 최소 수면 7시간 30분 (450분)
 const [wakeMinutes, setWakeMinutes] = useState(420);
const [sleepStartMinutes, setSleepStartMinutes] = useState(1410);
  const [selectedCodes, setSelectedCodes] = useState(['WALK', 'STRETCH', 'MEDITATION']);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customKeyword, setCustomKeyword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleActivity = (code) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // 백엔드가 받는 활동 코드는 6개뿐이다. 그 밖의 코드를 넣으면 저장할 때
  // 400 "알 수 없는 활동이 있어요." 가 나고, 칩으로 보이지 않아 사용자가
  // 해제할 수도 없어서 온보딩에서 못 넘어간다. 그래서 6개로만 매핑한다.
  const handleAddCustomActivity = () => {
    const trimmed = customKeyword.trim();
    if (!trimmed) return;

    const keywordMap = [
      { keywords: ['걷기', '산책'], code: 'WALK', name: '걷기' },
      { keywords: ['스트레칭', '필라테스'], code: 'STRETCH', name: '스트레칭' },
      { keywords: ['낮잠', '쪽잠', '잠'], code: 'NAP', name: '낮잠' },
      { keywords: ['요가'], code: 'YOGA', name: '요가' },
      { keywords: ['명상', '호흡', '휴식'], code: 'MEDITATION', name: '명상' },
      { keywords: ['러닝', '조깅', '달리기'], code: 'LIGHT_RUN', name: '가벼운 러닝' },
    ];

    const matched = keywordMap.find((entry) =>
      entry.keywords.some((kw) => trimmed.includes(kw))
    );

    if (matched) {
      if (!selectedCodes.includes(matched.code)) {
        setSelectedCodes((prev) => [...prev, matched.code]);
      }
      setCustomKeyword('');
      setShowCustomInput(false);
    } else {
      showAlert(
        '활동 선택 안내',
        '맞춤 추천 정확도를 위해 목록에 있는 추천 회복 활동 중에서 선택해 주세요.'
      );
    }
  };

  const handleSubmit = async () => {
    if (selectedCodes.length === 0) {
      showAlert('선호 회복 활동', '최소 1개 이상의 회복 활동을 선택해 주세요.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);

    try {
      const sleepEnd = minutesToHHmm(wakeMinutes);
      const sleepStart = minutesToHHmm(sleepStartMinutes);
      const measureTime = minutesToHHmm(wakeMinutes + 15);

      const res = await apiRequest('/api/me/settings', {
        method: 'PUT',
        body: {
          measureTime,
          sleepStart,
          sleepEnd,
          preferredActivities: selectedCodes,
        },
      });

      onSaved(res?.onboardingStep || 'SCHEDULE_REPORT');
    } catch (err) {
      showAlert('저장 오류', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 진행 바 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '60%' }]} />
        </View>
        <Text style={styles.stepIndicator}>3 / 5</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.tagPill}>
          <Text style={styles.tagPillText}>생활 패턴 설정</Text>
        </View>

        <Text style={styles.title}>회복을 위한 하루 리듬을{'\n'}알려주세요</Text>
        <Text style={styles.subtitle}>
          평소 생활에 맞춰 무리 없이 회복할 수 있는 기준을 잡아둘게요
        </Text>

        {/* 기상 시간 스테퍼 카드 */}
        <View style={styles.stepperCard}>
          <View style={styles.stepperHeader}>
            <Text style={styles.stepperLabel}>기상 시간</Text>
            <Text style={styles.stepperSubLabel}>아침 측정 시간</Text>
          </View>
          <View style={styles.stepperControlRow}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => setWakeMinutes((m) => m - 10)}
            >
              <Text style={styles.circleBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{formatWakeTimeKorean(wakeMinutes)}</Text>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => setWakeMinutes((m) => m + 10)}
            >
              <Text style={styles.circleBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.stepperFootnote}>
            ⓘ 일어난 직후 측정해요.
          </Text>
        </View>

        {/* 취침 시간 스테퍼 카드 */}
        <View style={styles.stepperCard}>
          <View style={styles.stepperHeader}>
            <Text style={styles.stepperLabel}>취침 시간</Text>
            <Text style={styles.stepperSubLabel}>목표 취침 시각</Text>
          </View>
          <View style={styles.stepperControlRow}>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => setSleepStartMinutes((m) => m - 10)}
            >
              <Text style={styles.circleBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>
              {formatWakeTimeKorean(sleepStartMinutes)}
            </Text>
            <TouchableOpacity
              style={styles.circleBtn}
              onPress={() => setSleepStartMinutes((m) => m + 10)}
            >
              <Text style={styles.circleBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 선호 회복 활동 */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>선호 회복 활동</Text>
            <Text style={styles.activityCount}>{selectedCodes.length}개 선택</Text>
          </View>
          <Text style={styles.activitySubtitle}>여러 개를 선택할 수 있어요</Text>

          <View style={styles.chipWrap}>
            {PRESET_ACTIVITIES.map((item) => {
              const active = selectedCodes.includes(item.code);
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleActivity(item.code)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {active ? `✓ ${item.label}` : item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {showCustomInput && (
            <View style={styles.customInputCard}>
              <Text style={styles.customInputLabel}>내 활동 추가</Text>
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customTextInput}
                  value={customKeyword}
                  onChangeText={setCustomKeyword}
                  placeholder="예: 요가, 뜨거운 샤워"
                  placeholderTextColor={Colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.customAddBtn}
                  onPress={handleAddCustomActivity}
                >
                  <Text style={styles.customAddBtnText}>추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 하단 안내 박스 */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            🖍 입력한 기상 시간과 취침 시간, 회복 활동은 일정 분석과 맞춤 회복 추천에 활용돼요.&nbsp;분석이 끝난 뒤에도 설정에서 언제든 바꿀 수 있어요. 
          </Text>
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.bottomNavRow}>
        <TouchableOpacity style={styles.prevBtn} onPress={onBack}>
          <Text style={styles.prevBtnIcon}>‹</Text>
          <Text style={styles.prevBtnText}>이전</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, (selectedCodes.length === 0 || submitting) && styles.nextBtnDisabled]}
          disabled={selectedCodes.length === 0 || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primaryText} />
          ) : (
            <Text style={styles.nextBtnText}>일정 분석 시작</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: { padding: 4, marginRight: 12 },
  backArrow: { fontSize: 20, color: Colors.textPrimary },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  stepIndicator: {
    marginLeft: 12,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  scrollContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 },
  tagPill: {
    paddingVertical: 5,
    marginBottom: 14,
  },
  tagPillText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 33,
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: { fontSize: 13.5, 
    color: Colors.textSecondary, 
    letterSpacing: -0.6,
    marginBottom: 22 },
  stepperCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
  },
  stepperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stepperLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  stepperSubLabel: { fontSize: 12, color: Colors.textMuted },
  stepperControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 300,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  circleBtnText: { fontSize: 26, color: Colors.textPrimary, fontWeight: '500', marginBottom: 3 },
  stepperValue: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.8, marginBottom: 2 },
  stepperFootnote: { fontSize: 12, color: Colors.textMuted, marginTop: 14 },
  activitySection: { marginTop: 8, marginBottom: 18 },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  activityCount: { fontSize: 12, fontWeight: '500', color: Colors.primary },
  activitySubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginBottom: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipAddTrigger: {
    borderStyle: 'dashed',
  },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  chipTextActive: { color: Colors.primaryText, fontWeight: '500' },
  customInputCard: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
  },
  customInputLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  customInputRow: { flexDirection: 'row', gap: 8 },
  customTextInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  customAddBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAddBtnText: { color: Colors.primaryText, fontSize: 13, fontWeight: '600' },
  infoBanner: {
    backgroundColor: Colors.surfaceAccent,
    borderRadius: 14,
    padding: 14,
  },
  infoBannerText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  bottomNavRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 10,
    backgroundColor: Colors.background,
  },
  prevBtn: {
    width: 92,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row', // 아이콘과 텍스트 가로 배치
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // ‹ 와 '이전' 사이 간격
  },
  prevBtnIcon: {
    fontSize: 26, // 원하는 크기로 조절 (예: 20~24)
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: -6, // 글자 높이와 수직 중앙 미세 보정
  },
  prevBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  nextBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: { fontSize: 16, fontWeight: '600', color: Colors.primaryText },
});