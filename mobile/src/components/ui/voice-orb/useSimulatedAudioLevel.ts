import { useEffect } from 'react';

import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type UseSimulatedAudioLevelOptions = {
  active: boolean;
  intensity?: 'low' | 'medium' | 'high';
};

export function useSimulatedAudioLevel({ active, intensity = 'medium' }: UseSimulatedAudioLevelOptions) {
  const level = useSharedValue(0.2);

  useEffect(() => {
    if (!active) {
      cancelAnimation(level);
      level.value = withTiming(0.15, { duration: 400 });
      return;
    }

    const peak = intensity === 'high' ? 1 : intensity === 'low' ? 0.55 : 0.82;
    const trough = intensity === 'high' ? 0.35 : 0.18;

    level.value = withRepeat(
      withSequence(
        withTiming(peak, { duration: 420, easing: Easing.inOut(Easing.sin) }),
        withTiming(trough, { duration: 380, easing: Easing.inOut(Easing.sin) }),
        withTiming(peak * 0.85, { duration: 360, easing: Easing.inOut(Easing.sin) }),
        withTiming(trough + 0.08, { duration: 340, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(level);
    };
  }, [active, intensity, level]);

  return level;
}
