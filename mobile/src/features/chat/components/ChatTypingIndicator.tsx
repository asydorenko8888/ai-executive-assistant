import { useEffect, useRef } from 'react';

import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type ChatTypingIndicatorProps = {
  label: string;
};

export function ChatTypingIndicator({ label }: ChatTypingIndicatorProps) {
  const dotAnimationsRef = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]);
  const dotAnimations = dotAnimationsRef.current;

  useEffect(() => {
    const loops = dotAnimations.map((animation, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(animation, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(animation, {
            toValue: 0.35,
            duration: 280,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [dotAnimations]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <View style={styles.dotsRow}>
          {dotAnimations.map((animation, index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: animation,
                  transform: [
                    {
                      scale: animation.interpolate({
                        inputRange: [0.35, 1],
                        outputRange: [0.92, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  bubble: {
    borderRadius: radii.xl,
    borderTopLeftRadius: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentBlueSoft,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
});
