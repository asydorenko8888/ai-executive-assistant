import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { VOICE_ORB_CORE_SIZE, voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';
import { VoiceWaveform } from '@/src/components/ui/voice-orb/VoiceWaveform';
import { colors } from '@/src/theme';

type VoiceOrbSpeakingProps = {
  level: SharedValue<number>;
};

export function VoiceOrbSpeaking({ level }: VoiceOrbSpeakingProps) {
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + level.value * 0.5,
    transform: [{ scale: 1.04 + level.value * 0.1 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.04 }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <Ionicons name="volume-high" size={44} color={colors.textPrimary} />
      </Animated.View>
      <View style={styles.waveformSlot}>
        <VoiceWaveform level={level} active variant="speaking" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: VOICE_ORB_CORE_SIZE + 60,
    height: VOICE_ORB_CORE_SIZE + 60,
    borderRadius: (VOICE_ORB_CORE_SIZE + 60) / 2,
    backgroundColor: voiceOrbPalette.speaking,
  },
  core: {
    width: VOICE_ORB_CORE_SIZE,
    height: VOICE_ORB_CORE_SIZE,
    borderRadius: VOICE_ORB_CORE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: voiceOrbPalette.surfaceElevated,
    borderWidth: 10,
    borderColor: voiceOrbPalette.speaking,
  },
  waveformSlot: {
    position: 'absolute',
    bottom: -28,
  },
});
