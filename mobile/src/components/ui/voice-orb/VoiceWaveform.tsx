import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';

const BAR_COUNT = 7;
const BAR_OFFSETS = [0.55, 0.78, 1, 0.88, 0.72, 0.92, 0.6];

type VoiceWaveformProps = {
  level: SharedValue<number>;
  active: boolean;
  variant?: 'listening' | 'speaking' | 'thinking';
};

function VoiceWaveformBar({
  level,
  index,
  active,
  variant,
}: {
  level: SharedValue<number>;
  index: number;
  active: boolean;
  variant: 'listening' | 'speaking' | 'thinking';
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const multiplier = BAR_OFFSETS[index] ?? 1;
    const minHeight = variant === 'thinking' ? 6 : 8;
    const maxHeight = variant === 'thinking' ? 22 : 34;
    const height = minHeight + level.value * multiplier * (maxHeight - minHeight);

    return {
      height,
      opacity: active ? 0.45 + level.value * 0.55 : 0.25,
    };
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        variant === 'speaking' && styles.barSpeaking,
        variant === 'thinking' && styles.barThinking,
        animatedStyle,
      ]}
    />
  );
}

export function VoiceWaveform({ level, active, variant = 'listening' }: VoiceWaveformProps) {
  const containerOpacity = useSharedValue(active ? 1 : 0.5);

  useEffect(() => {
    containerOpacity.value = withSpring(active ? 1 : 0.45, { damping: 16, stiffness: 140 });
  }, [active, containerOpacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <VoiceWaveformBar
          key={index}
          index={index}
          level={level}
          active={active}
          variant={variant}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
  },
  bar: {
    width: 4,
    borderRadius: 4,
    backgroundColor: voiceOrbPalette.glowSoft,
  },
  barSpeaking: {
    backgroundColor: voiceOrbPalette.speaking,
  },
  barThinking: {
    backgroundColor: voiceOrbPalette.thinking,
  },
});
