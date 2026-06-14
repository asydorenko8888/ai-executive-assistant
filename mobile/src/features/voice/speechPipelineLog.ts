export function logRecordingStarted() {
  console.log('RECORDING_STARTED');
}

export function logRecordingStopped(details?: { reason?: string }) {
  console.log('RECORDING_STOPPED', details ?? {});
}

export function logAudioFileReady(details: { uri: string }) {
  console.log('AUDIO_FILE_READY', { uri: details.uri });
}

export function logTranscribeStart(details?: { language?: string }) {
  console.log('TRANSCRIBE_START', details ?? {});
}

export function logTranscribeSuccess(details: { transcriptPreview: string }) {
  console.log('TRANSCRIBE_SUCCESS', details);
}

export function logTranscribeError(details: { message: string; code?: string }) {
  console.log('TRANSCRIBE_ERROR', details);
}

export function logAssistantRequestStart(details: { transcriptPreview: string; source: string }) {
  console.log('ASSISTANT_REQUEST_START', details);
}
