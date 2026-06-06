import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { useLocalAlarmEngine } from '@/src/features/local-alarms/useLocalAlarmEngine';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

export function LocalAlarmEngineHost() {
  const { languageCode } = useVoiceLanguage();
  const { activeSessions, stopAlarmSession, snoozeAlarmSession } = useLocalAlarmEngine(languageCode);

  if (activeSessions.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {activeSessions.map((session) => (
        <View key={session.alarmId} style={styles.banner}>
          <Text style={styles.title}>ALARM</Text>
          <Text style={styles.message}>{session.message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop Alarm"
              onPress={() => stopAlarmSession(session.alarmId)}
              style={[styles.actionButton, styles.stopButton]}
            >
              <Text style={styles.stopLabel}>Stop Alarm</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Snooze 5 min"
              onPress={() => snoozeAlarmSession(session.alarmId, 5)}
              style={styles.actionButton}
            >
              <Text style={styles.actionLabel}>Snooze 5 min</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Snooze 10 min"
              onPress={() => snoozeAlarmSession(session.alarmId, 10)}
              style={styles.actionButton}
            >
              <Text style={styles.actionLabel}>Snooze 10 min</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    gap: spacing.sm,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: spacing.xl * 4,
    zIndex: 998,
  },
  banner: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.accentPurpleSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.accentPurpleSoft,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
  },
  message: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actionButton: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stopButton: {
    borderColor: colors.accentPurpleSoft,
  },
  stopLabel: {
    color: colors.accentPurpleSoft,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  actionLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
});
