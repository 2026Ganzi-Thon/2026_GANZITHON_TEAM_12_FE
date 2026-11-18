import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { showAlert } from '../../utils/dialog';
import { apiRequest, generateUuid, ApiError } from '../../api/client';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function getMondayOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay(); // 0(일) ~ 6(토)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  return monday;
}

function toYyyyMmDd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatSuggestionTime(startIso, title) {
  if (!startIso) return title || '';
  const dt = new Date(startIso);
  const dayLabel = DAY_LABELS[(dt.getDay() + 6) % 7];
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${dayLabel} ${hh}:${mm} · ${title}`;
}

export default function HomeScreen({ onNavigateTab, onOpenSafety }) {
  const [loading, setLoading] = useState(true);
  const [homeData, setHomeData] = useState(null);
  const [dailyHours, setDailyHours] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [actionLoading, setActionLoading] = useState(false);

  // 409 SLOT_CONFLICT 대체 시간 모달
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [conflictSuggestion, setConflictSuggestion] = useState(null);
  const [alternativeSlots, setAlternativeSlots] = useState([]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const monday = getMondayOfCurrentWeek();
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const [homeRes, eventsRes] = await Promise.all([
        apiRequest('/api/home'),
        apiRequest(
          `/api/calendar/events?from=${toYyyyMmDd(monday)}&to=${toYyyyMmDd(sunday)}`
        ).catch(() => ({ events: [] })),
      ]);

      setHomeData(homeRes);

      // 요일별(월~일) 일정 시간 집계
      const hoursPerDay = [0, 0, 0, 0, 0, 0, 0];
      (eventsRes?.events || []).forEach((ev) => {
        if (ev.allDay || !ev.start || !ev.end) return;
        const s = new Date(ev.start);
        const e = new Date(ev.end);
        const idx = (s.getDay() + 6) % 7;
        const diffHrs = Math.max(0, (e - s) / (1000 * 60 * 60));
        hoursPerDay[idx] += diffHrs;
      });
      setDailyHours(hoursPerDay);
    } catch (err) {
      showAlert('홈 불러오기 실패', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  const handleApprove = async (suggestion) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/approve`, {
        method: 'POST',
        idempotencyKey: generateUuid(),
      });
      await loadHome();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_CONFLICT') {
        const res = await apiRequest(`/api/suggestions/${suggestion.id}/slots`).catch(() => null);
        setConflictSuggestion(suggestion);
        setAlternativeSlots(res?.slots || []);
        setSlotModalVisible(true);
      } else {
        showAlert('일정 추가 실패', err.message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectSlot = async (slot) => {
    if (!conflictSuggestion || actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/suggestions/${conflictSuggestion.id}/approve`, {
        method: 'POST',
        idempotencyKey: generateUuid(),
        body: { start: slot.start, end: slot.end },
      });
      setSlotModalVisible(false);
      setConflictSuggestion(null);
      await loadHome();
    } catch (err) {
      showAlert('시간 변경 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismiss = async (suggestion) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/dismiss`, {
        method: 'POST',
      });
      await loadHome();
    } catch (err) {
      showAlert('건너뛰기 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !homeData) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const nickname = homeData?.nickname || '사용자';
  const isBuilding = homeData?.phase === 'BUILDING';
  const recovery = homeData?.recovery || {};
  const validDays = recovery.baseline?.validDays ?? 0;
  const requiredDays = recovery.baseline?.required ?? 7;
  const isCheckDone = homeData?.todayCheck?.status === 'DONE';
  const proposedSuggestions = (homeData?.todaySuggestions || []).filter(
    (s) => s.status === 'PROPOSED'
  );
  const primarySuggestion = proposedSuggestions[0];

  const todayDayIdx = (new Date().getDay() + 6) % 7;
  const maxDailyHour = Math.max(4, ...dailyHours);

  const renderRecoveryHeadline = () => {
    if (recovery.status === 'LOW' && recovery.changePct != null) {
      return `평소보다 ${Math.abs(Math.round(recovery.changePct))}%낮아요`;
    }
    if (recovery.status === 'NORMAL') {
      if (recovery.changePct != null && recovery.changePct > 0) {
        return `평소보다 ${Math.round(recovery.changePct)}% 높아요`;
      }
      return '평소 범위를 유지하고 있어요';
    }
    return '최근 측정 자료가 부족해요';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 상단 안전 안내 칩 (기준선 확정 후 + safety.show일 때) */}
        {!isBuilding && homeData?.safety?.show && (
          <TouchableOpacity style={styles.topSafetyBanner} onPress={onOpenSafety}>
            <Text style={styles.topSafetyText}>도움 받을 수 있는 곳 ↗</Text>
          </TouchableOpacity>
        )}

        {/* 인사말 헤더 */}
        <View style={styles.greetingSection}>
          {isBuilding ? (
            <>
              <Text style={styles.greetingSub}>{nickname}님,</Text>
              <Text style={styles.greetingTitle}>좋은 아침이에요</Text>
            </>
          ) : (
            <Text style={styles.greetingTitle}>{nickname}님, 좋은 아침이에요</Text>
          )}
        </View>

        {/* 오늘의 회복 카드 (BUILDING vs ESTABLISHED) */}
        {isBuilding ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>오늘의 회복</Text>
            <Text style={styles.buildingTitle}>
              기준선 만드는 중 {validDays}/{requiredDays}
            </Text>
            <View style={styles.stampsRow}>
              {Array.from({ length: requiredDays }).map((_, idx) => {
                const filled = idx < validDays;
                return (
                  <View
                    key={idx}
                    style={[styles.stampCircle, filled && styles.stampCircleFilled]}
                  />
                );
              })}
            </View>
            <Text style={styles.cardFootnote}>
              7일 동안 재면 '내 평소'를 알 수 있어요
            </Text>
          </View>
        ) : (
          <View style={[styles.card, styles.establishedRecoveryCard]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardLabel}>오늘의 회복 ⓘ</Text>
              <TouchableOpacity
                style={styles.rangeBadge}
                onPress={() => onNavigateTab('reports')}
              >
                <Text style={styles.rangeBadgeText}>평소 범위</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.recoveryMainText}>{renderRecoveryHeadline()}</Text>
          </View>
        )}

        {/* BUILDING 중 안전 안내 카드 */}
        {isBuilding && homeData?.safety?.show && (
          <TouchableOpacity style={styles.safetyAlertCard} onPress={onOpenSafety}>
            <View style={styles.safetyIconBox}>
              <Text style={styles.safetyIcon}>♥</Text>
            </View>
            <View style={styles.safetyTextBox}>
              <Text style={styles.safetyAlertTag}>안전 안내</Text>
              <Text style={styles.safetyAlertTitle}>요즘 많이 지쳐 보여요</Text>
              <Text style={styles.safetyAlertSub}>
                도움 받을 수 있는 곳을 안내해 드려요
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* 이번 주 일정 부하 카드 */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>이번 주 일정 부하 ⓘ</Text>
          {!isBuilding && homeData?.thisWeekLoad?.vsUsualPct != null && (
            <Text style={styles.loadSubSummary}>
              평소보다 일정이 {Math.abs(Math.round(homeData.thisWeekLoad.vsUsualPct))}%{' '}
              {homeData.thisWeekLoad.vsUsualPct < 0 ? '적어요' : '많아요'}
            </Text>
          )}

          <View style={styles.weekBarsRow}>
            {DAY_LABELS.map((day, idx) => {
              const hrs = dailyHours[idx];
              const heightPct = hrs > 0 ? Math.min(100, Math.max(18, (hrs / maxDailyHour) * 100)) : 12;
              const isHighlight = idx === todayDayIdx || (hrs >= maxDailyHour * 0.85 && hrs > 0);
              return (
                <View key={day} style={styles.dayBarCol}>
                  <View style={styles.dayBarTrack}>
                    <View
                      style={[
                        styles.dayBarFill,
                        {
                          height: `${heightPct}%`,
                          backgroundColor: isHighlight ? Colors.primary : '#AFC1B4',
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.dayLabel,
                      idx === todayDayIdx && styles.dayLabelToday,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>

          {isBuilding && homeData?.thisWeekLoad?.vsUsualPct != null && (
            <Text style={styles.cardFootnote}>
              평소보다 일정이 {Math.abs(Math.round(homeData.thisWeekLoad.vsUsualPct))}%{' '}
              {homeData.thisWeekLoad.vsUsualPct < 0 ? '적어요' : '많아요'}
            </Text>
          )}
        </View>

        {/* 오늘의 추천 활동 카드 */}
        {primarySuggestion && (
          <View style={styles.suggestionWrapper}>
            <View style={styles.suggestionHeader}>
              <Text style={styles.suggestionTitle}>오늘의 추천 활동</Text>
              {primarySuggestion.message?.aiGenerated && (
                <View style={styles.aiTag}>
                  <Text style={styles.aiTagText}>AI 생성</Text>
                </View>
              )}
            </View>

            <View style={styles.suggestionInnerBox}>
              <Text style={styles.suggestionTimeText}>
                🕒 {formatSuggestionTime(primarySuggestion.start, primarySuggestion.title)}
              </Text>
            </View>

            <View style={styles.suggestionActions}>
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => handleDismiss(primarySuggestion)}
                disabled={actionLoading}
              >
                <Text style={styles.skipBtnText}>건너뛰기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => handleApprove(primarySuggestion)}
                disabled={actionLoading}
              >
                <Text style={styles.approveBtnText}>승인</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 하단 아침 1분 체크 CTA */}
        <TouchableOpacity
          style={[styles.checkCtaBtn, isCheckDone && styles.checkCtaBtnDone]}
          onPress={() => onNavigateTab('checkin', { baseline: recovery.baseline })}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkCtaText, isCheckDone && styles.checkCtaTextDone]}>
            {isCheckDone ? '✓  오늘 측정 완료' : '☀  아침 1분 체크 시작'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* SLOT_CONFLICT 대체 시간 선택 모달 */}
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
              같은 시간대에 일정이 생겼어요. 가능한 빈 시간을 골라 주세요.
            </Text>
            {alternativeSlots.map((slot, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.slotOption}
                onPress={() => handleSelectSlot(slot)}
              >
                <Text style={styles.slotOptionText}>
                  {formatSuggestionTime(slot.start, conflictSuggestion?.title || '')}
                </Text>
              </TouchableOpacity>
            ))}
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  topSafetyBanner: {
    backgroundColor: '#F6DFD5',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  topSafetyText: { fontSize: 12, fontWeight: '600', color: '#8A4836' },
  greetingSection: { marginBottom: 18 },
  greetingSub: { fontSize: 14, color: Colors.textSecondary, marginBottom: 2 },
  greetingTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  establishedRecoveryCard: {
    backgroundColor: Colors.surfaceAccent,
    borderColor: '#D6E2DA',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  buildingTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 14 },
  stampsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  stampCircle: {
    width: 34,
    height: 34,
    borderStyle: 'dashed',
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#C5CFC9',
    backgroundColor: Colors.surface,
  },
  stampCircleFilled: {
    backgroundColor: '#9DB2A4',
    borderColor: '#9DB2A4',
  },
  rangeBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rangeBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  recoveryMainText: { fontSize: 21, fontWeight: '700', color: Colors.textPrimary },
  cardFootnote: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  safetyAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBECE6',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#DFB3A4',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  safetyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4D5C9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  safetyIcon: { fontSize: 20, color: '#9E4B36' },
  safetyTextBox: { flex: 1 },
  safetyAlertTag: { fontSize: 11, fontWeight: '700', color: '#B8543A', marginBottom: 2 },
  safetyAlertTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  safetyAlertSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  chevron: { fontSize: 18, color: Colors.textMuted },
  loadSubSummary: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  weekBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 96,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
    paddingBottom: 6,
    marginBottom: 6,
  },
  dayBarCol: { alignItems: 'center', flex: 1 },
  dayBarTrack: { width: 16, height: 64, justifyContent: 'flex-end', marginBottom: 6 },
  dayBarFill: { width: '100%', borderRadius: 4 },
  dayLabel: { fontSize: 11, color: Colors.textSecondary },
  dayLabelToday: { fontWeight: '700', color: Colors.textPrimary },
  suggestionWrapper: {
    backgroundColor: '#F5DFD6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  suggestionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  aiTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiTagText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  suggestionInnerBox: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D6B6AA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  suggestionTimeText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  suggestionActions: { flexDirection: 'row', gap: 10 },
  skipBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  approveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primaryText },
  checkCtaBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCtaBtnDone: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  checkCtaText: { fontSize: 15, fontWeight: '700', color: Colors.primaryText },
  checkCtaTextDone: { color: Colors.textPrimary },
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