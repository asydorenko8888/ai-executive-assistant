import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import { useLocalReminderEngine } from '@/src/features/local-reminders/useLocalReminderEngine';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

export function LocalReminderEngineHost() {
  const { languageCode } = useVoiceLanguage();
  const { activeNotifications, dismissNotification } = useLocalReminderEngine(languageCode);

  if (activeNotifications.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {activeNotifications.map((notification) => (
        <View key={notification.id} style={styles.banner}>
          <Text style={styles.title}>
            {notification.kind === 'alarm' ? 'Alarm' : 'Reminder'}
          </Text>
          <Text style={styles.message}>{notification.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss local reminder"
            onPress={() => dismissNotification(notification.id)}
            style={styles.dismissButton}
          >
            <Text style={styles.dismissLabel}>Dismiss</Text>
          </Pressable>
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
    top: spacing.xl * 3,
    zIndex: 999,
  },
  banner: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.accentPurpleSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
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
  dismissButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  dismissLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
});
