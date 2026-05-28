import { useEffect, useRef } from 'react';

import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '@/src/theme';

type ChatVoiceStatusProps = {
  label: string;
  tone?: 'neutral' | 'error';
  isAnimating?: boolean;
};

export function ChatVoiceStatus({
  label,
  tone = 'neutral',
  isAnimating = false,
}: ChatVoiceStatusProps) {
  const dotAnimationsRef = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]);
  const dotAnimations = dotAnimationsRef.current;

  useEffect(() => {
    if (!isAnimating) {
      dotAnimations.forEach((animation) => {
        animation.stopAnimation();
        animation.setValue(0.35);
      });

      return;
    }

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
  }, [dotAnimations, isAnimating]);

  return (
    <View style={[styles.container, tone === 'error' ? styles.errorContainer : styles.neutralContainer]}>
      <View style={styles.dotsRow}>
        {dotAnimations.map((animation, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              tone === 'error' ? styles.errorDot : styles.neutralDot,
              {
                opacity: isAnimating ? animation : 1,
                transform: isAnimating
                  ? [
                      {
                        scale: animation.interpolate({
                          inputRange: [0.35, 1],
                          outputRange: [0.92, 1.08],
                        }),
                      },
                    ]
                  : undefined,
              },
            ]}
          />
        ))}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.label, tone === 'error' ? styles.errorText : styles.neutralText]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 118,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: spacing.xs,
  },
  neutralContainer: {
    backgroundColor: colors.overlaySurface,
    borderWidth: 1,
    borderColor: colors.overlaySky,
  },
  errorContainer: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.overlayGold,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  neutralDot: {
    backgroundColor: colors.accentBlueSoft,
  },
  errorDot: {
    backgroundColor: colors.accentGold,
  },
  label: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  neutralText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.accentGold,
  },
});
