export type VoiceAssistantStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type VoiceTranscriptSegment = {
  id: string;
  text: string;
  createdAt: string;
  isFinal: boolean;
};

export type AssistantSession = {
  id: string;
  status: VoiceAssistantStatus;
  locale: string;
  startedAt: string;
};
