import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Colors, Fonts } from '../theme/tokens';
import { findTerm } from '../data/glossary';

/**
 * C4 용어 팝업. 화면 곳곳의 ⓘ 를 눌렀을 때 그 용어만 보여준다.
 * 본문은 용어 사전과 같은 데이터(src/data/glossary.js)를 쓰므로 문구가 갈라지지 않는다.
 *
 * props
 *  - termKey   glossary.js 의 key. null 이면 닫힌 상태
 *  - chip      { label, value } 팝업 위에 띄우는 현재 값 (선택)
 *  - onClose   닫기
 *  - onOpenGlossary  "마이페이지 용어 사전 보기" (선택, 없으면 버튼을 숨긴다)
 */
export default function TermPopup({ termKey, chip, onClose, onOpenGlossary }) {
  const term = termKey ? findTerm(termKey) : null;

  return (
    <Modal visible={Boolean(term)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.wrap} onPress={() => {}}>
          {chip?.label ? (
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>{chip.label}</Text>
              {chip.value ? <Text style={styles.chipValue}>{chip.value}</Text> : null}
            </View>
          ) : null}

          {term ? (
            <View style={styles.card}>
              <Text style={styles.title}>
                {term.easy} = {term.formal}
              </Text>
              <Text style={styles.desc}>{term.desc}</Text>

              {onOpenGlossary ? (
                <TouchableOpacity
                  style={styles.more}
                  onPress={() => {
                    onClose?.();
                    onOpenGlossary();
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.moreText}>📖  마이페이지 용어 사전 보기</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 화면 곳곳에 넣는 ⓘ 버튼 */
export function InfoButton({ onPress, label }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label} 설명 보기` : '설명 보기'}
    >
      <Text style={styles.info}>ⓘ</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(35, 52, 40, 0.6)',
  },
  wrap: { width: '100%', maxWidth: 350, gap: 12 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 17,
    borderRadius: 999,
    backgroundColor: Colors.chipHighBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipLabel: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  chipValue: { fontFamily: Fonts.body, fontSize: 13, fontWeight: '700', color: Colors.warningText },

  card: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: { fontFamily: Fonts.display, fontSize: 19, fontWeight: '700', lineHeight: 26, color: Colors.textPrimary },
  desc: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 24, color: Colors.textSecondary, marginTop: 12 },
  more: {
    minHeight: 48,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '600', color: Colors.primary },

  info: { fontSize: 13, color: Colors.textMuted },
});
