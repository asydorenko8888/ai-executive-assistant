import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/src/shared/ui/ScreenContainer';
import { colors, fontSizes, fontWeights, spacing } from '@/src/theme';

type LoadingScreenProps = {
  title?: string;
  description?: string;
};

export function LoadingScreen({
  title = 'Loading workspace',
  description = 'Preparing your executive dashboard.',
}: LoadingScreenProps) {
  return (
    <ScreenContainer centered contentContainerStyle={styles.content}>
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.accentBlueSoft} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: spacing.md,
  },
  loader: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  description: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
});
