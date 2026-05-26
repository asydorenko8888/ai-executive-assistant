import type { PropsWithChildren } from 'react';

import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, spacing } from '@/src/theme';

type ScreenContainerProps = PropsWithChildren<{
  scrollable?: boolean;
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
}>;

export function ScreenContainer({
  children,
  scrollable = false,
  centered = false,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
}: ScreenContainerProps) {
  if (scrollable) {
    return (
      <SafeAreaView style={[styles.safeArea, style]}>
        <ScrollView
          contentContainerStyle={[styles.content, centered && styles.centered, contentContainerStyle]}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, style]}>
      <View style={[styles.content, centered && styles.centered, contentContainerStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.screenTop,
    paddingBottom: spacing.screenBottom,
  },
  centered: {
    justifyContent: 'center',
  },
});
