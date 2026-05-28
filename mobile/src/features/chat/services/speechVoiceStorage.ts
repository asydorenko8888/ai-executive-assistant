import { getStoredJson, setStoredJson } from '@/src/shared/storage/asyncStorage';

const SPEECH_VOICE_PREFERENCE_KEY = 'speech-voice-preference';

export type SpeechVoicePreference = {
  voiceURI: string | null;
};

const defaultPreference: SpeechVoicePreference = {
  voiceURI: null,
};

export async function loadSpeechVoicePreference(): Promise<SpeechVoicePreference> {
  return getStoredJson(SPEECH_VOICE_PREFERENCE_KEY, defaultPreference);
}

export async function saveSpeechVoicePreference(preference: SpeechVoicePreference) {
  return setStoredJson(SPEECH_VOICE_PREFERENCE_KEY, preference);
}
