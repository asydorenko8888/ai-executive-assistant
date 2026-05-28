import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useSharedValue, withSpring } from 'react-native-reanimated';

type UseMicrophoneAudioLevelOptions = {
  stream: MediaStream | null;
  active: boolean;
};

export function useMicrophoneAudioLevel({ stream, active }: UseMicrophoneAudioLevelOptions) {
  const level = useSharedValue(0.15);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active || !stream) {
      level.value = withSpring(0.15, { damping: 18, stiffness: 120 });
      return;
    }

    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;

    if (!AudioContextClass) {
      return;
    }

    let rafId = 0;
    let disposed = false;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (disposed) {
        return;
      }

      analyser.getByteFrequencyData(buffer);
      let sum = 0;

      for (let index = 0; index < buffer.length; index += 1) {
        sum += buffer[index];
      }

      const average = sum / buffer.length / 255;
      const normalized = Math.min(1, Math.max(0.12, average * 2.4));
      level.value = withSpring(normalized, { damping: 14, stiffness: 180 });
      rafId = requestAnimationFrame(tick);
    };

    void audioContext.resume().then(() => {
      rafId = requestAnimationFrame(tick);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      source.disconnect();
      void audioContext.close();
      level.value = withSpring(0.15, { damping: 18, stiffness: 120 });
    };
  }, [active, level, stream]);

  return level;
}
