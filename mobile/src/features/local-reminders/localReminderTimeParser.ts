import { parseNaturalDayOffset } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';

export type ParsedRelativeDuration = {
  totalMs: number;
  title: string;
};

const MINUTE_WORD = /(?:минут(?:ы|у)?|мин(?:ут)?|хв(?:илин)?|minutes?|mins?)/iu;
const SECOND_WORD = /(?:секунд(?:ы|у)?|сек(?:унд)?|seconds?|secs?)/iu;
const HOUR_WORD = /(?:час(?:ов|а)?|годин(?:и)?|hours?|hrs?)/iu;

function cleanReminderTitle(raw: string) {
  return raw
    .trim()
    .replace(/^(?:to|about|про|о|что)\s+/iu, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function defaultReminderTitle(kind: 'reminder' | 'alarm') {
  return kind === 'alarm' ? 'Будильник' : 'Напоминание';
}

export function parseRelativeDurationPhrase(
  phrase: string,
  kind: 'reminder' | 'alarm' = 'reminder',
): ParsedRelativeDuration | null {
  const normalized = phrase.trim().replace(/[,;]/g, ' ').replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');

  if (!normalized) {
    return null;
  }

  const hourMatch = normalized.match(new RegExp(`^(\\d+)\\s*${HOUR_WORD.source}(?:\\s+(.+))?$`, 'iu'));

  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    const title = cleanReminderTitle(hourMatch[2] ?? '') || defaultReminderTitle(kind);

    if (!Number.isFinite(hours) || hours <= 0) {
      return null;
    }

    return {
      totalMs: hours * 60 * 60 * 1000,
      title,
    };
  }

  const minuteSecondMatch = normalized.match(
    new RegExp(
      `^(\\d+)\\s*${MINUTE_WORD.source}\\s+(\\d+)\\s*${SECOND_WORD.source}(?:\\s+(.+))?$`,
      'iu',
    ),
  );

  if (minuteSecondMatch) {
    const minutes = Number(minuteSecondMatch[1]);
    const seconds = Number(minuteSecondMatch[2]);
    const title = cleanReminderTitle(minuteSecondMatch[3] ?? '') || defaultReminderTitle(kind);

    if (minutes <= 0 && seconds <= 0) {
      return null;
    }

    return {
      totalMs: minutes * 60_000 + seconds * 1000,
      title,
    };
  }

  const minuteMatch = normalized.match(
    new RegExp(`^(\\d+)\\s*${MINUTE_WORD.source}(?:\\s+(.+))?$`, 'iu'),
  );

  if (minuteMatch) {
    const minutes = Number(minuteMatch[1]);
    const title = cleanReminderTitle(minuteMatch[2] ?? '') || defaultReminderTitle(kind);

    if (!Number.isFinite(minutes) || minutes <= 0) {
      return null;
    }

    return {
      totalMs: minutes * 60_000,
      title,
    };
  }

  const secondMatch = normalized.match(
    new RegExp(`^(\\d+)\\s*${SECOND_WORD.source}(?:\\s+(.+))?$`, 'iu'),
  );

  if (secondMatch) {
    const seconds = Number(secondMatch[1]);
    const title = cleanReminderTitle(secondMatch[2] ?? '') || defaultReminderTitle(kind);

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }

    return {
      totalMs: seconds * 1000,
      title,
    };
  }

  return null;
}

export function parseAbsoluteReminderTime(
  timePhrase: string,
  referenceNow = new Date(),
  timeZone = getExecutiveCalendarTimezone(),
): Date | null {
  const normalized = timePhrase.trim().replace(/\s+/g, ' ');

  if (!normalized) {
    return null;
  }

  const naturalDay = parseNaturalDayOffset(normalized, referenceNow, timeZone);
  const dayOffset = naturalDay?.dayOffset ?? 0;
  const withoutDay = normalized
    .replace(
      /\b(?:завтра|tomorrow|післязавтра|послезавтра|сьогодні|сегодня|today)\b/giu,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const clockSource = withoutDay
    .replace(/^(?:на|в|о)\s+/iu, '')
    .replace(/^at\s+/i, '')
    .trim();

  const clock = parseSpokenClockTime(clockSource, referenceNow, {
    rollToNextDayIfPast: dayOffset === 0,
  });

  if (!clock) {
    return null;
  }

  if (dayOffset !== 0) {
    clock.setDate(clock.getDate() + dayOffset);
  }

  if (clock.getTime() <= referenceNow.getTime()) {
    return null;
  }

  return clock;
}
