import { Pressable, StyleSheet, View } from 'react-native';

import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { VOICE_ORB_SIZE, voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';
import { useMicrophoneAudioLevel } from '@/src/components/ui/voice-orb/useMicrophoneAudioLevel';
import { useSimulatedAudioLevel } from '@/src/components/ui/voice-orb/useSimulatedAudioLevel';
import type { VoiceOrbVisualState } from '@/src/components/ui/voice-orb/types';
import { VoiceOrbIdle } from '@/src/components/ui/voice-orb/VoiceOrbIdle';
import { VoiceOrbListening } from '@/src/components/ui/voice-orb/VoiceOrbListening';
import { VoiceOrbRings } from '@/src/components/ui/voice-orb/VoiceOrbRings';
import { VoiceOrbSpeaking } from '@/src/components/ui/voice-orb/VoiceOrbSpeaking';
import { VoiceOrbThinking } from '@/src/components/ui/voice-orb/VoiceOrbThinking';
import { createShadow } from '@/src/utils/shadow';

type VoiceOrbProps = {
  state: VoiceOrbVisualState;
  onPress?: () => void;
  microphoneStream?: MediaStream | null;
};

export function VoiceOrb({ state, onPress, microphoneStream = null }: VoiceOrbProps) {
  const pressScale = useSharedValue(1);
  const micLevel = useMicrophoneAudioLevel({
    stream: microphoneStream,
    active: state === 'listening',
  });
  const speakingLevel = useSimulatedAudioLevel({
    active: state === 'speaking',
    intensity: 'high',
  });

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const listeningLevel = state === 'listening' ? micLevel : speakingLevel;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voice assistant"
      onPress={onPress}
      onPressIn={() => {
        pressScale.value = withSpring(0.96, { damping: 16, stiffness: 280 });
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={styles.pressable}>
      <Animated.View style={[styles.shell, shellStyle]}>
        <VoiceOrbRings state={state} />
        <View style={styles.orbFrame}>
          {state === 'idle' ? (
            <Animated.View key="idle" entering={FadeIn.duration(280)} exiting={FadeOut.duration(200)}>
              <VoiceOrbIdle />
            </Animated.View>
          ) : null}
          {state === 'listening' ? (
            <Animated.View key="listening" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
              <VoiceOrbListening level={listeningLevel} />
            </Animated.View>
          ) : null}
          {state === 'thinking' ? (
            <Animated.View key="thinking" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
              <VoiceOrbThinking />
            </Animated.View>
          ) : null}
          {state === 'speaking' ? (
            <Animated.View key="speaking" entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
              <VoiceOrbSpeaking level={speakingLevel} />
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shell: {
    width: VOICE_ORB_SIZE + 80,
    height: VOICE_ORB_SIZE + 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbFrame: {
    width: VOICE_ORB_SIZE,
    height: VOICE_ORB_SIZE,
    borderRadius: VOICE_ORB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: voiceOrbPalette.surface,
    borderWidth: 1,
    borderColor: voiceOrbPalette.border,
    ...createShadow({
      color: voiceOrbPalette.glow,
      opacity: 0.28,
      radius: 32,
      offsetY: 16,
      elevation: 14,
    }),
  },
});
