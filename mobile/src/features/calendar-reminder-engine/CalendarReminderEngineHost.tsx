import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useVoiceLanguage } from '@/src/features/chat/hooks/useVoiceLanguage';
import {
  getCalendarReminderDevTestPayload,
  scheduleCalendarReminderDevTest,
} from '@/src/features/calendar-reminder-engine/calendarReminderDevTest';
import { useCalendarReminderEngine } from '@/src/features/calendar-reminder-engine/useCalendarReminderEngine';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

let devTestScheduledInSession = false;

export function CalendarReminderEngineHost() {
  const { languageCode } = useVoiceLanguage();
  const { activeNotifications, dismissNotification, announceReminder } = useCalendarReminderEngine({
    languageCode,
  });
  const announceReminderRef = useRef(announceReminder);

  useEffect(() => {
    announceReminderRef.current = announceReminder;
  }, [announceReminder]);

  useEffect(() => {
    if (!__DEV__ || devTestScheduledInSession) {
      return;
    }

    if (process.env.EXPO_PUBLIC_CALENDAR_REMINDER_DEV_TEST !== '1') {
      return;
    }

    devTestScheduledInSession = true;

    return scheduleCalendarReminderDevTest({
      languageCode,
      trigger: async () => {
        await announceReminderRef.current(getCalendarReminderDevTestPayload());
      },
    });
  }, [languageCode]);

  if (activeNotifications.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.host}>
      {activeNotifications.map((notification) => (
        <View key={notification.id} style={styles.banner}>
          <Text style={styles.title}>Calendar reminder</Text>
          <Text style={styles.message}>{notification.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss calendar reminder"
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
    top: spacing.md,
    zIndex: 1000,
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
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
  },
  message: {
    color: colors.textPrimary,
    fontSize: fontSizes.body,
    lineHeight: 22,
  },
  dismissButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  dismissLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.medium,
  },
});
