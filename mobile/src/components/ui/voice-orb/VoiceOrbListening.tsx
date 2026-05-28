import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { VOICE_ORB_CORE_SIZE, voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';
import { VoiceWaveform } from '@/src/components/ui/voice-orb/VoiceWaveform';
import { colors } from '@/src/theme';

type VoiceOrbListeningProps = {
  level: SharedValue<number>;
};

export function VoiceOrbListening({ level }: VoiceOrbListeningProps) {
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + level.value * 0.45,
    transform: [{ scale: 1.02 + level.value * 0.14 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.05 }],
    borderColor: voiceOrbPalette.glowSoft,
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <Ionicons name="mic" size={44} color={colors.textPrimary} />
      </Animated.View>
      <View style={styles.waveformSlot}>
        <VoiceWaveform level={level} active variant="listening" />
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
    width: VOICE_ORB_CORE_SIZE + 64,
    height: VOICE_ORB_CORE_SIZE + 64,
    borderRadius: (VOICE_ORB_CORE_SIZE + 64) / 2,
    backgroundColor: voiceOrbPalette.glow,
  },
  core: {
    width: VOICE_ORB_CORE_SIZE,
    height: VOICE_ORB_CORE_SIZE,
    borderRadius: VOICE_ORB_CORE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: voiceOrbPalette.surfaceElevated,
    borderWidth: 10,
    borderColor: voiceOrbPalette.glowSoft,
  },
  waveformSlot: {
    position: 'absolute',
    bottom: -28,
  },
});
