import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import { SectionTitle } from '@/src/components/ui/SectionTitle';
import {
  buildConversationExportRecords,
  exportConversationDocument,
} from '@/src/features/chat/debug/conversationExport';
import { useConversationDebugMode } from '@/src/features/chat/hooks/useConversationDebugMode';
import { useExecutiveConversationStore } from '@/src/features/chat/store/executiveConversationStore';
import { useConversationMessageDebugStore } from '@/src/features/chat/store/conversationMessageDebugStore';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

export function ConversationDebugSettingsPanel() {
  const { enabled, setEnabled } = useConversationDebugMode();
  const messages = useExecutiveConversationStore((state) => state.messages);
  const debugByMessageId = useConversationMessageDebugStore((state) => state.byMessageId);

  const runExport = useCallback(
    async (format: 'json' | 'txt') => {
      try {
        const records = buildConversationExportRecords(messages, debugByMessageId);
        await exportConversationDocument({ format, records });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Export failed';
        Alert.alert('Export failed', message);
      }
    },
    [debugByMessageId, messages],
  );

  return (
    <GlassCard style={styles.card}>
      <SectionTitle
        title="Conversation debug"
        subtitle="Inspect chat without auto-scroll"
        icon="bug-outline"
        iconColor={colors.accentPurple}
        iconBackgroundColor={colors.overlayPurpleSoft}
      />

      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <Text style={styles.toggleTitle}>Debug conversation mode</Text>
          <Text style={styles.helperText}>
            Disables automatic scrolling so you can read earlier messages, tool output, and errors.
            Shortcuts (web): Ctrl+Shift+D toggle, Ctrl+End latest, Ctrl+Home first.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(value) => {
            void setEnabled(value);
          }}
          trackColor={{ false: colors.border, true: colors.accentBlueSoft }}
          thumbColor={colors.textPrimary}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void runExport('json');
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonLabel}>Export conversation (JSON)</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void runExport('txt');
          }}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonLabel}>Export conversation (TXT)</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  toggleTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  helperText: {
    color: colors.textMuted,
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
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
});
