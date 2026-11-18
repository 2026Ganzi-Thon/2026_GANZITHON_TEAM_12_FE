import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RecoveryGraph from './RecoveryGraph';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest, ApiError } from '../../api/client';

/**
 * C1 회복 리포트 (API 명세 7절)
 * 잠금 해제 전에도 일정 쪽 카드는 보여준다.
 * C1-2는 명세 7절과 수정 요청사항 2의 1-9에 맞춰 HRV와 일정 부하의 날짜축을 공유한다.
 */

// 공통 토큰에 없는 잠김 카드와 위험 단계 색은 원본 시안의 구분을 유지한다.
const REPORT_COLORS = {
  lockedBackground: '#FAF3E8',
  lockedBorder: '#EFE2D2',
  riskBar: '#D98D74',
  watchBar: '#F2C8AB',
  watchDot: '#DBA07C',
  normalBar: '#A9C0A4',
  normalDot: '#8FA98A',
};
const RISK = {
  RISK: { label: '위험', barStyle: 'riskBar', dotStyle: 'riskDot' },
  WATCH: { label: '주의', barStyle: 'watchBar', dotStyle: 'watchDot' },
  NONE: { label: '보통', barStyle: 'normalBar', dotStyle: 'normalDot' },
};
const BAR_MAX_PX = 140;
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const signed = (n) => `${n > 0 ? '+' : ''}${round1(n)}%`;

/** 서울 기준 이번 주 월요일 (주는 월요일 시작, API 명세 0절) */
export function mondayOf(date = new Date()) {
  const seoul = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const diff = (seoul.getDay() + 6) % 7;
  seoul.setDate(seoul.getDate() - diff);
  return `${seoul.getFullYear()}-${String(seoul.getMonth() + 1).padStart(2, '0')}-${String(seoul.getDate()).padStart(2, '0')}`;
}

/** 주차 막대 높이. 가장 높은 주를 꽉 채우고 나머지를 비율로 */
export function barHeights(weeks) {
  const max = Math.max(...weeks.map((w) => w.loadScore ?? 0), 1);
  return weeks.map((w) => Math.round(((w.loadScore ?? 0) / max) * BAR_MAX_PX));
}

export const weekLabel = (idx) => ['이번 주', '다음 주', '3주차', '4주차'][idx] ?? `${idx + 1}주차`;

export default function ReportScreen({ onOpenTerm } = {}) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [weeks, setWeeks] = useState([]);
  // 부하 값이 비었을 때 "캘린더를 연결하세요" 인지 "자료가 부족해요" 인지 가른다.
  const [calendarConnected, setCalendarConnected] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [recovery, schedule, me] = await Promise.all([
          apiRequest('/api/reports/recovery?days=28'),
          // 주차 조회·내 정보 실패는 회복 리포트 전체를 막지 않는다.
          apiRequest(`/api/schedule/weeks?from=${mondayOf()}&count=4`).catch(() => null),
          apiRequest('/api/me').catch(() => null),
        ]);
        if (alive) {
          if (!recovery || typeof recovery.locked !== 'boolean') {
            throw new Error('리포트 응답이 비어 있어요.');
          }
          setReport(recovery);
          setWeeks(Array.isArray(schedule?.weeks) ? schedule.weeks.filter(Boolean) : []);
          setCalendarConnected(me ? Boolean(me.calendar?.connected) : null);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof ApiError ? e.message : '리포트를 불러오지 못했어요.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const validDays = report?.unlock?.validDays ?? 0;
  const requiredDays = report?.unlock?.requiredDays ?? 7;
  const recoveryPct = report?.hrvVsUsualPct;
  const loadPct = report?.loadVsUsualPct;
  const heights = barHeights(weeks);

  const info = (key, label) => onOpenTerm ? (
    <TouchableOpacity
      style={styles.infoButton}
      onPress={() => onOpenTerm?.(key)}
      accessibilityRole="button"
      accessibilityLabel={`${label} 설명 보기`}
    >
      <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
    </TouchableOpacity>
  ) : null;

  return (
    <SafeAreaView style={styles.root}>
      {/* 화면이 자기 제목을 그리므로 별도 셸 머리말은 두지 않는다. */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>회복 리포트</Text>

          {report?.locked ? (
            <View style={[styles.card, styles.lockedCard]}>
              <View style={styles.lockedTop}>
                <Text style={styles.cardTitle}>기준선 만드는 중</Text>
                <Text style={styles.cardTitle}>{validDays}/{requiredDays}</Text>
              </View>
              <View
                style={styles.dots}
                accessible
                accessibilityLabel={`유효 측정 ${validDays}일, 목표 ${requiredDays}일`}
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <View key={i} style={[styles.progressDot, i < validDays && styles.progressDotFilled]} />
                ))}
              </View>
              <Text style={styles.note}>{requiredDays}일째부터 회복 리포트를 볼 수 있어요.</Text>
              <Text style={styles.note}>매일 아침 재면 ‘내 평소’가 만들어져요.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>평소 대비 회복</Text>
                {info('changePct', '평소 대비 회복')}
              </View>
              <Text style={styles.value}>{recoveryPct == null ? '—' : signed(recoveryPct)}</Text>
              {report?.interpretation?.text ? (
                <Text style={[styles.note, styles.valueNote]}>{report.interpretation.text}</Text>
              ) : null}
            </View>
          )}

          {report?.locked === false && <RecoveryGraph graph={report.graph} />}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>평소 대비 일정 부하</Text>
              {info('loadVsUsual', '평소 대비 일정 부하')}
            </View>
            <Text style={[styles.value, styles.loadValue]}>{loadPct == null ? '—' : signed(loadPct)}</Text>
            {loadPct == null ? (
              // 캘린더가 연결돼 있어도 비교할 지난 일정이 모자라면 null 이 온다.
              <Text style={[styles.note, styles.valueNote]}>
                {calendarConnected === false
                  ? '캘린더를 연결하면 알려드려요'
                  : '비교할 일정이 아직 부족해요'}
              </Text>
            ) : null}
          </View>

          {weeks.length ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>앞으로 4주 위험 주차</Text>
                {info('riskWeek', '앞으로 4주 위험 주차')}
              </View>
              <View style={styles.chart}>
                {weeks.map((week, i) => {
                  const level = RISK[week.riskLevel] ?? RISK.NONE;
                  return (
                    <View key={week.weekStart ?? i} style={styles.column}>
                      <View style={styles.track}>
                        <View style={[styles.bar, styles[level.barStyle], { height: heights[i] }]} />
                      </View>
                      <Text style={styles.weekLabel}>{weekLabel(i)}</Text>
                      <View style={styles.legend}>
                        <View style={[styles.legendDot, styles[level.dotStyle]]} />
                        <Text style={styles.legendText}>{level.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 16 },
  title: { fontFamily: Fonts.display, fontSize: 24, fontWeight: '700', color: Colors.textPrimary, marginTop: 8 },
  card: { padding: 21, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardTitle: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
  infoButton: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  lockedCard: { gap: 16, backgroundColor: REPORT_COLORS.lockedBackground, borderColor: REPORT_COLORS.lockedBorder },
  lockedTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dots: { flexDirection: 'row', gap: 8 },
  progressDot: { flex: 1, maxWidth: 38, aspectRatio: 1, borderRadius: 19, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  progressDotFilled: { backgroundColor: Colors.textPrimary, borderColor: Colors.textPrimary },
  note: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 21, color: Colors.textSecondary },
  value: { fontFamily: Fonts.display, fontSize: 40, fontWeight: '700', letterSpacing: -1, color: Colors.textPrimary },
  loadValue: { color: Colors.warningText },
  valueNote: { marginTop: 12 },
  chart: { flexDirection: 'row', gap: 12, marginTop: 24 },
  column: { flex: 1, alignItems: 'center' },
  track: { width: '100%', height: BAR_MAX_PX, justifyContent: 'flex-end' },
  // 원본처럼 부하가 0이거나 null이어도 최소 8 높이의 막대를 보여준다.
  bar: { width: '100%', minHeight: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  riskBar: { backgroundColor: REPORT_COLORS.riskBar },
  watchBar: { backgroundColor: REPORT_COLORS.watchBar },
  normalBar: { backgroundColor: REPORT_COLORS.normalBar },
  weekLabel: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '500', color: Colors.textSecondary, marginTop: 12, marginBottom: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  riskDot: { backgroundColor: REPORT_COLORS.riskBar },
  watchDot: { backgroundColor: REPORT_COLORS.watchDot },
  normalDot: { backgroundColor: REPORT_COLORS.normalDot },
  legendText: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
});
