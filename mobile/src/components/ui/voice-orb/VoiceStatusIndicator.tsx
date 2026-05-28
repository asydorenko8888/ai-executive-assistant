import { StyleSheet, Text, View } from 'react-native';

import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { VoiceAssistantStatusType } from '@/src/components/ui/voice-orb/types';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type VoiceStatusIndicatorProps = {
  status: VoiceAssistantStatusType;
  label: string;
  showInterruptHint?: boolean;
};

function getStatusColor(status: VoiceAssistantStatusType) {
  switch (status) {
    case 'listening':
      return colors.accentBlueSoft;
    case 'processing':
    case 'heard':
      return colors.textMuted;
    case 'speaking':
      return colors.accentPurpleSoft;
    case 'error':
      return colors.textSecondary;
    default:
      return colors.textSubtle;
  }
}

export function VoiceStatusIndicator({ status, label, showInterruptHint }: VoiceStatusIndicatorProps) {
  const dotColor = getStatusColor(status);

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={styles.container}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text
          style={[
            styles.label,
            status === 'listening' && styles.labelActive,
            status === 'speaking' && styles.labelSpeaking,
            status === 'processing' && styles.labelThinking,
          ]}>
          {label}
        </Text>
      </View>
      {showInterruptHint ? <Text style={styles.hint}>Tap to interrupt</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.overlaySurface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  labelActive: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  labelThinking: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  labelSpeaking: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  hint: {
    color: colors.textSubtle,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
});
