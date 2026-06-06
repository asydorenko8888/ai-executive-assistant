import { logAlarmVoiceLocalized } from '@/src/features/local-alarms/localAlarmMarkers';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type AlarmVoiceLanguage = 'uk' | 'ru' | 'en';

const ALARM_VOICE_PHRASES: Record<
  AlarmVoiceLanguage,
  { first: (time: string) => string; second: string; third: string }
> = {
  uk: {
    first: (time) => `Андрію, ти просив розбудити тебе о ${time}.`,
    second: 'Андрію, піднімайся. Інакше я втрачу терпець.',
    third: 'Ганчірка, будь мужиком. Вставай.',
  },
  ru: {
    first: (time) => `Андрей, ты просил разбудить тебя в ${time}.`,
    second: 'Андрей, вставай. Иначе я потеряю терпение.',
    third: 'Тряпка, будь мужиком. Вставай.',
  },
  en: {
    first: (time) => `Andrii, you asked me to wake you up at ${time}.`,
    second: "Andrii, get up. Otherwise I'm going to lose my patience.",
    third: 'Quit being soft. Be a man. Get up.',
  },
};

const TIME_LOCALE_BY_LANGUAGE: Record<AlarmVoiceLanguage, string> = {
  uk: 'uk-UA',
  ru: 'ru-RU',
  en: 'en-US',
};

export function resolveAlarmVoiceLanguage(languageCode: VoiceLanguageCode): AlarmVoiceLanguage {
  if (languageCode.startsWith('uk')) {
    return 'uk';
  }

  if (languageCode.startsWith('ru')) {
    return 'ru';
  }

  return 'en';
}

export function formatAlarmOriginalTime(
  originalTriggerAtMs: number,
  language: AlarmVoiceLanguage,
) {
  return new Date(originalTriggerAtMs).toLocaleTimeString(TIME_LOCALE_BY_LANGUAGE[language], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildLocalAlarmVoiceText(
  alarm: LocalAlarm,
  languageCode: VoiceLanguageCode,
) {
  const language = resolveAlarmVoiceLanguage(languageCode);
  const phrases = ALARM_VOICE_PHRASES[language];

  let voiceText: string;

  if (alarm.snoozeCount >= 2) {
    voiceText = phrases.third;
  } else if (alarm.snoozeCount === 1) {
    voiceText = phrases.second;
  } else {
    const time = formatAlarmOriginalTime(alarm.originalTriggerAtMs, language);
    voiceText = phrases.first(time);
  }

  logAlarmVoiceLocalized({
    language,
    snoozeCount: alarm.snoozeCount,
    voiceText,
  });

  return voiceText;
}
