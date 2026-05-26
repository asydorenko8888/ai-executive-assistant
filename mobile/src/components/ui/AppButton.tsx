import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type AppButtonProps = PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  title,
  variant = 'primary',
  style,
  ...pressableProps
}: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      {...pressableProps}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' ? styles.secondary : styles.primary,
        pressed && styles.pressed,
        style,
      ]}>
      <Text style={[styles.label, variant === 'secondary' ? styles.secondaryLabel : styles.primaryLabel]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: colors.borderStrong,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  primaryLabel: {
    color: colors.background,
  },
  secondaryLabel: {
    color: colors.textPrimary,
  },
});
