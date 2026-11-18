import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Modal,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest, AuthUrls } from '../../api/client';
import { showAlert, showConfirm } from '../../utils/dialog';

/**
 * C2 마이페이지 (API 명세 8절)
 * 시안에 하위 화면이 없어서, 누를 수 없는 줄을 두지 않으려고 각 항목은
 * 명세의 필드 하나만 고치는 작은 시트로 연다. 시트 자체는 시안이 없다.
 */

/** 백엔드 기준 6가지 ("수정 요청사항 2" 1-5: 직접 추가 없음) */
const ACTIVITIES = [
  { code: 'WALK', label: '걷기' },
  { code: 'STRETCH', label: '스트레칭' },
  { code: 'NAP', label: '낮잠' },
  { code: 'YOGA', label: '요가' },
  { code: 'MEDITATION', label: '명상' },
  { code: 'LIGHT_RUN', label: '가벼운 러닝' },
];

/** 동의 6종 (API 명세 2절 PUT /api/onboarding/profile) */
const CONSENTS = [
  { type: 'TERMS', label: '이용약관' },
  { type: 'PRIVACY', label: '개인정보 처리방침' },
  { type: 'AGE_14', label: '만 14세 이상' },
  { type: 'SENSITIVE_HRV', label: '건강정보' },
  { type: 'CALENDAR', label: '구글 캘린더' },
  { type: 'AI_NOTICE', label: 'AI 활용 안내' },
];

/** 동의 버전을 모를 때 쓰는 기본값. 백엔드가 올리면 같이 올린다. */
const CONSENT_VERSION = '2026-11-01';

export default function MyPageScreen({ onOpenSafety, onOpenGlossary, onLoggedOut }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [settings, setSettings] = useState(null);
  const [consents, setConsents] = useState([]);
  // 'nickname' | 'measureTime' | 'activities' | 'calendar' | 'consents'
  const [sheet, setSheet] = useState(null);
  // 회복 낮음이 2주 이어졌을 때만 "도움 받을 수 있는 곳"을 보여준다(명세 9절)
  const [showSafety, setShowSafety] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // 시트 입력값
  const [nickname, setNickname] = useState('');
  const [measureTime, setMeasureTime] = useState('');
  const [picked, setPicked] = useState([]);

  const load = useCallback(async () => {
    try {
      const [meRes, settingsRes, safetyRes] = await Promise.all([
        apiRequest('/api/me'),
        apiRequest('/api/me/settings'),
        // 안전 안내 조회가 실패해도 마이페이지는 열린다
        apiRequest('/api/safety').catch(() => null),
      ]);
      setMe(meRes);
      setSettings(settingsRes);
      // "도움 받을 수 있는 곳"은 회복 낮음이 2주 이어졌을 때만 보여준다(명세 9절).
      setShowSafety(
        Boolean(safetyRes?.alerts?.some((a) => a.triggerType === 'LOW_RECOVERY_2W'))
      );
    } catch (e) {
      setError(e?.message || '정보를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeSheet = () => {
    setSheet(null);
    setError(null);
  };

  const openSheet = async (name) => {
    setError(null);
    if (name === 'nickname') setNickname(me?.nickname || '');
    if (name === 'measureTime') setMeasureTime(settings?.measureTime || '');
    if (name === 'activities') setPicked(settings?.preferredActivities || []);
    if (name === 'consents') {
      try {
        const res = await apiRequest('/api/me/consents');
        setConsents(res?.consents || []);
      } catch {
        setConsents([]); // 못 불러와도 안내는 보여준다
      }
    }
    setSheet(name);
  };

  const run = async (fn) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      closeSheet();
      await load();
    } catch (e) {
      setError(e?.message || '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const confirm = (message, onYes) =>
    showConfirm('확인', message, onYes, { confirmText: '계속', destructive: true });

  const hrvConsent = consents.find((c) => c.type === 'SENSITIVE_HRV');
  const calendarConnected = Boolean(me?.calendar?.connected);

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>마이페이지</Text>

        <View style={styles.list}>
          <Row label="닉네임 수정" onPress={() => openSheet('nickname')} />
          <Row label="아침 측정 시간 수정" onPress={() => openSheet('measureTime')} />
          <Row label="선호 회복 활동 수정" onPress={() => openSheet('activities')} />
          <Row label="캘린더 연동 관리" onPress={() => openSheet('calendar')} />
          {/* 시안대로 화살표 없이 오른쪽에 보조 문구만 */}
          <Row label="동의 관리" right="AI 활용 안내 다시 보기" onPress={() => openSheet('consents')} />
          <Row label="용어 사전" onPress={onOpenGlossary} />
        </View>

        {showSafety ? (
          <TouchableOpacity style={[styles.row, styles.rowHelp]} onPress={onOpenSafety} accessibilityRole="button">
            <Text style={styles.rowHelpLabel}>도움 받을 수 있는 곳</Text>
            <Text style={styles.rowChevron}>ⓘ</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.account}>
          <Text style={styles.accountLabel}>계정 관리</Text>
          <View style={styles.accountPair}>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() =>
                run(async () => {
                  try {
                    await apiRequest('/api/auth/logout', { method: 'POST' });
                  } catch {
                    /* 이미 로그아웃이어도 넘어간다 */
                  }
                  onLoggedOut?.();
                })
              }
            >
              <Text style={styles.ghostButtonText}>로그아웃</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() =>
                confirm('탈퇴하면 측정 기록과 설정이 모두 지워져요. 계속할까요?', () =>
                  run(async () => {
                    await apiRequest('/api/me', { method: 'DELETE' });
                    onLoggedOut?.();
                  })
                )
              }
            >
              <Text style={styles.ghostButtonText}>회원 탈퇴</Text>
            </TouchableOpacity>
          </View>
        </View>

        {error && !sheet ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <Sheet visible={sheet === 'nickname'} title="닉네임 수정" onClose={closeSheet}>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          maxLength={20}
          placeholder="1~20자"
          placeholderTextColor={Colors.textMuted}
        />
        <SheetActions
          saving={saving}
          error={error}
          onClose={closeSheet}
          onSave={() => run(() => apiRequest('/api/me', { method: 'PATCH', body: { nickname: nickname.trim() } }))}
        />
      </Sheet>

      <Sheet visible={sheet === 'measureTime'} title="아침 측정 시간" onClose={closeSheet}>
        <Text style={styles.sheetText}>일어난 직후에 재면 가장 정확해요.</Text>
        {/* RN 에는 time 입력이 없어 HH:mm 글자로 받는다 */}
        <TextInput
          style={styles.input}
          value={measureTime}
          onChangeText={setMeasureTime}
          placeholder="07:30"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <SheetActions
          saving={saving}
          error={error}
          onClose={closeSheet}
          onSave={() =>
            run(() => {
              if (!/^\d{2}:\d{2}$/.test(measureTime)) throw new Error('07:30 처럼 입력해 주세요.');
              return apiRequest('/api/me/settings', {
                method: 'PUT',
                body: { ...settings, measureTime },
              });
            })
          }
        />
      </Sheet>

      <Sheet visible={sheet === 'activities'} title="선호 회복 활동" onClose={closeSheet}>
        <Text style={styles.sheetText}>하나 이상 골라주세요.</Text>
        {ACTIVITIES.map((a) => {
          const on = picked.includes(a.code);
          return (
            <TouchableOpacity
              key={a.code}
              style={[styles.check, on && styles.checkOn]}
              onPress={() => setPicked(on ? picked.filter((c) => c !== a.code) : [...picked, a.code])}
            >
              <Text style={[styles.checkText, on && styles.checkTextOn]}>
                {on ? '✓ ' : ''}
                {a.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <SheetActions
          saving={saving}
          error={error}
          onClose={closeSheet}
          onSave={() =>
            run(() => {
              if (!picked.length) throw new Error('하나 이상 골라주세요.');
              return apiRequest('/api/me/settings', {
                method: 'PUT',
                body: { ...settings, preferredActivities: picked },
              });
            })
          }
        />
      </Sheet>

      <Sheet visible={sheet === 'calendar'} title="캘린더 연동 관리" onClose={closeSheet}>
        <Text style={styles.sheetText}>
          {calendarConnected ? '구글 캘린더가 연결돼 있어요.' : '구글 캘린더가 연결돼 있지 않아요.'}
        </Text>
        <TouchableOpacity
          style={styles.ghostButton}
          onPress={() => {
            if (!calendarConnected) {
              if (Platform.OS === 'web') window.location.href = AuthUrls.googleCalendar;
              else Linking.openURL(AuthUrls.googleCalendar).catch(() => {});
              return;
            }
            run(() => apiRequest('/api/calendar/connection', { method: 'DELETE' }));
          }}
        >
          <Text style={styles.ghostButtonText}>{calendarConnected ? '연결 해제' : '다시 연결'}</Text>
        </TouchableOpacity>
        <SheetActions saving={saving} error={error} onClose={closeSheet} />
      </Sheet>

      <Sheet visible={sheet === 'consents'} title="동의 관리" onClose={closeSheet}>
        <Text style={styles.sheetText}>
          Come &amp; Down은 해석 문구·추천 문구·일정 분류에 AI를 씁니다. 수치와 일정 제목만 보내고
          닉네임·이메일·측정 원신호는 보내지 않아요.
        </Text>
        <View style={styles.consentBox}>
          {CONSENTS.map((c) => {
            const agreed = consents.find((x) => x.type === c.type)?.agreed;
            return (
              <View key={c.type} style={styles.consentRow}>
                <Text style={styles.consentLabel}>{c.label}</Text>
                <Text style={[styles.consentState, agreed && styles.consentStateOn]}>
                  {agreed ? '동의함' : '철회됨'}
                </Text>
              </View>
            );
          })}
        </View>

        {hrvConsent?.agreed ? (
          <>
            <Text style={styles.sheetText}>
              건강정보 동의를 철회하면 측정이 꺼져요. 기록은 남겨둘 수도, 함께 지울 수도 있어요.
            </Text>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() =>
                confirm('건강정보 동의를 철회할까요? 측정이 꺼져요.', () =>
                  run(() => apiRequest('/api/me/consents/SENSITIVE_HRV', { method: 'DELETE' }))
                )
              }
            >
              <Text style={styles.ghostButtonText}>동의만 철회</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={() =>
                confirm('동의를 철회하고 측정 기록도 모두 지울까요?', () =>
                  run(() => apiRequest('/api/me/consents/SENSITIVE_HRV?deleteData=true', { method: 'DELETE' }))
                )
              }
            >
              <Text style={styles.ghostButtonText}>철회하고 기록도 삭제</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              run(() =>
                apiRequest('/api/me/consents', {
                  method: 'POST',
                  body: { type: 'SENSITIVE_HRV', version: hrvConsent?.version || CONSENT_VERSION },
                })
              )
            }
          >
            <Text style={styles.primaryButtonText}>건강정보 다시 동의하기</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.ghostButton}
          onPress={() =>
            confirm('측정·컨디션·번아웃 체크 기록을 모두 지울까요? 되돌릴 수 없어요.', () =>
              run(() => apiRequest('/api/hrv/data', { method: 'DELETE' }))
            )
          }
        >
          <Text style={styles.ghostButtonText}>건강 기록 전체 삭제</Text>
        </TouchableOpacity>

        <SheetActions saving={saving} error={error} onClose={closeSheet} />
      </Sheet>
    </SafeAreaView>
  );
}

function Row({ label, right, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={styles.rowLabel}>{label}</Text>
      {right ? <Text style={styles.rowRight}>{right}</Text> : <Text style={styles.rowChevron}>›</Text>}
    </TouchableOpacity>
  );
}

function Sheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SheetActions({ saving, error, onClose, onSave }) {
  return (
    <View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.sheetActions}>
        <TouchableOpacity style={styles.ghostButton} onPress={onClose} disabled={saving}>
          <Text style={styles.ghostButtonText}>닫기</Text>
        </TouchableOpacity>
        {onSave ? (
          <TouchableOpacity style={styles.primaryButton} onPress={onSave} disabled={saving}>
            <Text style={styles.primaryButtonText}>{saving ? '저장 중…' : '저장'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  title: { fontFamily: Fonts.display, fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 16 },

  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLabel: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '500', color: Colors.textPrimary },
  rowRight: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary },
  rowChevron: { fontSize: 18, color: Colors.textMuted },
  rowHelp: {
    marginTop: 16,
    backgroundColor: Colors.chipNeutralBg,
    borderStyle: 'dashed',
  },
  rowHelpLabel: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },

  account: { marginTop: 24, gap: 8 },
  accountLabel: { fontFamily: Fonts.body, fontSize: 12, fontWeight: '500', color: Colors.textMuted },
  accountPair: { flexDirection: 'row', gap: 10 },

  ghostButton: {
    flex: 1,
    minHeight: 48,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '600', color: Colors.primary },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '600', color: Colors.primaryText },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(30, 61, 47, 0.35)' },
  sheet: {
    maxHeight: '80%',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: Colors.surface,
  },
  sheetTitle: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  sheetText: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 21, color: Colors.textSecondary, marginBottom: 12 },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 8 },

  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  check: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  checkOn: { borderColor: Colors.borderSelected, backgroundColor: Colors.surfaceAccent },
  checkText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textPrimary },
  checkTextOn: { fontWeight: '700' },

  consentBox: { padding: 14, borderRadius: 12, backgroundColor: Colors.background, marginBottom: 16, gap: 6 },
  consentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  consentLabel: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textPrimary },
  consentState: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  consentStateOn: { color: Colors.accentBar },

  error: { fontFamily: Fonts.body, fontSize: 12.5, color: Colors.warningText, marginTop: 8 },
});
