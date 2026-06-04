import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type ChatEmergencyGoTopButtonProps = {
  onPress: () => void;
};

export function ChatEmergencyGoTopButton({ onPress }: ChatEmergencyGoTopButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go to top of conversation"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
      <Text style={styles.label}>Go Top</Text>
    </Pressable>
  );
}

export function emergencyScrollPageToTop() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    zIndex: 20,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  label: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
});
