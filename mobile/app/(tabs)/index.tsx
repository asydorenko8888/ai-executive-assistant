import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const agenda = [
  { time: '09:00', title: 'Board prep', detail: 'Review Q3 talking points' },
  { time: '11:30', title: 'Investor sync', detail: 'Finalize briefing notes' },
  { time: '15:00', title: 'Leadership 1:1s', detail: '3 conversations scheduled' },
];

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroPanel}>
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />

          <Text style={styles.kicker}>AI Executive Assistant</Text>
          <Text style={styles.greeting}>Good morning, Andriy</Text>
          <Text style={styles.subtitle}>
            Your day is aligned, your priorities are surfaced, and your next move is one tap away.
          </Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="sparkles-outline" size={16} color="#7DD3FC" />
              <Text style={styles.badgeText}>Priority brief ready</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="time-outline" size={16} color="#C4B5FD" />
              <Text style={styles.badgeText}>3 events today</Text>
            </View>
          </View>
        </View>

        <View style={styles.assistantSection}>
          <View style={styles.orbAura} />
          <Pressable style={({ pressed }) => [styles.orbButton, pressed && styles.orbButtonPressed]}>
            <View style={styles.orbCore}>
              <Ionicons name="mic" size={44} color="#F8FAFC" />
            </View>
          </Pressable>

          <Text style={styles.assistantLabel}>Voice Assistant</Text>
          <Text style={styles.assistantHint}>Tap to brief, schedule, draft, or follow up.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, styles.weatherIconWrap]}>
              <Ionicons name="partly-sunny-outline" size={20} color="#FBBF24" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Weather</Text>
              <Text style={styles.cardSubtitle}>Kyiv, Ukraine</Text>
            </View>
            <Text style={styles.temperature}>21°</Text>
          </View>

          <View style={styles.weatherRow}>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Condition</Text>
              <Text style={styles.metricValue}>Partly cloudy</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Feels like</Text>
              <Text style={styles.metricValue}>24°</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Rain</Text>
              <Text style={styles.metricValue}>12%</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, styles.calendarIconWrap]}>
              <Ionicons name="calendar-outline" size={20} color="#A78BFA" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>Calendar Summary</Text>
              <Text style={styles.cardSubtitle}>Next 3 priorities</Text>
            </View>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>Focused day</Text>
            </View>
          </View>

          <View style={styles.agendaList}>
            {agenda.map((item) => (
              <View key={item.time} style={styles.agendaItem}>
                <Text style={styles.agendaTime}>{item.time}</Text>
                <View style={styles.agendaContent}>
                  <Text style={styles.agendaTitle}>{item.title}</Text>
                  <Text style={styles.agendaDetail}>{item.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#475569" />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
    gap: 20,
  },
  heroPanel: {
    overflow: 'hidden',
    borderRadius: 28,
    padding: 24,
    gap: 14,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
  },
  heroGlowPrimary: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: -70,
    left: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  kicker: {
    color: '#7DD3FC',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  greeting: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 24,
    maxWidth: '92%',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.12)',
  },
  badgeText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  assistantSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  orbAura: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(59, 130, 246, 0.10)',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
  },
  orbButton: {
    width: 182,
    height: 182,
    borderRadius: 91,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.35)',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.26,
    shadowRadius: 30,
    elevation: 16,
  },
  orbButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  orbCore: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderWidth: 12,
    borderColor: '#1D4ED8',
  },
  assistantLabel: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
  },
  assistantHint: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    borderRadius: 24,
    padding: 18,
    gap: 18,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.14)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherIconWrap: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
  },
  calendarIconWrap: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  temperature: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
  },
  weatherRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    gap: 6,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#111827',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  summaryBadgeText: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '700',
  },
  agendaList: {
    gap: 12,
  },
  agendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  agendaTime: {
    width: 52,
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  agendaContent: {
    flex: 1,
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#111827',
  },
  agendaTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  agendaDetail: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
});
