import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../../theme/tokens';
import { apiRequest, generateUuid } from '../../api/client';

const LEVEL_LABELS = {
  LOW: { text: '보통', bg: Colors.chipNeutralBg, color: Colors.textSecondary },
  HIGH: { text: '높은 편', bg: Colors.chipHighBg, color: Colors.primary },
  VERY_HIGH: { text: '매우 높음', bg: Colors.warningBg, color: Colors.warningText },
};

export default function CbiAssessmentScreen({ 
  round = 'INITIAL', 
  onCompleted, 
  onOpenSafety,
  onBack,
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [shuffledItems, setShuffledItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answersMap, setAnswersMap] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await apiRequest('/api/cbi/questions');
        if (!mounted) return;
        setQuestionnaire(data);
        // 원 매뉴얼 권고에 따른 문항 순서 섞기 (제출 시 원래 item.no 유지)
        const itemsCopy = [...(data.items || [])];
        for (let i = itemsCopy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [itemsCopy[i], itemsCopy[j]] = [itemsCopy[j], itemsCopy[i]];
        }
        setShuffledItems(itemsCopy);
      } catch (err) {
        Alert.alert('문항 불러오기 실패', err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const currentItem = shuffledItems[currentIndex];
  const totalCount = shuffledItems.length;

  const scaleOptions = useMemo(() => {
    if (!questionnaire || !currentItem) return [];
    return questionnaire.scales?.[currentItem.scale] || [];
  }, [questionnaire, currentItem]);

  const handleSelectOption = (optionIndex) => {
    if (!currentItem) return;
    setAnswersMap((prev) => ({
      ...prev,
      [currentItem.no]: optionIndex,
    }));
  };

  const handleNext = async () => {
    if (!currentItem || answersMap[currentItem.no] === undefined) return;

    if (currentIndex < totalCount - 1) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    // 마지막 문항 제출
    if (submitting) return;
    setSubmitting(true);
    try {
      const answers = Object.entries(answersMap).map(([no, option]) => ({
        no: Number(no),
        option: Number(option),
      }));

      const res = await apiRequest('/api/cbi/assessments', {
        method: 'POST',
        idempotencyKey: generateUuid(),
        body: {
          round,
          questionnaireVersion: questionnaire.version,
          answers,
        },
      });
      setResult(res);
    } catch (err) {
      Alert.alert('제출 오류', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrev = () => {
    if (result) {
      setResult(null);
      return;
    }
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    } else if (onBack) {
      onBack();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  // [화면 4] 피로도 체크 결과 화면
  if (result) {
    const personalBadge = LEVEL_LABELS[result.personal?.level] || LEVEL_LABELS.LOW;
    const workBadge = LEVEL_LABELS[result.work?.level] || LEVEL_LABELS.LOW;
    const personalScore = Math.round(result.personal?.score ?? 0);
    const workScore = Math.round(result.work?.score ?? 0);

    const interpretationSummary =
      personalScore > workScore
        ? '몸의 피로가 마음의 부담보다 조금 더 높게 나타났어요. 잠들기까지 걸리는 시간과 아침 컨디션을 먼저 살펴보면 좋아요.'
        : '일·학업으로 인한 소진감이 신체 피로만큼 높게 나타났어요. 다가오는 일정의 휴식 간격을 함께 확인해 볼게요.';

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <View style={styles.tagPill}>
            <Text style={styles.tagPillText}>피로도 체크 결과</Text>
          </View>

          <Text style={styles.resultTitle}>몸과 마음의 피로를{'\n'}각각 살펴봤어요</Text>
          <Text style={styles.resultSubtitle}>
            지난 한 주를 떠올리며 답한 내용을 바탕으로 정리했어요
          </Text>

          {/* 신체 피로도 카드 */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreCardHeader}>
              <Text style={styles.scoreCardTitle}>신체 피로도</Text>
              <View style={[styles.levelBadge, { backgroundColor: personalBadge.bg }]}>
                <Text style={[styles.levelBadgeText, { color: personalBadge.color }]}>
                  {personalBadge.text}
                </Text>
              </View>
            </View>
            <View style={styles.scoreValueRow}>
              <Text style={styles.scoreNumber}>{personalScore}</Text>
              <Text style={styles.scoreMax}> / 100</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, Math.max(0, personalScore))}%` },
                ]}
              />
            </View>
          </View>

          {/* 심리적 부담 카드 */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreCardHeader}>
              <Text style={styles.scoreCardTitle}>심리적 부담</Text>
              <View style={[styles.levelBadge, { backgroundColor: workBadge.bg }]}>
                <Text style={[styles.levelBadgeText, { color: workBadge.color }]}>
                  {workBadge.text}
                </Text>
              </View>
            </View>
            <View style={styles.scoreValueRow}>
              <Text style={styles.scoreNumber}>{workScore}</Text>
              <Text style={styles.scoreMax}> / 100</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, Math.max(0, workScore))}%`,
                    backgroundColor: Colors.accentBar,
                  },
                ]}
              />
            </View>
          </View>

          <Text style={styles.scoreFootnote}>
            ⓘ 점수가 높을수록 피로도가 큰 상태를 의미해요.
          </Text>

          {/* 결과 해석 박스 */}
          <View style={styles.interpretationCard}>
            <Text style={styles.interpretationTitle}>결과 해석</Text>
            <Text style={styles.interpretationBody}>{interpretationSummary}</Text>
          </View>

          {/* 도움받을 수 있는 곳 카드 (highRisk 또는 safety.show일 때 강조 노출) */}
          {(result.highRisk || result.safety?.show) && (
            <TouchableOpacity
              style={styles.safetyCard}
              onPress={onOpenSafety}
              activeOpacity={0.85}
            >
              <View style={styles.safetyIconCircle}>
                <Text style={styles.safetyIconText}>♥</Text>
              </View>
              <View style={styles.safetyTexts}>
                <Text style={styles.safetyTitle}>도움받을 수 있는 곳 보기</Text>
                <Text style={styles.safetySubtitle}>
                  요즘 많이 지쳐있는 것 같다면, 이야기 나눌 수 있는 곳을 안내해 드려요
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.bottomNavRow}>
          <TouchableOpacity style={styles.prevBtn} onPress={handlePrev}>
            <Text style={styles.prevBtnText}>‹ 이전</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={() => onCompleted(result.onboardingStep || 'LIFESTYLE')}
          >
            <Text style={styles.nextBtnText}>다음</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // [화면 3] 문항 진행 화면
  const selectedOption = currentItem ? answersMap[currentItem.no] : undefined;
  const isPersonal = currentItem?.subscale === 'PERSONAL';
  const progressPct = totalCount > 0 ? ((currentIndex + 1) / totalCount) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 진행 바 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handlePrev}
          disabled={currentIndex === 0}
          style={[styles.backButton, currentIndex === 0 && { opacity: 0.3 }]}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        <Text style={styles.stepIndicator}>
          {currentIndex + 1} / {totalCount}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.questionScroll}>
        <View style={styles.tagPill}>
          <Text style={styles.tagPillText}>
            {isPersonal ? '피로도 체크' : '소진도 체크'}
          </Text>
        </View>

        <Text style={styles.questionTitle}>{currentItem?.text}</Text>
        <Text style={styles.questionSubtitle}>
          {isPersonal
            ? '몸과 마음 상태에 가장 가까운 항목 하나를 골라 주세요'
            : '요즘 하루를 떠올리며 가장 가까운 항목 하나를 골라 주세요'}
        </Text>

        {/* 보기 리스트 */}
        <View style={styles.optionsList}>
          {scaleOptions.map((label, idx) => {
            const isSelected = selectedOption === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                onPress={() => handleSelectOption(idx)}
                activeOpacity={0.85}
              >
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <Text style={styles.radioCheck}>✓</Text>}
                </View>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.questionFootnote}>
          {isPersonal
            ? '선택한 답변은 이번 주 리포트의 피로도 그래프에 반영돼요'
            : '선택한 답변은 이번 주 리포트의 소진도 그래프에 반영돼요'}
        </Text>
      </ScrollView>

      {/* 하단 이전/다음 버튼 */}
      <View style={styles.bottomNavRow}>
        <TouchableOpacity
          style={[styles.prevBtn, currentIndex === 0 && { opacity: 0.4 }]}
          disabled={currentIndex === 0 && !onBack}
          onPress={handlePrev}
        >
          <Text style={styles.prevBtnText}>‹ 이전</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.nextBtn,
            (selectedOption === undefined || submitting) && styles.nextBtnDisabled,
          ]}
          disabled={selectedOption === undefined || submitting}
          onPress={handleNext}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primaryText} />
          ) : (
            <Text style={styles.nextBtnText}>
              {currentIndex === totalCount - 1 ? '완료' : '다음'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  stepIndicator: {
    marginLeft: 12,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  questionScroll: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 32,
  },
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAccent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
  },
  tagPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  questionTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 32,
    marginBottom: 8,
  },
  questionSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 18,
    height: 56,
  },
  optionCardSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surface,
  },
  radioCheck: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  optionLabelSelected: {
    color: Colors.primaryText,
    fontWeight: '600',
  },
  questionFootnote: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 18,
  },
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
    alignItems: 'center',
    justifyContent: 'center',
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
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  // 결과 화면 스타일
  resultScroll: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  resultTitle: {
    fontSize: 25,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 34,
    marginBottom: 8,
  },
  resultSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 22,
  },
  scoreCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  scoreCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scoreCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  levelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  scoreNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  scoreMax: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  scoreFootnote: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginBottom: 18,
  },
  interpretationCard: {
    backgroundColor: Colors.surfaceAccent,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  interpretationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 6,
  },
  interpretationBody: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  safetyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  safetyIconText: {
    fontSize: 16,
    color: Colors.primary,
  },
  safetyTexts: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  safetySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
    marginLeft: 8,
  },
});