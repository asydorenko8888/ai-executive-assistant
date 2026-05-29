import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';

export type OperationalScheduleParseResult =
  | {
      ok: true;
      date: Date;
      hasExplicitTime: boolean;
      explicitDayOffset: number | null;
    }
  | {
      ok: false;
      reason: 'date_parse_failed';
      detail: string;
    };

function extractClockFragment(transcript: string) {
  const patterns = [
    /\b(?:в|на)\s+(\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью)?)/iu,
    /\b(\d{1,2}(?::\d{2})?\s*(?:вечера|вечером|утра|утром|дня|днём|днем|ночи|ночью))/iu,
    /\b(?:at|@|о|в|на)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
    /\b(?:на|в)\s+(\d{1,2}(?::\d{2})?)\b/i,
    /\b(\d{1,2}:\d{2})\b/,
    /\b(\d{1,2})\s*(am|pm)\b/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match) {
      return (match[1] ?? match[0]).trim();
    }
  }

  return null;
}

function resolveDayOffset(transcript: string) {
  const normalized = transcript.toLowerCase();

  if (/\b(?:tomorrow|завтра)\b/i.test(normalized)) {
    return 1;
  }

  if (/\b(?:today|сьогодні|сегодня)\b/i.test(normalized)) {
    return 0;
  }

  const weekdayMatch = normalized.match(
    /\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес)\b/i,
  );

  if (!weekdayMatch) {
    return null;
  }

  const weekdayIndex: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    воскрес: 0,
    понедельник: 1,
    вторник: 2,
    сред: 3,
    четверг: 4,
    пятниц: 5,
    суббот: 6,
  };

  const key = Object.keys(weekdayIndex).find((candidate) => weekdayMatch[1].toLowerCase().startsWith(candidate));

  if (!key) {
    return null;
  }

  const target = weekdayIndex[key];
  const reference = new Date();
  const current = reference.getDay();
  let delta = (target - current + 7) % 7;

  if (delta === 0) {
    delta = 7;
  }

  return delta;
}

export function parseOperationalScheduleHint(transcript: string, referenceNow: Date): OperationalScheduleParseResult {
  const dayOffset = resolveDayOffset(transcript);
  const clockFragment = extractClockFragment(transcript);
  const hasExplicitDay = dayOffset !== null;

  if (dayOffset === null && !clockFragment) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'No day or time fragment found',
    };
  }

  const base = new Date(referenceNow);

  if (dayOffset !== null) {
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + dayOffset);
  }

  if (!clockFragment) {
    base.setHours(9, 0, 0, 0);
    return {
      ok: true,
      date: base,
      hasExplicitTime: false,
      explicitDayOffset: dayOffset,
    };
  }

  try {
    const clockParseInput = /вечер|утр|дн[её]м|ноч/ui.test(clockFragment)
      ? clockFragment
      : `${clockFragment} ${transcript}`;

    const parsedTime = parseSpokenClockTime(clockParseInput, base, {
      rollToNextDayIfPast: !hasExplicitDay,
    });

    if (!parsedTime) {
      return {
        ok: false,
        reason: 'date_parse_failed',
        detail: `Could not parse clock fragment: ${clockFragment}`,
      };
    }

    if (hasExplicitDay) {
      parsedTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    }

    if (hasExplicitDay && dayOffset === 0 && parsedTime.getTime() <= referenceNow.getTime()) {
      return {
        ok: false,
        reason: 'date_parse_failed',
        detail: 'Requested time already passed today',
      };
    }

    return {
      ok: true,
      date: parsedTime,
      hasExplicitTime: true,
      explicitDayOffset: dayOffset,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: error instanceof Error ? error.message : 'parseSpokenClockTime threw',
    };
  }
}
