import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/src/components/ui/GlassCard';
import type { ChatThread } from '@/src/entities/chat/types';
import { colors, fontSizes, fontWeights, spacing } from '@/src/theme';

type ChatHeaderProps = {
  thread: ChatThread;
};

export function ChatHeader({ thread }: ChatHeaderProps) {
  return (
    <GlassCard style={styles.container}>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Ionicons name="sparkles" size={20} color={colors.accentBlueSoft} />
        </View>

        <View style={styles.textContent}>
          <Text style={styles.title}>{thread.title}</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.subtitle}>Online now for briefings, planning, and follow-ups</Text>
          </View>
        </View>
      </View>

      <View style={styles.metaPill}>
        <Text style={styles.metaLabel}>Updated {thread.updatedAt}</Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  textContent: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentBlueSoft,
  },
  subtitle: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  metaPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
  },
  metaLabel: {
    color: colors.textSubtle,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
});
