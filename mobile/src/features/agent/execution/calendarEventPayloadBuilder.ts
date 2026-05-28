import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { getBrowserTimezone } from '@/src/features/agent/calendar/calendarTime';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { parseSpokenClockTime } from '@/src/features/reminders/reminderTimeParser';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';

const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

export type OperationalScheduleParseResult =
  | {
      ok: true;
      date: Date;
      hasExplicitTime: boolean;
    }
  | {
      ok: false;
      reason: 'date_parse_failed';
      detail: string;
    };

function extractClockFragment(transcript: string) {
  const patterns = [
    /\b(?:at|@|о|в|на)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
    /\b(?:на|в)\s+(\d{1,2}(?::\d{2})?)\b/i,
    /\b(\d{1,2}:\d{2})\b/,
    /\b(\d{1,2})\s*(am|pm)\b/i,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match) {
      return match[1] ?? match[0];
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

  if (dayOffset === null && !clockFragment) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: 'No day or time fragment found',
    };
  }

  const base = new Date(referenceNow);

  if (dayOffset !== null) {
    base.setDate(base.getDate() + dayOffset);
  }

  if (!clockFragment) {
    base.setHours(9, 0, 0, 0);
    return {
      ok: true,
      date: base,
      hasExplicitTime: false,
    };
  }

  try {
    const parsedTime = parseSpokenClockTime(clockFragment, base);

    if (!parsedTime) {
      return {
        ok: false,
        reason: 'date_parse_failed',
        detail: `Could not parse clock fragment: ${clockFragment}`,
      };
    }

    if (dayOffset !== null) {
      parsedTime.setFullYear(base.getFullYear(), base.getMonth(), base.getDate());
    }

    return {
      ok: true,
      date: parsedTime,
      hasExplicitTime: true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'date_parse_failed',
      detail: error instanceof Error ? error.message : 'parseSpokenClockTime threw',
    };
  }
}

export function extractCalendarEventLocation(transcript: string) {
  const patterns = [
    /\b(?:в|у|at)\s+((?:библиотек\w+|library|office|офис\w*)[\s\S]{0,120}?)(?:\s*$|[,.])/iu,
    /\b(?:в|у|at)\s+([\p{L}0-9][\p{L}0-9\s,'-]{2,80})$/iu,
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern);

    if (match?.[1]) {
      const location = formatLocationShort(match[1].trim()) || match[1].trim();
      return location.length > 0 ? location : null;
    }
  }

  return null;
}

export function extractCalendarEventTitle(transcript: string, languageCode: VoiceLanguageCode, location?: string | null) {
  const stripped = transcript
    .replace(
      /(?:внеси|внести|добав(?:ь|ить)|создай|запланируй|поставь|add|create|schedule|book).{0,120}?(?:google\s*)?(?:календар|calendar)/giu,
      '',
    )
    .replace(/\b(?:на|завтра|tomorrow|today|сьогодні|сегодня)\b/giu, '')
    .replace(/\b(?:встреч[а-яё]*|зустріч|meeting|event)\b/giu, '')
    .replace(/\b(?:в|у|at)\s+\d{1,2}(?::\d{2})?\b/giu, '')
    .replace(/\b(?:на|в|at)\s+\d{1,2}(?::\d{2})?\b/giu, '')
    .trim();

  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (stripped.length >= 3 && stripped.length <= 80) {
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  if (location) {
    if (locale === 'uk') {
      return `Зустріч — ${location}`;
    }

    if (locale === 'ru') {
      return `Встреча — ${location}`;
    }

    return `Meeting — ${location}`;
  }

  if (locale === 'uk') {
    return 'Зустріч';
  }

  if (locale === 'ru') {
    return 'Встреча';
  }

  return 'Meeting';
}

function toGoogleDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildCalendarCreateEventPayload(params: {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
}): { ok: true; payload: CalendarCreateEventPayload; scheduleIso: string } | { ok: false; reason: 'date_parse_failed'; detail: string } {
  const schedule = parseOperationalScheduleHint(params.transcript, params.referenceNow);

  if (!schedule.ok) {
    return schedule;
  }

  const location = extractCalendarEventLocation(params.transcript);
  const summary = extractCalendarEventTitle(params.transcript, params.languageCode, location);
  const timeZone = getBrowserTimezone();
  const startDate = schedule.date;
  const endDate = new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS);

  const payload: CalendarCreateEventPayload = {
    summary,
    location: location ?? undefined,
    start: {
      dateTime: toGoogleDateTimeLocal(startDate),
      timeZone,
    },
    end: {
      dateTime: toGoogleDateTimeLocal(endDate),
      timeZone,
    },
  };

  logActionExecution('payload_generated', {
    summary: payload.summary,
    location: payload.location ?? null,
    timeZone,
    start: payload.start,
    end: payload.end,
  });

  return {
    ok: true,
    payload,
    scheduleIso: startDate.toISOString(),
  };
}

export function formatVerifiedEventScheduleLabel(
  event: { startsAt: string; location?: string },
  languageCode: VoiceLanguageCode,
) {
  const startMs = Date.parse(event.startsAt);
  const date = Number.isNaN(startMs) ? new Date() : new Date(startMs);
  const locale = getChatLocaleFromVoiceLanguage(languageCode);
  const intlLocale = locale === 'ru' ? 'ru-RU' : locale === 'uk' ? 'uk-UA' : 'en-US';

  const dayLine = date.toLocaleDateString(intlLocale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLine = date.toLocaleTimeString(intlLocale, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return {
    dayLine,
    timeLine,
    locationLine: event.location?.trim() || null,
  };
}
