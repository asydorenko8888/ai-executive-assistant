import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import { useCalendarDebug } from '@/src/features/settings/hooks/useCalendarDebug';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

export function CalendarDebugPanel() {
  const {
    snapshot,
    localExecution,
    isLoading,
    isTestRunning,
    lastTestResult,
    loadError,
    refresh,
    runTestInsert,
  } = useCalendarDebug();

  const scopes = snapshot?.scopes?.length ? snapshot.scopes.join('\n') : '—';
  const tokenScopes = snapshot?.token?.scopes?.length ? snapshot.token.scopes.join('\n') : '—';

  return (
    <GlassCard style={styles.card}>
      <SectionTitle
        title="Calendar debug"
        subtitle="Google Calendar write pipeline"
        icon="calendar-outline"
        iconColor={colors.accentBlueSoft}
        iconBackgroundColor={colors.overlaySky}
      />

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accentBlueSoft} />
          <Text style={styles.helperText}>Loading debug snapshot…</Text>
        </View>
      ) : null}

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {!isLoading ? (
        <>
          <DebugRow label="Auth status" value={snapshot?.authStatus ?? 'unknown'} />
          <DebugRow label="Calendar connected" value={String(snapshot?.calendarConnected ?? snapshot?.connected ?? false)} />
          <DebugRow label="Write enabled" value={String(snapshot?.writeEnabled ?? false)} />
          <DebugRow label="Has calendar.events scope" value={String(snapshot?.hasCalendarEventsScope ?? false)} />
          <DebugRow label="Required scope" value={snapshot?.requiredScope ?? 'https://www.googleapis.com/auth/calendar.events'} />
          <DebugRow label="OAuth scopes" value={scopes} />
          <DebugRow label="Token scopes" value={tokenScopes} />
          <DebugRow
            label="Access token"
            value={snapshot?.token?.accessToken ? String(snapshot.token.accessToken) : '—'}
          />
          <DebugRow
            label="Refresh token"
            value={snapshot?.token?.refreshTokenPresent ? 'present' : 'missing'}
          />
          <DebugRow label="Connected email" value={snapshot?.connectedEmail ?? '—'} />
          <DebugRow label="Last tool status" value={localExecution?.lastToolStatus ?? '—'} />
          <DebugRow label="Last error code" value={localExecution?.lastErrorCode ?? '—'} />
          <DebugRow label="Last API error" value={localExecution?.lastApiError ?? '—'} />
          <DebugRow label="Last event id" value={localExecution?.lastEventId ?? '—'} />
          <DebugRow label="Last updated" value={localExecution?.updatedAt ?? '—'} />
          {lastTestResult ? <DebugRow label="Last test insert" value={lastTestResult} /> : null}
        </>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void refresh();
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonLabel}>Refresh</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isTestRunning}
          onPress={() => {
            void runTestInsert();
          }}
          style={({ pressed }) => [
            styles.button,
            styles.buttonPrimary,
            (pressed || isTestRunning) && styles.buttonPressed,
          ]}>
          {isTestRunning ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={styles.buttonLabel}>Run TEST EVENT insert</Text>
          )}
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  errorText: {
    color: '#f87171',
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  row: {
    gap: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.accentBlueDeep,
    borderColor: colors.borderStrong,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
});
