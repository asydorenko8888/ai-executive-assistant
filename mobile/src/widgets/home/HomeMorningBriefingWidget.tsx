import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import type { CalendarConnection } from '@/src/entities/calendar/types';
import type { MorningBriefing } from '@/src/features/agent/types';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type HomeMorningBriefingWidgetProps = {
  summary: string | null;
  briefing: MorningBriefing | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  calendarConnection: CalendarConnection | null;
  isCalendarConnectReady: boolean;
  isPreparingCalendarConnection: boolean;
  onConnectCalendar: () => Promise<unknown> | void;
  onDisconnectCalendar: () => Promise<unknown> | void;
};

type CalendarConnectButtonProps = {
  isConnected: boolean;
  label: string;
  disabled?: boolean;
  onPress: () => Promise<unknown> | void;
};

type BriefingRefreshButtonProps = {
  isRefreshing: boolean;
  onPress: () => void;
};

function CalendarConnectButton({
  isConnected,
  label,
  disabled = false,
  onPress,
}: CalendarConnectButtonProps) {
  const handlePress = async (event: GestureResponderEvent) => {
    event.stopPropagation?.();

    if (disabled) {
      return;
    }

    await onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.connectionButtonStandalone,
        isConnected && styles.connectionButtonStandaloneConnected,
        disabled && styles.connectionButtonStandaloneDisabled,
        pressed && styles.connectionButtonPressed,
      ]}>
      <Text style={styles.connectionButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function BriefingRefreshButton({ isRefreshing, onPress }: BriefingRefreshButtonProps) {
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation?.();
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh morning briefing"
      onPress={handlePress}
      style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}>
      {isRefreshing ? (
        <ActivityIndicator size="small" color={colors.textPrimary} />
      ) : (
        <Text style={styles.refreshLabel}>Refresh Briefing</Text>
      )}
    </Pressable>
  );
}

export function HomeMorningBriefingWidget({
  summary,
  briefing,
  isLoading,
  isRefreshing,
  onRefresh,
  calendarConnection,
  isCalendarConnectReady,
  isPreparingCalendarConnection,
  onConnectCalendar,
  onDisconnectCalendar,
}: HomeMorningBriefingWidgetProps) {
  const isCalendarConnected = calendarConnection?.status === 'connected';
  const calendarButtonLabel = isCalendarConnected
    ? 'Disconnect Google Calendar'
    : isPreparingCalendarConnection
      ? 'Preparing Google Calendar...'
      : 'Connect Google Calendar';
  const calendarLabel =
    calendarConnection?.status === 'connected'
      ? calendarConnection.connectedEmail || 'Google Calendar connected'
      : calendarConnection?.status === 'missing_config'
        ? 'Google Calendar setup required'
        : 'Google Calendar not connected';

  return (
    <View style={styles.stack}>
      <CalendarConnectButton
        isConnected={isCalendarConnected}
        disabled={!isCalendarConnected && !isCalendarConnectReady}
        label={calendarButtonLabel}
        onPress={isCalendarConnected ? onDisconnectCalendar : onConnectCalendar}
      />

      <GlassCard style={styles.container}>
        <SectionTitle
          title="Morning Briefing"
          subtitle="Local companion preview"
          icon="sparkles-outline"
          iconColor={colors.accentBlueSoft}
          iconBackgroundColor={colors.overlaySky}
        />

        <View style={styles.connectionPanel}>
          <View style={styles.connectionRow}>
            <View style={styles.connectionCopy}>
              <Text style={styles.connectionTitle}>Calendar awareness</Text>
              <Text style={styles.connectionLabel}>{calendarLabel}</Text>
            </View>
          </View>

          <BriefingRefreshButton isRefreshing={isRefreshing} onPress={onRefresh} />
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={colors.accentBlueSoft} />
            <Text style={styles.loadingLabel}>Preparing the first read on your day.</Text>
          </View>
        ) : null}

        {!isLoading && summary ? <Text style={styles.summary}>{summary}</Text> : null}

        {!isLoading && briefing ? (
          <View style={styles.sectionList}>
            {briefing.sections.slice(0, 4).map((section) => (
              <View key={section.kind} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <View
                    style={[
                      styles.priorityPill,
                      section.priority === 'attention' && styles.priorityPillAttention,
                      section.priority === 'critical' && styles.priorityPillCritical,
                    ]}>
                    <Text style={styles.priorityLabel}>{section.priority}</Text>
                  </View>
                </View>

                <Text style={styles.sectionSummary}>{section.summary}</Text>
                {section.items.length > 0 ? (
                  <View style={styles.itemList}>
                    {section.items.slice(0, 2).map((item) => (
                      <Text key={item} style={styles.itemText}>
                        {item}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  container: {
    gap: spacing.lg,
  },
  connectionPanel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  connectionCopy: {
    flex: 1,
    gap: 4,
  },
  connectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  connectionLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  connectionButtonStandalone: {
    minHeight: 42,
    width: '100%',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentBlueDeep,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  connectionButtonStandaloneDisabled: {
    opacity: 0.6,
  },
  connectionButtonStandaloneConnected: {
    borderColor: colors.border,
    backgroundColor: colors.overlaySurface,
  },
  connectionButtonPressed: {
    opacity: 0.9,
  },
  connectionButtonLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  refreshButton: {
    minHeight: 40,
    width: '100%',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.overlaySurface,
  },
  refreshButtonPressed: {
    opacity: 0.9,
  },
  refreshLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  summary: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: 28,
  },
  sectionList: {
    gap: spacing.md,
  },
  sectionCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  priorityPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.overlayBlueSoft,
  },
  priorityPillAttention: {
    backgroundColor: colors.overlayGold,
  },
  priorityPillCritical: {
    backgroundColor: colors.overlayPurpleSoft,
  },
  priorityLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
  },
  sectionSummary: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    lineHeight: 22,
  },
  itemList: {
    gap: spacing.xs,
  },
  itemText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
});
