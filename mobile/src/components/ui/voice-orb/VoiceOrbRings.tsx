import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { VOICE_ORB_SIZE, voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';
import type { VoiceOrbVisualState } from '@/src/components/ui/voice-orb/types';

type VoiceOrbRingsProps = {
  state: VoiceOrbVisualState;
};

function AnimatedRing({
  size,
  delay,
  state,
}: {
  size: number;
  delay: number;
  state: VoiceOrbVisualState;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    const isActive = state !== 'idle';

    if (!isActive) {
      scale.value = withSpring(1, { damping: 20, stiffness: 90 });
      opacity.value = withTiming(0.12, { duration: 600 });
      return;
    }

    const maxScale = state === 'listening' ? 1.22 : state === 'speaking' ? 1.16 : 1.1;
    const maxOpacity = state === 'listening' ? 0.5 : state === 'speaking' ? 0.42 : 0.32;

    scale.value = withRepeat(
      withSequence(
        withTiming(maxScale, { duration: 1400 + delay, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1400 + delay, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(maxOpacity, { duration: 1200 + delay, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.08, { duration: 1200 + delay, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [delay, opacity, scale, state]);

  const ringStyle = useAnimatedStyle(() => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        state === 'speaking' && styles.ringSpeaking,
        state === 'thinking' && styles.ringThinking,
        ringStyle,
      ]}
    />
  );
}

export function VoiceOrbRings({ state }: VoiceOrbRingsProps) {
  return (
    <View pointerEvents="none" style={styles.container}>
      <AnimatedRing size={VOICE_ORB_SIZE + 72} delay={0} state={state} />
      <AnimatedRing size={VOICE_ORB_SIZE + 36} delay={180} state={state} />
      <AnimatedRing size={VOICE_ORB_SIZE + 8} delay={320} state={state} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: voiceOrbPalette.glowSoft,
  },
  ringSpeaking: {
    borderColor: voiceOrbPalette.speaking,
  },
  ringThinking: {
    borderColor: voiceOrbPalette.thinking,
  },
});
