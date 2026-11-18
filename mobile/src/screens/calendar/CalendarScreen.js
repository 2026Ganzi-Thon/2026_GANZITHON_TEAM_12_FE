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

const CATEGORY_LABELS = {
  CLASS: '수업',
  ASSIGNMENT: '과제',
  STUDY: '공부',
  EXAM: '시험',
  PRESENTATION: '발표',
  PART_TIME: '알바',
  CLUB: '동아리',
  WORK_MEETING: '회의',
  EXERCISE: '운동',
  APPOINTMENT: '약속',
  PERSONAL: '개인',
  OTHER: '기타',
};

const RISK_META = {
  NONE: { label: '보통', color: '#8CA38C' },
  WATCH: { label: '주의', color: '#E0977B' },
  RISK: { label: '위험', color: '#B34B36' },
};

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

function getMonday(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toYyyyMmDd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function formatWeekHeaderTitle(monday) {
  const month = monday.getMonth() + 1;
  const weekOfMonth = Math.ceil(monday.getDate() / 7);
  return `${month}월 ${weekOfMonth}주차`;
}

function formatWeekRange(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.getMonth() + 1}/${monday.getDate()}~${
    sunday.getMonth() + 1
  }/${sunday.getDate()}`;
}

// v2.0 명세: customCategory가 있으면 "기타" 대신 직접 입력한 이름 표시
function getEventDisplayCategory(ev) {
  if (ev.category === 'OTHER' && ev.customCategory) {
    return ev.customCategory;
  }
  return CATEGORY_LABELS[ev.category] || '기타';
}

export default function CalendarScreen({ onEditCategory, refreshTrigger }) {
  const [selectedMonday, setSelectedMonday] = useState(() => getMonday(new Date()));
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [weekLoad, setWeekLoad] = useState(null);
  const [fourWeeks, setFourWeeks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [conflictSuggestion, setConflictSuggestion] = useState(null);
  const [alternativeSlots, setAlternativeSlots] = useState([]);

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const fromStr = toYyyyMmDd(selectedMonday);
      const sunday = new Date(selectedMonday);
      sunday.setDate(selectedMonday.getDate() + 6);
      const toStr = toYyyyMmDd(sunday);

      // 마지막 동기화가 10분 넘었는지 확인 후 동기화
      const reportCheck = await apiRequest('/api/schedule/report').catch(() => null);
      const syncedAt = reportCheck?.syncedAt ? new Date(reportCheck.syncedAt).getTime() : 0;
      if (Date.now() - syncedAt > 10 * 60 * 1000) {
        await apiRequest('/api/calendar/sync', { method: 'POST' }).catch(() => null);
      }

      const [eventsRes, weeksRes, suggRes] = await Promise.all([
        apiRequest(`/api/calendar/events?from=${fromStr}&to=${toStr}`),
        apiRequest(`/api/schedule/weeks?from=${fromStr}&count=4`),
        apiRequest('/api/suggestions?type=PRE_START&status=PROPOSED'),
      ]);

      setEvents(eventsRes?.events || []);
      setWeekLoad(eventsRes?.week || null);
      setFourWeeks(weeksRes?.weeks || []);
      setSuggestions(suggRes?.suggestions || []);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ONBOARDING_STEP_INVALID') {
        Alert.alert('동의 필요', '캘린더 이용 동의를 먼저 완료해 주세요.');
      } else {
        Alert.alert('캘린더 조회 오류', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMonday]);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData, refreshTrigger]);

  const moveWeek = (deltaWeeks) => {
    setSelectedMonday((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + deltaWeeks * 7);
      return next;
    });
  };

  const handleApproveSuggestion = async (suggestion) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/approve`, {
        method: 'POST',
        idempotencyKey: generateUuid(),
      });
      await loadCalendarData();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_CONFLICT') {
        const res = await apiRequest(`/api/suggestions/${suggestion.id}/slots`).catch(() => null);
        setConflictSuggestion(suggestion);
        setAlternativeSlots(res?.slots || []);
        setSlotModalVisible(true);
      } else {
        Alert.alert('일정 추가 실패', err.message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectAlternativeSlot = async (slot) => {
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
      await loadCalendarData();
    } catch (err) {
      Alert.alert('시간 변경 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismissSuggestion = async (suggestion) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/dismiss`, {
        method: 'POST',
      });
      await loadCalendarData();
    } catch (err) {
      Alert.alert('처리 실패', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 월~일 7일 날짜 객체 및 날짜별 일정 매핑
  const weekDays = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(selectedMonday);
    d.setDate(selectedMonday.getDate() + idx);
    const dateStr = toYyyyMmDd(d);
    const dayEvents = events.filter((ev) => {
      if (ev.allDay && ev.startDate) return ev.startDate === dateStr;
      if (ev.start) return ev.start.startsWith(dateStr);
      return false;
    });
    return {
      dayName: DAY_NAMES[idx],
      dateNum: d.getDate(),
      dateStr,
      dayEvents,
    };
  });

  // 4주 요약 차트 슬롯 구성 (API v2.0: 계산되지 않은 주는 빠질 수 있으므로 weekStart로 매칭)
  const fourWeekSlots = Array.from({ length: 4 }).map((_, idx) => {
    const targetMon = new Date(selectedMonday);
    targetMon.setDate(selectedMonday.getDate() + idx * 7);
    const monStr = toYyyyMmDd(targetMon);
    const matched = fourWeeks.find((w) => w.weekStart === monStr);
    const label = idx === 0 ? '이번 주' : idx === 1 ? '다음 주' : `${idx + 1}주차`;
    return {
      weekStart: monStr,
      label,
      data: matched || null,
    };
  });

  const primarySuggestion = suggestions[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 주차 네비게이터 */}
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => moveWeek(-1)} style={styles.navArrowBtn}>
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekTitle}>{formatWeekHeaderTitle(selectedMonday)}</Text>
        <View style={styles.headerRightGroup}>
          <Text style={styles.weekRangeText}>{formatWeekRange(selectedMonday)}</Text>
          <TouchableOpacity onPress={() => moveWeek(1)} style={styles.navArrowBtn}>
            <Text style={styles.navArrowText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 상단 주의 주차 배너 */}
          {weekLoad && weekLoad.riskLevel !== 'NONE' && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningBannerText}>
                ⚠ {weekLoad.riskLevel === 'RISK' ? '위험 주차' : '주의 주차'} · 마감{' '}
                {weekLoad.deadlineCount ?? 0}건 ·{' '}
                {(weekLoad.restDays ?? 0) === 0
                  ? '쉬는 날 없음'
                  : `쉬는 날 ${weekLoad.restDays}일`}
              </Text>
            </View>
          )}

          {/* 이번 주 일정 부하 + 4주 막대 차트 카드 */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>이번 주 일정 부하 ⓘ</Text>
            <View style={styles.loadHeadlineRow}>
              <Text style={styles.loadHeadline}>
                {weekLoad?.vsUsualPct != null
                  ? `평소보다 ${weekLoad.vsUsualPct > 0 ? '+' : ''}${Math.round(
                      weekLoad.vsUsualPct
                    )}%`
                  : `부하 점수 ${Math.round(weekLoad?.loadScore ?? 0)}점`}
              </Text>
              <Text style={styles.loadSubTag}>앞으로 4주 위험 주차</Text>
            </View>

            <View style={styles.fourWeekBarsRow}>
              {fourWeekSlots.map((slot) => {
                const riskLevel = slot.data?.riskLevel || 'NONE';
                const meta = RISK_META[riskLevel] || RISK_META.NONE;
                const score = slot.data?.loadScore ?? 25;
                const heightPct = slot.data
                  ? Math.min(100, Math.max(22, Math.round(score)))
                  : 15;

                return (
                  <View key={slot.weekStart} style={styles.fourWeekCol}>
                    <View style={styles.fourWeekTrack}>
                      <View
                        style={[
                          styles.fourWeekFill,
                          {
                            height: `${heightPct}%`,
                            backgroundColor: slot.data ? meta.color : '#E0DFD9',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.fourWeekLabel}>{slot.label}</Text>
                    <Text style={[styles.fourWeekRisk, { color: meta.color }]}>
                      {slot.data ? meta.label : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 월~일 주간 일정 스트립 */}
          <View style={styles.weekGridCard}>
            {weekDays.map((day) => (
              <View key={day.dateStr} style={styles.dayCol}>
                <Text style={styles.gridDayName}>{day.dayName}</Text>
                <Text style={styles.gridDateNum}>{day.dateNum}</Text>
                <View style={styles.gridBadgesCol}>
                  {day.dayEvents.slice(0, 3).map((ev) => {
                    const isAppCreated = ev.createdByApp;
                    const isAlert =
                      ev.isDeadline || ev.category === 'EXAM' || ev.category === 'PRESENTATION';
                    return (
                      <View
                        key={ev.id}
                        style={[
                          styles.miniBadge,
                          isAppCreated
                            ? styles.miniBadgeDashed
                            : isAlert
                            ? styles.miniBadgeAlert
                            : styles.miniBadgeNormal,
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniBadgeText,
                            isAlert && !isAppCreated && styles.miniBadgeTextAlert,
                          ]}
                          numberOfLines={1}
                        >
                          {getEventDisplayCategory(ev)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          {/* 일정 리스트 (카테고리 변경 버튼 포함) */}
          {events.map((ev) => {
            const catLabel = getEventDisplayCategory(ev);
            const isAlert =
              ev.isDeadline || ev.category === 'EXAM' || ev.category === 'PRESENTATION';
            return (
              <View key={ev.id} style={styles.eventItemCard}>
                <View style={styles.eventLeft}>
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {ev.title || '(제목 없음)'}
                  </Text>
                  <Text style={styles.eventMeta}>
                    {ev.categorySource === 'USER'
                      ? '직접 수정됨'
                      : 'AI 분류 · 직접 수정 가능'}
                  </Text>
                  <View
                    style={[
                      styles.eventCategoryPill,
                      isAlert && styles.eventCategoryPillAlert,
                    ]}
                  >
                    <Text
                      style={[
                        styles.eventCategoryText,
                        isAlert && styles.eventCategoryTextAlert,
                      ]}
                    >
                      {catLabel}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.changeCatBtn}
                  onPress={() => onEditCategory(ev)}
                >
                  <Text style={styles.changeCatBtnText}>카테고리 변경 ⌄</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          <Text style={styles.legendText}>
            ▭ 점선은 앱이 추가한 일정 (부하 계산 제외)
          </Text>

          {/* 과부하 대비 제안 카드 */}
          {primarySuggestion && (
            <View style={styles.overloadCard}>
              <View style={styles.overloadHeader}>
                <Text style={styles.overloadTitle}>과부하 대비 제안</Text>
                {primarySuggestion.message?.aiGenerated && (
                  <View style={styles.aiBadge}>
                    <Text style={styles.aiBadgeText}>AI 생성</Text>
                  </View>
                )}
              </View>
              <Text style={styles.overloadMessage}>
                {primarySuggestion.message?.text ||
                  `${primarySuggestion.title} 일정을 미리 배치해 볼까요?`}
              </Text>
              <View style={styles.overloadActions}>
                <TouchableOpacity
                  style={styles.laterBtn}
                  onPress={() => handleDismissSuggestion(primarySuggestion)}
                  disabled={actionLoading}
                >
                  <Text style={styles.laterBtnText}>나중에</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => handleApproveSuggestion(primarySuggestion)}
                  disabled={actionLoading}
                >
                  <Text style={styles.addBtnText}>캘린더에 추가</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* SLOT_CONFLICT 대체 시간 모달 */}
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
              같은 시간대에 일정이 생겼어요. 가능한 빈 시간을 선택해 주세요.
            </Text>
            {alternativeSlots.map((slot, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.slotOption}
                onPress={() => handleSelectAlternativeSlot(slot)}
              >
                <Text style={styles.slotOptionText}>
                  {slot.start?.slice(5, 16).replace('T', ' ')} ~ {slot.end?.slice(11, 16)}
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
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  navArrowBtn: { padding: 6 },
  navArrowText: { fontSize: 20, color: Colors.textPrimary, fontWeight: '600' },
  weekTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekRangeText: { fontSize: 12, color: Colors.textSecondary },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 28 },
  warningBanner: {
    backgroundColor: '#FBECE6',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E3B2A3',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  warningBannerText: { fontSize: 12, fontWeight: '600', color: '#B34B36' },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  cardLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  loadHeadlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  loadHeadline: { fontSize: 21, fontWeight: '700', color: Colors.textPrimary },
  loadSubTag: { fontSize: 11, color: Colors.textMuted },
  fourWeekBarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: 8,
  },
  fourWeekCol: { alignItems: 'center', flex: 1 },
  fourWeekTrack: {
    width: 32,
    height: 76,
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
    paddingBottom: 6,
    marginBottom: 6,
  },
  fourWeekFill: { width: '100%', borderRadius: 6 },
  fourWeekLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  fourWeekRisk: { fontSize: 11, fontWeight: '700' },
  weekGridCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  dayCol: { flex: 1, alignItems: 'center' },
  gridDayName: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  gridDateNum: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  gridBadgesCol: { width: '90%', gap: 4 },
  miniBadge: {
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  miniBadgeNormal: { backgroundColor: '#DDE7E0' },
  miniBadgeAlert: { backgroundColor: '#F3C7BA' },
  miniBadgeDashed: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#A9B8AE',
  },
  miniBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.textPrimary },
  miniBadgeTextAlert: { color: '#9E3E2A' },
  eventItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  eventLeft: { flex: 1, marginRight: 12 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  eventMeta: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
  eventCategoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#DDE7E0',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  eventCategoryPillAlert: { backgroundColor: '#F3D2C7' },
  eventCategoryText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  eventCategoryTextAlert: { color: '#9E3E2A' },
  changeCatBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surface,
  },
  changeCatBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  legendText: { fontSize: 11, color: Colors.textMuted, marginTop: 2, marginBottom: 14 },
  overloadCard: {
    backgroundColor: '#F6DFD6',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D6A99B',
    borderRadius: 16,
    padding: 16,
  },
  overloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  overloadTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  aiBadge: {
    paddingHorizontal: 7,
  },
  aiBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  overloadMessage: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 19,
    marginBottom: 14,
  },
  overloadActions: { flexDirection: 'row', gap: 10 },
  laterBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  addBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primaryText },
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