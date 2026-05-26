import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';
import { createShadow } from '@/src/utils/shadow';

type VoiceAssistantButtonProps = {
  onPress?: () => void;
  label: string;
  hint: string;
};

export function VoiceAssistantButton({
  onPress,
  label,
  hint,
}: VoiceAssistantButtonProps) {
  return (
    <View style={styles.section}>
      <View style={styles.aura} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <View style={styles.core}>
          <Ionicons name="mic" size={44} color={colors.textPrimary} />
        </View>
      </Pressable>

      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  aura: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: colors.overlayBlueSoft,
    ...createShadow({
      color: colors.accentBlue,
      opacity: 0.35,
      radius: 28,
      elevation: 12,
    }),
  },
  button: {
    width: 182,
    height: 182,
    borderRadius: radii.orb,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...createShadow({
      color: colors.accentBlue,
      opacity: 0.26,
      radius: 30,
      offsetY: 18,
      elevation: 16,
    }),
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  core: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 12,
    borderColor: colors.accentBlueDeep,
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
});
