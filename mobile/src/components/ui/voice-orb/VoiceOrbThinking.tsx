import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { VOICE_ORB_CORE_SIZE, voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';
import { useSimulatedAudioLevel } from '@/src/components/ui/voice-orb/useSimulatedAudioLevel';
import { VoiceWaveform } from '@/src/components/ui/voice-orb/VoiceWaveform';
import { colors } from '@/src/theme';

export function VoiceOrbThinking() {
  const level = useSimulatedAudioLevel({ active: true, intensity: 'low' });
  const rotation = useSharedValue(0);
  const dim = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 2800, easing: Easing.linear }),
      -1,
      false,
    );
    dim.value = withTiming(0.88, { duration: 320 });
  }, [dim, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    opacity: 0.45,
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: dim.value,
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.orbitRing, ringStyle]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <Ionicons name="sparkles" size={40} color={colors.textSecondary} />
      </Animated.View>
      <View style={styles.waveformSlot}>
        <VoiceWaveform level={level} active variant="thinking" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitRing: {
    position: 'absolute',
    width: VOICE_ORB_CORE_SIZE + 28,
    height: VOICE_ORB_CORE_SIZE + 28,
    borderRadius: (VOICE_ORB_CORE_SIZE + 28) / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: voiceOrbPalette.glowSoft,
    borderRightColor: voiceOrbPalette.thinking,
  },
  core: {
    width: VOICE_ORB_CORE_SIZE,
    height: VOICE_ORB_CORE_SIZE,
    borderRadius: VOICE_ORB_CORE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: voiceOrbPalette.surface,
    borderWidth: 10,
    borderColor: voiceOrbPalette.thinking,
  },
  waveformSlot: {
    position: 'absolute',
    bottom: -28,
  },
});
