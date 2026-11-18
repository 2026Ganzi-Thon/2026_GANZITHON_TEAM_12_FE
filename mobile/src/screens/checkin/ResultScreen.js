import React, { useEffect, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest, ApiError, generateUuid } from '../../api/client';
import TermPopup from '../../components/TermPopup';
import { findTerm } from '../../data/glossary';

/**
 * B6 오늘의 측정 결과 (API 명세 6절 TodayResult).
 * BUILDING은 HRV 수치를 보여주되 판단하지 않고, ESTABLISHED는 평소 대비 회복을 보여준다.
 * 컨디션 저장 응답을 부모에게서 받고, 없으면 오늘 체크를 다시 조회한다.
 */
const RECOVERY_LABEL = { LOW: '낮음', NORMAL: '평소 범위', INSUFFICIENT: '측정 부족', BUILDING: '기준선 만드는 중' };
const QUALITY_LABEL = { GOOD: '좋음', FAIR: '보통', RETRY: '재측정 필요', UNVERIFIED: '참고용' };
// 추천 이유. 1~7일차에는 회복을 판단할 수 없어 일정만 근거다 ("수정 요청사항 2" 1-8).
const REASON_LABEL = { OVERLOAD: '일정 많음', LOW_RECOVERY: '일정 많음 + 회복 낮음' };

const round1 = (value) => (value == null ? null : Math.round(value * 10) / 10);
// 날짜만 있는 값은 기기 시간대에 따라 전날로 바뀌지 않도록 날짜 구성요소로 만든다.
const dateLabel = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return iso;
  return `${iso.replace(/-/g, '.')} ${'일월화수목금토'[date.getDay()]}요일`;
};
const slotLabel = (suggestion) => {
  if (!suggestion.start) return suggestion.title ?? '';
  const date = new Date(suggestion.start);
  if (Number.isNaN(date.getTime())) return suggestion.title ?? '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${'일월화수목금토'[date.getDay()]} ${hh}:${mm} · ${suggestion.title ?? ''}`.trim();
};
// fallback(규칙 기반)일 때는 배지를 달지 않는다 (API 명세 0절 "AI 문구 표시").
const isAiGenerated = (message) => message?.aiGenerated === true && !message?.fallback;

function AiBadge() {
  return <Text style={styles.badge}>✦ AI 생성</Text>;
}

function InfoButton({ term, onOpen }) {
  return (
    <TouchableOpacity
      style={styles.infoButton}
      onPress={() => onOpen(term)}
      accessibilityRole="button"
      accessibilityLabel={`${findTerm(term)?.easy ?? ''} 설명 보기`}
    >
      <Text style={styles.infoIcon}>ⓘ</Text>
    </TouchableOpacity>
  );
}

function SuggestionCard({ suggestion, building }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState('');
  const [slots, setSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const showSlots = async () => {
    setSlots([]);
    setSlotsLoading(true);
    setSlotsError('');
    try {
      const response = await apiRequest(`/api/suggestions/${suggestion.id}/slots`);
      if (mounted.current) setSlots(response?.slots ?? []);
    } catch {
      if (mounted.current) setSlotsError('다른 시간을 불러오지 못했어요.');
    } finally {
      if (mounted.current) setSlotsLoading(false);
    }
  };

  const act = async (path, label, body) => {
    // 연속 탭과 대체 시간 선택 중 중복 승인을 함께 막는다.
    if (pending.current || done) return;
    pending.current = true;
    setBusy(true);
    setStatus('');
    try {
      await apiRequest(`/api/suggestions/${suggestion.id}/${path}`, {
        method: 'POST',
        body,
        idempotencyKey: generateUuid(),
      });
      if (!mounted.current) return;
      setDone(true);
      setSlots(null);
      setStatus(label);
    } catch (error) {
      if (!mounted.current) return;
      setStatus(error instanceof ApiError ? error.message : '잠시 후 다시 시도해주세요.');
      // 409 SLOT_CONFLICT: 그 사이 같은 시간에 일정이 생겼다. 다른 시간을 보여준다 (API 명세 5절).
      if (path === 'approve' && error instanceof ApiError && error.status === 409 && error.code === 'SLOT_CONFLICT') {
        await showSlots();
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const reasonText = [REASON_LABEL[suggestion.reasonCode], suggestion.title].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, styles.suggestion]}>
      <View style={styles.cardTop}>
        <Text style={styles.suggestionTitle}>오늘의 운동·휴식 추천</Text>
        {isAiGenerated(suggestion.message) ? <AiBadge /> : null}
      </View>
      {reasonText ? (
        <Text style={[styles.reason, !building && styles.reasonBox]}>{reasonText}</Text>
      ) : null}
      <View style={styles.when}>
        <View style={styles.walkIcon}><Ionicons name="walk-outline" size={20} color={Colors.primary} /></View>
        <View style={styles.whenTexts}>
          <Text style={styles.slotTitle}>{slotLabel(suggestion)}</Text>
          <Text style={styles.hint}>승인 시 구글 캘린더에 반영</Text>
        </View>
      </View>
      {!done ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.ghostButton, styles.actionButton, busy && styles.disabled]}
            onPress={() => act('dismiss', '다음에 다시 알려드릴게요')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.ghostButtonText}>다음에</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.actionButton, busy && styles.disabled]}
            onPress={() => act('approve', '구글 캘린더에 넣었어요')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>캘린더에 추가</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!done && slots !== null ? (
        <View style={styles.slots}>
          <Text style={styles.label}>다른 시간 보기</Text>
          {slotsLoading ? <ActivityIndicator color={Colors.primary} /> : slotsError ? (
            <Text style={styles.hint}>{slotsError}</Text>
          ) : !slots.length ? (
            <Text style={styles.hint}>오늘은 비어 있는 시간이 없어요.</Text>
          ) : slots.map((slot, index) => (
            <TouchableOpacity
              key={`${slot.start}-${slot.end}-${index}`}
              style={[styles.slotButton, busy && styles.disabled]}
              disabled={busy}
              accessibilityRole="button"
              onPress={() => act('approve', '구글 캘린더에 넣었어요', { start: slot.start, end: slot.end })}
            >
              <Text style={styles.slotButtonText}>{slotLabel({ ...suggestion, start: slot.start })}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {busy && !slotsLoading ? <ActivityIndicator color={Colors.primary} /> : null}
      {status ? <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text> : null}
    </View>
  );
}

export default function ResultScreen({ result, onHome, onOpenGlossary }) {
  const [data, setData] = useState(result ?? null);
  const [loading, setLoading] = useState(result == null);
  const [error, setError] = useState(null);
  const [term, setTerm] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setTerm(null);
    if (result != null) {
      setData(result);
      setLoading(false);
      return () => { alive = false; };
    }
    setData(null);
    setLoading(true);
    (async () => {
      try {
        const response = await apiRequest('/api/morning-checks/today');
        if (alive) setData(response?.result ?? null);
      } catch (err) {
        if (alive) setError(err?.message || '결과를 불러오지 못했어요.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [result]);

  const current = result ?? data;
  const building = current?.phase === 'BUILDING';
  const validDays = current?.baseline?.validDays ?? 0;
  const required = current?.baseline?.required ?? 7;
  const pct = current?.recovery?.changePct;

  const labelWithInfo = (label, key) => (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      <InfoButton term={key} onOpen={setTerm} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* 화면이 자기 머리말(로고·날짜·제목)을 그리므로 별도 셸 머리말·탭은 두지 않는다. */}
      <View style={styles.header}>
        <Text style={styles.brand}>Come &amp; Down</Text>
        {current?.date ? <Text style={styles.hint}>{dateLabel(current.date)}</Text> : null}
        <Text style={styles.title}>오늘의 측정 결과</Text>
      </View>
      {loading && result == null ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {error || !current ? (
            <Text style={styles.empty}>{error || '아직 오늘 체크를 마치지 않았어요.'}</Text>
          ) : (
            <>
              {building ? (
                <>
                  <View style={[styles.card, styles.baseline]}>
                    <Text style={styles.baselineTitle}>
                      기준선 만드는 중 <Text style={styles.baselineCount}>{validDays}/{required}</Text>
                    </Text>
                    <View style={styles.dots} accessibilityLabel={`${required}일 중 ${validDays}일 측정`}>
                      {Array.from({ length: required }, (_, index) => (
                        <View key={index} style={[styles.dot, index < validDays && styles.dotOn]} />
                      ))}
                    </View>
                    <Text style={styles.hint}>{required}일째부터 평소 대비 회복을 알려드려요</Text>
                  </View>
                  <View style={styles.metrics}>
                    {[
                      { name: 'HRV', value: current.rmssdMs, unit: 'ms', term: 'recovery' },
                      { name: '심박수', value: current.heartRateBpm, unit: 'bpm', term: 'heartRate' },
                    ].map((metric) => (
                      <View key={metric.name} style={[styles.card, styles.metric]}>
                        {labelWithInfo(metric.name, metric.term)}
                        <Text style={styles.metricValue}>
                          {round1(metric.value) ?? '—'}<Text style={styles.unit}> {metric.unit}</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={[styles.card, styles.recovery]}>
                  <View style={styles.cardTop}>
                    {labelWithInfo('오늘의 회복', 'recovery')}
                    <Text style={[styles.chip, styles.solidChip]}>{RECOVERY_LABEL[current.recovery?.status] ?? '—'}</Text>
                  </View>
                  {/* 기준선이나 표본이 부족하면 changePct가 null이므로 0%로 바꾸지 않는다. */}
                  {pct == null ? (
                    <Text style={styles.label}>평소와 비교할 자료가 아직 부족해요</Text>
                  ) : (
                    <View>
                      <Text style={styles.label}>평소보다</Text>
                      <Text style={styles.recoveryValue}>
                        {Math.abs(round1(pct))}% <Text style={styles.recoveryDirection}>{pct < 0 ? '낮아요' : '높아요'}</Text>
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <View style={[styles.card, building ? styles.cardTop : styles.qualityLine]}>
                {labelWithInfo('측정 품질', 'quality')}
                <View style={styles.qualityValues}>
                  <Text style={styles.chip}>{building ? '' : '• '}{QUALITY_LABEL[current.qualityLevel] ?? '—'}</Text>
                  {!building && current.rmssdMs != null ? <Text style={styles.label}>· HRV {round1(current.rmssdMs)}ms</Text> : null}
                  {!building && current.heartRateBpm != null ? <Text style={styles.label}>· 심박수 {round1(current.heartRateBpm)}bpm</Text> : null}
                </View>
              </View>
              {!building && current.interpretation?.text ? (
                <View style={[styles.card, styles.interpretation]}>
                  <View style={styles.cardTop}>
                    {isAiGenerated(current.interpretation) ? <AiBadge /> : <View />}
                    <Text style={styles.hint}>AI 해석</Text>
                  </View>
                  <Text style={styles.interpretationText}>{current.interpretation.text}</Text>
                </View>
              ) : null}
              {current.excludedFromBaseline === true ? (
                <View style={styles.excluded}>
                  <InfoButton term="excluded" onOpen={setTerm} />
                  <Text style={styles.excludedText}>오늘 값은 '내 평소' 계산에서 빠져요</Text>
                </View>
              ) : null}
              {(current.suggestions ?? []).map((suggestion) => (
                <SuggestionCard key={`${current.date ?? ''}-${suggestion.id}`} suggestion={suggestion} building={building} />
              ))}
            </>
          )}
          <TouchableOpacity style={[styles.button, styles.ghostButton, styles.homeButton]} onPress={onHome} accessibilityRole="button">
            <Text style={styles.homeButtonText}>홈으로</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      {/* 웹 용어 팝업을 네이티브 모달로 대체해 뒤로 가기와 닫기를 지원한다. */}
      {/* 용어 팝업은 용어 사전과 같은 데이터를 쓴다 (src/components/TermPopup) */}
      <TermPopup termKey={term} onClose={() => setTerm(null)} onOpenGlossary={onOpenGlossary} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 4 },
  brand: { fontFamily: Fonts.display, fontSize: 15, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  title: { fontFamily: Fonts.display, fontSize: 21, fontWeight: '700', color: Colors.textPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  body: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  empty: { fontFamily: Fonts.body, fontSize: 15, color: Colors.textSecondary, textAlign: 'center', marginVertical: 32 },
  card: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 17 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  hint: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 18, color: Colors.textMuted },
  infoButton: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  infoIcon: { fontFamily: Fonts.body, fontSize: 17, color: Colors.textMuted },
  chip: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: Colors.accentBar, backgroundColor: Colors.surfaceAccent, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10, overflow: 'hidden' },
  solidChip: { backgroundColor: Colors.primary, color: Colors.primaryText },
  badge: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '600', color: Colors.accentBar, backgroundColor: Colors.surfaceAccent, borderColor: Colors.border, borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10, overflow: 'hidden' },
  baseline: { gap: 14 },
  baselineTitle: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  baselineCount: { color: Colors.accentBar, fontWeight: '700' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  dotOn: { borderColor: Colors.accentBar, backgroundColor: Colors.accentBar },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, paddingHorizontal: 12, gap: 8 },
  metricValue: { fontFamily: Fonts.body, fontSize: 26, fontWeight: '700', color: Colors.textPrimary },
  unit: { fontSize: 12, fontWeight: '400', color: Colors.textMuted },
  recovery: { gap: 24 },
  recoveryValue: { fontFamily: Fonts.body, fontSize: 42, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  recoveryDirection: { fontSize: 18, fontWeight: '600' },
  qualityLine: { gap: 8 },
  qualityValues: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  interpretation: { gap: 10 },
  interpretationText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 26, color: Colors.textPrimary },
  excluded: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, borderRadius: 16 },
  excludedText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
  suggestion: { gap: 12, padding: 16 },
  suggestionTitle: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  reason: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
  reasonBox: { paddingVertical: 11, paddingHorizontal: 12, backgroundColor: Colors.warningBg, color: Colors.warningText, borderRadius: 12 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 13, borderTopWidth: 1, borderTopColor: Colors.border },
  walkIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.surfaceAccent, alignItems: 'center', justifyContent: 'center' },
  whenTexts: { flex: 1, gap: 2 },
  slotTitle: { fontFamily: Fonts.body, fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  actions: { flexDirection: 'row', gap: 8 },
  button: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  buttonText: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '600', color: Colors.primaryText, textAlign: 'center' },
  ghostButton: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  ghostButtonText: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  actionButton: { flex: 1 },
  disabled: { opacity: 0.5 },
  status: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 20, color: Colors.textSecondary, textAlign: 'center' },
  slots: { gap: 8 },
  slotButton: { minHeight: 44, padding: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  slotButtonText: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  homeButton: { marginTop: 8 },
  homeButtonText: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
});
