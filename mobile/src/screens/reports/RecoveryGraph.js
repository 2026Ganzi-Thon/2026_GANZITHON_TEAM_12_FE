import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';

const DAY = 86400000;
const HRV_HEIGHT = 160;
const LOAD_HEIGHT = 88;
// 명세 7절은 교란일을 회색으로 구분한다. 공통 토큰의 글자색은 녹색 계열이라 중립 회색을 별도로 둔다.
const EXCLUDED_COLOR = '#999999';
const list = (value) => (Array.isArray(value) ? value : []);
const validValue = (value) => Number.isFinite(value) && value >= 0;
const dateValue = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  // 명세 7절의 서울 날짜를 날짜 단위로만 비교해 기기 시간대나 일광절약시간의 영향을 없앤다.
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
};
const shortDate = (time) => `${new Date(time).getUTCMonth() + 1}/${new Date(time).getUTCDate()}`;
const numberLabel = (value) => String(Math.round(value * 10) / 10);

export function buildRecoveryGraph(graph) {
  const from = dateValue(graph?.from);
  const to = dateValue(graph?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  const dated = (items) => list(items)
    .filter((item) => item && dateValue(item.date) >= from && dateValue(item.date) <= to)
    .map((item) => ({ ...item, time: dateValue(item.date) }))
    .sort((a, b) => a.time - b.time);
  const points = dated(graph.points).filter((point) => validValue(point.rmssdMs));
  if (!points.length) return null;
  const trend = dated(graph.trend).filter((point) => validValue(point.rmssdMs));
  const band = dated(graph.normalBand).filter((point) => (
    validValue(point.lowerMs) && validValue(point.upperMs) && point.lowerMs <= point.upperMs
  ));
  // 명세 7절의 날짜별 띠까지 포함해야 정상 범위가 차트 밖으로 잘리지 않는다.
  const values = [...points, ...trend].map((point) => point.rmssdMs)
    .concat(band.flatMap((point) => [point.lowerMs, point.upperMs]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.1, max === min ? Math.max(max * 0.1, 1) : 0);
  const low = Math.max(0, min - padding);
  const high = max + padding;
  const weeks = list(graph.loadWeeks).filter((week) => week
    && Number.isFinite(dateValue(week.weekStart)) && Number.isFinite(dateValue(week.weekEnd))
    && dateValue(week.weekEnd) >= dateValue(week.weekStart)
    && dateValue(week.weekEnd) >= from && dateValue(week.weekStart) <= to);
  const loadMax = Math.max(1, ...weeks.map((week) => validValue(week.loadScore) ? week.loadScore : 0)) * 1.1;
  const ticks = [];
  // 명세 7절의 주차는 온보딩 기준이다. 월요일이나 오늘로 축을 다시 맞추지 않는다.
  for (let time = from; time <= to; time += 7 * DAY) ticks.push(time);
  return { from, to, points, trend, band, weeks, low, high, loadMax, ticks };
}

export default function RecoveryGraph({ graph }) {
  const [width, setWidth] = useState(0);
  const data = useMemo(() => buildRecoveryGraph(graph), [graph]);
  if (!data) {
    return <View style={styles.card}><Text style={styles.note}>측정 기록이 아직 없어요</Text></View>;
  }
  const { from, to, points, trend, band, weeks, low, high, loadMax, ticks } = data;
  const x = (time) => ((Math.max(from, Math.min(to, time)) - from) / Math.max(DAY, to - from)) * width;
  const y = (value) => (1 - (value - low) / (high - low)) * HRV_HEIGHT;
  const normal = graph.normalRange;
  const hasNormal = validValue(normal?.lowerMs) && validValue(normal?.upperMs) && normal.lowerMs <= normal.upperMs;
  const hasLoad = weeks.some((week) => validValue(week.loadScore));
  const grid = (height) => ticks.map((time) => (
    <View key={time} style={[styles.grid, { left: x(time), height }]} />
  ));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>회복과 일정 부하</Text>
      <Text style={styles.note}>{shortDate(from)} ~ {shortDate(to)}</Text>
      <View style={styles.legend}>
        <Legend label="하루 측정" marker={styles.pointLegend} />
        <Legend label="교란일" marker={[styles.pointLegend, styles.excluded]} />
        <Legend label="7일 평균" marker={styles.lineLegend} />
        <Legend label="정상 범위" marker={styles.bandLegend} />
      </View>
      <Text style={styles.sectionTitle}>HRV · ms</Text>
      <View style={styles.plotRow}>
        <View style={[styles.yAxis, { height: HRV_HEIGHT }]}>
          <Text style={styles.axisText}>{numberLabel(high)}</Text>
          <Text style={styles.axisText}>{numberLabel((low + high) / 2)}</Text>
          <Text style={styles.axisText}>{numberLabel(low)}</Text>
        </View>
        <View style={styles.plotColumn} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <View style={{ height: HRV_HEIGHT }} accessibilityLabel={`HRV 측정 ${points.length}일, 7일 평균 ${trend.length}일`}>
            {grid(HRV_HEIGHT)}
            {/* 명세 7절의 정상 범위는 날짜마다 다르므로 요약 normalRange로 대체하지 않는다. */}
            {width > 0 && band.map((point) => (
              <View key={point.date} style={[styles.band, {
                left: x(point.time - DAY / 2), top: y(point.upperMs),
                width: x(point.time + DAY / 2) - x(point.time - DAY / 2),
                height: y(point.lowerMs) - y(point.upperMs),
              }]} />
            ))}
            {width > 0 && trend.map((point, index) => {
              const previous = trend[index - 1];
              // 명세 7절에서 항목이 없는 날은 추세가 없으므로 결측 구간을 선으로 메우지 않는다.
              if (!previous || point.time - previous.time !== DAY) return null;
              const dx = x(point.time) - x(previous.time);
              const dy = y(point.rmssdMs) - y(previous.rmssdMs);
              const length = Math.hypot(dx, dy);
              return <View key={`line-${point.date}`} style={[styles.trendLine, {
                left: (x(point.time) + x(previous.time) - length) / 2,
                top: (y(point.rmssdMs) + y(previous.rmssdMs)) / 2 - 1,
                width: length, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }]} />;
            })}
            {width > 0 && trend.map((point) => <View key={`trend-${point.date}`} style={[styles.trendPoint, {
              left: x(point.time) - 2, top: y(point.rmssdMs) - 2,
            }]} />)}
            {width > 0 && points.map((point) => (
              <View key={point.date} accessible accessibilityLabel={`${point.date}, ${point.rmssdMs} ms${point.excluded ? ', 교란일' : ''}`}
                style={[styles.point, point.excluded && styles.excluded, {
                  left: x(point.time) - 3, top: y(point.rmssdMs) - 3,
                }]} />
            ))}
          </View>
        </View>
      </View>
      <View style={styles.loadHeading}>
        <Text style={styles.sectionTitle}>주차별 일정 부하</Text>
        <Legend label="진행 중인 주" marker={styles.currentLegend} />
      </View>
      <View style={styles.plotRow}>
        <View style={[styles.yAxis, { height: LOAD_HEIGHT }]}>
          <Text style={styles.axisText}>{numberLabel(loadMax)}</Text>
          <Text style={styles.axisText}>0</Text>
        </View>
        <View style={styles.plotColumn}>
          <View style={[styles.loadPlot, { height: LOAD_HEIGHT }]}>
            {grid(LOAD_HEIGHT)}
            {width > 0 && weeks.map((week) => {
              // 명세 7절: 미연결의 null은 0점이 아니다. 주차 공간만 남기고 막대는 그리지 않는다.
              if (!validValue(week.loadScore)) return null;
              const left = x(dateValue(week.weekStart));
              return <View key={week.weekStart} accessible
                accessibilityLabel={`${week.weekStart}부터 ${week.weekEnd}, 일정 부하 ${week.loadScore}${week.current ? ', 진행 중인 주' : ''}`}
                style={[styles.loadBar, week.current && styles.currentBar, {
                  left, width: Math.max(0, x(dateValue(week.weekEnd)) - left),
                  height: week.loadScore / loadMax * LOAD_HEIGHT,
                }]} />;
            })}
          </View>
          {/* 두 단이 같은 너비와 x 함수를 써서 미래 날짜까지 날짜축 하나를 공유한다(명세 7절). */}
          <View style={styles.dateAxis}>
            {width > 0 && ticks.map((time) => <Text key={time} style={[styles.dateLabel, {
              left: Math.max(0, Math.min(width - 42, x(time) - 21)),
            }]}>{shortDate(time)}</Text>)}
          </View>
        </View>
      </View>
      {!hasLoad && <Text style={styles.note}>일정 부하 데이터가 아직 없어요</Text>}
      {hasNormal && <Text style={styles.note}>현재 정상 범위 {numberLabel(normal.lowerMs)} ~ {numberLabel(normal.upperMs)} ms</Text>}
    </View>
  );
}

function Legend({ label, marker }) {
  return <View style={styles.legendItem}><View style={marker} /><Text style={styles.axisText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { padding: 21, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, gap: 8 },
  title: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  note: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 21, color: Colors.textSecondary },
  sectionTitle: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pointLegend: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  lineLegend: { width: 12, height: 2, backgroundColor: Colors.accentBar },
  bandLegend: { width: 12, height: 8, backgroundColor: Colors.surfaceAccent },
  currentLegend: { width: 10, height: 8, backgroundColor: Colors.primary },
  axisText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
  plotRow: { flexDirection: 'row', paddingRight: 4 },
  yAxis: { width: 38, paddingRight: 6, justifyContent: 'space-between', alignItems: 'flex-end' },
  plotColumn: { flex: 1, minWidth: 0 },
  grid: { position: 'absolute', top: 0, width: 1, backgroundColor: Colors.surfaceMuted },
  band: { position: 'absolute', backgroundColor: Colors.surfaceAccent },
  point: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  excluded: { backgroundColor: EXCLUDED_COLOR },
  trendPoint: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.accentBar },
  trendLine: { position: 'absolute', height: 2, backgroundColor: Colors.accentBar },
  loadHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20 },
  loadPlot: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  loadBar: { position: 'absolute', bottom: 0, backgroundColor: Colors.surfaceAccent, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  currentBar: { backgroundColor: Colors.primary },
  dateAxis: { height: 28, marginTop: 8 },
  dateLabel: { position: 'absolute', width: 42, textAlign: 'center', fontFamily: Fonts.body, fontSize: 11, color: Colors.textSecondary },
});
