import { Audio } from 'expo-av';

let activeRecording: Audio.Recording | null = null;

export async function startNativeAudioRecording() {
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
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  activeRecording = recording;

  return recording;
}

export async function stopNativeAudioRecording(recording: Audio.Recording) {
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

  try {
    await activeRecording.stopAndUnloadAsync();
  } catch {
    // Ignore cleanup errors.
  }

  activeRecording = null;
}
