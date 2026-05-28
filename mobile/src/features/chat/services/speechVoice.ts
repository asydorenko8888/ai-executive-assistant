import { Platform } from 'react-native';

import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { loadPersistedVoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import {
  loadSpeechVoicePreference,
  saveSpeechVoicePreference,
  type SpeechVoicePreference,
} from '@/src/features/chat/services/speechVoiceStorage';

type VoiceScoringRule = { pattern: RegExp; score: number };

const ENGLISH_PREFERRED_VOICE_RULES: VoiceScoringRule[] = [
  { pattern: /google.*english.*united states|google us english/i, score: 120 },
  { pattern: /\bsamantha\b/i, score: 110 },
  { pattern: /\bdaniel\b/i, score: 110 },
  { pattern: /enhanced|premium|neural|natural|wavenet|studio/i, score: 95 },
  { pattern: /google/i, score: 70 },
  { pattern: /microsoft.*(aria|jenny|guy|ryan)/i, score: 65 },
  { pattern: /apple.*(siri|premium)/i, score: 60 },
];

const UKRAINIAN_PREFERRED_VOICE_RULES: VoiceScoringRule[] = [
  { pattern: /google.*україн|google.*ukrainian|україн/i, score: 120 },
  { pattern: /\blesya\b|\blesia\b/i, score: 110 },
  { pattern: /enhanced|premium|neural|natural/i, score: 90 },
  { pattern: /microsoft.*(oksana|polina)/i, score: 70 },
];

const RUSSIAN_PREFERRED_VOICE_RULES: VoiceScoringRule[] = [
  { pattern: /google.*рус|russian/i, score: 120 },
  { pattern: /\bmilena\b|\byuri\b|\bdmitri\b/i, score: 110 },
  { pattern: /enhanced|premium|neural|natural/i, score: 90 },
  { pattern: /microsoft.*(irina|dmitry)/i, score: 70 },
];

const DISCOURAGED_VOICE_RULES: { pattern: RegExp; penalty: number }[] = [
  { pattern: /compact|low quality|espeak|festival|android|sapi legacy/i, penalty: 40 },
  { pattern: /novelty|whisper|bad news|bells|zarvox/i, penalty: 80 },
];

export const SPEECH_SENTENCE_PAUSE_MS = 280;
export const SPEECH_RATE = 0.92;
export const SPEECH_PITCH = 0.95;

export const SPEECH_TEST_PHRASES: Record<VoiceLanguageCode, string> = {
  'en-US':
    'Your next meeting is at 1:30 PM. The rest of the afternoon is fairly open.',
  'uk-UA': 'Ваша наступна зустріч о 13:30. Решта дня досить вільна.',
  'ru-RU': 'Ваша следующая встреча в 13:30. Остаток дня довольно свободный.',
};

function getSpeechSynthesis() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  return window.speechSynthesis ?? null;
}

function voiceMatchesLanguage(voice: SpeechSynthesisVoice, languageCode: VoiceLanguageCode) {
  const lang = voice.lang.toLowerCase();

  if (languageCode === 'en-US') {
    return lang.startsWith('en');
  }

  if (languageCode === 'uk-UA') {
    return lang.startsWith('uk');
  }

  if (languageCode === 'ru-RU') {
    return lang.startsWith('ru');
  }

  return false;
}

function getPreferredRulesForLanguage(languageCode: VoiceLanguageCode): VoiceScoringRule[] {
  switch (languageCode) {
    case 'uk-UA':
      return UKRAINIAN_PREFERRED_VOICE_RULES;
    case 'ru-RU':
      return RUSSIAN_PREFERRED_VOICE_RULES;
    default:
      return ENGLISH_PREFERRED_VOICE_RULES;
  }
}

export function scoreSpeechVoice(voice: SpeechSynthesisVoice, languageCode: VoiceLanguageCode) {
  if (!voiceMatchesLanguage(voice, languageCode)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  const name = voice.name;
  const lang = voice.lang.toLowerCase();

  if (languageCode === 'en-US') {
    if (lang.startsWith('en-us')) {
      score += 30;
    } else if (lang.startsWith('en-gb')) {
      score += 18;
    } else if (lang.startsWith('en')) {
      score += 10;
    }
  } else if (languageCode === 'uk-UA' && lang.startsWith('uk')) {
    score += 25;
  } else if (languageCode === 'ru-RU' && lang.startsWith('ru')) {
    score += 25;
  }

  for (const rule of getPreferredRulesForLanguage(languageCode)) {
    if (rule.pattern.test(name)) {
      score += rule.score;
    }
  }

  for (const rule of DISCOURAGED_VOICE_RULES) {
    if (rule.pattern.test(name)) {
      score -= rule.penalty;
    }
  }

  if (voice.default) {
    score += 4;
  }

  if (voice.localService) {
    score += 2;
  }

  return score;
}

export function sortVoicesByQualityForLanguage(
  voices: SpeechSynthesisVoice[],
  languageCode: VoiceLanguageCode,
) {
  return voices
    .filter((voice) => voiceMatchesLanguage(voice, languageCode))
    .sort((left, right) => {
      const scoreDelta = scoreSpeechVoice(right, languageCode) - scoreSpeechVoice(left, languageCode);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.name.localeCompare(right.name);
    });
}

export function pickBestVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  languageCode: VoiceLanguageCode,
  preferredVoiceURI?: string | null,
) {
  if (preferredVoiceURI) {
    const preferredVoice = voices.find((voice) => voice.voiceURI === preferredVoiceURI);

    if (preferredVoice && voiceMatchesLanguage(preferredVoice, languageCode)) {
      return preferredVoice;
    }
  }

  const ranked = sortVoicesByQualityForLanguage(voices, languageCode);

  return ranked[0] ?? null;
}

export function waitForSpeechVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  const synthesis = getSpeechSynthesis();

  if (!synthesis) {
    return Promise.resolve([]);
  }

  const existingVoices = synthesis.getVoices();

  if (existingVoices.length > 0) {
    return Promise.resolve(existingVoices);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      synthesis.removeEventListener('voiceschanged', finish);
      resolve(synthesis.getVoices());
    };

    synthesis.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, timeoutMs);
  });
}

let cachedVoice: SpeechSynthesisVoice | null | undefined;
let cachedPreferenceKey: string | undefined;

export function invalidateSpeechVoiceCache() {
  cachedVoice = undefined;
  cachedPreferenceKey = undefined;
}

export async function getPreferredSpeechVoiceURI() {
  const preference = await loadSpeechVoicePreference();

  return preference.voiceURI;
}

export async function setPreferredSpeechVoiceURI(voiceURI: string | null) {
  await saveSpeechVoicePreference({ voiceURI });
  invalidateSpeechVoiceCache();
}

export async function resolveSpeechVoice(options?: {
  languageCode?: VoiceLanguageCode;
  preferredVoiceURI?: string | null;
}) {
  const synthesis = getSpeechSynthesis();

  if (!synthesis) {
    return null;
  }

  const languageCode = options?.languageCode ?? (await loadPersistedVoiceLanguageCode());
  const preferredVoiceURI =
    options?.preferredVoiceURI === undefined
      ? await getPreferredSpeechVoiceURI()
      : options.preferredVoiceURI;
  const cacheKey = `${languageCode}:${preferredVoiceURI ?? '__auto__'}`;

  if (cachedVoice !== undefined && cachedPreferenceKey === cacheKey) {
    return cachedVoice;
  }

  const voices = await waitForSpeechVoices();
  const voice = pickBestVoiceForLanguage(voices, languageCode, preferredVoiceURI);

  cachedVoice = voice;
  cachedPreferenceKey = cacheKey;

  console.log('[Voice] TTS voice:', voice?.name ?? 'browser default', voice ? `(${voice.lang})` : '');

  return voice;
}

export async function listSpeechVoicesForLanguage(languageCode: VoiceLanguageCode) {
  const voices = await waitForSpeechVoices();

  return sortVoicesByQualityForLanguage(voices, languageCode);
}

/** @deprecated Use listSpeechVoicesForLanguage */
export async function listEnglishSpeechVoices() {
  return listSpeechVoicesForLanguage('en-US');
}

export function formatSpeechVoiceLabel(voice: SpeechSynthesisVoice) {
  return `${voice.name} (${voice.lang})`;
}

export async function loadSpeechVoicePreferenceState(): Promise<SpeechVoicePreference> {
  return loadSpeechVoicePreference();
}

export function getSpeechTestPhrase(languageCode: VoiceLanguageCode) {
  return SPEECH_TEST_PHRASES[languageCode];
}
