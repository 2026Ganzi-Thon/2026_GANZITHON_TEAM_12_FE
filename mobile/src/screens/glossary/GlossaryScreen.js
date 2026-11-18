import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { Colors, Fonts } from '../../theme/tokens';
import { GLOSSARY } from '../../data/glossary';

/** 용어 사전 — API 없는 정적 화면 (API 명세 8절 "용어 사전은 프론트 정적 데이터") */
export default function GlossaryScreen({ onBack }) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로">
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>용어 사전</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>화면에 나오는 쉬운 용어와 원래 용어를 함께 정리했어요.</Text>

        {GLOSSARY.map((group) => (
          <View key={group.section}>
            <Text style={styles.section}>{group.section}</Text>
            <View style={styles.list}>
              {group.items.map((term) => (
                <View key={term.key} style={styles.item}>
                  <Text style={styles.easy}>{term.easy}</Text>
                  <Text style={styles.formal}>{term.formal}</Text>
                  <Text style={styles.desc}>{term.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 56 },
  back: { fontSize: 26, color: Colors.textPrimary, width: 24 },
  headerTitle: { fontFamily: Fonts.display, fontSize: 22, fontWeight: '700', color: Colors.textPrimary },

  body: { paddingHorizontal: 20, paddingBottom: 32 },
  lead: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 21, color: Colors.textSecondary, marginBottom: 20 },

  section: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  list: { gap: 10 },
  item: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  easy: { fontFamily: Fonts.body, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  formal: { fontFamily: Fonts.body, fontSize: 12.5, color: Colors.accentBar, marginTop: 2, marginBottom: 8 },
  desc: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 22, color: Colors.textSecondary },
});
