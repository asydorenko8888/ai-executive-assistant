import { StyleSheet, View } from 'react-native';

import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { Ionicons } from '@expo/vector-icons';

import { VOICE_ORB_CORE_SIZE, voiceOrbPalette } from '@/src/components/ui/voice-orb/constants';
import { colors } from '@/src/theme';

export function VoiceOrbIdle() {
  const breathe = useSharedValue(1);

  useEffect(() => {
    breathe.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2400 }),
        withTiming(0.97, { duration: 2400 }),
      ),
      -1,
      true,
    );
  }, [breathe]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + (breathe.value - 0.97) * 0.15,
    transform: [{ scale: breathe.value * 1.08 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.aura, auraStyle]} />
      <Animated.View style={[styles.core, coreStyle]}>
        <Ionicons name="mic" size={44} color={colors.textPrimary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    width: VOICE_ORB_CORE_SIZE + 48,
    height: VOICE_ORB_CORE_SIZE + 48,
    borderRadius: (VOICE_ORB_CORE_SIZE + 48) / 2,
    backgroundColor: voiceOrbPalette.glowSoft,
  },
  core: {
    width: VOICE_ORB_CORE_SIZE,
    height: VOICE_ORB_CORE_SIZE,
    borderRadius: VOICE_ORB_CORE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: voiceOrbPalette.surfaceElevated,
    borderWidth: 10,
    borderColor: voiceOrbPalette.glowDeep,
  },
});
