import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/ui/AppButton';
import { GlassCard } from '@/src/components/ui/GlassCard';
import { colors, fontSizes, fontWeights } from '@/src/theme';

type ErrorStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function ErrorState({
  title,
  description,
  actionLabel,
  onActionPress,
}: ErrorStateProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle-outline" size={22} color={colors.accentGold} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel ? <AppButton title={actionLabel} onPress={onActionPress} /> : null}
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
  },
});
