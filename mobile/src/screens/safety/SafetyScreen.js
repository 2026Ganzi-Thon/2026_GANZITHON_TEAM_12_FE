import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest } from '../../api/client';

/**
 * C3 도움 받을 수 있는 곳 (API 명세 9절)
 * 번호를 화면에 박지 않고 서버 resources를 그린다. 전화번호가 있는 항목만 전화 연결.
 * 안내 문구는 열린 안내 중 1개만 보여준다("수정 요청사항 2" 2장).
 */

/**
 * 시안의 "학교 상담센터 찾아보기" 카드.
 * 명세 9절: 학교마다 연락처가 달라 서버 resources에 넣지 않았고 연결할 주소를 정해야 한다.
 * 주소가 정해지면 여기에 넣으면 카드가 나온다. 그 전까지는 누를 수 없는 줄을 두지 않는다.
 */
const SCHOOL_COUNSELING_URL = null;

export default function SafetyScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiRequest('/api/safety');
        if (alive) setData(res);
      } catch (e) {
        if (alive) setError(e?.message || '안내를 불러오지 못했어요.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const alert = data?.alerts?.[0] || null;

  const close = async () => {
    // 닫기는 실패해도 화면을 막지 않는다. 조건이 그대로면 다음에 다시 뜬다.
    if (alert?.id != null) {
      try {
        await apiRequest(`/api/safety/alerts/${alert.id}/acknowledge`, { method: 'POST' });
      } catch {
        /* 무시 */
      }
    }
    onBack?.();
  };

  const openResource = (resource) => {
    const url = resource.phone
      ? `tel:${String(resource.phone).replace(/-/g, '')}`
      : resource.url;
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.brand}>Come &amp; Down</Text>
        <Text style={styles.headerAside}>안전 안내</Text>
      </View>

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
          <Text style={styles.title}>혼자 버티지 않아도 괜찮아요</Text>

          {alert?.message ? (
            <View style={styles.reason}>
              <View style={styles.reasonDot} />
              <Text style={styles.reasonText}>{alert.message}</Text>
            </View>
          ) : null}

          <View style={styles.list}>
            {(data?.resources || []).map((resource) => (
              <TouchableOpacity
                key={resource.id}
                style={styles.row}
                onPress={() => openResource(resource)}
                accessibilityRole="button"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="call-outline" size={18} color={Colors.primary} />
                </View>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowTitle}>{resource.name}</Text>
                  {resource.phone ? (
                    <Text style={styles.rowSub}>{resource.phone} · 전화 연결</Text>
                  ) : resource.url ? (
                    <Text style={styles.rowSub}>누리집 열기</Text>
                  ) : null}
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </TouchableOpacity>
            ))}

            {SCHOOL_COUNSELING_URL ? (
              <TouchableOpacity
                style={styles.row}
                onPress={() => Linking.openURL(SCHOOL_COUNSELING_URL).catch(() => {})}
              >
                <View style={[styles.rowIcon, styles.rowIconWarm]}>
                  <Ionicons name="school-outline" size={18} color={Colors.warningText} />
                </View>
                <View style={styles.rowTexts}>
                  <Text style={styles.rowTitle}>학교 상담센터 찾아보기</Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {data?.disclaimer ? <Text style={styles.disclaimer}>{data.disclaimer}</Text> : null}

          <TouchableOpacity style={styles.closeButton} onPress={close} accessibilityRole="button">
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brand: { fontFamily: Fonts.display, fontSize: 15, fontWeight: '700', color: Colors.primary },
  headerAside: { fontFamily: Fonts.body, fontSize: 12, color: Colors.textSecondary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorText: { fontFamily: Fonts.body, fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  body: { paddingHorizontal: 20, paddingBottom: 32 },
  title: {
    fontFamily: Fonts.display,
    fontSize: 21,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },

  reason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 21,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAccent,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  reasonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accentBar, marginTop: 7 },
  reasonText: { flex: 1, fontFamily: Fonts.body, fontSize: 15, fontWeight: '600', lineHeight: 23, color: Colors.textPrimary },

  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 17,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAccent,
  },
  rowIconWarm: { backgroundColor: Colors.warningBg },
  rowTexts: { flex: 1 },
  rowTitle: { fontFamily: Fonts.body, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  rowSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  rowChevron: { fontSize: 18, color: Colors.textMuted },

  disclaimer: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 20,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },

  closeButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  closeButtonText: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '600', color: Colors.primaryText },
});
