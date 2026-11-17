import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest, generateUuid, ApiError } from '../../api/client';

const RISK_META = {
  NONE: { label: '보통', barColor: '#7B9478', textColor: Colors.textSecondary },
  WATCH: { label: '주의', barColor: '#D5A264', textColor: '#B5813E' },
  RISK: { label: '위험', barColor: '#B86B4B', textColor: '#B8543A' },
};

function formatWeekLabel(weekStartStr) {
  if (!weekStartStr) return '';
  const parts = weekStartStr.split('-');
  if (parts.length !== 3) return weekStartStr;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const weekOfMonth = Math.ceil(day / 7);
  return `${month}월 ${weekOfMonth}주`;
}

function formatDateRangeShort(fromStr, toStr) {
  if (!fromStr || !toStr) return '';
  const [, fm, fd] = fromStr.split('-');
  const [, tm, td] = toStr.split('-');
  return `${Number(fm)}월 ${Number(fd)}일 – ${Number(tm)}월 ${Number(td)}일`;
}

function formatMonthTitle(toStr) {
  const target = toStr ? new Date(toStr) : new Date();
  return `${target.getFullYear()}년 ${target.getMonth() + 1}월`;
}

function formatMonthShort(toStr) {
  const target = toStr ? new Date(toStr) : new Date();
  return `${target.getMonth() + 1}월`;
}

function formatTimeRangeKorean(startIso, endIso) {
  if (!startIso) return '';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const month = start.getMonth() + 1;
  const date = start.getDate();
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  if (!end) return `${month}월 ${date}일 ${hh}:${mm}`;
  const ehh = String(end.getHours()).padStart(2, '0');
  const emm = String(end.getMinutes()).padStart(2, '0');
  return `${month}월 ${date}일 ${hh}:${mm}–${ehh}:${emm}`;
}

export default function ScheduleReportScreen({ onBack, onCompleteOnboarding }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [conflictSuggestion, setConflictSuggestion] = useState(null);
  const [alternativeSlots, setAlternativeSlots] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, suggRes] = await Promise.all([
        apiRequest('/api/schedule/report'),
        apiRequest('/api/suggestions?type=PRE_START&status=PROPOSED'),
      ]);
      setReport(reportRes);
      setSuggestions(suggRes?.suggestions || []);
    } catch (err) {
      Alert.alert('리포트 조회 오류', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAlternativeSlots = async (suggestion) => {
    try {
      const res = await apiRequest(`/api/suggestions/${suggestion.id}/slots`);
      setConflictSuggestion(suggestion);
      setAlternativeSlots(res?.slots || []);
      setSlotModalVisible(true);
    } catch (err) {
      Alert.alert('시간 조회 실패', err.message);
    }
  };

  const approveListSequentially = async (targetList) => {
    if (targetList.length === 0) return;
    setActionLoading(true);
    try {
      for (const item of targetList) {
        try {
          const updated = await apiRequest(`/api/suggestions/${item.id}/approve`, {
            method: 'POST',
            idempotencyKey: generateUuid(),
          });
          setSuggestions((prev) =>
            prev.map((s) => (s.id === item.id ? updated : s))
          );
        } catch (err) {
          if (err instanceof ApiError && err.code === 'SLOT_CONFLICT') {
            setActionLoading(false);
            await openAlternativeSlots(item);
            return;
          }
          throw err;
        }
      }
      Alert.alert('캘린더 추가 완료', '과부하 대비 회복 일정을 캘린더에 추가했어요.');
    } catch (err) {
      Alert.alert('일정 추가 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveSuggestions = async () => {
    if (actionLoading) return;
    const proposedList = suggestions.filter((s) => s.status === 'PROPOSED');
    await approveListSequentially(proposedList);
  };

  const handleSelectAlternativeSlot = async (slot) => {
    if (!conflictSuggestion || actionLoading) return;
    setActionLoading(true);
    try {
      const updated = await apiRequest(
        `/api/suggestions/${conflictSuggestion.id}/approve`,
        {
          method: 'POST',
          idempotencyKey: generateUuid(),
          body: { start: slot.start, end: slot.end },
        }
      );

      const nextList = suggestions.map((s) =>
        s.id === conflictSuggestion.id ? updated : s
      );
      setSuggestions(nextList);
      setSlotModalVisible(false);
      setConflictSuggestion(null);
      setActionLoading(false);

      // 모달 처리 후 남아 있던 나머지 PROPOSED 제안도 이어서 처리
      const remaining = nextList.filter((s) => s.status === 'PROPOSED');
      if (remaining.length > 0) {
        await approveListSequentially(remaining);
      } else {
        Alert.alert('캘린더 추가 완료', '과부하 대비 회복 일정을 캘린더에 추가했어요.');
      }
    } catch (err) {
      setActionLoading(false);
      Alert.alert('시간 변경 승인 실패', err.message);
    }
  };

  const handleDismissAll = async () => {
    const proposedList = suggestions.filter((s) => s.status === 'PROPOSED');
    if (proposedList.length === 0 || actionLoading) return;

    setActionLoading(true);
    try {
      await Promise.all(
        proposedList.map((item) =>
          apiRequest(`/api/suggestions/${item.id}/dismiss`, { method: 'POST' })
        )
      );
      setSuggestions([]);
    } catch (err) {
      Alert.alert('처리 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await apiRequest('/api/onboarding/complete', {
        method: 'POST',
      });
      onCompleteOnboarding(res);
    } catch (err) {
      Alert.alert('완료 처리 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const pastMonth = report?.pastMonth;
  const classification = report?.classification;
  const upcomingWeeks = report?.upcomingWeeks || [];
  const proposedCount = suggestions.filter((s) => s.status === 'PROPOSED').length;
  const hasAnyAiSuggestion = suggestions.some((s) => s.message?.aiGenerated);

  const highestRiskWeek =
    upcomingWeeks.find((w) => w.riskLevel === 'RISK') ||
    upcomingWeeks.find((w) => w.riskLevel === 'WATCH');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <Text style={styles.stepIndicator}>5 / 5</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.categoryLabel}>일정 분석 리포트</Text>

        {report?.enoughData === false ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>분석할 일정이 아직 적어요</Text>
            <Text style={styles.emptySubtitle}>
              구글 캘린더에 수업·과제 일정을 등록해 두시면 주간 부하와 회복 틈을 자동으로 분석해 드려요.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.headline}>
              {formatMonthTitle(pastMonth?.to)}, 이렇게 보냈어요
            </Text>
            <Text style={styles.subheadline}>
              {pastMonth
                ? `${formatDateRangeShort(pastMonth.from, pastMonth.to)} 일정 ${
                    classification?.total ?? 0
                  }건을 분석했어요.`
                : '동기화된 일정을 바탕으로 분석했어요.'}
            </Text>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>쉬는 날</Text>
                <Text style={styles.metricValue}>{pastMonth?.restDays ?? 0}일</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>밤 10시 이후</Text>
                <Text style={styles.metricValue}>{pastMonth?.lateNightCount ?? 0}회</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>마감 · 시험</Text>
                <Text style={styles.metricValue}>{pastMonth?.deadlineCount ?? 0}건</Text>
              </View>
            </View>

            {upcomingWeeks.length > 0 && (
              <View style={styles.chartSection}>
                <Text style={styles.sectionTitle}>앞으로 4주 위험 주차</Text>
                <Text style={styles.sectionSubtitle}>
                  {formatWeekLabel(upcomingWeeks[0]?.weekStart)} –{' '}
                  {formatWeekLabel(upcomingWeeks[upcomingWeeks.length - 1]?.weekStart)}
                  {classification?.total != null ? ` · 예정 일정 ${classification.total}건` : ''}
                </Text>

                <View style={styles.chartCard}>
                  <View style={styles.barsContainer}>
                    {upcomingWeeks.map((week, idx) => {
                      const pct = week.vsUsualPct;
                      const score = week.loadScore ?? 0;
                      const displayVal =
                        pct != null
                          ? `${pct > 0 ? '+' : ''}${Math.round(pct)}%`
                          : `${Math.round(score)}점`;
                      const barHeightPct = Math.min(
                        100,
                        Math.max(16, pct != null ? 45 + pct * 1.2 : score)
                      );
                      const meta = RISK_META[week.riskLevel] || RISK_META.NONE;
                      const isMuted = week.riskLevel === 'NONE' && idx === upcomingWeeks.length - 1;

                      return (
                        <View key={week.weekStart} style={styles.barColumn}>
                          
                          <View style={styles.barTrackVertical}>
                            <Text
                            style={[
                              styles.barTopPct,
                              {
                                color:
                                  week.riskLevel === 'NONE'
                                    ? Colors.textSecondary
                                    : meta.textColor,
                              },
                            ]}
                          >
                            {displayVal}
                          </Text>
                            <View
                              style={[
                                styles.barFillVertical,
                                {
                                  height: `${barHeightPct}%`,
                                  backgroundColor: isMuted ? '#C5D1C3' : meta.barColor,
                                },
                              ]}
                            />
                          </View>
                          <View style={styles.barDivider} />
                          <Text style={styles.barWeekLabel}>
                            {formatWeekLabel(week.weekStart)}
                          </Text>
                          <Text style={[styles.barRiskLabel, { color: meta.textColor }]}>
                            {meta.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text style={styles.chartFootnote}>
                    퍼센트는 평소 같은 주 대비 일정 부담이 얼마나 늘었는지예요.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.summaryBox}>
              <View style={styles.summaryHeader}>
                <View style={styles.aiBadge}>
                  <Text style={styles.aiBadgeText}>✦ AI 생성</Text>
                </View>
                <Text style={styles.summaryTag}>
                  {formatMonthShort(pastMonth?.to)} 일정 {classification?.total ?? 0}건 분석
                </Text>
              </View>
              <Text style={styles.summaryText}>
                최근 한 달 동안 총 {Math.round(pastMonth?.totalHours ?? 0)}시간의 일정과 마감{' '}
                {pastMonth?.deadlineCount ?? 0}건이 있었어요. 밤 10시 이후 일정은{' '}
                {pastMonth?.lateNightCount ?? 0}회, 한 달 쉬는 날은 {pastMonth?.restDays ?? 0}
                일이었어요.
                {highestRiskWeek
                  ? ` 다음 주의 구간은 ${formatWeekLabel(highestRiskWeek.weekStart)}예요.`
                  : ''}
              </Text>
            </View>

            {suggestions.length > 0 && (
              <View style={styles.suggestionCard}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionTitle}>과부하 줄이기 제안</Text>
                  {hasAnyAiSuggestion && (
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>✦ AI 생성</Text>
                    </View>
                  )}
                </View>

                {suggestions.map((s) => (
                  <View key={s.id} style={styles.suggestionItem}>
                    <Text style={styles.suggestionIcon}>📅</Text>
                    <View style={styles.suggestionContent}>
                      <Text style={styles.suggestionMessage}>
                        {s.message?.text || `${s.title} 일정을 미리 넣어둘까요?`}
                      </Text>
                      {s.status === 'APPROVED' && (
                        <Text style={styles.suggestionApprovedTag}>✓ 캘린더에 추가됨</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {proposedCount > 0 && (
          <View style={styles.secondaryActionRow}>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={handleDismissAll}
              disabled={actionLoading}
            >
              <Text style={styles.dismissBtnText}>나중에 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addCalendarBtn}
              onPress={handleApproveSuggestions}
              disabled={actionLoading}
            >
              <Text style={styles.addCalendarBtnText}>📅 캘린더에 추가</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.completeBtn}
          onPress={handleComplete}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator color={Colors.primaryText} />
          ) : (
            <Text style={styles.completeBtnText}>완료</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.footerFootnote}>
          리포트는 마이페이지 › 일정 분석에서 다시 볼 수 있어요.
        </Text>
      </View>

      <Modal
        visible={slotModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSlotModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>다른 시간 보기</Text>
            <Text style={styles.modalSubtitle}>
              같은 시간대에 일정이 생겼어요. 비어 있는 다른 시간을 선택해 주세요.
            </Text>

            {alternativeSlots.length === 0 ? (
              <Text style={styles.noSlotsText}>선택 가능한 빈 시간이 없어요.</Text>
            ) : (
              alternativeSlots.map((slot, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.slotOption}
                  onPress={() => handleSelectAlternativeSlot(slot)}
                >
                  <Text style={styles.slotOptionText}>
                    {formatTimeRangeKorean(slot.start, slot.end)}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSlotModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  scrollContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28 },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accentBar,
    marginBottom: 8,
  },
  headline: {
    fontSize: 23,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 31,
    marginBottom: 6,
  },
  subheadline: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  metricLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  metricValue: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  chartSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },
  chartCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  barColumn: { alignItems: 'center', flex: 1 },
  barTopPct: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  barTrackVertical: {
    width: 30,
    height: 84,
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  barFillVertical: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barDivider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: 8,
  },
  barWeekLabel: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  barRiskLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  chartFootnote: { fontSize: 11, color: Colors.textMuted },
  summaryBox: {
    backgroundColor: Colors.surfaceAccent,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  aiBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiBadgeText: { color: Colors.primaryText, fontSize: 11, fontWeight: '700' },
  summaryTag: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  summaryText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 21 },
  suggestionCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B8C7BD',
    borderRadius: 16,
    padding: 16,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  suggestionIcon: { fontSize: 14, marginRight: 8, marginTop: 2 },
  suggestionContent: { flex: 1 },
  suggestionMessage: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
  suggestionApprovedTag: {
    fontSize: 11,
    color: Colors.accentBar,
    fontWeight: '600',
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: Colors.background,
  },
  secondaryActionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dismissBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  addCalendarBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.surfaceAccent,
    borderWidth: 1,
    borderColor: '#C5D5CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCalendarBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  completeBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  completeBtnText: { fontSize: 16, fontWeight: '600', color: Colors.primaryText },
  footerFootnote: { textAlign: 'center', fontSize: 11, 
    color: Colors.textMuted,
    marginTop: 8,
    marginBottom: 18, 
 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
  noSlotsText: { fontSize: 13, color: Colors.textMuted, paddingVertical: 16 },
  slotOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  slotOptionText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  modalCloseBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
});