import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type ChatCalendarAuthBannerProps = {
  phase: CalendarOperationalUxPhase;
  statusLabel: string | null;
  onConnectPress: () => void;
  isConnecting: boolean;
};

function resolveBannerTitle(phase: CalendarOperationalUxPhase) {
  if (phase === 'connecting') {
    return 'Connecting Google Calendar';
  }

  if (phase === 'authorized' || phase === 'retrying') {
    return 'Retrying your calendar action';
  }

  if (phase === 'creating_event') {
    return 'Creating calendar event';
  }

  if (phase === 'event_created') {
    return 'Event created';
  }

  return 'Google Calendar authorization';
}

export function ChatCalendarAuthBanner({
  phase,
  statusLabel,
  onConnectPress,
  isConnecting,
}: ChatCalendarAuthBannerProps) {
  if (phase === 'idle' || phase === 'failed') {
    return null;
  }

  const showButton = phase === 'auth_required' && !isConnecting;

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.title}>{resolveBannerTitle(phase)}</Text>
        {statusLabel ? <Text style={styles.subtitle}>{statusLabel}</Text> : null}
      </View>

      {isConnecting ? (
        <ActivityIndicator color={colors.accentBlueSoft} />
      ) : null}

      {showButton ? (
        <Pressable
          accessibilityRole="button"
          onPress={onConnectPress}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonLabel}>Connect Google Calendar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.overlaySky,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.accentBlue,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
});
