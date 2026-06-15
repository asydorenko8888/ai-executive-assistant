import { parseAbsoluteReminderTime } from '@/src/features/local-reminders/localReminderTimeParser';
import type { LocalAlarm } from '@/src/features/local-alarms/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

function startOfLocalDayMs(timestampMs: number) {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function normalizeAlarmTimePhrase(phrase: string) {
  return phrase
    .trim()
    .replace(/[.!?]+$/g, '')
    .replace(/^(?:на|в|о|at)\s+/iu, '')
    .trim();
}

export function parseAlarmSelectorTime(phrase: string, referenceNow: Date) {
  const normalized = normalizeAlarmTimePhrase(phrase);

  if (!normalized) {
    return null;
  }

  return (
    parseAbsoluteReminderTime(normalized, referenceNow) ??
    parseAbsoluteReminderTime(phrase.trim(), referenceNow)
  );
}

export function formatAlarmClockLabel(
  triggerAtMs: number,
  languageCode: VoiceLanguageCode = 'ru-RU',
  options?: { hour24?: boolean },
) {
  const locale =
    languageCode === 'uk-UA' ? 'uk-UA' : languageCode === 'ru-RU' ? 'ru-RU' : 'en-US';
  const hour12 = options?.hour24 === true ? false : languageCode === 'en-US';

  return new Date(triggerAtMs).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  });
}

export function formatAlarmScheduleLine(
  triggerAtMs: number,
  referenceNowMs: number,
  languageCode: VoiceLanguageCode,
) {
  const dayOffset = Math.round(
    (startOfLocalDayMs(triggerAtMs) - startOfLocalDayMs(referenceNowMs)) / (24 * 60 * 60 * 1000),
  );
  const timeLabel = formatAlarmClockLabel(triggerAtMs, languageCode, { hour24: true });

  if (languageCode === 'uk-UA') {
    if (dayOffset === 0) {
      return `Сьогодні, ${timeLabel}`;
    }

    if (dayOffset === 1) {
      return `Завтра, ${timeLabel}`;
    }

    return `${new Date(triggerAtMs).toLocaleDateString('uk-UA')}, ${timeLabel}`;
  }

  if (languageCode === 'ru-RU') {
    if (dayOffset === 0) {
      return `Сегодня, ${timeLabel}`;
    }

    if (dayOffset === 1) {
      return `Завтра, ${timeLabel}`;
    }

    return `${new Date(triggerAtMs).toLocaleDateString('ru-RU')}, ${timeLabel}`;
  }

  if (dayOffset === 0) {
    return `Today, ${timeLabel}`;
  }

  if (dayOffset === 1) {
    return `Tomorrow, ${timeLabel}`;
  }

  return `${new Date(triggerAtMs).toLocaleDateString('en-US')}, ${timeLabel}`;
}

export function alarmMatchesSelectorTime(
  alarm: LocalAlarm,
  selectorTime: Date,
  toleranceMinutes = 1,
) {
  const alarmDate = new Date(alarm.triggerAtMs);
  const sameDay = startOfLocalDayMs(alarm.triggerAtMs) === startOfLocalDayMs(selectorTime.getTime());

  if (!sameDay) {
    return false;
  }

  const alarmMinutes = alarmDate.getHours() * 60 + alarmDate.getMinutes();
  const selectorMinutes = selectorTime.getHours() * 60 + selectorTime.getMinutes();

  return Math.abs(alarmMinutes - selectorMinutes) <= toleranceMinutes;
}

export function matchAlarmsByTimeSelector(
  alarms: LocalAlarm[],
  selectorPhrase: string | undefined,
  referenceNow: Date,
) {
  if (!selectorPhrase?.trim()) {
    return alarms;
  }

  const selectorTime = parseAlarmSelectorTime(selectorPhrase, referenceNow);

  if (!selectorTime) {
    return [];
  }

  return alarms.filter((alarm) => alarmMatchesSelectorTime(alarm, selectorTime));
}

export function alarmsHaveDuplicateTime(alarms: LocalAlarm[], triggerAt: Date, toleranceMinutes = 1) {
  return alarms.some((alarm) => alarmMatchesSelectorTime(alarm, triggerAt, toleranceMinutes));
}

export {
  extractAlarmSelectionPhrase,
  isLikelyAlarmSelectionReply,
  resolveAlarmSelectionFromReply,
} from '@/src/features/local-alarms/localAlarmSelectionResolution';
