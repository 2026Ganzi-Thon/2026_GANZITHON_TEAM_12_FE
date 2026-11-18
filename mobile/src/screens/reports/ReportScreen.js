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
import FourWeekReport from './FourWeekReport';
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
  // 시안의 회복 강조색·범위 막대. tokens 에 같은 역할이 없어 여기 둔다.
  recovery: '#C0705A',
  rangeFill: 'rgba(47, 74, 66, 0.2)',
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

/** 회복 상태 칩. %가 음수여도 NORMAL 일 수 있어 % 로 추측하지 않는다 (명세 7절). */
const RECOVERY_STATUS_LABEL = { LOW: '낮음', NORMAL: '평소 범위', INSUFFICIENT: '측정 부족' };

/** 10.16 처럼 짧게 */
const shortDate = (iso) => (iso ? iso.slice(5).replace('-', '.') : '');

/** 측정 품질 (명세 7절 latestQuality) */
const QUALITY_LABEL = { GOOD: '좋음', FAIR: '보통', RETRY: '재측정', UNVERIFIED: '참고용' };

/** 최저~최고 사이에서 지금이 어디쯤인지. value 는 0~100 (명세 7절) */
function RangeBar({ label, value, info }) {
  const pct = typeof value === 'number' ? Math.min(100, Math.max(0, value)) : null;
  return (
    <View style={styles.rangeRow}>
      <View style={styles.cardHead}>
        <Text style={styles.smallTitle}>{label}</Text>
        {info}
      </View>
      <View style={styles.rangeTrack}>
        {pct == null ? null : (
          <>
            <View style={[styles.rangeFill, { width: `${pct}%` }]} />
            <View style={[styles.rangeKnob, { left: `${pct}%` }]} />
          </>
        )}
      </View>
      <View style={styles.rangeEnds}>
        <Text style={styles.rangeEndText}>최저</Text>
        <Text style={styles.rangeEndText}>최고</Text>
      </View>
    </View>
  );
}

export const weekLabel = (idx) => ['이번 주', '다음 주', '3주차', '4주차'][idx] ?? `${idx + 1}주차`;

export default function ReportScreen({ onOpenTerm, onOpenSafety } = {}) {
  const [fourWeekOpen, setFourWeekOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [weeks, setWeeks] = useState([]);
  // 부하 값이 비었을 때 "캘린더를 연결하세요" 인지 "자료가 부족해요" 인지 가른다.
  const [calendarConnected, setCalendarConnected] = useState(null);
  // 머리말의 4주 / 2주 전환. 명세 7절의 days 는 7~90 이다.
  const [days, setDays] = useState(28);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [recovery, schedule, me] = await Promise.all([
          apiRequest(`/api/reports/recovery?days=${days}`),
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
  }, [days]);

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

  if (fourWeekOpen) return (
    <SafeAreaView style={styles.root}>
      <FourWeekReport onBack={() => setFourWeekOpen(false)} onOpenSafety={onOpenSafety} />
    </SafeAreaView>
  );

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
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>회복 리포트</Text>
              {report?.graph?.from ? (
                <Text style={styles.note}>
                  {shortDate(report.graph.from)} – {shortDate(report.graph.to)}
                </Text>
              ) : null}
            </View>
            {/* 명세 7절의 days 는 7~90. 4주/2주만 쓴다. */}
            <View style={styles.rangeToggle}>
              {[28, 14].map((d) => {
                const on = days === d;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.rangeButton, on && styles.rangeButtonOn]}
                    onPress={() => setDays(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{d === 28 ? '4주' : '2주'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity style={styles.card} accessibilityRole="button" onPress={() => setFourWeekOpen(true)}>
            <Text style={styles.cardTitle}>4주 동안의 변화 보기 →</Text>
            <Text style={styles.note}>28일차 피로도 재검사와 처음·지금 비교</Text>
          </TouchableOpacity>

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
            <View style={styles.pair}>
              <View style={[styles.card, styles.pairCard]}>
                <View style={styles.cardHead}>
                  <Text style={styles.smallTitle}>평소 대비 회복</Text>
                  {info('changePct', '평소 대비 회복')}
                </View>
                <View style={styles.valueRow}>
                  <Text style={[styles.valueMid, styles.recoveryValue]}>
                    {recoveryPct == null ? '—' : signed(recoveryPct)}
                  </Text>
                  {report?.recoveryStatus ? (
                    <Text style={styles.valueSuffix}>{RECOVERY_STATUS_LABEL[report.recoveryStatus] ?? ''}</Text>
                  ) : null}
                </View>
              </View>
              <View style={[styles.card, styles.pairCard]}>
                <View style={styles.cardHead}>
                  <Text style={styles.smallTitle}>측정 품질</Text>
                  {info('quality', '측정 품질')}
                </View>
                <Text style={[styles.valueMid, styles.qualityValue]}>
                  {QUALITY_LABEL[report?.latestQuality] ?? '—'}
                </Text>
              </View>
            </View>
          )}

          {report?.locked === false && <RecoveryGraph graph={report.graph} />}

          {report?.interpretation?.text ? (
            <View style={styles.card}>
              <View style={styles.cardHeadBetween}>
                <Text style={styles.cardTitle}>AI 해석</Text>
                {/* fallback(규칙 기반)일 때는 배지를 달지 않는다 (명세 0절) */}
                {report.interpretation.aiGenerated && !report.interpretation.fallback ? (
                  <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI 생성</Text></View>
                ) : null}
              </View>
              <Text style={styles.aiText}>{report.interpretation.text}</Text>
            </View>
          ) : null}

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

          {/* 명세 7절: dayIndex 28 이상이고 표본이 충분해야 열린다. 그 전엔 잠긴 모습으로 보여준다. */}
          <View style={[styles.card, styles.rangeCard]}>
            <View style={styles.cardHeadBetween}>
              <Text style={styles.cardTitle}>
                내 범위 중 현재 위치{report?.rangePosition?.available ? '' : ' (28일차 이후 공개)'}
              </Text>
              {report?.rangePosition?.available ? null : (
                <Ionicons name="lock-closed-outline" size={13} color={Colors.textMuted} />
              )}
            </View>
            <View style={report?.rangePosition?.available ? null : styles.rangeLocked}>
              <RangeBar
                label="회복"
                value={report?.rangePosition?.recovery?.position}
                info={info('rangePosition', '내 범위 중 현재 위치')}
              />
              <RangeBar
                label="일정 부하"
                value={report?.rangePosition?.load?.position}
                info={info('loadVsUsual', '일정 부하')}
              />
            </View>
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
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  rangeToggle: { flexDirection: 'row', gap: 6 },
  rangeButton: { minWidth: 51, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  rangeButtonOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rangeText: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: Colors.primary },
  rangeTextOn: { color: Colors.primaryText },

  pair: { flexDirection: 'row', gap: 12 },
  pairCard: { flex: 1, padding: 17, gap: 12 },
  smallTitle: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  valueMid: { fontFamily: Fonts.body, fontSize: 26, fontWeight: '700', color: Colors.textPrimary },
  valueSuffix: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: REPORT_COLORS.recovery },
  recoveryValue: { color: REPORT_COLORS.recovery },
  qualityValue: { fontSize: 24, color: Colors.accentBar },

  cardHeadBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  aiBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: Colors.chipNeutralBg, borderWidth: 1, borderColor: Colors.border },
  aiBadgeText: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  aiText: { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 23, color: Colors.textPrimary },

  rangeCard: { backgroundColor: Colors.background, borderStyle: 'dashed', gap: 16 },
  rangeLocked: { opacity: 0.7 },
  rangeRow: { marginBottom: 20 },
  rangeTrack: { height: 8, marginTop: 12, borderRadius: 999, backgroundColor: Colors.surfaceAccent },
  rangeFill: { position: 'absolute', left: 0, top: 0, height: 8, borderRadius: 999, backgroundColor: REPORT_COLORS.rangeFill },
  rangeKnob: { position: 'absolute', top: -4, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: Colors.primary, borderWidth: 2, borderColor: Colors.surface },
  rangeEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  rangeEndText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textMuted },
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
