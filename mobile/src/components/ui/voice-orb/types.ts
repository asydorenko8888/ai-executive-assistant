export type VoiceAssistantStatusType =
  | 'idle'
  | 'listening'
  | 'heard'
  | 'processing'
  | 'speaking'
  | 'answered'
  | 'error';

export type VoiceOrbVisualState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function mapVoiceStatusToOrbState(status: VoiceAssistantStatusType): VoiceOrbVisualState {
  switch (status) {
    case 'listening':
      return 'listening';
    case 'heard':
    case 'processing':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    default:
      return 'idle';
  }
}

export function getDefaultVoiceStatusLabel(status: VoiceAssistantStatusType) {
  switch (status) {
    case 'listening':
      return 'Listening...';
    case 'heard':
    case 'processing':
      return 'Thinking...';
    case 'speaking':
      return 'Speaking...';
    case 'answered':
      return 'Ready';
    case 'error':
      return 'Something went wrong';
    default:
      return 'Tap to speak';
  }
}
