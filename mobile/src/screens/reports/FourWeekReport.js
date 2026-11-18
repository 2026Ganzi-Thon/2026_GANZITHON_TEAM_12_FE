import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { apiRequest } from '../../api/client';
import { Colors, Fonts } from '../../theme/tokens';
import CbiAssessmentScreen from '../onboarding/CbiAssessmentScreen';

const value = (n, unit = '') => Number.isFinite(n) ? `${Math.round(n * 10) / 10}${unit}` : '자료 부족';
const signed = (n, unit) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${value(n, unit)}` : '자료 부족';

function Comparison({ title, before, after, unit, difference }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.row}>
        <View style={styles.metric}><Text style={styles.note}>처음</Text><Text style={styles.value}>{value(before, unit)}</Text></View>
        <Text style={styles.note}>→</Text>
        <View style={styles.metric}><Text style={styles.note}>4주 후</Text><Text style={styles.value}>{value(after, unit)}</Text></View>
      </View>
      {difference ? <Text style={styles.note}>{difference}</Text> : null}
    </View>
  );
}

/** API 7절: 28일 미도달, 재검사 필요, 동의 철회, 비교값 누락을 각각 표시한다. */
export default function FourWeekReport({ onBack, onOpenSafety }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    apiRequest('/api/reports/four-week')
      .then((data) => {
        if (typeof data?.available !== 'boolean') throw new Error('비교 리포트를 불러오지 못했어요.');
        if (alive) setReport(data);
      })
      .catch((err) => { if (alive) setError(err.message || '비교 리포트를 불러오지 못했어요.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh]);

  const reload = () => {
    setLoading(true);
    setError('');
    setRefresh((n) => n + 1);
  };

  if (assessment) {
    return <CbiAssessmentScreen round="DAY28" onBack={() => setAssessment(false)}
      onOpenSafety={onOpenSafety} onCompleted={() => {
        setAssessment(false);
        reload();
      }} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.back}>
        <Text style={styles.note}>‹ 회복 리포트</Text>
      </TouchableOpacity>
      <Text style={styles.title}>4주 동안의 변화</Text>
      <Text style={styles.note}>처음과 지금의 피로, 회복, 일정 부하를 함께 살펴봐요.</Text>
      {loading ? <ActivityIndicator color={Colors.primary} /> : error ? (
        <View style={styles.card}>
          <Text style={styles.note}>{error}</Text>
          <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={reload}>
            <Text style={styles.buttonText}>다시 불러오기</Text>
          </TouchableOpacity>
        </View>
      ) : report?.unavailableReason === 'CONSENT_REQUIRED' ? (
        <View style={styles.card}><Text style={styles.cardTitle}>건강정보 동의가 필요해요</Text>
          <Text style={styles.note}>마이페이지에서 건강정보 동의를 확인해주세요.</Text></View>
      ) : !report?.available ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{report?.cbiDue ? '28일차 피로도 체크' : '28일차에 만나요'}</Text>
          <Text style={styles.note}>{report?.cbiDue
            ? '피로도 체크를 한 번 더 마치면 처음과 지금을 비교할 수 있어요.'
            : report?.availableFrom ? `${report.availableFrom}부터 4주 비교 리포트를 확인할 수 있어요.` : '28일이 지나면 4주 비교 리포트가 열려요.'}</Text>
          {report?.cbiDue ? <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => setAssessment(true)}>
            <Text style={styles.buttonText}>피로도 다시 체크하기</Text>
          </TouchableOpacity> : null}
        </View>
      ) : (
        <>
          <Comparison title="몸과 마음의 피로" before={report.cbi?.initial?.personal} after={report.cbi?.day28?.personal}
            unit="점" difference={`점수 변화 ${signed(report.cbi?.diff?.personal, '점')}`} />
          <Comparison title="일·학업의 피로" before={report.cbi?.initial?.work} after={report.cbi?.day28?.work}
            unit="점" difference={`점수 변화 ${signed(report.cbi?.diff?.work, '점')}`} />
          {!report.cbi?.initial ? <Text style={styles.note}>첫 피로도 체크 기록이 없어 점수 변화를 비교할 수 없어요.</Text> : null}
          <Comparison title="회복 · 첫 주와 마지막 주" before={report.recovery?.firstWeekAvgMs} after={report.recovery?.lastWeekAvgMs}
            unit=" ms" difference={`첫 주 대비 변화 ${signed(report.recovery?.changePct, '%')}`} />
          <Comparison title="평소 대비 일정 부하" before={report.load?.firstWeekVsUsualPct} after={report.load?.lastWeekVsUsualPct} unit="%" />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>함께 만든 휴식</Text>
            <Text style={styles.note}>캘린더에 추가한 제안 {value(report.suggestions?.approved, '개')}</Text>
            <Text style={styles.note}>실천한 제안 {value(report.suggestions?.done, '개')}</Text>
          </View>
          {report.interpretation?.text ? <View style={styles.card}>
            <Text style={styles.cardTitle}>나의 4주 돌아보기</Text>
            {report.interpretation.aiGenerated && !report.interpretation.fallback ? <Text style={styles.note}>AI 생성</Text> : null}
            <Text style={styles.note}>{report.interpretation.text}</Text>
          </View> : null}
          <Text style={styles.note}>기록을 비교한 참고 정보이며 의학적 진단이 아니에요.</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 32, gap: 16, backgroundColor: Colors.background },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  title: { fontFamily: Fonts.display, fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  card: { padding: 20, gap: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, backgroundColor: Colors.surface },
  cardTitle: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  note: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 21, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metric: { flex: 1, gap: 8 },
  value: { fontFamily: Fonts.display, fontSize: 23, fontWeight: '700', color: Colors.textPrimary },
  button: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '600', color: Colors.primaryText },
});
