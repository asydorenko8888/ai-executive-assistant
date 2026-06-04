import { useState } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ChatMessageDebugMeta } from '@/src/features/chat/debug/conversationDebugTypes';
import { colors, fontSizes, fontWeights, spacing } from '@/src/theme';

type ChatMessageDebugDetailsProps = {
  debug: ChatMessageDebugMeta;
};

function DebugLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

export function ChatMessageDebugDetails({ debug }: ChatMessageDebugDetailsProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}>
        <Text style={styles.toggleLabel}>{expanded ? '▼' : '▶'} Debug Details</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.panel}>
          <DebugLine label="Timestamp" value={debug.timestampIso} />
          <DebugLine label="Role" value={debug.role} />
          <DebugLine label="Detected intent" value={debug.detectedIntent} />
          <DebugLine label="Calendar action" value={debug.calendarAction} />
          {debug.route ? <DebugLine label="Route" value={debug.route} /> : null}
          {debug.executionState ? (
            <DebugLine label="Execution state" value={debug.executionState} />
          ) : null}
          {debug.toolResponse ? <DebugLine label="Tool response" value={debug.toolResponse} /> : null}
          {debug.rawError ? <DebugLine label="Raw error" value={debug.rawError} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  togglePressed: {
    opacity: 0.85,
  },
  toggleLabel: {
    color: colors.accentSkyBadge,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  panel: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: {
    gap: 2,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  value: {
    color: colors.textPrimary,
    fontSize: fontSizes.xs,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
});
