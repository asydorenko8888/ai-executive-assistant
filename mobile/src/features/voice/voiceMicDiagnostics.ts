export function logMicButtonPressed() {
  console.log('MIC_BUTTON_PRESSED');
}

export function logMicStateBefore(state: {
  voiceStatus: string;
  hasActiveSession: boolean;
  isRecording: boolean;
}) {
  console.log('MIC_STATE_BEFORE', state);
}

export function logStartRecordingCalled() {
  console.log('START_RECORDING_CALLED');
}

export function logStopRecordingCalled() {
  console.log('STOP_RECORDING_CALLED');
}

export function logRecordingStoppedOk() {
  console.log('RECORDING_STOPPED_OK');
}
