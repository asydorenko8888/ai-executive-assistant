import type { ComponentProps } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/ui/AppButton';
import { GlassCard } from '@/src/components/ui/GlassCard';
import { colors, fontSizes, fontWeights, spacing } from '@/src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: IconName;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function EmptyState({
  title,
  description,
  icon = 'sparkles-outline',
  actionLabel,
  onActionPress,
}: EmptyStateProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={22} color={colors.accentBlueSoft} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel ? <AppButton title={actionLabel} variant="secondary" onPress={onActionPress} /> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
});
