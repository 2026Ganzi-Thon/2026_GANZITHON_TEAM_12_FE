import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../theme/tokens';
import { apiRequest } from '../../api/client';

const WORK_STUDY_CATEGORIES = [
  { code: 'CLASS', label: '수업' },
  { code: 'ASSIGNMENT', label: '과제' },
  { code: 'STUDY', label: '공부' },
  { code: 'EXAM', label: '시험' },
  { code: 'PRESENTATION', label: '발표' },
  { code: 'PART_TIME', label: '아르바이트' },
  { code: 'CLUB', label: '동아리·대외활동' },
  { code: 'WORK_MEETING', label: '회의·팀플' },
];

const PERSONAL_CATEGORIES = [
  { code: 'EXERCISE', label: '운동' },
  { code: 'APPOINTMENT', label: '약속' },
  { code: 'PERSONAL', label: '개인' },
];

const OTHER_CATEGORY = { code: 'OTHER', label: '기타' };

const ALL_CATEGORIES = [...WORK_STUDY_CATEGORIES, ...PERSONAL_CATEGORIES, OTHER_CATEGORY];

export default function CategoryEditScreen({ event, onBack, onSaved }) {
  const [category, setCategory] = useState(event?.category || 'WORK_MEETING');
  const [customCategory, setCustomCategory] = useState(event?.customCategory || '');
  const [isDeadline, setIsDeadline] = useState(Boolean(event?.isDeadline));
  const [scope, setScope] = useState('THIS');
  const [submitting, setSubmitting] = useState(false);

  const selectedLabel =
    category === 'OTHER' && customCategory.trim()
      ? customCategory.trim()
      : ALL_CATEGORIES.find((c) => c.code === category)?.label || '기타';

  const handleSave = async () => {
    if (submitting) return;
    const trimmedCustom = customCategory.trim();

    if (category === 'OTHER' && trimmedCustom.length > 20) {
      Alert.alert('입력 오류', '직접 입력 카테고리는 20자 이내로 입력해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        category,
        isDeadline,
        scope,
        ...(category === 'OTHER' ? { customCategory: trimmedCustom || null } : {}),
      };

      const res = await apiRequest(`/api/calendar/events/${event.id}/category`, {
        method: 'PATCH',
        body: payload,
      });

      onSaved(res);
    } catch (err) {
      Alert.alert('저장 실패', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderChip = (item, isPersonalGroup = false) => {
    const selected = category === item.code;
    return (
      <TouchableOpacity
        key={item.code}
        style={[
          styles.chip,
          isPersonalGroup && styles.chipPersonal,
          selected && styles.chipSelected,
        ]}
        onPress={() => setCategory(item.code)}
      >
        <Text
          style={[
            styles.chipText,
            isPersonalGroup && styles.chipTextPersonal,
            selected && styles.chipTextSelected,
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>카테고리 변경</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 선택된 일정 요약 카드 */}
        <View style={styles.eventSummaryCard}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {event?.title || '(제목 없음)'}
            </Text>
            {event?.start && (
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 3 }}>
                {new Date(event.start).toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}{' '}
                {!event?.allDay &&
                  new Date(event.start).toTimeString().slice(0, 5)}
              </Text>
            )}
          </View>
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>{selectedLabel} ⌄</Text>
          </View>
        </View>

        {/* 일·공부 그룹 */}
        <View style={styles.groupSection}>
          <Text style={styles.groupTitle}>
            • 일·공부 <Text style={styles.groupSub}>(부하 계산에 포함)</Text>
          </Text>
          <View style={styles.chipWrap}>
            {WORK_STUDY_CATEGORIES.map((item) => renderChip(item, false))}
          </View>
        </View>

        {/* 개인 그룹 */}
        <View style={styles.groupSection}>
          <Text style={styles.groupTitle}>
            • 개인 <Text style={styles.groupSub}>(부하 계산 제외)</Text>
          </Text>
          <View style={styles.chipWrap}>
            {PERSONAL_CATEGORIES.map((item) => renderChip(item, true))}
          </View>
        </View>

        {/* 그 외 (OTHER + v2.0 customCategory 입력) */}
        <View style={styles.groupSection}>
          <Text style={styles.groupTitle}>• 그 외</Text>
          <View style={styles.chipWrap}>{renderChip(OTHER_CATEGORY, false)}</View>

          {category === 'OTHER' && (
            <View style={styles.customCatBox}>
              <TextInput
                style={styles.customCatInput}
                value={customCategory}
                onChangeText={setCustomCategory}
                placeholder="카테고리 이름 직접 입력 (선택, 1~20자)"
                placeholderTextColor={Colors.textMuted}
                maxLength={20}
              />
              <Text style={styles.customCatCount}>{customCategory.length}/20</Text>
            </View>
          )}
        </View>

        {/* 마감 일정 체크박스 카드 */}
        <TouchableOpacity
          style={styles.cardRow}
          onPress={() => setIsDeadline((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isDeadline && styles.checkboxChecked]}>
            {isDeadline && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.cardRowTexts}>
            <Text style={styles.cardRowTitle}>마감 일정이에요</Text>
            <Text style={styles.cardRowSub}>
              체크하면 '마감 몰림' 계산에 들어가요
            </Text>
          </View>
        </TouchableOpacity>

        {/* 적용 범위 (scope) 카드 */}
        <View style={styles.scopeCard}>
          <TouchableOpacity
            style={styles.scopeOptionRow}
            onPress={() => setScope('THIS')}
          >
            <View style={[styles.radio, scope === 'THIS' && styles.radioSelected]}>
              {scope === 'THIS' && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.scopeLabel}>이 일정만</Text>
          </TouchableOpacity>

          {event?.recurring && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.scopeOptionRow}
                onPress={() => setScope('SERIES')}
              >
                <View style={[styles.radio, scope === 'SERIES' && styles.radioSelected]}>
                  {scope === 'SERIES' && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.scopeLabel}>반복 일정 전체</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.scopeOptionRow}
            onPress={() => setScope('TITLE')}
          >
            <View style={[styles.radio, scope === 'TITLE' && styles.radioSelected]}>
              {scope === 'TITLE' && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.scopeLabel}>같은 이름 일정 모두</Text>
          </TouchableOpacity>
        </View>

        {/* 하단 안내 문구 */}
        <View style={styles.infoPill}>
          <Text style={styles.infoPillText}>
            ⓘ '회복'은 앱이 추가한 일정에만 자동으로 붙어요 (선택지에 없음)
          </Text>
        </View>
      </ScrollView>

      {/* 저장 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primaryText} />
          ) : (
            <Text style={styles.saveBtnText}>저장</Text>
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
  backBtn: { padding: 4, marginRight: 10 },
  backArrow: { fontSize: 22, color: Colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  eventSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  eventTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  currentBadge: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  currentBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  groupSection: { marginBottom: 18 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  groupSub: { fontWeight: '400', color: Colors.textMuted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipPersonal: {
    backgroundColor: '#C5D1C5',
    borderColor: '#C5D1C5',
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  chipTextPersonal: { color: Colors.textPrimary },
  chipTextSelected: { color: Colors.primaryText, fontWeight: '600' },
  customCatBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    marginTop: 10,
  },
  customCatInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  customCatCount: { fontSize: 11, color: Colors.textMuted, marginLeft: 8 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: Colors.primaryText, fontSize: 12, fontWeight: '700' },
  cardRowTexts: { flex: 1 },
  cardRowTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  cardRowSub: { fontSize: 12, color: Colors.textMuted },
  scopeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  scopeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  scopeLabel: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  divider: { height: 1, backgroundColor: Colors.surfaceMuted },
  infoPill: {
    backgroundColor: '#E5E4DE',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  infoPillText: { fontSize: 11, color: Colors.textSecondary },
  footer: { paddingHorizontal: 20, paddingVertical: 16 },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: Colors.primaryText },
});