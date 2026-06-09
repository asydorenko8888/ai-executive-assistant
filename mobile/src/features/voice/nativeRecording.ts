import { Audio } from 'expo-av';

let activeRecording: Audio.Recording | null = null;

const SILENCE_THRESHOLD_DB = -45;
const MIN_RECORDING_MS = 600;
const SILENCE_STOP_MS = 1400;

export type NativeAudioRecordingOptions = {
  onSilenceStop?: () => void;
};

export async function startNativeAudioRecording(options: NativeAudioRecordingOptions = {}) {
  const permission = await Audio.requestPermissionsAsync();

  if (!permission.granted) {
    throw new Error('Microphone permission denied. Enable microphone access in Settings.');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  if (activeRecording) {
    try {
      await activeRecording.stopAndUnloadAsync();
    } catch {
      // Ignore cleanup errors from stale recordings.
    }

    activeRecording = null;
  }

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  await recording.startAsync();

  let silenceStartedAt: number | null = null;

  recording.setOnRecordingStatusUpdate((status) => {
    if (!status.isRecording || !options.onSilenceStop) {
      return;
    }

    const durationMs = status.durationMillis ?? 0;

    if (durationMs < MIN_RECORDING_MS) {
      silenceStartedAt = null;
      return;
    }

    const metering = status.metering;

    if (typeof metering !== 'number') {
      return;
    }

    if (metering <= SILENCE_THRESHOLD_DB) {
      silenceStartedAt ??= Date.now();

      if (Date.now() - silenceStartedAt >= SILENCE_STOP_MS) {
        options.onSilenceStop();
      }

      return;
    }

    silenceStartedAt = null;
  });

  activeRecording = recording;

  return recording;
}

export async function stopNativeAudioRecording(recording: Audio.Recording) {
  recording.setOnRecordingStatusUpdate(null);
  await recording.stopAndUnloadAsync();

  if (activeRecording === recording) {
    activeRecording = null;
  }

  const uri = recording.getURI();

  if (!uri) {
    throw new Error('Recording did not produce an audio file.');
  }

  return uri;
}

export async function cancelNativeAudioRecording() {
  if (!activeRecording) {
    return;
  }

  activeRecording.setOnRecordingStatusUpdate(null);

  try {
    await activeRecording.stopAndUnloadAsync();
  } catch {
    // Ignore cleanup errors.
  }

  activeRecording = null;
}
